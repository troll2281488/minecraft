/**
 * Villager careers and trade offers for the pre-1.14 Java trading system.
 * Careers are fixed when the villager spawns. New tiers unlock as the player
 * completes previously unused offers; this deliberately avoids post-1.14 job
 * site blocks and XP badge progression.
 */
import { ITEMS } from '../world/item.js';
import { positionalRandom } from '../core/rng.js';

const offer = (id, tier, input, minInput, maxInput, output, minOutput = 1, maxOutput = minOutput, input2 = null, input2Count = 0) => ({
  id, tier, input, minInput, maxInput, output, minOutput, maxOutput, input2, input2Count,
});

export const VILLAGER_CAREERS = Object.freeze({
  farmer: Object.freeze({ label: 'Фермер', profession: 'farmer', texture: 'farmer', offers: [
    offer('wheat',1,'mc:wheat',18,22,'mc:emerald'),
    offer('potato',1,'mc:potato',15,19,'mc:emerald'),
    offer('carrot',1,'mc:carrot',15,19,'mc:emerald'),
    offer('bread',1,'mc:emerald',1,1,'mc:bread',2,4),
    offer('pumpkin',2,'mc:pumpkin',8,13,'mc:emerald'),
    offer('apple',2,'mc:emerald',1,1,'mc:apple',5,7),
    offer('melon',3,'mc:melon',7,12,'mc:emerald'),
    offer('baked_potato',3,'mc:emerald',1,1,'mc:baked_potato',3,5),
  ]}),
  fisherman: Object.freeze({ label: 'Рыбак', profession: 'farmer', texture: 'fisherman', offers: [
    offer('string',1,'mc:string',15,20,'mc:emerald'),
    offer('coal',1,'mc:coal',16,24,'mc:emerald'),
    offer('cod',1,'mc:emerald',1,1,'mc:raw_cod',6,8),
    offer('salmon',2,'mc:emerald',1,1,'mc:raw_salmon',4,6),
    offer('rod',2,'mc:emerald',7,8,'mc:fishing_rod'),
  ]}),
  shepherd: Object.freeze({ label: 'Пастух', profession: 'farmer', texture: 'shepherd', offers: [
    offer('wool',1,'mc:white_wool',16,22,'mc:emerald'),
    offer('shears',1,'mc:emerald',3,4,'mc:shears'),
    offer('wool_extra',2,'mc:white_wool',16,22,'mc:emerald'),
  ]}),
  librarian: Object.freeze({ label: 'Библиотекарь', profession: 'librarian', texture: 'librarian', offers: [
    offer('bookshelf',1,'mc:bookshelf',3,4,'mc:emerald'),
    offer('glass',1,'mc:emerald',1,1,'mc:glass',3,5),
    offer('bookshelf2',2,'mc:emerald',1,1,'mc:bookshelf'),
    offer('glass2',3,'mc:glass',8,12,'mc:emerald'),
  ]}),
  cleric: Object.freeze({ label: 'Священник', profession: 'priest', texture: 'cleric', offers: [
    offer('rotten_flesh',1,'mc:rotten_flesh',36,40,'mc:emerald'),
    offer('gold',1,'mc:gold_ingot',8,10,'mc:emerald'),
    offer('redstone',2,'mc:emerald',1,1,'mc:redstone',1,4),
    offer('lapis',2,'mc:emerald',1,1,'mc:lapis_lazuli',1,2),
  ]}),
  armorer: Object.freeze({ label: 'Бронник', profession: 'blacksmith', texture: 'armorer', offers: [
    offer('coal',1,'mc:coal',16,24,'mc:emerald'),
    offer('iron',2,'mc:iron_ingot',7,9,'mc:emerald'),
    offer('helmet',1,'mc:emerald',4,6,'mc:iron_helmet'),
    offer('chestplate',2,'mc:emerald',10,14,'mc:iron_chestplate'),
    offer('leggings',3,'mc:emerald',9,11,'mc:iron_leggings'),
    offer('boots',3,'mc:emerald',5,7,'mc:iron_boots'),
  ]}),
  toolsmith: Object.freeze({ label: 'Инструментальщик', profession: 'blacksmith', texture: 'toolsmith', offers: [
    offer('coal',1,'mc:coal',16,24,'mc:emerald'),
    offer('iron',2,'mc:iron_ingot',7,9,'mc:emerald'),
    offer('pickaxe',1,'mc:emerald',9,11,'mc:iron_pickaxe'),
    offer('diamond',3,'mc:diamond',3,4,'mc:emerald'),
    offer('diamond_pickaxe',3,'mc:emerald',12,15,'mc:diamond_pickaxe'),
  ]}),
  butcher: Object.freeze({ label: 'Мясник', profession: 'butcher', texture: 'butcher', offers: [
    offer('pork',1,'mc:raw_porkchop',14,18,'mc:emerald'),
    offer('chicken',1,'mc:raw_chicken',14,18,'mc:emerald'),
    offer('cooked_pork',2,'mc:emerald',1,1,'mc:cooked_porkchop',5,7),
    offer('cooked_chicken',2,'mc:emerald',1,1,'mc:cooked_chicken',6,8),
  ]}),
  leatherworker: Object.freeze({ label: 'Кожевник', profession: 'butcher', texture: 'leatherworker', offers: [
    offer('leather',1,'mc:leather',9,12,'mc:emerald'),
    offer('pants',1,'mc:emerald',2,4,'mc:leather_leggings'),
    offer('tunic',2,'mc:emerald',7,12,'mc:leather_chestplate'),
    offer('boots',3,'mc:emerald',2,4,'mc:leather_boots'),
  ]}),
  nitwit: Object.freeze({ label: 'Бездельник', profession: 'nitwit', texture: 'nitwit', offers: [] }),
});

