/**
 * Deterministic composter and crop bone-meal rules.
 *
 * Composter fill is a blockstate property, so it is included in normal world
 * saves and replicated through the existing block-change path. The chance
 * table follows the Java compostability tiers for the registered item subset.
 */
export const COMPOSTER_MAX_LEVEL = 8;

const CHANCES = {
  'mc:wheat_seeds': 0.30,
  'mc:beetroot_seeds': 0.30,
  'mc:melon_seeds': 0.30,
  'mc:pumpkin_seeds': 0.30,
  'mc:oak_sapling': 0.30,
  'mc:birch_sapling': 0.30,
  'mc:spruce_sapling': 0.30,
  'mc:jungle_sapling': 0.30,
  'mc:acacia_sapling': 0.30,
  'mc:dark_oak_sapling': 0.30,
  'mc:oak_leaves': 0.30,
  'mc:birch_leaves': 0.30,
  'mc:spruce_leaves': 0.30,
  'mc:jungle_leaves': 0.30,
  'mc:acacia_leaves': 0.30,
  'mc:dark_oak_leaves': 0.30,
  'mc:short_grass': 0.30,
  'mc:fern': 0.30,
  'mc:dead_bush': 0.30,
  'mc:dandelion': 0.65,
  'mc:poppy': 0.65,
  'mc:red_mushroom': 0.65,
  'mc:brown_mushroom': 0.65,
  'mc:wheat': 0.65,
  'mc:carrot': 0.65,
  'mc:potato': 0.65,
  'mc:beetroot': 0.65,
  'mc:melon_slice': 0.65,
  'mc:apple': 0.65,
  'mc:bread': 0.85,
  'mc:hay_block': 0.85,
};

export const COMPOSTABLE_ITEM_IDS = Object.freeze(Object.keys(CHANCES));

export function compostChance(itemId) {
  return typeof itemId === 'string' && Object.hasOwn(CHANCES, itemId)
    ? CHANCES[itemId] : null;
}

export function isCompostable(itemId) {
  return compostChance(itemId) !== null;
}

export function nextComposterLevel(level, chance, roll) {
  if (!Number.isInteger(level) || level < 0 || level >= COMPOSTER_MAX_LEVEL) return level;
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) return level;
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return level;
  return roll < chance ? level + 1 : level;
}

function stableHash(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable [0,1) roll so all clients derive the same composter outcome. */
export function compostRoll(seed, x, y, z, tick, itemId) {
  let value = stableHash(seed ?? 0);
  value ^= stableHash(`${x},${y},${z}|${tick}|${itemId}`);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x100000000;
}

/** Bone meal advances ageable crops by 2–5 stages, capped at full maturity. */
export function boneMealAge(age, seed, x, y, z, tick) {
  if (!Number.isInteger(age) || age < 0 || age >= 7) return null;
  const roll = compostRoll(seed, x, y, z, tick, 'bone_meal');
  return Math.min(7, age + 2 + Math.floor(roll * 4));
}


/** Hopper input consumes one compostable item; a failed roll still consumes it. */
export function composterHopperInsert(level, itemId, roll) {
  const chance = compostChance(itemId);
  if (!Number.isInteger(level) || level < 0 || level >= COMPOSTER_MAX_LEVEL ||
      chance === null || !Number.isFinite(roll) || roll < 0 || roll >= 1) {
    return { accepted: false, level };
  }
  return { accepted: true, level: nextComposterLevel(level, chance, roll) };
}

/** A bottom hopper can extract exactly one bone meal only from a ready composter. */
export function composterHopperExtract(level) {
  return { extracted: level === COMPOSTER_MAX_LEVEL, level: level === COMPOSTER_MAX_LEVEL ? 0 : level };
}

/** Java comparator output for composter fill levels: 0, 1, 3, ... 13, 15. */
export function composterComparatorOutput(level) {
  if (!Number.isInteger(level) || level < 0 || level > COMPOSTER_MAX_LEVEL) return 0;
  if (level === 0) return 0;
  return level === COMPOSTER_MAX_LEVEL ? 15 : level * 2 - 1;
}
