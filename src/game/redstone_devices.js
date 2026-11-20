import { AIR } from '../world/block.js';

/**
 * Small redstone-device simulation for the Java 1.19 compatibility track.
 * Buttons, levers, player-triggered pressure plates and redstone dust power
 * adjacent doors/trapdoors. Dust signal strength decays along connected wire.
 * Repeaters, comparators, pistons and mob/item plate activation remain separate.
 */
const NEIGHBORS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const HORIZONTAL = [[1,0,0,'east','west'],[-1,0,0,'west','east'],[0,0,1,'south','north'],[0,0,-1,'north','south']];
const FACING_VECTOR = { north: [0,0,-1], south: [0,0,1], east: [1,0,0], west: [-1,0,0] };

export function comparatorOutput(rear, left = 0, right = 0, subtract = false) {
  const back = Math.max(0, Math.min(15, Math.floor(Number(rear) || 0)));
  const side = Math.max(Math.max(0, Math.min(15, Math.floor(Number(left) || 0))), Math.max(0, Math.min(15, Math.floor(Number(right) || 0))));
  return subtract ? Math.max(0, back - side) : (back >= side ? back : 0);
}

/** Vanilla container fullness formula; slots contain {count, maxStackSize}. */
export function comparatorContainerOutput(slots, slotCount = slots && slots.length || 0) {
  if (!Array.isArray(slots) || slotCount <= 0) return 0;
  let fullness = 0;
  for (const slot of slots) {
    if (!slot) continue;
    const count = Math.max(0, Number(slot.count) || 0);
    const max = Math.max(1, Number(slot.maxStackSize) || 64);
    fullness += Math.min(1, count / max);
  }
  if (fullness <= 0) return 0;
  return Math.max(1, Math.min(15, Math.floor(1 + (fullness / slotCount) * 14)));
}

export function daylightDetectorPower(time, inverted = false) {
  const t = ((Math.floor(time || 0) % 24000) + 24000) % 24000;
  let power;
  if (t < 12000) power = 15;
  else if (t < 13000) power = Math.round(15 * (13000 - t) / 1000);
  else if (t < 23000) power = 0;
  else power = Math.round(15 * (t - 23000) / 1000);
  return inverted ? 15 - power : power;
}

function readSignal(world, x, y, z, targetX, targetY, targetZ) {
  const state = world.getBlock(x,y,z);
  if (state.block.id === 'mc:redstone_block') return 15;
  if (state.block.renderShape === 'redstone_wire') return state.get('power') || 0;
  if (state.block.id === 'mc:daylight_detector') return state.get('power') || 0;
  if (state.block.id === 'mc:redstone_torch' && state.get('lit') !== false) return 15;
  if ((state.block.renderShape === 'lever' || state.block.renderShape === 'button' || state.block.renderShape === 'pressure_plate') && state.get('powered')) return 15;
  if (state.block.renderShape === 'weighted_pressure_plate') return state.get('power') || 0;
  if (state.block.renderShape === 'comparator' && state.get('power') > 0) {
    const [dx,dy,dz] = FACING_VECTOR[state.get('facing')] || [0,0,-1];
    if (x+dx === targetX && y+dy === targetY && z+dz === targetZ) return state.get('power');
  }
  if (state.block.renderShape === 'repeater' && state.get('powered')) {
    const [dx,dy,dz] = FACING_VECTOR[state.get('facing')] || [0,0,-1];
    if (x+dx === targetX && y+dy === targetY && z+dz === targetZ) return 15;
  }
  return 0;
}

function writeState(game, x, y, z, state) {
  game.world.setBlock(x, y, z, state);
  game.multiplayer?.pushBlockChange(x, y, z, state);
}

function applyMechanism(game, x, y, z, state, powered) {
  if (state.block.renderShape === 'door') {
    const lowerY = state.get('half') === 'upper' ? y - 1 : y;
    const lower = game.world.getBlock(x, lowerY, z);
    const upper = game.world.getBlock(x, lowerY + 1, z);
    if (lower.block.renderShape !== 'door' || upper.block.renderShape !== 'door') return;
    if (lower.get('open') !== powered) writeState(game, x, lowerY, z, lower.with('open', powered));
    if (upper.get('open') !== powered) writeState(game, x, lowerY + 1, z, upper.with('open', powered));
  } else if (state.block.renderShape === 'trapdoor' && state.get('open') !== powered) {
    writeState(game, x, y, z, state.with('open', powered));
  } else if (state.block.id === 'mc:redstone_lamp' && state.get('lit') !== powered) {
    writeState(game, x, y, z, state.with('lit', powered));
  }
}

