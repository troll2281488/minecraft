import { describe, it, assertEqual } from './framework.js';
import { rollFishingCatch } from '../src/entity/mobs.js';
import '../src/world/blocks/index.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { withEnchantment } from '../src/game/enchantments.js';

function sequence(values) {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('Java 1.19 fishing loot', () => {
  it('uses the fish category for 85 percent of unenchanted catches', () => {
    assertEqual(rollFishingCatch(sequence([0.849, 0.1])).id, 'mc:raw_cod');
    assertEqual(rollFishingCatch(sequence([0.2, 0.7])).id, 'mc:raw_salmon');
    assertEqual(rollFishingCatch(sequence([0.2, 0.9])).id, 'mc:pufferfish');
    assertEqual(rollFishingCatch(sequence([0.2, 0.99])).id, 'mc:tropical_fish');
  });
  it('separates junk and treasure category boundaries', () => {
    assertEqual(rollFishingCatch(sequence([0.85, 0])).id, 'mc:lily_pad');
    assertEqual(rollFishingCatch(sequence([0.949, 0.999])).id, 'mc:tripwire_hook');
    assertEqual(rollFishingCatch(sequence([0.95, 0])).id, 'mc:bow');
    assertEqual(rollFishingCatch(sequence([0.999, 0.999])).id, 'mc:saddle');
  });
  it('moves category weights toward treasure with Luck of the Sea', () => {
    const rod = ItemStack.of('mc:fishing_rod');
    const luckyRod = withEnchantment(rod, 'luck_of_the_sea', 3);
    assertEqual(rollFishingCatch(sequence([0.90, 0]), rod).id, 'mc:lily_pad');
    assertEqual(rollFishingCatch(sequence([0.90, 0]), luckyRod).id, 'mc:bow');
  });
  it('registers every item returned by the expanded loot table', () => {
    const catches = [
      'mc:raw_cod', 'mc:raw_salmon', 'mc:pufferfish', 'mc:tropical_fish',
      'mc:lily_pad', 'mc:leather_boots', 'mc:rotten_flesh', 'mc:stick',
      'mc:string', 'mc:water_bottle', 'mc:bone', 'mc:ink_sac',
      'mc:tripwire_hook', 'mc:bow', 'mc:enchanted_book', 'mc:fishing_rod',
      'mc:name_tag', 'mc:nautilus_shell', 'mc:saddle',
    ];
    for (const id of catches) assertEqual(Boolean(ITEMS.get(id)), true);
  });
  it('keeps a craftable, damageable fishing rod item', () => {
    assertEqual(ITEMS.get('mc:fishing_rod').maxDamage, 64);
    assertEqual(ITEMS.get('mc:fishing_rod').tool, 'fishing_rod');
  });
  it('registers fish as food items', () => {
    assertEqual(ITEMS.get('mc:raw_cod').food.nutrition, 2);
    assertEqual(ITEMS.get('mc:raw_salmon').food.nutrition, 2);
  });
});
