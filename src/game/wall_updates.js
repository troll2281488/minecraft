/**
 * Persist wall neighbour connections as ordinary blockstates.
 *
 * Recalculation is event-driven: callers pass only positions whose blocks
 * changed. The helper inspects the affected walls and publishes only states
 * that actually changed, avoiding background polling and redundant traffic.
 */
import { wallStateFromNeighbors } from '../world/shapes.js';

const HORIZONTAL = Object.freeze([
  [0, 0, 0],
  [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0],
  [0, -1, 0],
]);

export function refreshWallConnections(world, multiplayer, ...changedPositions) {
  const candidates = new Map();
  for (const position of changedPositions) {
    if (!position) continue;
    const { x, y, z } = position;
    for (const [dx, dy, dz] of HORIZONTAL) {
      const px = x + dx, py = y + dy, pz = z + dz;
      candidates.set(`${px},${py},${pz}`, { x: px, y: py, z: pz });
    }
  }

  const updated = [];
  for (const { x, y, z } of candidates.values()) {
    const state = world.getBlock(x, y, z);
    if (state.block.renderShape !== 'wall') continue;
    const next = wallStateFromNeighbors(state, (dx, dy, dz) =>
      world.getBlock(x + dx, y + dy, z + dz));
    if (next.stringId === state.stringId) continue;
    if (world.setBlock(x, y, z, next)) {
      multiplayer?.pushBlockChange(x, y, z, next);
      updated.push({ x, y, z, state: next });
    }
  }
  return updated;
}
