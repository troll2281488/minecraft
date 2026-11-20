/**
 * Piston movement rules shared by the redstone tick and regression tests.
 *
 * The planner is pure: it never mutates the world. A piston only commits a
 * complete plan after the entire line has been checked, so a failed push can
 * never leave half the blocks moved.
 */
import { AIR } from '../world/block.js';
import { MIN_Y, MAX_Y } from '../core/constants.js';
import { blockToChunk, chunkKey } from '../core/math.js';

export const PISTON_MAX_PUSH = 12;

const IMMOBILE_IDS = new Set([
  'mc:bedrock', 'mc:obsidian', 'mc:crying_obsidian', 'mc:respawn_anchor',
  'mc:ender_chest', 'mc:mob_spawner', 'mc:piston', 'mc:sticky_piston',
  'mc:piston_head', 'mc:portal', 'mc:end_portal', 'mc:end_gateway',
  'mc:chest', 'mc:trapped_chest', 'mc:furnace', 'mc:hopper', 'mc:dropper',
  'mc:dispenser', 'mc:barrel', 'mc:shulker_box',
]);

const VECTOR = Object.freeze({
  north: [0, 0, -1], south: [0, 0, 1],
  west: [-1, 0, 0], east: [1, 0, 0],
  up: [0, 1, 0], down: [0, -1, 0],
});

export function pistonVector(facing) {
  return VECTOR[facing] || null;
}

export function isPistonCellLoaded(world, x, y, z) {
  if (y < MIN_Y || y >= MAX_Y) return false;
  // World.getBlock deliberately returns air for unloaded chunks. A piston must
  // distinguish that from real air or it could erase a block at a chunk seam.
  if (world?.chunks instanceof Map) {
    return world.chunks.has(chunkKey(blockToChunk(x), blockToChunk(z)));
  }
  return true;
}

export function canPistonMove(state) {
  if (!state || state.block === AIR || state.block.id === 'mc:air') return true;
  const block = state.block;
  if (block.isUnbreakable || block.pushReaction === 'block') return false;
  if (IMMOBILE_IDS.has(block.id)) return false;
  return true;
}

/**
 * Return near-to-far source/destination pairs, or null if the push is blocked.
 * The caller applies the returned list in reverse order (farthest first).
 */
export function planPistonMove(world, x, y, z, facing) {
  const vector = pistonVector(facing);
  if (!vector) return null;
  const [dx, dy, dz] = vector;
  const moves = [];

  for (let distance = 1; distance <= PISTON_MAX_PUSH + 1; distance++) {
    const sx = x + dx * distance;
    const sy = y + dy * distance;
    const sz = z + dz * distance;
    if (!isPistonCellLoaded(world, sx, sy, sz)) return null;
    const state = world.getBlock(sx, sy, sz);

    if (state.block === AIR || state.block.id === 'mc:air') {
      return moves.map((move) => ({
        ...move,
        to: { x: move.from.x + dx, y: move.from.y + dy, z: move.from.z + dz },
      }));
    }
    if (distance > PISTON_MAX_PUSH || !canPistonMove(state)) return null;
    moves.push({ from: { x: sx, y: sy, z: sz }, state });
  }
  return null;
}
