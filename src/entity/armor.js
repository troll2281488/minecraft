/**
 * Armour damage reduction, Java 1.12.2.
 *
 * Vanilla formula: the incoming damage is multiplied by
 *   1 - min(20, max(defense / 5, defense - damage / (2 + toughness / 4))) / 25
 * Defense is the sum of the protection values of the worn pieces. Toughness only
 * matters for diamond armour (2). Pure function, testable under node.
 */

/** Protection per piece, from the vanilla armour table (matches ARMOR in core/constants.js). */
export const ARMOR_DEFENSE = {
  leather:  { helmet: 1, chestplate: 3, leggings: 2, boots: 1 },
  iron:     { helmet: 2, chestplate: 6, leggings: 5, boots: 2 },
  golden:   { helmet: 2, chestplate: 5, leggings: 3, boots: 1 },
  diamond:  { helmet: 3, chestplate: 8, leggings: 6, boots: 3 },
};

export const ARMOR_TOUGHNESS = { leather: 0, iron: 0, golden: 0, diamond: 2 };

/**
 * Damage left after armour.
 * @param {number} damage incoming damage (half-hearts)
 * @param {number} defense summed protection of worn pieces
 * @param {number} toughness summed toughness of worn pieces
 */
export function reduceDamage(damage, defense, toughness = 0) {
  if (damage <= 0) return 0;
  const effective = Math.min(20, Math.max(defense / 5, defense - damage / (2 + toughness / 4)));
  return damage * (1 - effective / 25);
}

/**
 * Sum defense and toughness for a set of worn armour item ids, e.g. "mc:iron_chestplate".
 * Unknown ids contribute nothing.
 */
export function armorTotals(itemIds) {
  let defense = 0;
  let toughness = 0;
  for (const id of itemIds) {
    const m = /^mc:([a-z]+)_(helmet|chestplate|leggings|boots)$/.exec(id);
    if (!m || !ARMOR_DEFENSE[m[1]]) continue;
    defense += ARMOR_DEFENSE[m[1]][m[2]];
    toughness += ARMOR_TOUGHNESS[m[1]];
  }
  return { defense, toughness };
}
