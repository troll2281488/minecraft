import { describe, it, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { shieldBlocksAttack } from '../src/entity/mobs.js';

describe('Java shield blocking', () => {
  it('blocks attacks from the front and rejects attacks from behind', () => {
    const player = { x: 0, z: 0, yaw: 0 };
    assertEqual(shieldBlocksAttack(player, 0, 3, true), true);
    assertEqual(shieldBlocksAttack(player, 0, -3, true), false);
  });
  it('uses the player facing direction and a frontal 120-degree arc', () => {
    const player = { x: 0, z: 0, yaw: 90 };
    assertEqual(shieldBlocksAttack(player, -3, 0, true), true);
    assertEqual(shieldBlocksAttack(player, 3, 0, true), false);
    assertEqual(shieldBlocksAttack(player, 0, 3, false), false);
  });
  it('registers a non-stackable shield with Java durability and recipe', () => {
    assertEqual(ITEMS.get('mc:shield')?.stackSize, 1);
    assertEqual(ITEMS.get('mc:shield')?.maxDamage, 336);
    assertEqual(RECIPES.producing('mc:shield').length, 1);
  });
});

describe('Java food expansion', () => {
  it('registers new edible foods with expected nutrition', () => {
    assertEqual(ITEMS.get('mc:golden_carrot')?.food?.nutrition, 6);
    assertEqual(ITEMS.get('mc:rabbit_stew')?.food?.nutrition, 10);
  });
  it('returns a bowl from stew foods and keeps stew non-stackable', () => {
    for (const id of ['mc:mushroom_stew', 'mc:beetroot_soup', 'mc:rabbit_stew']) {
      assertEqual(ITEMS.get(id)?.stackSize, 1);
      assertEqual(ITEMS.get(id)?.containerItem, 'mc:bowl');
    }
  });
  it('provides recipes for every added food and passes registry validation', () => {
    for (const id of ['mc:cookie', 'mc:pumpkin_pie', 'mc:golden_carrot', 'mc:mushroom_stew', 'mc:beetroot_soup', 'mc:rabbit_stew']) {
      assertEqual(RECIPES.producing(id).length > 0, true);
    }
    assertEqual(RECIPES.validate().length, 0);
    assertEqual(ItemStack.of('mc:cookie', 8).count, 8);
  });
});
