import { AIR } from '../world/block.js';

const NEIGHBORS = Object.freeze([
  [1, 0, 0], [-1, 0, 0], [0, 1, 0],
  [0, -1, 0], [0, 0, 1], [0, 0, -1],
]);

/**
 * Absorb connected water around a newly placed sponge.
 * Search is bounded to the Java sponge radius and at most 64 water blocks.
 * Only loaded chunks are inspected, so this cannot trigger chunk generation.
 * Returns exact block edits for one batched multiplayer update.
 */
export function absorbWaterAround(world, x, y, z, maxBlocks = 64, maxDistance = 6) {
  if (!world || ![x, y, z].every(Number.isInteger)) return [];
  const limit = Math.max(0, Math.min(64, Math.floor(maxBlocks)));
  const radius = Math.max(0, Math.min(6, Math.floor(maxDistance)));
  if (!limit) return [];

  const queue = [{ x, y, z, distance: 0 }];
  const visited = new Set([`${x},${y},${z}`]);
  const changes = [];
  let cursor = 0;

  while (cursor < queue.length && changes.length < limit) {
    const current = queue[cursor++];
    if (current.distance >= radius) continue;
    for (const [dx, dy, dz] of NEIGHBORS) {
      if (changes.length >= limit) break;
      const nx = current.x + dx, ny = current.y + dy, nz = current.z + dz;
      const key = `${nx},${ny},${nz}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (typeof world.hasChunk === 'function' &&
          !world.hasChunk(Math.floor(nx / 16), Math.floor(nz / 16))) continue;
      const state = world.getBlock(nx, ny, nz);
      if (state?.block?.id !== 'mc:water') continue;
      if (!world.setBlock(nx, ny, nz, AIR.defaultState)) continue;
      changes.push({ x: nx, y: ny, z: nz, state: AIR.defaultState });
      queue.push({ x: nx, y: ny, z: nz, distance: current.distance + 1 });
    }
  }
  return changes;
}