const CAREER_KEYS = Object.keys(VILLAGER_CAREERS).filter((key) => key !== 'nitwit');

export function createVillagerProfile(seed, x, z, biome = 'mc:plains', index = 0) {
  const rng = positionalRandom(seed, x + index * 17, 4103, z - index * 13, 4103);
  const careerKey = rng.nextInt(12) === 0 ? 'nitwit' : CAREER_KEYS[rng.nextInt(CAREER_KEYS.length)];
  const biomeType = biome.includes('desert') ? 'desert'
    : biome.includes('savanna') ? 'savanna'
    : biome.includes('taiga') || biome.includes('mega_taiga') ? 'taiga'
    : biome.includes('snow') || biome.includes('ice') ? 'snow'
    : biome.includes('jungle') ? 'jungle'
    : biome.includes('swamp') ? 'swamp' : 'plains';
  return {
    villagerCareer: careerKey,
    villagerProfession: VILLAGER_CAREERS[careerKey].profession,
    villagerType: biomeType,
    villagerSeed: Number(rng.nextInt(0x7fffffff)),
    villagerTier: 1,
    villagerTradeCount: 0,
    villagerUsedOffers: [],
    villagerOfferUses: {},
  };
}

export function getVillagerOffers(villager) {
  const career = VILLAGER_CAREERS[villager?.villagerCareer] ?? VILLAGER_CAREERS.nitwit;
  const rng = positionalRandom(villager?.villagerSeed ?? 1, 0, 4104, 0, 4104);
  return career.offers
    .filter((entry) => entry.tier <= Math.max(1, Math.min(5, villager?.villagerTier ?? 1)))
    .map((entry, index) => {
      const inputCount = entry.minInput + rng.nextInt(entry.maxInput - entry.minInput + 1);
      const outputCount = entry.minOutput + rng.nextInt(entry.maxOutput - entry.minOutput + 1);
      const rawUses = villager?.villagerOfferUses?.[entry.id] ?? 0;
      const uses = Number.isFinite(rawUses) ? Math.max(0, Math.floor(rawUses)) : 0;
      return {
        id: entry.id, tier: entry.tier, input: entry.input, inputCount,
        input2: entry.input2, input2Count: entry.input2Count,
        output: entry.output, outputCount, uses,
        disabled: false,
      };
    });
}

