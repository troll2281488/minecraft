import { describe, it, assertEqual } from './framework.js';
import { rollFishingCatch } from '../src/entity/mobs.js';
import '../src/world/blocks/index.js';
import { ITEMS } from '../src/world/item.js';

describe('fishing', () => {
  it('catches cod and salmon using the vanilla fish-weight ordering', () => {
    assertEqual(rollFishingCatch(() => 0.1).id, 'mc:raw_cod');
    assertEqual(rollFishingCatch(() => 0.7).id, 'mc:raw_salmon');
  });
  it('can catch pufferfish and tropical fish', () => {
    assertEqual(rollFishingCatch(() => 0.9).id, 'mc:tropical_fish');
    assertEqual(rollFishingCatch(() => 0.87).id, 'mc:pufferfish');
  });
  it('has a craftable, damageable fishing rod item', () => {
    assertEqual(ITEMS.get('mc:fishing_rod').maxDamage, 64);
    assertEqual(ITEMS.get('mc:fishing_rod').tool, 'fishing_rod');
  });
  it('registers fish as food items', () => {
    assertEqual(ITEMS.get('mc:raw_cod').food.nutrition, 2);
    assertEqual(ITEMS.get('mc:raw_salmon').food.nutrition, 2);
  });
});
