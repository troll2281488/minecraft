import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { ContainerScreensMixin } from '../src/game/container_screens.js';
import { ItemStack } from '../src/world/item.js';
import {
  COMPOSTER_MAX_LEVEL, COMPOSTABLE_ITEM_IDS, compostChance, isCompostable,
  nextComposterLevel, compostRoll, boneMealAge,
  composterHopperInsert, composterHopperExtract, composterComparatorOutput,
} from '../src/game/composting.js';

describe('composter and bone meal farming', () => {
  it('moves one compostable item from a hopper into a composter on the eight-tick cadence', () => {
    const blocks = new Map();
    const air = BLOCKS.get('mc:air').defaultState;
    const world = {
      seed: 9876,
      getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || air; },
      setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); },
    };
    blocks.set('0,1,0', BLOCKS.get('mc:hopper').defaultState);
    blocks.set('0,0,0', BLOCKS.get('mc:composter').defaultState);
    const game = Object.assign({}, ContainerScreensMixin, {
      world, player: { x: 0.5, y: 0.5, z: 0.5 }, tickCount: 8,
      multiplayer: null, _containers: new Map(),
    });
    const hopper = game._hopperAt(0, 1, 0);
    hopper.slots[0] = ItemStack.of('mc:bread', 2);
    game._tickHoppers();
    assertEqual(hopper.slots[0].count, 1);
    const level = world.getBlock(0, 0, 0).get('level');
    assert(level === 0 || level === 1, 'composter level must remain in valid range after one attempt');
  });

  it('extracts one bone meal from a full composter and preserves it when the hopper is full', () => {
    const makeGame = (fillHopper) => {
      const blocks = new Map();
      const air = BLOCKS.get('mc:air').defaultState;
      const world = {
        seed: 123,
        getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || air; },
        setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); },
      };
      blocks.set('0,0,0', BLOCKS.get('mc:hopper').defaultState);
      blocks.set('0,1,0', BLOCKS.get('mc:composter').defaultState.with('level', 8));
      const game = Object.assign({}, ContainerScreensMixin, {
        world, player: { x: 0.5, y: 0.5, z: 0.5 }, tickCount: 8,
        multiplayer: null, _containers: new Map(),
      });
      const hopper = game._hopperAt(0, 0, 0);
      if (fillHopper) for (let i = 0; i < hopper.slots.length; i++) hopper.slots[i] = ItemStack.of('mc:bread', 64);
      return { game, world, hopper };
    };
    const ready = makeGame(false);
    ready.game._tickHoppers();
    assertEqual(ready.hopper.slots[0].item.id, 'mc:bone_meal');
    assertEqual(ready.hopper.slots[0].count, 1);
    assertEqual(ready.world.getBlock(0, 1, 0).get('level'), 0);
    const blocked = makeGame(true);
    blocked.game._tickHoppers();
    assertEqual(blocked.world.getBlock(0, 1, 0).get('level'), 8);
  });
  it('registers composter with saved fill level from zero to eight', () => {
    const composter = BLOCKS.get('mc:composter');
    assert(composter, 'composter missing');
    assertEqual(composter.defaultState.get('level'), 0);
    assertEqual(composter.defaultState.with('level', 8).get('level'), COMPOSTER_MAX_LEVEL);
  });

  it('registers bone meal as a stackable survival item', () => {
    const boneMeal = ITEMS.get('mc:bone_meal');
    assert(boneMeal, 'bone meal missing');
    assertEqual(boneMeal.stackSize, 64);
  });

  it('has known compostability tiers and rejects non-organic items', () => {
    assertEqual(compostChance('mc:wheat_seeds'), 0.30);
    assertEqual(compostChance('mc:carrot'), 0.65);
    assertEqual(compostChance('mc:pumpkin'), 0.65);
    assertEqual(compostChance('mc:melon_slice'), 0.50);
    assertEqual(compostChance('mc:sugar_cane'), 0.50);
    assertEqual(compostChance('mc:bread'), 0.85);
    assertEqual(isCompostable('mc:diamond'), false);
    assertEqual(compostChance('mc:missing_item'), null);
  });

  it('only lists compostable item IDs that exist in the item registry', () => {
    for (const id of COMPOSTABLE_ITEM_IDS) assert(ITEMS.get(id), id + ' is not registered');
  });

  it('only adds one level when a valid compost attempt succeeds', () => {
    assertEqual(nextComposterLevel(2, 0.65, 0.64), 3);
    assertEqual(nextComposterLevel(2, 0.65, 0.65), 2);
    assertEqual(nextComposterLevel(7, 0.85, 0.1), 8);
    assertEqual(nextComposterLevel(8, 0.85, 0.1), 8);
  });

  it('rejects malformed levels and random values safely', () => {
    assertEqual(nextComposterLevel(-1, 1, 0), -1);
    assertEqual(nextComposterLevel(1, 1, 1), 1);
    assertEqual(nextComposterLevel(1, Number.NaN, 0), 1);
  });

  it('derives repeatable composter outcomes from seed, position, tick and item', () => {
    const a = compostRoll('world-seed', 4, 65, -2, 120, 'mc:carrot');
    const b = compostRoll('world-seed', 4, 65, -2, 120, 'mc:carrot');
    const c = compostRoll('world-seed', 4, 65, -2, 121, 'mc:carrot');
    assertEqual(a, b);
    assert(a >= 0 && a < 1);
    assert(a !== c);
  });

  it('bone meal advances immature crops by two to five stages and caps at seven', () => {
    for (let age = 0; age < 7; age++) {
      const next = boneMealAge(age, 12345, 1, 64, 2, 20 + age);
      assert(next >= Math.min(7, age + 2) && next <= Math.min(7, age + 5));
    }
    assertEqual(boneMealAge(7, 1, 0, 0, 0, 0), null);
    assertEqual(boneMealAge(-1, 1, 0, 0, 0, 0), null);
  });

  it('supports bone-to-meal crafting and reversible bone-block packing', () => {
    const fromBone = RECIPES.producing('mc:bone_meal').find(recipe =>
      recipe.ingredients?.includes('mc:bone'));
    assert(fromBone, 'bone meal from bone recipe missing');
    assertEqual(fromBone.count, 3);
    const boneBlock = RECIPES.producing('mc:bone_block');
    assert(boneBlock.some(recipe => recipe.key?.M === 'mc:bone_meal' || recipe.key?.I === 'mc:bone_meal'));
    assert(RECIPES.producing('mc:bone_meal').some(recipe => recipe.ingredients?.includes('mc:bone_block')));
  });

  it('lets hoppers insert compostable items and consumes failed compost rolls exactly once', () => {
    assertEqual(composterHopperInsert(2, 'mc:bread', 0.1).accepted, true);
    assertEqual(composterHopperInsert(2, 'mc:bread', 0.1).level, 3);
    const failed = composterHopperInsert(2, 'mc:wheat_seeds', 0.9);
    assertEqual(failed.accepted, true);
    assertEqual(failed.level, 2);
    assertEqual(composterHopperInsert(8, 'mc:bread', 0.1).accepted, false);
    assertEqual(composterHopperInsert(2, 'mc:diamond', 0.1).accepted, false);
  });

  it('only extracts bone meal from a full composter', () => {
    assertEqual(composterHopperExtract(7).extracted, false);
    assertEqual(composterHopperExtract(8).extracted, true);
    assertEqual(composterHopperExtract(8).level, 0);
  });

  it('outputs Java composter comparator strengths for all fill levels', () => {
    const expected = [0, 1, 3, 5, 7, 9, 11, 13, 15];
    for (let level = 0; level <= 8; level++) {
      assertEqual(composterComparatorOutput(level), expected[level]);
    }
    assertEqual(composterComparatorOutput(9), 0);
  });

  it('provides the vanilla-shaped seven-slab composter recipe', () => {
    const recipes = RECIPES.producing('mc:composter');
    assertEqual(recipes.length, 1);
    assertEqual(recipes[0].pattern.join('/'), 'S S/S S/SSS');
    assertEqual(recipes[0].key.S, '#mc:wooden_slabs');
  });
});