function careerTiers(careerKey) {
  const career = VILLAGER_CAREERS[careerKey] ?? VILLAGER_CAREERS.nitwit;
  return career.offers.map((entry) => entry.tier);
}

function canFitOutput(inventory, itemId, count, costs = []) {
  const item = ITEMS.get(itemId);
  if (!item) return false;
  const slots = inventory.slots.slice(0, 36).map((stack) => ({
    id: stack.isEmpty ? null : stack.item.id,
    count: stack.isEmpty ? 0 : stack.count,
    stackSize: stack.isEmpty ? 64 : stack.maxStackSize,
    stackable: !stack.isEmpty && stack.item.isStackable,
  }));

  // Simulate consuming the inputs first; a full inventory can still trade if
  // the payment itself frees enough space for the result.
  for (const [costId, costCount] of costs) {
    let remaining = costCount;
    for (const slot of slots) {
      if (slot.id !== costId || remaining <= 0) continue;
      const removed = Math.min(slot.count, remaining);
      slot.count -= removed;
      remaining -= removed;
      if (slot.count <= 0) slot.id = null;
    }
    if (remaining > 0) return false;
  }

  let remaining = count;
  for (const slot of slots) {
    if (slot.id === itemId && slot.stackable && item.isStackable) {
      const moved = Math.min(item.stackSize - slot.count, remaining);
      slot.count += moved;
      remaining -= moved;
    } else if (slot.id === null) {
      const moved = Math.min(item.stackSize, remaining);
      slot.id = itemId;
      slot.count = moved;
      slot.stackSize = item.stackSize;
      slot.stackable = item.isStackable;
      remaining -= moved;
    }
    if (remaining <= 0) return true;
  }
  return false;
}

/** Execute one offer atomically; no items are consumed if the result cannot fit. */
export function executeVillagerTrade(villager, offerId, inventory) {
  const selected = getVillagerOffers(villager).find((entry) => entry.id === offerId);
  if (!selected || selected.disabled) return { ok: false, reason: 'Эта сделка сейчас недоступна.' };
  if (inventory.countOf(selected.input) < selected.inputCount ||
      (selected.input2 && inventory.countOf(selected.input2) < selected.input2Count)) {
    return { ok: false, reason: 'Не хватает предметов для обмена.' };
  }
  const costs = [[selected.input, selected.inputCount]];
  if (selected.input2) costs.push([selected.input2, selected.input2Count]);
  if (!canFitOutput(inventory, selected.output, selected.outputCount, costs)) {
    return { ok: false, reason: 'В инвентаре нет места.' };
  }

  inventory.remove(selected.input, selected.inputCount);
  if (selected.input2) inventory.remove(selected.input2, selected.input2Count);
  const leftover = inventory.addItem(selected.output, selected.outputCount);
  if (leftover > 0) {
    // Defensive rollback: the preflight above should make this unreachable.
    inventory.remove(selected.output, selected.outputCount - leftover);
    inventory.addItem(selected.input, selected.inputCount);
    if (selected.input2) inventory.addItem(selected.input2, selected.input2Count);
    return { ok: false, reason: 'Не удалось завершить обмен.' };
  }

  const wasUsed = (villager.villagerUsedOffers ?? []).includes(selected.id);
  villager.villagerOfferUses ??= {};
  villager.villagerUsedOffers ??= [];
  villager.villagerOfferUses[selected.id] = (villager.villagerOfferUses[selected.id] ?? 0) + 1;
  villager.villagerTradeCount = (villager.villagerTradeCount ?? 0) + 1;
  if (!wasUsed) {
    villager.villagerUsedOffers.push(selected.id);
    const maxTier = Math.max(1, ...careerTiers(villager.villagerCareer));
    villager.villagerTier = Math.min(maxTier, Math.max(1, villager.villagerTier ?? 1) + 1);
  }
  return {
    ok: true,
    output: selected.output,
    count: selected.outputCount,
    tradeCount: villager.villagerTradeCount,
    tier: villager.villagerTier,
    unlocked: !wasUsed,
  };
}
