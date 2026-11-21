import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import {
  COMPOSTER_MAX_LEVEL, COMPOSTABLE_ITEM_IDS, compostChance, isCompostable,
  nextComposterLevel, compostRoll, boneMealAge,
} from '../src/game/composting.js';

describe('composter and bone meal farming', () => {
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

  it('provides the vanilla-shaped seven-slab composter recipe', () => {
    const recipes = RECIPES.producing('mc:composter');
    assertEqual(recipes.length, 1);
    assertEqual(recipes[0].pattern.join('/'), 'S S/S S/SSS');
    assertEqual(recipes[0].key.S, '#mc:wooden_slabs');
  });
});
