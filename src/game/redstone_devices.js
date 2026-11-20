/**
 * Small redstone-device simulation for the Java 1.19 compatibility track.
 *
 * This first pass handles player-operated buttons/levers and player-triggered
 * pressure plates. Power is applied to adjacent doors and trapdoors. Dust,
 * repeaters, comparators, pistons and mob/item plate activation are separate
 * follow-up systems; this module intentionally does not pretend those exist.
 */
const NEIGHBORS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

function writeState(game, x, y, z, state) {
  game.world.setBlock(x, y, z, state);
  game.multiplayer?.pushBlockChange(x, y, z, state);
}

function setMechanism(game, x, y, z, state, powered) {
  const shape = state.block.renderShape;
  if (shape === 'door') {
    const lowerY = state.get('half') === 'upper' ? y - 1 : y;
    const lower = game.world.getBlock(x, lowerY, z);
    const upper = game.world.getBlock(x, lowerY + 1, z);
    if (lower.block.renderShape !== 'door' || upper.block.renderShape !== 'door') return;
    if (lower.get('open') !== powered) writeState(game, x, lowerY, z, lower.with('open', powered));
    if (upper.get('open') !== powered) writeState(game, x, lowerY + 1, z, upper.with('open', powered));
  } else if (shape === 'trapdoor' && state.get('open') !== powered) {
    writeState(game, x, y, z, state.with('open', powered));
  }
}

export const RedstoneDevicesMixin = {
  _applyAdjacentRedstonePower(x, y, z, powered) {
    for (const [dx, dy, dz] of NEIGHBORS) {
      const bx = x + dx, by = y + dy, bz = z + dz;
      const state = this.world.getBlock(bx, by, bz);
      setMechanism(this, bx, by, bz, state, powered);
    }
  },

  _tickRedstoneDevices() {
    const world = this.world;
    const tick = this.tickCount || 0;
    this._redstoneDeviceTimers ||= new Map();
    this._pressurePlateTimers ||= new Map();

    // Replicated powered buttons also get a local expiry, so a joining peer
    // does not leave a button permanently pressed after receiving its state.
    for ((let entry of this._redstoneDeviceTimers)) {
      const [key, timer] = entry;
      const [x, y, z] = key.split(',').map(Number);
      const state = world.getBlock(x, y, z);
      if (state.block.renderShape !== 'button' || !state.get('powered')) {
        this._redstoneDeviceTimers.delete(key);
        continue;
      }
      if (tick >= timer.due) {
        const next = state.with('powered', false);
        writeState(this, x, y, z, next);
        this._redstoneDeviceTimers.delete(key);
        this._applyAdjacentRedstonePower(x, y, z, false);
      }
    }

    const player = this.player;
    const activePlates = new Set();
    if (player && !player.flying) {
      const box = player.boundingBox();
      const minX = Math.floor(box.minX), maxX = Math.floor(box.maxX);
      const minZ = Math.floor(box.minZ), maxZ = Math.floor(box.maxZ);
      const baseY = Math.floor(player.y);
      for (let y = baseY - 1; y <= baseY; y++) {
        for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
          const state = world.getBlock(x, y, z);
          if (state.block.renderShape !== 'pressure_plate') continue;
          const key = `${x},${y},${z}`;
          const overPlate = box.minX < x + 1 && box.maxX > x
            && box.minZ < z + 1 && box.maxZ > z
            && box.minY <= y + 0.09 && box.maxY > y;
          if (!overPlate) continue;
          activePlates.add(key);
          this._pressurePlateTimers.delete(key);
          if (!state.get('powered')) {
            writeState(this, x, y, z, state.with('powered', true));
            this._applyAdjacentRedstonePower(x, y, z, true);
          }
        }
      }
    }

    for (const [key, timer] of this._pressurePlateTimers) {
      if (activePlates.has(key)) {
        this._pressurePlateTimers.delete(key);
        continue;
      }
      if (tick < timer.due) continue;
      const [x, y, z] = key.split(',').map(Number);
      const state = world.getBlock(x, y, z);
      if (state.block.renderShape === 'pressure_plate' && state.get('powered')) {
        writeState(this, x, y, z, state.with('powered', false));
        this._applyAdjacentRedstonePower(x, y, z, false);
      }
      this._pressurePlateTimers.delete(key);
    }

    // Start a short release delay after a player leaves a plate.
    for (const [key] of this._pressurePlateTimers) {
      if (activePlates.has(key)) this._pressurePlateTimers.delete(key);
    }
    // Find powered plates around the player and schedule their release once no
    // player intersects them. The scan stays bounded to the current area.
    if (player) {
      const box = player.boundingBox();
      const minX = Math.floor(box.minX) - 1, maxX = Math.floor(box.maxX) + 1;
      const minZ = Math.floor(box.minZ) - 1, maxZ = Math.floor(box.maxZ) + 1;
      const baseY = Math.floor(player.y);
      for (let y = baseY - 1; y <= baseY; y++) for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const state = world.getBlock(x, y, z);
        if (state.block.renderShape !== 'pressure_plate' || !state.get('powered')) continue;
        const key = `${x},${y},${z}`;
        if (!activePlates.has(key) && !this._pressurePlateTimers.has(key)) {
          this._pressurePlateTimers.set(key, { due: tick + 10 });
        }
      }
    }
  },
};
