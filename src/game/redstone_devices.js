import { AIR } from '../world/block.js';

/**
 * Small redstone-device simulation for the Java 1.19 compatibility track.
 * Buttons, levers and player-triggered pressure plates power adjacent doors
 * and trapdoors. Dust, repeaters, comparators, pistons and mob/item activation
 * remain separate systems and are not claimed as implemented here.
 */
const NEIGHBORS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

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
  },
};
