import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { hiveHarvestResult, hasCampfireSmoke, findBeeTarget, tickBeeForaging, HIVE_MAX_HONEY } from '../src/game/bee_hives.js';
import { MOB_TYPES_112, MobSystem } from '../src/entity/mobs.js';
import { shouldGenerateBeeNest, beeNestFacing } from '../src/world/gen/bee_nests.js';

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

  it('generates bee nests deterministically only on eligible oak/birch forest trees', () => {
    let eligible = 0;
    for (let x = 0; x < 200; x++) {
      if (shouldGenerateBeeNest(12345, x, 7, 'mc:flower_forest', 'oak')) eligible++;
      assertEqual(shouldGenerateBeeNest(12345, x, 7, 'mc:desert', 'oak'), false);
      assertEqual(shouldGenerateBeeNest(12345, x, 7, 'mc:flower_forest', 'jungle'), false);
    }
    assert(eligible > 0 && eligible < 40, 'nest frequency is not within the expected sparse range');
    assertEqual(shouldGenerateBeeNest(12345, 4, 7, 'mc:flower_forest', 'oak'),
      shouldGenerateBeeNest(12345, 4, 7, 'mc:flower_forest', 'oak'));
  });

  it('chooses a stable valid horizontal nest facing', () => {
    assert(['north', 'south', 'west', 'east'].includes(beeNestFacing(12, 4, 8)));
    assertEqual(beeNestFacing(12, 4, 8), beeNestFacing(12, 4, 8));
  });

  it('registers bees and a creative bee spawn egg', () => {
    assertEqual(MOB_TYPES_112.includes('bee'), true);
    assert(ITEMS.get('mc:bee_spawn_egg'), 'bee spawn egg missing');
  });

  it('finds the nearest flower and ignores unrelated blocks', () => {
    const flower = BLOCKS.get('mc:dandelion').defaultState;
    const world = { getBlock(x, y, z) {
      return { block: { id: x === 2 && y === 1 && z === 0 ? flower.block.id : 'mc:air' } };
    } };
    const target = findBeeTarget(world, 0.5, 1, 0.5, 'flower', 4);
    assertEqual(target.x, 2);
    assertEqual(target.y, 1);
    assertEqual(target.z, 0);
  });

  it('collects pollen at a flower and delivers it to a nearby hive', () => {
    const blocks = new Map([
      ['0,0,0', BLOCKS.get('mc:dandelion').defaultState],
      ['2,0,0', BLOCKS.get('mc:beehive').defaultState],
    ]);
    const world = {
      getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); return true; },
    };
    const bee = { type: 'bee', x: 0.5, y: 0, z: 0.5, moveTicks: 0 };
    tickBeeForaging(world, bee);
    assertEqual(bee.beePollenTicks, 600);
    bee.x = 2.5;
    bee.z = 0.5;
    let changed = null;
    for (let i = 0; i < 200; i++) changed = tickBeeForaging(world, bee) || changed;
    assert(changed, 'bee did not deliver pollen');
    assertEqual(changed.state.get('honey_level'), 1);
    assertEqual(blocks.get('2,0,0').get('honey_level'), 1);
  });

  it('persists bee pollen and hive-work progress through mob save data', () => {
    const original = new MobSystem({});
    original.mobs.push({
      id: 4, type: 'bee', x: 1, y: 2, z: 3, yaw: 0.5, targetYaw: 0.5,
      health: 10, beePollenTicks: 321, beeHiveWorkTicks: 123, beeSearchTicks: 9,
    });
    const restored = new MobSystem({});
    restored.loadFrom(original.toJSON());
    assertEqual(restored.mobs.length, 1);
    assertEqual(restored.mobs[0].type, 'bee');
    assertEqual(restored.mobs[0].beePollenTicks, 321);
    assertEqual(restored.mobs[0].beeHiveWorkTicks, 123);
    assertEqual(restored.mobs[0].beeSearchTicks, 9);
  });

  it('registers the beehive and campfire crafting recipes', () => {
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:beehive'));
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:honeycomb' && recipe.count === 4));
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:campfire'));
  });
});
