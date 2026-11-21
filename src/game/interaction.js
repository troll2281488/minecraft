/**
 * Looking at blocks, breaking them, and placing them.
 *
 * The mining formula is the real one:
 *
 *   ticks = hardness * (canHarvest ? 1.5 : 5) / toolSpeed
 *
 * That 1.5-versus-5 split is why mining stone with a wooden pickaxe you cannot
 * harvest with still works, just badly -- and it is the reason mining feels the
 * way it does at every stage of progression. Approximating it produces a game
 * where the tool tiers do not mean what players expect them to.
 */

import { MINING, TICKS_PER_SECOND } from '../core/constants.js';
import { positionalRandom } from '../core/rng.js';
import { forwardVector } from '../core/mat4.js';
import { FACES, AABB, yawToFacing } from '../core/math.js';
import { AIR } from '../world/block.js';
import { ITEMS } from '../world/item.js';

// ---------------------------------------------------------------------------
// Raycasting
// ---------------------------------------------------------------------------

/**
 * Step a ray through the voxel grid, returning the first non-passable block.
 *
 * Amanatides-Woo DDA: advance to the nearest grid plane on each step, so every
 * voxel the ray touches is visited exactly once and none are skipped. Sampling
 * the ray at fixed intervals instead -- the obvious approach -- either misses
 * blocks the ray clips a corner of, or costs many times more steps to avoid it.
 *
 * @returns {{x,y,z,face,state,previous:{x,y,z}}|null}
 */
export function raycast(world, originX, originY, originZ, yaw, pitch, maxDistance) {
  const [dx, dy, dz] = forwardVector(yaw, pitch);

  let x = Math.floor(originX);
  let y = Math.floor(originY);
  let z = Math.floor(originZ);

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const stepZ = Math.sign(dz);

  // Distance along the ray to the next grid plane on each axis. Infinity when
  // the ray is parallel to that axis, which correctly means "never crosses".
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);

  let tMaxX = dx === 0 ? Infinity
    : ((stepX > 0 ? x + 1 - originX : originX - x) / Math.abs(dx));
  let tMaxY = dy === 0 ? Infinity
    : ((stepY > 0 ? y + 1 - originY : originY - y) / Math.abs(dy));
  let tMaxZ = dz === 0 ? Infinity
    : ((stepZ > 0 ? z + 1 - originZ : originZ - z) / Math.abs(dz));

  let face = null;
  let previous = { x, y, z };

  // The +1 lets the loop reach a block exactly at maxDistance rather than
  // stopping one short of it.
  const maxSteps = Math.ceil(maxDistance * 3) + 1;

  for (let i = 0; i < maxSteps; i++) {
    const state = world.getBlock(x, y, z);
    if (state.block !== AIR && state.block.renderShape !== 'none' && isTargetable(state.block)) {
      return { x, y, z, face, state, previous };
    }

    previous = { x, y, z };

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      if (tMaxX > maxDistance) break;
      x += stepX;
      tMaxX += tDeltaX;
      face = stepX > 0 ? FACES[4] : FACES[5]; // entered through west or east
    } else if (tMaxY < tMaxZ) {
      if (tMaxY > maxDistance) break;
      y += stepY;
      tMaxY += tDeltaY;
      face = stepY > 0 ? FACES[0] : FACES[1];
    } else {
      if (tMaxZ > maxDistance) break;
      z += stepZ;
      tMaxZ += tDeltaZ;
      face = stepZ > 0 ? FACES[2] : FACES[3];
    }
  }

  return null;
}

