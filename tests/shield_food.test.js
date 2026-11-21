import { describe, it, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { Inventory } from '../src/game/inventory.js';
import { RECIPES } from '../src/game/recipes.js';
import { MobSystem, shieldBlocksAttack } from '../src/entity/mobs.js';

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

  it('actually cancels a frontal mob hit and spends shield durability', () => {
    const inventory = new Inventory();
    inventory.set(0, ItemStack.of('mc:shield', 1));
    const player = { x: 0, z: 0, yaw: 0, gamemode: 'survival', health: 20 };
    const game = {
      player, inventory, mouseButtons: new Set([2]), worldMeta: { difficulty: 'normal' },
      ui: { updateHotbar() {} }, sounds: { play() {} },
    };
    const mobs = new MobSystem(game);
    assertEqual(mobs._damagePlayer(4, 0, 3), 0);
    assertEqual(player.health, 20);
    assertEqual(inventory.held.damage, 1);
    assertEqual(mobs._damagePlayer(4, 0, -3), 4);
    assertEqual(player.health, 16);
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
    for (const id of ['mc:golden_carrot', 'mc:mushroom_stew', 'mc:beetroot_soup', 'mc:rabbit_stew']) {
      assertEqual(RECIPES.producing(id).length > 0, true);
    }
    assertEqual(RECIPES.validate().length, 0);
    assertEqual(RECIPES.producing('mc:bowl').length, 1);
  });
});
