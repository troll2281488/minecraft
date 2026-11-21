import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { hiveHarvestResult, hasCampfireSmoke, HIVE_MAX_HONEY } from '../src/game/bee_hives.js';

describe('bee nest and beehive harvesting', () => {
  it('registers both hive blocks with persisted 0..5 honey levels', () => {
    for (const id of ['mc:bee_nest', 'mc:beehive']) {
      const block = BLOCKS.get(id);
      assert(block, id + ' missing');
      assertEqual(block.defaultState.get('honey_level'), 0);
      assertEqual(block.defaultState.with('honey_level', HIVE_MAX_HONEY).get('honey_level'), 5);
    }
  });

  it('registers glass bottle and honey bottle items with the expected food value', () => {
    assert(ITEMS.get('mc:glass_bottle'), 'glass bottle missing');
    const honey = ITEMS.get('mc:honey_bottle');
    assert(honey, 'honey bottle missing');
    assertEqual(honey.stackSize, 16);
    assertEqual(honey.food.nutrition, 6);
  });

  it('accepts an unobstructed campfire smoke column below the hive', () => {
    const world = { getBlock(x, y, z) {
      return { block: { id: x === 2 && y === 8 && z === 3 ? 'mc:campfire' : 'mc:air' } };
    } };
    assertEqual(hasCampfireSmoke(world, 2, 10, 3), true);
  });

  it('rejects smoke when a solid block blocks the column', () => {
    const world = { getBlock(x, y, z) {
      const id = x === 0 && y === 8 && z === 0 ? 'mc:campfire'
        : x === 0 && y === 9 && z === 0 ? 'mc:stone' : 'mc:air';
      return { block: { id } };
    } };
    assertEqual(hasCampfireSmoke(world, 0, 10, 0), false);
  });

  it('does not accept smoke from a campfire in a neighboring column', () => {
    const world = { getBlock(x, y, z) {
      return { block: { id: x === 1 && y === 8 && z === 0 ? 'mc:campfire' : 'mc:air' } };
    } };
    assertEqual(hasCampfireSmoke(world, 0, 10, 0), false);
  });

  it('does not accept campfires outside the five-block smoke range', () => {
    const world = { getBlock(x, y, z) {
      return { block: { id: x === 0 && y === 4 && z === 0 ? 'mc:campfire' : 'mc:air' } };
    } };
    assertEqual(hasCampfireSmoke(world, 0, 10, 0), false);
  });

  it('requires a full hive before harvesting', () => {
    const hive = BLOCKS.get('mc:beehive').defaultState;
    const result = hiveHarvestResult(hive, 'mc:shears', true);
    assertEqual(result.ok, false);
    assertEqual(result.reason, 'not_full');
  });

  it('requires smoke before shears or bottles can harvest', () => {
    const hive = BLOCKS.get('mc:bee_nest').defaultState.with('honey_level', 5);
    assertEqual(hiveHarvestResult(hive, 'mc:shears', false).reason, 'bees_angry');
    assertEqual(hiveHarvestResult(hive, 'mc:glass_bottle', false).reason, 'bees_angry');
  });

  it('shears harvest exactly three honeycombs and reset honey level', () => {
    const hive = BLOCKS.get('mc:beehive').defaultState.with('honey_level', 5);
    const result = hiveHarvestResult(hive, 'mc:shears', true);
    assertEqual(result.ok, true);
    assertEqual(result.drops[0].id, 'mc:honeycomb');
    assertEqual(result.drops[0].count, 3);
    assertEqual(result.nextLevel, 0);
  });

  it('a glass bottle collects honey and resets the hive', () => {
    const hive = BLOCKS.get('mc:bee_nest').defaultState.with('honey_level', 5);
    const result = hiveHarvestResult(hive, 'mc:glass_bottle', true);
    assertEqual(result.ok, true);
    assertEqual(result.drops[0].id, 'mc:honey_bottle');
    assertEqual(result.drops[0].count, 1);
    assertEqual(result.nextLevel, 0);
  });

  it('does not harvest with unrelated items', () => {
    const hive = BLOCKS.get('mc:beehive').defaultState.with('honey_level', 5);
    assertEqual(hiveHarvestResult(hive, 'mc:stick', true).reason, 'wrong_tool');
  });

  it('registers the beehive and campfire crafting recipes', () => {
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:beehive'));
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:campfire'));
  });
});
