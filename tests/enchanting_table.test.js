import { describe, it, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import {
  withEnchantment, enchantmentLevel, generateEnchantingOffers,
  applyEnchantingOffer, countEnchantingBookshelves, repairWithMending,
} from '../src/game/enchantments.js';

describe('Java 1.19 enchanting table, Mending and Lure', () => {
  it('registers enchanting and repair stations with craft recipes', () => {
    assertEqual(Boolean(BLOCKS.get('mc:enchanting_table')), true);
    assertEqual(Boolean(BLOCKS.get('mc:anvil')), true);
    assertEqual(RECIPES.all().some((recipe) => recipe.result === 'mc:enchanting_table'), true);
    assertEqual(RECIPES.all().some((recipe) => recipe.result === 'mc:anvil'), true);
    assertEqual(Boolean(ITEMS.get('mc:enchanting_table')), true);
    assertEqual(Boolean(ITEMS.get('mc:anvil')), true);
  });
  it('generates three repeatable offers from the same item, shelf count and seed', () => {
    const pick = ItemStack.of('mc:diamond_pickaxe');
    const a = generateEnchantingOffers(pick.item, 15, 12345);
    const b = generateEnchantingOffers(pick.item, 15, 12345);
    assertEqual(a.length, 3);
    assertEqual(JSON.stringify(a), JSON.stringify(b));
    assertEqual(a[0].levelCost, 1);
    assertEqual(a[2].lapisCost, 3);
    assertEqual(a.every((offer) => offer.enchantment && offer.enchantmentLevel >= 1), true);
  });
  it('allows enchanted books to receive any non-treasure enchantment', () => {
    const offers = generateEnchantingOffers(ITEMS.get('mc:enchanted_book'), 15, 987);
    assertEqual(offers.every((offer) => Boolean(offer.enchantment)), true);
  });
  it('checks player levels and lapis before applying an offer immutably', () => {
    const pick = ItemStack.of('mc:diamond_pickaxe');
    const offer = { slot: 0, levelCost: 1, lapisCost: 1, enchantment: 'efficiency', enchantmentLevel: 2 };
    assertEqual(applyEnchantingOffer(pick, offer, { playerLevel: 0, lapis: 3 }).ok, false);
    assertEqual(applyEnchantingOffer(pick, offer, { playerLevel: 3, lapis: 0 }).ok, false);
    const applied = applyEnchantingOffer(pick, offer, { playerLevel: 3, lapis: 3 });
    assertEqual(applied.ok, true);
    assertEqual(enchantmentLevel(applied.output, 'efficiency'), 2);
    assertEqual(enchantmentLevel(pick, 'efficiency'), 0);
    assertEqual(applied.levelsSpent, 1);
  });
  it('counts only shelves with an unobstructed one-block gap and caps at fifteen', () => {
    const blocks = new Map();
    const key = (x, y, z) => [x, y, z].join(',');
    blocks.set(key(2, 0, 0), 'mc:bookshelf');
    blocks.set(key(2, 1, 0), 'mc:bookshelf');
    blocks.set(key(2, 0, 1), 'mc:bookshelf');
    blocks.set(key(1, 0, 1), 'mc:stone');
    const world = { getBlock: (x, y, z) => ({ block: { id: blocks.get(key(x, y, z)) || 'mc:air' } }) };
    assertEqual(countEnchantingBookshelves(world, 0, 0, 0), 2);
  });
  it('repairs damaged Mending tools and returns unused XP to the player', () => {
    const pick = ItemStack.of('mc:diamond_pickaxe');
    pick.damage = 12;
    const mending = withEnchantment(pick, 'mending', 1);
    const result = repairWithMending(mending, 8);
    assertEqual(result.repaired, 4);
    assertEqual(result.xpUsed, 8);
    assertEqual(result.xpRemaining, 0);
    assertEqual(mending.damage, 8);
    const noMending = repairWithMending(pick, 8);
    assertEqual(noMending.repaired, 0);
    assertEqual(noMending.xpRemaining, 8);
  });
});