export const RedstoneDevicesMixin = {
  _applyAdjacentRedstonePower(x, y, z, powered) {
    for (const [dx, dy, dz] of NEIGHBORS) {
      const bx = x + dx, by = y + dy, bz = z + dz;
      applyMechanism(this, bx, by, bz, this.world.getBlock(bx, by, bz), powered);
    }
  },

  _removeAttachedRedstoneDevices(supportX, supportY, supportZ) {
    for (const [dx, dy, dz] of NEIGHBORS) {
      const x = supportX + dx, y = supportY + dy, z = supportZ + dz;
      const state = this.world.getBlock(x, y, z);
      const shape = state.block.renderShape;
      if (!['button', 'lever', 'pressure_plate', 'weighted_pressure_plate'].includes(shape)) continue;
      let sx = x, sy = y - 1, sz = z;
      if (shape !== 'pressure_plate') {
        const face = state.get('face'), facing = state.get('facing');
        if (face === 'ceiling') sy = y + 1;
        else if (face === 'wall') {
          if (facing === 'north') sz = z + 1;
          else if (facing === 'south') sz = z - 1;
          else if (facing === 'east') sx = x - 1;
          else sx = x + 1;
          sy = y;
        }
      }
      if (sx !== supportX || sy !== supportY || sz !== supportZ) continue;
      const wasPowered = state.get('powered') === true || state.get('power') > 0;
      writeState(this, x, y, z, AIR.defaultState);
      if (this.player?.gamemode === 'survival') this.inventory?.addItem(state.block.id, 1);
      if (wasPowered) this._applyAdjacentRedstonePower(x, y, z, false);
    }
  },

  _tickRedstoneDevices() {
    const world = this.world;
    const tick = this.tickCount || 0;
    this._redstoneDeviceTimers ||= new Map();
    this._pressurePlateTimers ||= new Map();
    this._knownPressurePlates ||= new Set();

    const player = this.player;
    const box = player?.boundingBox();
    const baseX = player ? Math.floor(player.x) : 0;
    const baseY = player ? Math.floor(player.y) : 0;
    const baseZ = player ? Math.floor(player.z) : 0;

    // Discover nearby powered buttons replicated from another player and give
    // them the same finite pulse as a locally pressed button.
    if (player) {
      for (let y = baseY - 2; y <= baseY + 3; y++) {
        for (let x = baseX - 4; x <= baseX + 4; x++) for (let z = baseZ - 4; z <= baseZ + 4; z++) {
          const state = world.getBlock(x, y, z);
          if (state.block.renderShape !== 'button' || !state.get('powered')) continue;
          const key = `${x},${y},${z}`;
          if (!this._redstoneDeviceTimers.has(key)) {
            const wooden = !['mc:stone_button', 'mc:polished_blackstone_button'].includes(state.block.id);
            this._redstoneDeviceTimers.set(key, { due: tick + (wooden ? 30 : 20) });
          }
        }
      }
    }

    for (const [key, timer] of this._redstoneDeviceTimers) {
      const [x, y, z] = key.split(',').map(Number);
      const state = world.getBlock(x, y, z);
      if (state.block.renderShape !== 'button' || !state.get('powered')) {
        this._redstoneDeviceTimers.delete(key);
        continue;
      }
      if (tick >= timer.due) {
        writeState(this, x, y, z, state.with('powered', false));
        this._redstoneDeviceTimers.delete(key);
        this._applyAdjacentRedstonePower(x, y, z, false);
      }
    }

    const activeNow = new Set();
    const activatePressurePlate = (x, y, z) => {
      const state = world.getBlock(x, y, z);
      if (state.block.renderShape !== 'pressure_plate') return;
      const key = `${x},${y},${z}`;
      activeNow.add(key);
      this._knownPressurePlates.add(key);
      this._pressurePlateTimers.delete(key);
      if (!state.get('powered')) {
        writeState(this, x, y, z, state.with('powered', true));
        this._applyAdjacentRedstonePower(x, y, z, true);
      }
    };
    // Pick up previously powered plates in the nearby loaded area as well, so
    // a save/reconnect cannot leave one latched after the player has moved off.
    if (player) {
      for (let y = baseY - 1; y <= baseY; y++) {
        for (let x = baseX - 4; x <= baseX + 4; x++) for (let z = baseZ - 4; z <= baseZ + 4; z++) {
          const state = world.getBlock(x, y, z);
          if (state.block.renderShape === 'pressure_plate' && state.get('powered')) {
            this._knownPressurePlates.add(`${x},${y},${z}`);
          }
        }
      }
    }
    if (player && !player.flying && box) {
      const minX = Math.floor(box.minX), maxX = Math.floor(box.maxX);
      const minZ = Math.floor(box.minZ), maxZ = Math.floor(box.maxZ);
      for (let y = baseY - 1; y <= baseY; y++) {
        for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
          const state = world.getBlock(x, y, z);
          if (state.block.renderShape !== 'pressure_plate') continue;
          const key = `${x},${y},${z}`;
          const overlaps = box.minX < x + 1 && box.maxX > x
            && box.minZ < z + 1 && box.maxZ > z
            && box.minY <= y + 0.09 && box.maxY > y;
          if (!overlaps) continue;
          activatePressurePlate(x, y, z);
        }
      }
    }

    // Mobs activate both stone and wooden plates; dropped item entities
    // activate wooden plates only. Each entity contributes one press.
    for (const mob of this.entities?.mobs || []) {
      if (!mob || !Number.isFinite(mob.x) || !Number.isFinite(mob.y) || !Number.isFinite(mob.z)) continue;
      for (let x = Math.floor(mob.x - 0.3); x <= Math.floor(mob.x + 0.3); x++) {
        for (let z = Math.floor(mob.z - 0.3); z <= Math.floor(mob.z + 0.3); z++) {
          if (mob.x + 0.3 <= x || mob.x - 0.3 >= x + 1 || mob.z + 0.3 <= z || mob.z - 0.3 >= z + 1) continue;
          for (const y of [Math.floor(mob.y), Math.floor(mob.y) - 1]) {
            if (mob.y <= y + 0.1 && mob.y + 1.8 > y) activatePressurePlate(x, y, z);
          }
        }
      }
    }
    for (const drop of this.entities?.droppedItems || []) {
      if (!drop || !Number.isFinite(drop.x) || !Number.isFinite(drop.y) || !Number.isFinite(drop.z)) continue;
      const x = Math.floor(drop.x), z = Math.floor(drop.z);
      for (const y of [Math.floor(drop.y), Math.floor(drop.y) - 1]) {
        const state = world.getBlock(x, y, z);
        const wooden = state.block.renderShape === 'pressure_plate' &&
          !['mc:stone_pressure_plate', 'mc:polished_blackstone_pressure_plate'].includes(state.block.id);
        if (wooden && drop.x >= x && drop.x < x + 1 && drop.z >= z && drop.z < z + 1 &&
            drop.y >= y && drop.y <= y + 0.25) activatePressurePlate(x, y, z);
      }
    }

    for (const key of this._knownPressurePlates) {
      if (activeNow.has(key)) continue;
      if (!this._pressurePlateTimers.has(key)) this._pressurePlateTimers.set(key, { due: tick + 10 });
    }
    for (const [key, timer] of this._pressurePlateTimers) {
      if (activeNow.has(key) || tick < timer.due) continue;
      const [x, y, z] = key.split(',').map(Number);
      const state = world.getBlock(x, y, z);
      if (state.block.renderShape === 'pressure_plate' && state.get('powered')) {
        writeState(this, x, y, z, state.with('powered', false));
        this._applyAdjacentRedstonePower(x, y, z, false);
      }
      this._pressurePlateTimers.delete(key);
      this._knownPressurePlates.delete(key);
    }

    this._tickDaylightDetectors(baseX, baseY, baseZ, !!player);
    this._tickWeightedPressurePlates(baseX, baseY, baseZ, !!player);
    this._tickRepeaters(baseX, baseY, baseZ, !!player);
    this._tickComparators(baseX, baseY, baseZ, !!player);
    this._tickRedstoneWireNetwork(baseX, baseY, baseZ, !!player);
    this._tickRedstoneTorches(baseX, baseY, baseZ, !!player);
    this._tickRedstoneLamps(baseX, baseY, baseZ, !!player);
    this._tickNoteBlocks(baseX, baseY, baseZ, !!player);
  },

  _tickRedstoneTorches(baseX, baseY, baseZ, hasPlayer) {
    if (!hasPlayer) return;
    const world = this.world;
    // Floor-mounted redstone torches invert the power state of the solid block
    // beneath them. Wall-mounted orientation and burnout are tracked separately.
    for (let y = baseY - 3; y <= baseY + 4; y++) {
      for (let x = baseX - 8; x <= baseX + 8; x++) for (let z = baseZ - 8; z <= baseZ + 8; z++) {
        const state = world.getBlock(x, y, z);
        if (state.block.id !== 'mc:redstone_torch') continue;
        const sx = x, sy = y - 1, sz = z;
        let supportPowered = false;
        for (const [dx, dy, dz] of NEIGHBORS) {
          const nx = sx + dx, ny = sy + dy, nz = sz + dz;
          if (nx === x && ny === y && nz === z) continue;
          if (readSignal(world, nx, ny, nz, sx, sy, sz) > 0) { supportPowered = true; break; }
        }
        const lit = !supportPowered;
        if (state.get('lit') === lit) continue;
        writeState(this, x, y, z, state.with('lit', lit));
        this._applyAdjacentRedstonePower(x, y, z, lit);
      }
    }
  },

  _tickRedstoneLamps(baseX, baseY, baseZ, hasPlayer) {
    if (!hasPlayer) return;
    const world = this.world;
    for (let y = baseY - 3; y <= baseY + 4; y++) {
      for (let x = baseX - 8; x <= baseX + 8; x++) for (let z = baseZ - 8; z <= baseZ + 8; z++) {
        const state = world.getBlock(x, y, z);
        if (state.block.id !== 'mc:redstone_lamp') continue;
        let powered = false;
        for (const [dx, dy, dz] of NEIGHBORS) {
          if (readSignal(world, x + dx, y + dy, z + dz, x, y, z) > 0) { powered = true; break; }
        }
        if (state.get('lit') !== powered) writeState(this, x, y, z, state.with('lit', powered));
      }
    }
  },

  _tickNoteBlocks(baseX, baseY, baseZ, hasPlayer) {
    if (!hasPlayer) return;
    const world = this.world;
    for (let y = baseY - 3; y <= baseY + 3; y++) {
      for (let x = baseX - 8; x <= baseX + 8; x++) for (let z = baseZ - 8; z <= baseZ + 8; z++) {
        const state = world.getBlock(x, y, z);
        if (state.block.id !== 'mc:note_block') continue;
        let powered = false;
        for (const [dx,dy,dz] of NEIGHBORS) {
          if (readSignal(world,x+dx,y+dy,z+dz,x,y,z) > 0) { powered = true; break; }
        }
        if (powered === state.get('powered')) continue;
        const next = state.with('powered', powered);
        writeState(this,x,y,z,next);
        if (powered) {
          const support = world.getBlock(x,y-1,z);
          this.sounds?.playNote(state.get('note'),support.block.soundGroup || 'wood');
        }
      }
    }
  },

  _tickDaylightDetectors(baseX, baseY, baseZ, hasPlayer) {
    if (!hasPlayer) return;
    const world = this.world;
    for (let y = baseY - 3; y <= baseY + 3; y++) {
      for (let x = baseX - 8; x <= baseX + 8; x++) for (let z = baseZ - 8; z <= baseZ + 8; z++) {
        const state = world.getBlock(x, y, z);
        if (state.block.id !== 'mc:daylight_detector') continue;
        const power = daylightDetectorPower(world.time, state.get('inverted'));
        if (state.get('power') === power) continue;
        const next = state.with('power', power);
        writeState(this, x, y, z, next);
        if ((state.get('power') > 0) !== (power > 0)) this._applyAdjacentRedstonePower(x, y, z, power > 0);
      }
    }
  },

  _tickWeightedPressurePlates(baseX, baseY, baseZ, hasPlayer) {
    if (!hasPlayer) return;
    const world = this.world;
    const minX = baseX - 4, maxX = baseX + 4;
    const minY = baseY - 2, maxY = baseY + 1;
    const minZ = baseZ - 4, maxZ = baseZ + 4;
    const mobs = this.entities?.mobs || [];
    const drops = this.entities?.droppedItems || [];
    const playerBox = this.player?.boundingBox();
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const state = world.getBlock(x, y, z);
      if (state.block.renderShape !== 'weighted_pressure_plate') continue;
      let count = 0;
      if (playerBox && !this.player.flying && playerBox.minX < x + 1 && playerBox.maxX > x &&
          playerBox.minZ < z + 1 && playerBox.maxZ > z && playerBox.minY <= y + 0.09 && playerBox.maxY > y) count++;
      for (const mob of mobs) {
        if (!mob || !Number.isFinite(mob.x) || !Number.isFinite(mob.y) || !Number.isFinite(mob.z)) continue;
        if (mob.x + 0.3 > x && mob.x - 0.3 < x + 1 && mob.z + 0.3 > z && mob.z - 0.3 < z + 1 &&
            mob.y <= y + 0.1 && mob.y + 1.8 > y) count++;
      }
      for (const drop of drops) {
        if (!drop || !Number.isFinite(drop.x) || !Number.isFinite(drop.y) || !Number.isFinite(drop.z)) continue;
        if (drop.x >= x && drop.x < x + 1 && drop.z >= z && drop.z < z + 1 && drop.y >= y && drop.y <= y + 0.25) count++;
      }
      const light = state.block.id === 'mc:light_weighted_pressure_plate';
      const power = light ? Math.min(15, count) : Math.min(15, Math.ceil(count / 10));
      if (state.get('power') === power) continue;
      const next = state.with('power', power);
      writeState(this, x, y, z, next);
      if ((state.get('power') > 0) !== (power > 0)) this._applyAdjacentRedstonePower(x, y, z, power > 0);
    }
  },

  _tickRepeaters(baseX, baseY, baseZ, hasPlayer) {
    if (!hasPlayer) return;
    const world = this.world, tick = this.tickCount || 0;
    this._repeaterTimers ||= new Map();
    for(let y=baseY-3;y<=baseY+4;y++) for(let x=baseX-8;x<=baseX+8;x++) for(let z=baseZ-8;z<=baseZ+8;z++) {
      const state=world.getBlock(x,y,z);
      if(state.block.renderShape!=='repeater') continue;
      const [dx,dy,dz]=FACING_VECTOR[state.get('facing')] || [0,0,-1];
      const input=readSignal(world,x-dx,y-dy,z-dz,x,y,z)>0;
      const key=`${x},${y},${z}`;
      if(input===state.get('powered')) { this._repeaterTimers.delete(key); continue; }
      const pending=this._repeaterTimers.get(key);
      if(!pending || pending.powered!==input) this._repeaterTimers.set(key,{powered:input,due:tick+state.get('delay')*4});
    }
    for(const [key,timer] of this._repeaterTimers) {
      const [x,y,z]=key.split(',').map(Number), state=world.getBlock(x,y,z);
      if(state.block.renderShape!=='repeater') { this._repeaterTimers.delete(key); continue; }
      if(tick<timer.due) continue;
      const next=state.with('powered',timer.powered);
      writeState(this,x,y,z,next);
      this._repeaterTimers.delete(key);
      const [dx,dy,dz]=FACING_VECTOR[next.get('facing')] || [0,0,-1];
      const out=world.getBlock(x+dx,y+dy,z+dz);
      applyMechanism(this,x+dx,y+dy,z+dz,out,timer.powered);
    }
  },

  _tickComparators(baseX, baseY, baseZ, hasPlayer) {
    if (!hasPlayer) return;
    const world = this.world, tick = this.tickCount || 0;
    this._comparatorTimers ||= new Map();
    const sideSignal = (x, y, z, tx, ty, tz) => {
      const state = world.getBlock(x, y, z);
      if (state.block.id === 'mc:redstone_block') return 15;
      if (!['redstone_wire', 'repeater', 'comparator'].includes(state.block.renderShape)) return 0;
      return readSignal(world, x, y, z, tx, ty, tz);
    };
    for (let y = baseY - 3; y <= baseY + 4; y++) {
      for (let x = baseX - 8; x <= baseX + 8; x++) for (let z = baseZ - 8; z <= baseZ + 8; z++) {
        const state = world.getBlock(x, y, z);
        if (state.block.renderShape !== 'comparator') continue;
        const [dx, , dz] = FACING_VECTOR[state.get('facing')] || [0, 0, -1];
        const rearX = x - dx, rearY = y, rearZ = z - dz;
        const rearBlock = world.getBlock(rearX, rearY, rearZ);
        let containerPower = 0;
        if (rearBlock.block.id === 'mc:chest' || rearBlock.block.id === 'mc:trapped_chest') {
          const chest = this._chestAt?.(rearX, rearY, rearZ);
          if (chest?.slots) containerPower = comparatorContainerOutput(chest.slots, chest.slots.length);
        } else if (rearBlock.block.id === 'mc:furnace') {
          const furnace = this._furnaceAt?.(rearX, rearY, rearZ);
          if (furnace) containerPower = comparatorContainerOutput([furnace.input, furnace.fuel, furnace.output], 3);
        }
        const rear = Math.max(readSignal(world, rearX, rearY, rearZ, x, y, z), containerPower);
        const left = sideSignal(x + dz, y, z - dx, x, y, z);
        const right = sideSignal(x - dz, y, z + dx, x, y, z);
        const desired = comparatorOutput(rear, left, right, state.get('mode') === 'subtract');
        const key = String(x) + ',' + y + ',' + z;
        if (desired === state.get('power')) { this._comparatorTimers.delete(key); continue; }
        const pending = this._comparatorTimers.get(key);
        if (!pending || pending.power !== desired) this._comparatorTimers.set(key, { power: desired, due: tick + 2 });
      }
    }
    for (const [key, pending] of this._comparatorTimers) {
      const [x, y, z] = key.split(',').map(Number);
      const state = world.getBlock(x, y, z);
      if (state.block.renderShape !== 'comparator') { this._comparatorTimers.delete(key); continue; }
      if (tick < pending.due) continue;
      const next = state.with('power', pending.power).with('powered', pending.power > 0);
      writeState(this, x, y, z, next);
      this._comparatorTimers.delete(key);
      const [dx, dy, dz] = FACING_VECTOR[next.get('facing')] || [0, 0, -1];
      applyMechanism(this, x + dx, y + dy, z + dz, world.getBlock(x + dx, y + dy, z + dz), pending.power > 0);
    }
  },

  _tickRedstoneWireNetwork(baseX, baseY, baseZ, hasPlayer) {
    if (!hasPlayer) return;
    const world = this.world;
    const minX = baseX - 8, maxX = baseX + 8;
    const minY = baseY - 3, maxY = baseY + 4;
    const minZ = baseZ - 8, maxZ = baseZ + 8;
    const wires = new Map();
    const keyOf = (x,y,z) => `${x},${y},${z}`;
    const sourcePower = (x,y,z,targetX,targetY,targetZ) => readSignal(world,x,y,z,targetX,targetY,targetZ);
    for (let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) for(let z=minZ;z<=maxZ;z++) {
      const state=world.getBlock(x,y,z);
      if(state.block.renderShape==='redstone_wire') wires.set(keyOf(x,y,z),{x,y,z,state,power:0});
    }
    if (!wires.size) return;
    for (const wire of wires.values()) {
      for (const [dx,dy,dz] of NEIGHBORS) wire.power=Math.max(wire.power,sourcePower(wire.x+dx,wire.y+dy,wire.z+dz,wire.x,wire.y,wire.z));
    }
    for(let pass=0;pass<15;pass++) {
      let changed=false;
      for(const wire of wires.values()) {
        let next=wire.power;
        for(const [dx,dy,dz] of HORIZONTAL) {
          const neighbor=wires.get(keyOf(wire.x+dx,wire.y+dy,wire.z+dz));
          if(neighbor) next=Math.max(next,neighbor.power-1);
          const above=wires.get(keyOf(wire.x+dx,wire.y+1,wire.z+dz));
          if(above) next=Math.max(next,above.power-1);
          const below=wires.get(keyOf(wire.x+dx,wire.y-1,wire.z+dz));
          if(below) next=Math.max(next,below.power-1);
        }
        next=Math.max(0,next);
        if(next!==wire.power){wire.power=next;changed=true;}
      }
      if(!changed)break;
    }
    for(const wire of wires.values()) {
      const old=wire.state;
      let next=old;
      if(old.get('power')!==wire.power)next=next.with('power',wire.power);
      for(const [dx,dy,dz,prop] of [[1,0,0,'east'],[-1,0,0,'west'],[0,0,1,'south'],[0,0,-1,'north']]) {
        const connected=wires.has(keyOf(wire.x+dx,wire.y+dy,wire.z+dz)) || sourcePower(wire.x+dx,wire.y+dy,wire.z+dz,wire.x,wire.y,wire.z)>0;
        if(next.get(prop)!==connected)next=next.with(prop,connected);
      }
      if(next!==old)writeState(this,wire.x,wire.y,wire.z,next);
    }
    for(const wire of wires.values()) {
      const powered=wire.power>0;
      for(const [dx,dy,dz] of NEIGHBORS) {
        const x=wire.x+dx,y=wire.y+dy,z=wire.z+dz;
        const state=world.getBlock(x,y,z);
        if(['door','trapdoor'].includes(state.block.renderShape)) applyMechanism(this,x,y,z,state,powered);
      }
    }
  },
};
