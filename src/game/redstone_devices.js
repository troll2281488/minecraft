import { AIR } from '../world/block.js';

/**
 * Small redstone-device simulation for the Java 1.19 compatibility track.
 * Buttons, levers, player-triggered pressure plates and redstone dust power
 * adjacent doors/trapdoors. Dust signal strength decays along connected wire.
 * Repeaters, comparators, pistons and mob/item plate activation remain separate.
 */
const NEIGHBORS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const HORIZONTAL = [[1,0,0,'east','west'],[-1,0,0,'west','east'],[0,0,1,'south','north'],[0,0,-1,'north','south']];

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
      if (!['button', 'lever', 'pressure_plate'].includes(shape)) continue;
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
      const wasPowered = state.get('powered') === true;
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
          activeNow.add(key);
          this._knownPressurePlates.add(key);
          this._pressurePlateTimers.delete(key);
          if (!state.get('powered')) {
            writeState(this, x, y, z, state.with('powered', true));
            this._applyAdjacentRedstonePower(x, y, z, true);
          }
        }
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

    this._tickRedstoneWireNetwork(baseX, baseY, baseZ, !!player);
  },

  _tickRedstoneWireNetwork(baseX, baseY, baseZ, hasPlayer) {
    if (!hasPlayer) return;
    const world = this.world;
    const minX = baseX - 8, maxX = baseX + 8;
    const minY = baseY - 3, maxY = baseY + 4;
    const minZ = baseZ - 8, maxZ = baseZ + 8;
    const wires = new Map();
    const keyOf = (x,y,z) => `${x},${y},${z}`;
    const sourcePower = (x,y,z) => {
      const state = world.getBlock(x,y,z);
      if (state.block.id === 'mc:redstone_block') return 15;
      if ((state.block.renderShape === 'lever' || state.block.renderShape === 'button' || state.block.renderShape === 'pressure_plate') && state.get('powered')) return 15;
      return 0;
    };
    for (let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) for(let z=minZ;z<=maxZ;z++) {
      const state=world.getBlock(x,y,z);
      if(state.block.renderShape==='redstone_wire') wires.set(keyOf(x,y,z),{x,y,z,state,power:0});
    }
    if (!wires.size) return;
    for (const wire of wires.values()) {
      for (const [dx,dy,dz] of NEIGHBORS) wire.power=Math.max(wire.power,sourcePower(wire.x+dx,wire.y+dy,wire.z+dz));
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
        const connected=wires.has(keyOf(wire.x+dx,wire.y+dy,wire.z+dz)) || sourcePower(wire.x+dx,wire.y+dy,wire.z+dz)>0;
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
