import { describe, it, assertEqual } from './framework.js';
import { ItemStack } from '../src/world/item.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { breakTicks, blockDrops } from '../src/game/interaction.js';
import {
  ENCHANTMENTS, enchantmentLevel, getEnchantments, canApplyEnchantment,
  areEnchantmentsCompatible, withEnchantment, unbreakingDamage,
  combineOnAnvil, eligibleEnchantments,
} from '../src/game/enchantments.js';

describe('Java 1.19 enchantment data and anvil core', () => {
  const sword = ItemStack.of('mc:iron_sword');
  const pickaxe = ItemStack.of('mc:diamond_pickaxe');
  const book = ItemStack.of('mc:enchanted_book');

  it('defines the supported classic enchantments and max levels', () => {
    assertEqual(ENCHANTMENTS.protection.max, 4);
    assertEqual(ENCHANTMENTS.efficiency.max, 5);
    assertEqual(ENCHANTMENTS.mending.treasure, true);
    assertEqual(ENCHANTMENTS.curse_of_vanishing.max, 1);
  });
  it('applies valid enchantments immutably and preserves existing stack data', () => {
    const named = sword.clone();
    named.data = { customName: 'Test Blade' };
    const enchanted = withEnchantment(named, 'sharpness', 3);
    assertEqual(enchantmentLevel(enchanted, 'sharpness'), 3);
    assertEqual(enchanted.data.customName, 'Test Blade');
    assertEqual(named.data.enchantments, undefined);
  });
  it('rejects incompatible enchantments and invalid targets/levels', () => {
    const sharp = withEnchantment(sword, 'sharpness', 2);
    assertEqual(withEnchantment(sharp, 'smite', 2), null);
    assertEqual(withEnchantment(pickaxe, 'sharpness', 2), null);
    assertEqual(withEnchantment(sword, 'sharpness', 6), null);
  });
  it('sanitizes malformed or out-of-range save metadata', () => {
    const malformed = new ItemStack(sword.item, 1, 0, { enchantments: {
      efficiency: 99, missing: 2, fortune: 2, sharpness: '3',
    } });
    assertEqual(Object.keys(getEnchantments(malformed)).join(','), 'fortune');
    assertEqual(enchantmentLevel(malformed, 'efficiency'), 0);
  });
  it('implements enchantment compatibility groups', () => {
    assertEqual(areEnchantmentsCompatible('sharpness', 'smite'), false);
    assertEqual(areEnchantmentsCompatible('fortune', 'silk_touch'), false);
    assertEqual(areEnchantmentsCompatible('efficiency', 'unbreaking'), true);
  });
  it('uses Java Unbreaking chance and leaves non-damageable items alone', () => {
    const enchanted = withEnchantment(pickaxe, 'unbreaking', 2);
    assertEqual(unbreakingDamage(enchanted, 3, () => 0.1), 0);
    assertEqual(unbreakingDamage(enchanted, 3, () => 0.9), 3);
    assertEqual(unbreakingDamage(sword, 2, () => 0), 2);
  });
  it('combines matching books and tools on an anvil with level progression', () => {
    const bookSharp = withEnchantment(book, 'sharpness', 2);
    const bookSharp2 = withEnchantment(book, 'sharpness', 2);
    const combined = combineOnAnvil(bookSharp, bookSharp2);
    assertEqual(combined.ok, true);
    assertEqual(enchantmentLevel(combined.output, 'sharpness'), 3);
    const applied = combineOnAnvil(sword, bookSharp);
    assertEqual(applied.ok, true);
    assertEqual(enchantmentLevel(applied.output, 'sharpness'), 2);
  });
  it('repairs matching damaged tools with an anvil bonus', () => {
    const wornA = new ItemStack(pickaxe.item, 1, 80);
    const wornB = new ItemStack(pickaxe.item, 1, 90);
    const repaired = combineOnAnvil(wornA, wornB);
    assertEqual(repaired.ok, true);
    assertEqual(repaired.output.damage < wornA.damage, true);
    assertEqual(wornA.damage, 80);
  });
  it('applies Efficiency to real block-breaking time', () => {
    const stone = BLOCKS.get('mc:stone');
    const plainTicks = breakTicks(stone, pickaxe);
    const efficient = withEnchantment(pickaxe, 'efficiency', 4);
    assertEqual(breakTicks(stone, efficient) < plainTicks, true);
  });
  it('uses Silk Touch and Fortune in block drop calculations', () => {
    const glass = BLOCKS.get('mc:glass').defaultState;
    const silk = withEnchantment(pickaxe, 'silk_touch', 1);
    assertEqual(blockDrops(glass, silk, 1, 0, 0, 0)[0].id, 'mc:glass');
    const coal = BLOCKS.get('mc:coal_ore').defaultState;
    const fortune = withEnchantment(pickaxe, 'fortune', 3);
    const drop = blockDrops(coal, fortune, 123, 2, 64, 2)[0];
    assertEqual(drop.id, 'mc:coal');
    assertEqual(drop.count >= 1 && drop.count <= 4, true);
  });
  it('returns bounded eligible enchantment candidates for item categories', () => {
    const eligible = eligibleEnchantments(pickaxe);
    assertEqual(eligible.some((entry) => entry.id === 'efficiency'), true);
    assertEqual(eligible.some((entry) => entry.id === 'power'), false);
    assertEqual(eligible.some((entry) => entry.id === 'mending'), false);
  });
});