/** Water and air are looked through, not at. */
function isTargetable(block) {
  if (block === AIR) return false;
  if (block.id === 'mc:water') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Mining
// ---------------------------------------------------------------------------

/**
 * How long a block takes to break, in ticks.
 *
 * @param {object} block
 * @param {import('../world/item.js').ItemStack} heldStack
 * @param {object} conditions  { underwater, airborne }
 * @returns {number} ticks, or Infinity for unbreakable blocks
 */
export function breakTicks(block, heldStack, conditions = {}) {
  if (block.isUnbreakable) return Infinity;
  if (block.hardness === 0) return 0;

  const item = heldStack && !heldStack.isEmpty ? heldStack.item : null;
  const correctTool = item && item.tool && item.tool === block.tool;
  const harvestLevel = item?.harvestLevel ?? -1;
  const canHarvest = !block.requiresTool || (correctTool && harvestLevel >= block.harvestLevel);

  let speed = correctTool ? (item.toolSpeed ?? 1) : 1;

  // Efficiency, haste, and mining fatigue all fold into the speed term rather
  // than the divisor -- which is why Efficiency V on a diamond pickaxe is such
  // an enormous jump rather than a linear improvement.
  if (conditions.efficiency > 0) speed += conditions.efficiency ** 2 + 1;
  if (conditions.haste > 0) speed *= 1 + MINING.HASTE_PER_LEVEL * conditions.haste;
  if (conditions.miningFatigue > 0) speed *= MINING.MINING_FATIGUE_BASE ** conditions.miningFatigue;

  if (conditions.underwater && !conditions.aquaAffinity) speed /= MINING.UNDERWATER_PENALTY;
  if (conditions.airborne) speed /= MINING.AIRBORNE_PENALTY;

  const divisor = canHarvest ? MINING.CORRECT_TOOL_DIVISOR : MINING.WRONG_TOOL_DIVISOR;
  const rawTicks = (block.hardness * divisor * TICKS_PER_SECOND) / speed;

  // Rounded UP to a whole tick, and this is not cosmetic.
  //
  // Minecraft accumulates breaking progress once per tick and breaks the block
  // on the tick that progress crosses 1.0, so the real duration is always a
  // whole number of ticks. Returning the unrounded value makes every mining
  // time in the game come out a few percent fast: stone with a wooden pickaxe
  // is 22.5 ticks of progress, which takes 23 ticks -- 1.15 s, not 1.125 s.
  //
  // With the ceiling, the published vanilla figures reproduce exactly rather
  // than approximately: 0.6, 0.4, 0.3, 0.2 for stone by tier, 9.4 for obsidian
  // with a diamond pickaxe, 0.75 for dirt by hand.
  //
  // The epsilon is not paranoia. Leaves are hardness 0.2, and 0.2 * 1.5 * 20
  // evaluates to 6.000000000000001 in IEEE 754 -- so a bare ceil returns 7 and
  // every block whose duration lands on a whole tick silently costs an extra
  // one. Nudging down by far less than a tick fixes that without ever pulling a
  // genuine 22.5 down to 22.
  return Math.ceil(rawTicks - 1e-9);
}

/** Whether breaking this block with this item yields a drop. */
export function canHarvest(block, heldStack) {
  if (!block.requiresTool) return true;
  const item = heldStack && !heldStack.isEmpty ? heldStack.item : null;
  if (!item || item.tool !== block.tool) return false;
  return (item.harvestLevel ?? -1) >= block.harvestLevel;
}

/**
 * Tracks progress on the block currently being mined.
 *
 * Progress resets when the player looks at a different block -- and this is one
 * of those details that is invisible when correct and maddening when not.
 */
export class MiningState {
  constructor() {
    this.target = null;      // {x, y, z}
    this.progress = 0;       // 0..1
    this.totalTicks = 0;
  }

  get stage() {
    if (!this.target || this.progress <= 0) return -1;
    return Math.min(MINING.BREAK_STAGES - 1, Math.floor(this.progress * MINING.BREAK_STAGES));
  }

  reset() {
    this.target = null;
    this.progress = 0;
    this.totalTicks = 0;
  }

  /**
   * Advance mining by one tick.
   * @returns {boolean} true when the block should break this tick
   */
  tick(world, hit, heldStack, conditions) {
    if (!hit) { this.reset(); return false; }

    if (!this.target || this.target.x !== hit.x || this.target.y !== hit.y || this.target.z !== hit.z) {
      this.target = { x: hit.x, y: hit.y, z: hit.z };
      this.progress = 0;
      this.totalTicks = breakTicks(hit.state.block, heldStack, conditions);
    }

    if (!Number.isFinite(this.totalTicks)) return false;
    if (this.totalTicks <= MINING.INSTANT_BREAK_THRESHOLD) return true;

    this.progress += 1 / this.totalTicks;
    if (this.progress >= 1) { this.progress = 1; return true; }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * Where a block would go if placed against `hit`, or null if it cannot.
 *
 * Placing into grass or water replaces it rather than landing beside it, which
 * is why the replaceable check comes before the offset.
 */
export function placementTarget(world, hit) {
  if (!hit || !hit.face) return null;

  const intoX = hit.x + hit.face.dx;
  const intoY = hit.y + hit.face.dy;
  const intoZ = hit.z + hit.face.dz;

  const existing = world.getBlock(intoX, intoY, intoZ).block;
  if (existing.replaceable) return { x: intoX, y: intoY, z: intoZ };
  if (world.getBlock(hit.x, hit.y, hit.z).block.replaceable) {
    return { x: hit.x, y: hit.y, z: hit.z };
  }
  if (existing === AIR) return { x: intoX, y: intoY, z: intoZ };
  return null;
}

/** Whether a block at this position would overlap the player. */
export function wouldTrapPlayer(player, x, y, z) {
  const box = new AABB(x, y, z, x + 1, y + 1, z + 1);
  return player.boundingBox().intersects(box);
}

/**
 * The state to place, with any orientation properties resolved from how the
 * player is standing and which face they clicked.
 */
export function orientPlacement(block, player, hit) {
  let state = block.defaultState;
  const isStair = block.renderShape === 'stair';
  const isMountedDevice = ['button', 'lever'].includes(block.renderShape);

  if (block.properties.axis) {
    // Logs align to the face that was clicked: hitting the top of a block places
    // an upright log, hitting a side places one lying down.
    const axis = hit.face.dy !== 0 ? 'y' : hit.face.dx !== 0 ? 'x' : 'z';
    state = state.with('axis', axis);
  }

  if (block.properties.face) {
    const face = hit.face.dy > 0 ? 'floor' : hit.face.dy < 0 ? 'ceiling' : 'wall';
    state = state.with('face', face);
  }

  if (block.properties.facing) {
    // Stairs ascend AWAY from the player (the tall step is on the far side), so
    // they face the way the player is looking. Most other directional blocks
    // face TOWARD the player instead.
    const faceDirection = hit.face.dx > 0 ? 'east' : hit.face.dx < 0 ? 'west'
      : hit.face.dz > 0 ? 'south' : hit.face.dz < 0 ? 'north' : null;
    const hopperFacing = hit.face.dy !== 0 ? 'down'
      : hit.face.dx > 0 ? 'west' : hit.face.dx < 0 ? 'east'
      : hit.face.dz > 0 ? 'north' : 'south';
    const sixWayFacing = hit.face.dx > 0 ? 'east' : hit.face.dx < 0 ? 'west'
      : hit.face.dy > 0 ? 'up' : hit.face.dy < 0 ? 'down'
      : hit.face.dz > 0 ? 'south' : 'north';
    const facing = block.id === 'mc:hopper' ? hopperFacing
      : ['mc:dropper', 'mc:observer', 'mc:piston', 'mc:sticky_piston'].includes(block.id) ? sixWayFacing
      : isStair || block.renderShape === 'door' || block.renderShape === 'fence_gate'
        ? yawToFacing(player.yaw)
        : (isMountedDevice && faceDirection ? faceDirection : yawToFacing(player.yaw + 180));
    if (block.properties.facing.has(facing)) state = state.with('facing', facing);
  }

  if (block.properties.half) {
    // Bottom half unless you placed it against the underside of something (or
    // clicked the upper part of a side face -- approximated by the face for now).
    state = block.renderShape === 'door'
      ? state.with('half', 'lower')
      : state.with('half', hit.face.dy < 0 ? 'top' : 'bottom');
  }

  if (block.properties.type) {
    // Slabs: sit on top of what you clicked, hang under it if placed against an
    // underside. Sub-face precision (upper vs lower half of a side) is a later
    // refinement once the raycast returns a hit point.
    const type = hit.face.dy < 0 ? 'top' : 'bottom';
    if (block.properties.type.has(type)) state = state.with('type', type);
  }

  return state;
}

/**
 * The item stacks a block drops when broken.
 *
 * Randomness is seeded from the world seed and the block position, never
 * Math.random. A world is supposed to be reproducible from its seed, and a
 * global RNG breaks that in a way that is invisible in normal play and
 * impossible to debug later: two players on the same seed breaking the same
 * ore get different amounts, and no test can pin the behaviour down.
 *
 * Position-seeded also means breaking the same block twice (place, break,
 * place, break) yields the same drop, which is the vanilla-consistent
 * behaviour for anything deterministic.
 *
 * @param {number} worldSeed
 * @param {number} x @param {number} y @param {number} z  block position
 */
export function blockDrops(state, heldStack, worldSeed = 0, x = 0, y = 0, z = 0) {
  const block = state.block;
  if (!canHarvest(block, heldStack)) return [];

  const rng = positionalRandom(worldSeed, x, y, z, 0x10ad);
  const id = block.id;

  // Blocks that do not drop themselves in vanilla without Silk Touch.
  // Silk Touch is not implemented yet, so these correctly yield nothing.
  if (id === 'mc:glass' || id === 'mc:ice') return [];
  // Monster spawners are never item drops in Java Edition, even with Silk Touch.
  if (id === 'mc:mob_spawner') return [];

  // A shovel breaks a snow block into four snowballs in Java 1.12.2.
  if (id === 'mc:snow_block') return [{ id: 'mc:snowball', count: 4 }];

  if (id === 'mc:melon') return [{ id: 'mc:melon_slice', count: 3 + rng.nextInt(5) }];
  if (id === 'mc:pumpkin_stem' || id === 'mc:melon_stem') {
    const seedId = id === 'mc:pumpkin_stem' ? 'mc:pumpkin_seeds' : 'mc:melon_seeds';
    const count = rng.nextInt(2);
    return count ? [{ id: seedId, count }] : [];
  }

  if (['mc:wheat', 'mc:carrots', 'mc:potatoes', 'mc:beetroots'].includes(id)) {
    if (state.get('age') < 7) return [];
    if (id === 'mc:wheat') return [
      { id: 'mc:wheat', count: 1 },
      { id: 'mc:wheat_seeds', count: rng.nextInt(4) },
    ];
    if (id === 'mc:carrots') return [{ id: 'mc:carrot', count: 1 + rng.nextInt(4) }];
    if (id === 'mc:potatoes') return [{ id: 'mc:potato', count: 1 + rng.nextInt(4) }];
    return [
      { id: 'mc:beetroot', count: 1 },
      { id: 'mc:beetroot_seeds', count: rng.nextInt(4) },
    ];
  }

  if (id === 'mc:nether_gold_ore') return [{ id: 'mc:gold_nugget', count: 2 + rng.nextInt(4) }];

  // Java 1.19 glowstone drops 2–4 dust without Fortune (Silk Touch is not yet implemented).
  if (id === 'mc:glowstone') return [{ id: 'mc:glowstone_dust', count: 2 + rng.nextInt(3) }];

  if (id === 'mc:gravel') {
    return rng.nextDouble() < 0.10
      ? [{ id: 'mc:flint', count: 1 }]
      : [{ id: 'mc:gravel', count: 1 }];
  }

  if (id === 'mc:short_grass' || id === 'mc:fern') {
    const seeds = rng.nextDouble() < 0.12 ? 1 + rng.nextInt(2) : 0;
    return seeds ? [{ id: 'mc:wheat_seeds', count: seeds }] : [];
  }
  if (id === 'mc:dead_bush') return [];

  if (id.endsWith('_leaves')) {
    if (heldStack?.item?.tool === 'shears') return [{ id, count: 1 }];
    const sapling = id.replace('_leaves', '_sapling');
    const drops = [];
    if (rng.nextDouble() < 0.05 && ITEMS.get(sapling)) drops.push({ id: sapling, count: 1 });
    if (id === 'mc:oak_leaves' && rng.nextDouble() < 0.005) {
      drops.push({ id: 'mc:apple', count: 1 });
    }
    return drops;
  }

  const special = {
    'mc:stone': 'mc:cobblestone',
    'mc:grass_block': 'mc:dirt',
    'mc:coal_ore': 'mc:coal',
    'mc:diamond_ore': 'mc:diamond',
    'mc:emerald_ore': 'mc:emerald',
    'mc:redstone_ore': 'mc:redstone',
    'mc:redstone_wire': 'mc:redstone',
    'mc:lapis_ore': 'mc:lapis_lazuli',
    'mc:clay': 'mc:clay_ball',
  };
  const dropId = special[id] ?? id;
  if (!ITEMS.get(dropId)) return [];

  let count = 1;
  if (dropId === 'mc:redstone') count = 4 + rng.nextInt(2);
  if (dropId === 'mc:lapis_lazuli') count = 4 + rng.nextInt(5);
  if (dropId === 'mc:clay_ball') count = 4;

  return [{ id: dropId, count }];
}
