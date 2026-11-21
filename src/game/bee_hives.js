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
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    for (let depth = 2; depth <= 5; depth++) {
      const cx = x + dx, cz = z + dz, campY = y - depth;
      if (world.getBlock(cx, campY, cz)?.block?.id !== 'mc:campfire') continue;
      let clear = true;
      for (let sy = campY + 1; sy < y; sy++) {
        const id = world.getBlock(cx, sy, cz)?.block?.id;
        if (id !== 'mc:air' && id !== 'mc:short_grass') { clear = false; break; }
      }
      if (clear) return true;
    }
  }
  return false;
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
