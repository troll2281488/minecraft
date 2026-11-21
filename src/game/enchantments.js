/**
 * Java 1.19 enchantment data, compatibility, item combination and anvil rules.
 * Enchantments live in ItemStack.data so the existing save format preserves them.
 */
export const ENCHANTMENTS = Object.freeze({
  protection: { max: 4, weight: 10, applies: ['armor'], group: 'protection' },
  fire_protection: { max: 4, weight: 5, applies: ['armor'], group: 'protection' },
  blast_protection: { max: 4, weight: 2, applies: ['armor'], group: 'protection' },
  projectile_protection: { max: 4, weight: 5, applies: ['armor'], group: 'protection' },
  feather_falling: { max: 4, weight: 5, applies: ['boots'] },
  respiration: { max: 3, weight: 2, applies: ['helmet'] },
  aqua_affinity: { max: 1, weight: 2, applies: ['helmet'] },
  thorns: { max: 3, weight: 1, applies: ['armor'] },
  depth_strider: { max: 3, weight: 2, applies: ['boots'], group: 'water_movement' },
  frost_walker: { max: 2, weight: 2, applies: ['boots'], group: 'water_movement' },
  sharpness: { max: 5, weight: 10, applies: ['sword', 'axe'], group: 'damage' },
  smite: { max: 5, weight: 5, applies: ['sword', 'axe'], group: 'damage' },
  bane_of_arthropods: { max: 5, weight: 5, applies: ['sword', 'axe'], group: 'damage' },
  knockback: { max: 2, weight: 5, applies: ['sword'] },
  fire_aspect: { max: 2, weight: 2, applies: ['sword'] },
  looting: { max: 3, weight: 2, applies: ['sword'] },
  efficiency: { max: 5, weight: 10, applies: ['pickaxe', 'axe', 'shovel', 'hoe'] },
  silk_touch: { max: 1, weight: 1, applies: ['pickaxe', 'axe', 'shovel'], group: 'fortune' },
  unbreaking: { max: 3, weight: 5, applies: ['durable'] },
  fortune: { max: 3, weight: 2, applies: ['pickaxe', 'axe', 'shovel'], group: 'fortune' },
  power: { max: 5, weight: 10, applies: ['bow'] },
  punch: { max: 2, weight: 2, applies: ['bow'] },
  flame: { max: 1, weight: 2, applies: ['bow'] },
  infinity: { max: 1, weight: 1, applies: ['bow'], group: 'arrow_supply' },
  luck_of_the_sea: { max: 3, weight: 2, applies: ['fishing_rod'] },
  lure: { max: 3, weight: 2, applies: ['fishing_rod'] },
  mending: { max: 1, weight: 2, applies: ['durable'], group: 'arrow_supply', treasure: true },
  curse_of_binding: { max: 1, weight: 1, applies: ['armor'], treasure: true },
  curse_of_vanishing: { max: 1, weight: 1, applies: ['all'], treasure: true },
});
const CATEGORY = (item) => {
  if (!item) return [];
  const result = [];
  if (item.armorSlot) result.push('armor', item.armorSlot);
  if (item.tool) result.push(item.tool);
  if (item.weapon === 'bow' || item.id === 'mc:bow') result.push('bow');
  if (item.id === 'mc:fishing_rod') result.push('fishing_rod');
  if (item.isDamageable) result.push('durable');
  return result;
};

export function enchantmentLevel(stack, id) {
  const value = stack?.data?.enchantments?.[id];
  return Number.isInteger(value) ? Math.max(0, Math.min(5, value)) : 0;
}

export function getEnchantments(stack) {
  const source = stack?.data?.enchantments;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const result = {};
  for (const [id, raw] of Object.entries(source)) {
    const def = ENCHANTMENTS[id];
    if (def && Number.isInteger(raw) && raw >= 1 && raw <= def.max) result[id] = raw;
  }
  return result;
}

export function canApplyEnchantment(item, id) {
  const def = ENCHANTMENTS[id];
  if (!def || !item) return false;
  if (item.id === 'mc:enchanted_book') return true;
  const categories = CATEGORY(item);
  return def.applies.includes('all') || def.applies.some((category) => categories.includes(category));
}

