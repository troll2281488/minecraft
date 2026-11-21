/**
 * Piston movement rules shared by the redstone tick and regression tests.
 *
 * The planner is pure: it never mutates the world. A piston only commits a
 * complete plan after the full push line and all slime-block attachments have
 * been checked, so a failed push cannot leave a partially moved structure.
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
const DIRECTIONS = Object.freeze(Object.values(VECTOR));

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

function stickyKind(state) {
  if (state?.block?.id === 'mc:slime_block') return 'slime';
  if (state?.block?.id === 'mc:honey_block') return 'honey';
  return null;
}

/** Slime and honey adhere to ordinary blocks, but never to each other. */
export function pistonBlocksStick(a, b) {
  const ak = stickyKind(a), bk = stickyKind(b);
  return !!(ak || bk) && !(ak && bk && ak !== bk);
}

function positionKey(x, y, z) {
  return `${x},${y},${z}`;
}

/**
 * Plan a complete push. Returns near-to-far source/destination pairs, or null
 * if any attached block is immovable, unloaded, outside build height, or would
 * exceed the 12-block limit. The caller commits farthest-first.
 */
export function planPistonMove(world, x, y, z, facing) {
  const vector = pistonVector(facing);
  if (!vector) return null;
  const [dx, dy, dz] = vector;
  const originKey = positionKey(x, y, z);
  const queue = [{ x: x + dx, y: y + dy, z: z + dz }];
  const queued = new Set([positionKey(x + dx, y + dy, z + dz)]);
  const moved = new Map();

  while (queue.length) {
    const pos = queue.shift();
    const key = positionKey(pos.x, pos.y, pos.z);
    if (key === originKey || moved.has(key)) continue;
    if (!isPistonCellLoaded(world, pos.x, pos.y, pos.z)) return null;
    const state = world.getBlock(pos.x, pos.y, pos.z);
    if (!state || state.block === AIR || state.block.id === 'mc:air') continue;
    if (!canPistonMove(state)) return null;

    moved.set(key, { from: pos, state });
    if (moved.size > PISTON_MAX_PUSH) return null;

    // Every pushed block must have a free destination. If it is occupied,
    // that block joins the push line even when it is beside a slime block.
    const forward = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
    const forwardKey = positionKey(forward.x, forward.y, forward.z);
    if (!queued.has(forwardKey)) {
      queued.add(forwardKey);
      queue.push(forward);
    }

    // Sticky blocks pull/push connected blocks on their sides and above/below.
    // Check both ends of each edge so a regular block touching slime is found
    // even when the regular block itself is processed first.
    for (const [sx, sy, sz] of DIRECTIONS) {
      if (sx === -dx && sy === -dy && sz === -dz) continue;
      const nx = pos.x + sx, ny = pos.y + sy, nz = pos.z + sz;
      const neighborKey = positionKey(nx, ny, nz);
      if (neighborKey === originKey || moved.has(neighborKey) || queued.has(neighborKey)) continue;
      if (!isPistonCellLoaded(world, nx, ny, nz)) return null;
      const neighbor = world.getBlock(nx, ny, nz);
      if (neighbor.block === AIR || neighbor.block.id === 'mc:air') continue;
      if (!pistonBlocksStick(state, neighbor)) continue;
      queued.add(neighborKey);
      queue.push({ x: nx, y: ny, z: nz });
    }
  }

  const moves = [...moved.values()];
  // Stable near-to-far order is useful for tests and diagnostics. The commit
  // site sorts by projection and writes the farthest cells first.
  moves.sort((a, b) =>
    (a.from.x - x) * dx + (a.from.y - y) * dy + (a.from.z - z) * dz -
    ((b.from.x - x) * dx + (b.from.y - y) * dy + (b.from.z - z) * dz));
  return moves.map((move) => ({
    ...move,
    to: { x: move.from.x + dx, y: move.from.y + dy, z: move.from.z + dz },
  }));
}
