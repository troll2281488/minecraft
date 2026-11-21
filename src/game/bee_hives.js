/**
 * Pure Java-style honey-harvest decisions shared by interactions and tests.
 * Honey level is a persisted blockstate property (0..5).
 */
export const HIVE_MAX_HONEY = 5;

/**
 * A campfire two to five blocks below the hive calms the colony when the
 * vertical smoke column is unobstructed. Keep this query bounded to 5×5×5.
 */
export function hasCampfireSmoke(world, x, y, z) {
  if (!world?.getBlock) return false;
  // The smoke source must be in the same column; a one-block air gap is
  // required so smoke can reach the underside of the hive.
  for (let depth = 2; depth <= 5; depth++) {
    const campY = y - depth;
    const campfire = world.getBlock(x, campY, z);
    if (campfire?.block?.id !== 'mc:campfire' || campfire.get?.('lit') === false) continue;
    let clear = true;
    for (let sy = campY + 1; sy < y; sy++) {
      const id = world.getBlock(x, sy, z)?.block?.id;
      if (id !== 'mc:air' && id !== 'mc:short_grass') { clear = false; break; }
    }
    if (clear) return true;
  }
  return false;
}

const BEE_FLOWERS = new Set([
  'mc:dandelion', 'mc:poppy', 'mc:blue_orchid', 'mc:allium', 'mc:azure_bluet',
  'mc:red_tulip', 'mc:orange_tulip', 'mc:white_tulip', 'mc:pink_tulip',
  'mc:oxeye_daisy', 'mc:cornflower', 'mc:lily_of_the_valley',
  'mc:sunflower', 'mc:lilac', 'mc:rose_bush', 'mc:peony',
]);

/** Find the closest loaded flower or non-full hive in a small local cube. */
export function findBeeTarget(world, x, y, z, kind, radius = 8) {
  if (!world?.getBlock || !['flower', 'hive'].includes(kind)) return null;
  let best = null, bestDistance = Infinity;
  const minX = Math.floor(x - radius), maxX = Math.floor(x + radius);
  const minY = Math.floor(y - 3), maxY = Math.floor(y + 3);
  const minZ = Math.floor(z - radius), maxZ = Math.floor(z + radius);
  for (let by = minY; by <= maxY; by++) for (let bz = minZ; bz <= maxZ; bz++) {
    for (let bx = minX; bx <= maxX; bx++) {
      const state = world.getBlock(bx, by, bz);
      const id = state?.block?.id;
      if (kind === 'flower' ? !BEE_FLOWERS.has(id)
        : !['mc:bee_nest', 'mc:beehive'].includes(id) || state.get('honey_level') >= HIVE_MAX_HONEY) continue;
      const distance = Math.hypot(bx + 0.5 - x, by + 0.5 - y, bz + 0.5 - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: bx, y: by, z: bz, distance, state };
      }
    }
  }
  return best;
}

/**
 * Advance a bee's flower -> hive delivery cycle. Called only for nearby,
 * simulated bees; each target search is throttled to once per second.
 */
export function tickBeeForaging(world, mob) {
  if (!world || !mob || mob.type !== 'bee') return null;
  mob.beeSearchTicks = Math.max(0, (mob.beeSearchTicks || 0) - 1);
  if ((mob.beePollenTicks || 0) > 0) mob.beePollenTicks--;

  if (mob.beeSearchTicks === 0 || !mob.beeTarget) {
    const kind = mob.beePollenTicks > 0 ? 'hive' : 'flower';
    const target = findBeeTarget(world, mob.x, mob.y, mob.z, kind, kind === 'hive' ? 12 : 8);
    mob.beeTarget = target ? { x: target.x, y: target.y, z: target.z, kind } : null;
    mob.beeSearchTicks = 20;
  }

  const target = mob.beeTarget;
  if (!target) return null;
  const dx = target.x + 0.5 - mob.x, dz = target.z + 0.5 - mob.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 1.15 || Math.abs((target.y + 0.5) - (mob.y + 0.5)) > 1.25) {
    mob.targetYaw = Math.atan2(dx, dz);
    mob.moveTicks = Math.max(mob.moveTicks || 0, 2);
    return null;
  }

  mob.moveTicks = 0;
  mob.pauseTicks = Math.max(mob.pauseTicks || 0, 20);
  if (target.kind === 'flower') {
    mob.beePollenTicks = 600;
    mob.beeTarget = null;
    mob.beeSearchTicks = 0;
    return null;
  }

  mob.beeHiveWorkTicks = (mob.beeHiveWorkTicks || 0) + 1;
  if (mob.beeHiveWorkTicks < 200) return null;
  const state = world.getBlock(target.x, target.y, target.z);
  if (!['mc:bee_nest', 'mc:beehive'].includes(state?.block?.id) ||
      state.get('honey_level') >= HIVE_MAX_HONEY) {
    mob.beeTarget = null;
    mob.beeHiveWorkTicks = 0;
    mob.beeSearchTicks = 0;
    return null;
  }
  const next = state.with('honey_level', state.get('honey_level') + 1);
  world.setBlock(target.x, target.y, target.z, next);
  mob.beePollenTicks = 0;
  mob.beeTarget = null;
  mob.beeHiveWorkTicks = 0;
  mob.beeSearchTicks = 0;
  return { x: target.x, y: target.y, z: target.z, state: next };
}

export function hiveHarvestResult(state, heldItemId, smokeCalmed = false) {
  if (!state || !['mc:bee_nest', 'mc:beehive'].includes(state.block.id)) return null;
  const level = state.get('honey_level');
  if (!Number.isInteger(level) || level < 0 || level > HIVE_MAX_HONEY) return null;
  if (level < HIVE_MAX_HONEY) return { ok: false, reason: 'not_full', level };
  if (!smokeCalmed) return { ok: false, reason: 'bees_angry', level };
  if (heldItemId === 'mc:shears') return {
    ok: true, tool: 'shears', drops: [{ id: 'mc:honeycomb', count: 3 }], nextLevel: 0,
  };
  if (heldItemId === 'mc:glass_bottle') return {
    ok: true, tool: 'bottle', drops: [{ id: 'mc:honey_bottle', count: 1 }], nextLevel: 0,
  };
  return { ok: false, reason: 'wrong_tool', level };
}
