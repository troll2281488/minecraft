import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { ItemStack } from '../src/world/item.js';
import { MobSystem, canLeadMob, attachMobLead, detachMobLead } from '../src/entity/mobs.js';

describe('Java leads and companion state', () => {
  it('registers a stackable lead and the two-lead crafting recipe', () => {
    assertEqual(ITEMS.get('mc:lead').stackSize, 64);
    const grid = [
      ItemStack.of('mc:string', 1), ItemStack.of('mc:string', 1), ItemStack.EMPTY,
      ItemStack.of('mc:string', 1), ItemStack.of('mc:slime_ball', 1), ItemStack.EMPTY,
      ItemStack.EMPTY, ItemStack.EMPTY, ItemStack.of('mc:string', 1),
    ];
    const recipe = RECIPES.match(grid, 3);
    assertEqual(recipe?.result, 'mc:lead');
    assertEqual(recipe?.count, 2);
  });

  it('allows leads on supported passive mobs but rejects hostiles and duplicates', () => {
    for (const type of ['cow', 'pig', 'sheep', 'chicken', 'mooshroom', 'rabbit', 'wolf', 'horse', 'bee']) {
      assertEqual(canLeadMob({ type }), true);
    }
    for (const type of ['zombie', 'skeleton', 'creeper', 'villager']) {
      assertEqual(canLeadMob({ type }), false);
    }
    assertEqual(canLeadMob({ type: 'cow', leashHolder: 'player' }), false);
  });

  it('attaches and detaches only the expected leash owner', () => {
    const cow = { type: 'cow' };
    assertEqual(attachMobLead(cow), true);
    assertEqual(cow.leashHolder, 'player');
    assertEqual(detachMobLead(cow, 'another-player'), false);
    assertEqual(detachMobLead(cow), true);
    assertEqual(cow.leashHolder, undefined);
  });

  it('persists tame, sitting, saddle, and leash state through world saves', () => {
    const system = new MobSystem({});
    system.mobs = [
      { id: 1, type: 'wolf', x: 1, y: 64, z: 1, yaw: 0, health: 20, tamed: true, sitting: true, leashHolder: 'player' },
      { id: 2, type: 'horse', x: 2, y: 64, z: 2, yaw: 0, health: 30, tamed: true, saddled: true, horseArmor: 'iron' },
    ];
    const saved = system.toJSON();
    const restored = new MobSystem({});
    restored.loadFrom(saved);
    assertEqual(restored.mobs[0].tamed, true);
    assertEqual(restored.mobs[0].sitting, true);
    assertEqual(restored.mobs[0].leashHolder, 'player');
    assertEqual(restored.mobs[1].saddled, true);
    assertEqual(restored.mobs[1].horseArmor, 'iron');
  });
});
