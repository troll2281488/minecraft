/**
 * Fence connectivity is derived from the four horizontal neighbours. The
 * resulting booleans are blockstate data, so rendering, collision and
 * multiplayer all agree without a per-frame world scan in the mesher.
 */
const DIRECTIONS = [
  ['north', 0, 0, -1],
  ['south', 0, 0, 1],
  ['east', 1, 0, 0],
  ['west', -1, 0, 0],
];

export const FenceMixin = {
  _updateFenceConnectionsAround(x, y, z) {
    const positions = [[x, y, z],
      [x, y, z - 1], [x, y, z + 1], [x + 1, y, z], [x - 1, y, z]];
    for (const [fx, fy, fz] of positions) {
      const state = this.world.getBlock(fx, fy, fz);
      if (state.block.renderShape !== 'fence') continue;
      let next = state;
      for (const [direction, dx, dy, dz] of DIRECTIONS) {
        const neighbor = this.world.getBlock(fx + dx, fy + dy, fz + dz);
        const connects = neighbor.block.renderShape === 'fence'
          || neighbor.block.renderShape === 'fence_gate'
          || (neighbor.block.solid && neighbor.block.opaqueCube);
        if (next.get(direction) !== connects) next = next.with(direction, connects);
      }
      if (next.stringId !== state.stringId) {
        this.world.setBlock(fx, fy, fz, next);
        this.multiplayer?.pushBlockChange(fx, fy, fz, next);
      }
    }
  },
};
