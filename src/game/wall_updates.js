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
    if (world.setBlock(x, y, z, next, { relight: false })) {
      multiplayer?.pushBlockChange(x, y, z, next);
      updated.push({ x, y, z, state: next });
    }
  }
  return updated;
}


/**
 * Rebuild wall states when a chunk becomes available.
 *
 * Old saves did not persist the Java wall connection properties. Scanning only
 * sections whose palette contains a wall keeps the load-time cost proportional
 * to sections that can actually contain walls. At chunk seams, also revisit
 * walls on the four touching edges of already-loaded neighbours.
 */
export function refreshWallConnectionsInChunk(world, chunk, multiplayer = null) {
  const positions = [];
  const collect = (candidate, edge = null) => {
    if (!candidate) return;
    const baseX = candidate.cx * 16;
    const baseZ = candidate.cz * 16;
    for (const section of candidate.sections) {
      if (!section) continue;
      if (!section.blocks.palette.some((state) => state?.block?.renderShape === 'wall')) continue;
      for (let i = 0; i < 4096; i++) {
        const state = section.blocks.get(i);
        if (state?.block?.renderShape !== 'wall') continue;
        const x = i & 15;
        const z = (i >> 4) & 15;
        if (edge && (
          (edge.dx === 1 && x !== 0) ||
          (edge.dx === -1 && x !== 15) ||
          (edge.dz === 1 && z !== 0) ||
          (edge.dz === -1 && z !== 15)
        )) continue;
        positions.push({
          x: baseX + x,
          y: section.yOffset + ((i >> 8) & 15),
          z: baseZ + z,
        });
      }
    }
  };

  collect(chunk);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    collect(world.getChunk(chunk.cx + dx, chunk.cz + dz), { dx, dz });
  }
  return positions.length ? refreshWallConnections(world, multiplayer, ...positions) : [];
}
