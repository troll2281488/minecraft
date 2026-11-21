/**
 * Pure Java-style honey-harvest decisions shared by interactions and tests.
 * Honey level is a persisted blockstate property (0..5).
 */
export const HIVE_MAX_HONEY = 5;

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