export function areEnchantmentsCompatible(first, second) {
  if (first === second) return true;
  const a = ENCHANTMENTS[first], b = ENCHANTMENTS[second];
  if (!a || !b) return false;
  if (a.group && a.group === b.group) return false;
  return true;
}

/** Return a new stack; the source stack is never mutated. */
export function withEnchantment(stack, id, level) {
  const def = ENCHANTMENTS[id];
  if (!stack || stack.isEmpty || !def || !Number.isInteger(level) ||
      level < 1 || level > def.max || !canApplyEnchantment(stack.item, id)) return null;
  const current = getEnchantments(stack);
  for (const existing of Object.keys(current)) {
    if (!areEnchantmentsCompatible(existing, id)) return null;
  }
  current[id] = level;
  const next = stack.clone();
  next.data = { ...(next.data || {}), enchantments: current };
  return next;
}

export function enchantmentDamageMultiplier(stack, targetType = '') {
  const sharpness = enchantmentLevel(stack, 'sharpness');
  const smite = enchantmentLevel(stack, 'smite');
  const bane = enchantmentLevel(stack, 'bane_of_arthropods');
  let bonus = sharpness > 0 ? 0.5 * sharpness + 0.5 : 0;
  if (/zombie|skeleton|wither|drowned|husk|phantom/.test(targetType)) bonus += smite * 2.5;
  if (/spider|silverfish|endermite|bee/.test(targetType)) bonus += bane * 2.5;
  return bonus;
}

/** Java Unbreaking: each durability point is ignored with probability level/(level+1). */
export function unbreakingDamage(stack, requested = 1, random = Math.random) {
  const amount = Math.max(0, Math.floor(Number(requested) || 0));
  const level = enchantmentLevel(stack, 'unbreaking');
  if (!level || !stack?.item?.isDamageable) return amount;
  let damage = 0;
  for (let i = 0; i < amount; i++) {
    const roll = Number(random());
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1 || roll >= level / (level + 1)) damage++;
  }
  return damage;
}

/** Apply Java's anvil enchantment merge and repair rules to two compatible stacks. */
export function combineOnAnvil(left, right) {
  if (!left || left.isEmpty || !right || right.isEmpty) return { ok: false, reason: 'missing_input' };
  if (left.item.id !== right.item.id && right.item.id !== 'mc:enchanted_book') {
    return { ok: false, reason: 'incompatible_items' };
  }
  if (left.item.id === right.item.id && !left.item.isDamageable && left.item.id !== 'mc:enchanted_book') return { ok: false, reason: 'not_repairable' };

  const output = left.clone();
  let cost = 0;
  let changed = false;
  if (right.item.id === 'mc:enchanted_book' || right.item.id === left.item.id) {
    for (const [id, incoming] of Object.entries(getEnchantments(right))) {
      if (!canApplyEnchantment(left.item, id) && left.item.id !== 'mc:enchanted_book') continue;
      const existing = enchantmentLevel(output, id);
      if (Object.keys(getEnchantments(output)).some((key) => !areEnchantmentsCompatible(key, id))) continue;
      const nextLevel = existing === incoming ? Math.min(ENCHANTMENTS[id].max, existing + 1) : Math.max(existing, incoming);
      const enchantmentData = getEnchantments(output);
      enchantmentData[id] = nextLevel;
      output.data = { ...(output.data || {}), enchantments: enchantmentData };
      cost += ENCHANTMENTS[id].weight * nextLevel;
      changed = true;
    }
  }
  if (left.item.id === right.item.id && left.item.isDamageable) {
    const max = left.item.maxDamage;
    const repaired = Math.min(max, Math.floor(max * 0.12) + (max - left.damage) + (max - right.damage));
    output.damage = Math.max(0, max - repaired);
    cost += 2;
    changed = changed || output.damage !== left.damage;
  }
  if (!changed) return { ok: false, reason: 'no_valid_operation' };
  return { ok: true, output, cost: Math.max(1, cost), consumesRight: true };
}

/** Weighted list of enchantments eligible for a particular item category. */
export function eligibleEnchantments(item, { treasure = false } = {}) {
  const categories = CATEGORY(item);
  return Object.entries(ENCHANTMENTS)
    .filter(([id, def]) => (treasure || !def.treasure) &&
      (def.applies.includes('all') || def.applies.some((category) => categories.includes(category))))
    .map(([id, def]) => ({ id, maxLevel: def.max, weight: def.weight }));
}
