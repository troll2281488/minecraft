import { describe, it, assert, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import {
  tickFarming, nextWheatAge, nextCropAge, hasNearbyWaterSource,
  chooseStemFruitTarget, STEM_IDS, canPlantSugarCane, SUGAR_CANE_MAX_HEIGHT,
  FARMLAND_MAX_MOISTURE, DRY_WHEAT_GROWTH_INTERVAL,
} from '../src/game/farming.js';
import { RECIPES } from '../src/game/recipes.js';
import { blockDrops } from '../src/game/interaction.js';
import { boneMealAge, canApplyBoneMeal } from '../src/game/composting.js';

function makeWorld(entries = []) {
  const blocks = new Map(entries);
  return {
    blocks,
    getBlock(x, y, z) {
      return blocks.get(`${x},${y},${z}`) ?? BLOCKS.get('mc:air').defaultState;
    },
    setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); return true; },
  };
}

describe('sugar cane farming', () => {
  it('requires sand, dirt or grass and adjacent source water', () => {
    const sand = BLOCKS.get('mc:sand').defaultState;
    const dirt = BLOCKS.get('mc:dirt').defaultState;
    const water = BLOCKS.get('mc:water').defaultState;
    assertEqual(canPlantSugarCane(makeWorld([['0,64,0', sand], ['1,65,0', water]]), 0, 64, 0), true);
    assertEqual(canPlantSugarCane(makeWorld([['0,64,0', dirt], ['0,65,1', water]]), 0, 64, 0), true);
    assertEqual(canPlantSugarCane(makeWorld([['0,64,0', sand]]), 0, 64, 0), false);
    assertEqual(canPlantSugarCane(makeWorld([['0,64,0', BLOCKS.get('mc:stone').defaultState], ['1,65,0', water]]), 0, 64, 0), false);
    assertEqual(canPlantSugarCane(makeWorld([['0,64,0', sand], ['1,65,0', water.with('level', 2)]]), 0, 64, 0), false);
  });

  it('grows one top segment at a time and never exceeds three blocks', () => {
    const cane = BLOCKS.get('mc:sugar_cane').defaultState;
    const sand = BLOCKS.get('mc:sand').defaultState;
    const water = BLOCKS.get('mc:water').defaultState;
    const world = makeWorld([
      ['0,64,0', sand], ['1,65,0', water],
      ['0,65,0', cane],
    ]);
    tickFarming(world, { x: 0, y: 65, z: 0 }, 599);
    assertEqual(world.getBlock(0, 66, 0).block.id, 'mc:air');
    const first = tickFarming(world, { x: 0, y: 65, z: 0 }, 600);
    assertEqual(world.getBlock(0, 66, 0).block.id, 'mc:sugar_cane');
    assertEqual(first.filter(c => c.state.block.id === 'mc:sugar_cane').length, 1);
    tickFarming(world, { x: 0, y: 66, z: 0 }, 1200);
    assertEqual(world.getBlock(0, 67, 0).block.id, 'mc:sugar_cane');
    tickFarming(world, { x: 0, y: 67, z: 0 }, 1800);
    assertEqual(world.getBlock(0, 68, 0).block.id, 'mc:air');
    assertEqual(SUGAR_CANE_MAX_HEIGHT, 3);
  });

  it('drops one sugar cane item when harvested', () => {
    const drops = blockDrops(BLOCKS.get('mc:sugar_cane').defaultState, null, 9, 0, 65, 0);
    assertEqual(drops.length, 1);
    assertEqual(drops[0].id, 'mc:sugar_cane');
    assertEqual(drops[0].count, 1);
  });

  it('does not grow through a blocked top or without valid water', () => {
    const cane = BLOCKS.get('mc:sugar_cane').defaultState;
    const sand = BLOCKS.get('mc:sand').defaultState;
    const stone = BLOCKS.get('mc:stone').defaultState;
    const world = makeWorld([['0,64,0', sand], ['0,65,0', cane], ['0,66,0', stone]]);
    tickFarming(world, { x: 0, y: 65, z: 0 }, 600);
    assertEqual(world.getBlock(0, 66, 0).block.id, 'mc:stone');
    assertEqual(world.getBlock(0, 67, 0).block.id, 'mc:air');
  });
});

describe('wheat farming and farmland hydration', () => {
  it('registers sugar cane as a placeable item block', () => {
    assert(BLOCKS.get('mc:sugar_cane'), 'sugar cane block missing');
    assert(ITEMS.get('mc:sugar_cane'), 'sugar cane item missing');
  });

  it('registers persisted farmland moisture from zero through seven', () => {
    const farmland = BLOCKS.get('mc:farmland');
    assert(farmland, 'farmland missing');
    assertEqual(farmland.defaultState.get('moisture'), 0);
    assertEqual(farmland.defaultState.with('moisture', FARMLAND_MAX_MOISTURE).get('moisture'), 7);
  });

  it('finds a source-water block four horizontal blocks away', () => {
    const water = BLOCKS.get('mc:water').defaultState;
    const world = makeWorld([['4,64,0', water]]);
    assertEqual(hasNearbyWaterSource(world, 0, 64, 0), true);
  });

  it('uses the full square horizontal water range, including diagonal corners', () => {
    const source = BLOCKS.get('mc:water').defaultState;
    assertEqual(hasNearbyWaterSource(makeWorld([['4,65,4', source]]), 0, 64, 0), true);
  });

  it('does not hydrate from flowing water or water beyond the four-block range', () => {
    const flowing = BLOCKS.get('mc:water').defaultState.with('level', 4);
    assertEqual(hasNearbyWaterSource(makeWorld([['2,64,0', flowing]]), 0, 64, 0), false);
    const source = BLOCKS.get('mc:water').defaultState;
    assertEqual(hasNearbyWaterSource(makeWorld([['5,64,0', source]]), 0, 64, 0), false);
  });

  it('hydrates farmland to seven and replicates the changed blockstate once', () => {
    const farmland = BLOCKS.get('mc:farmland').defaultState;
    const water = BLOCKS.get('mc:water').defaultState;
    const world = makeWorld([['0,64,0', farmland], ['4,64,0', water]]);
    const changed = tickFarming(world, { x: 0, y: 65, z: 0 }, 20);
    assertEqual(world.getBlock(0, 64, 0).get('moisture'), 7);
    assertEqual(changed.filter((c) => c.x === 0 && c.y === 64 && c.z === 0).length, 1);
  });

  it('loses one moisture level per second when no water is nearby', () => {
    const soil = BLOCKS.get('mc:farmland').defaultState.with('moisture', 4);
    const world = makeWorld([['0,64,0', soil]]);
    tickFarming(world, { x: 0, y: 65, z: 0 }, 20);
    assertEqual(world.getBlock(0, 64, 0).get('moisture'), 3);
  });

  it('grows wheat above hydrated farmland on the 600-tick interval', () => {
    const wheat = BLOCKS.get('mc:wheat').defaultState;
    const farmland = BLOCKS.get('mc:farmland').defaultState.with('moisture', 7);
    const water = BLOCKS.get('mc:water').defaultState;
    const world = makeWorld([['0,64,0', farmland], ['0,65,0', wheat], ['4,64,0', water]]);
    const changed = tickFarming(world, { x: 0.5, y: 65, z: 0.5 }, 600);
    assertEqual(world.getBlock(0, 65, 0).get('age'), 1);
    assertEqual(changed.some((c) => c.x === 0 && c.y === 65 && c.z === 0), true);
  });

  it('advances all four crop families through the shared hydration loop', () => {
    const entries = [];
    const water = BLOCKS.get('mc:water').defaultState;
    for (const [index, id] of ['mc:wheat', 'mc:carrots', 'mc:potatoes', 'mc:beetroots'].entries()) {
      const x = index * 2;
      entries.push([`${x},64,0`, BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)]);
      entries.push([`${x},65,0`, BLOCKS.get(id).defaultState]);
      entries.push([`${x + 4},64,0`, water]);
    }
    const world = makeWorld(entries);
    tickFarming(world, { x: 3, y: 65, z: 0 }, 600);
    for (const [index, id] of ['mc:wheat', 'mc:carrots', 'mc:potatoes', 'mc:beetroots'].entries()) {
      assertEqual(world.getBlock(index * 2, 65, 0).get('age'), 1, id + ' did not grow');
    }
  });

  it('allows dry farmland to grow wheat at one third the hydrated rate', () => {
    const wheat = BLOCKS.get('mc:wheat').defaultState;
    const soil = BLOCKS.get('mc:farmland').defaultState;
    const world = makeWorld([['0,64,0', soil], ['0,65,0', wheat]]);
    tickFarming(world, { x: 0, y: 65, z: 0 }, DRY_WHEAT_GROWTH_INTERVAL);
    assertEqual(world.getBlock(0, 65, 0).get('age'), 1);
  });

  it('does not grow wheat on ordinary dirt or between growth intervals', () => {
    const wheat = BLOCKS.get('mc:wheat').defaultState;
    const dirt = BLOCKS.get('mc:dirt').defaultState;
    const world = makeWorld([['0,64,0', dirt], ['0,65,0', wheat]]);
    tickFarming(world, { x: 0, y: 65, z: 0 }, 600);
    assertEqual(world.getBlock(0, 65, 0).get('age'), 0);
    assertEqual(nextWheatAge(wheat.with('age', 7)), null);
  });

  it('registers carrot, potato and beetroot crop blocks with seven growth stages', () => {
    for (const id of ['mc:carrots', 'mc:potatoes', 'mc:beetroots']) {
      const crop = BLOCKS.get(id);
      assert(crop, id + ' missing');
      assertEqual(nextCropAge(crop.defaultState), 1);
      assertEqual(nextCropAge(crop.defaultState.with('age', 7)), null);
    }
    assertEqual(ITEMS.get('mc:beetroot').food.nutrition, 1);
  });

  it('gives mature carrots, potatoes and beetroot the correct deterministic drops', () => {
    const mature = id => BLOCKS.get(id).defaultState.with('age', 7);
    const carrots = blockDrops(mature('mc:carrots'), null, 9, 1, 64, 2);
    const potatoes = blockDrops(mature('mc:potatoes'), null, 9, 1, 64, 2);
    const beetroot = blockDrops(mature('mc:beetroots'), null, 9, 1, 64, 2);
    assertEqual(carrots[0].id, 'mc:carrot');
    assert(carrots[0].count >= 1 && carrots[0].count <= 4);
    assertEqual(potatoes[0].id, 'mc:potato');
    assert(potatoes[0].count >= 1 && potatoes[0].count <= 4);
    assertEqual(beetroot[0].id, 'mc:beetroot');
    assertEqual(beetroot[1].id, 'mc:beetroot_seeds');
  });

  it('only mature wheat drops wheat and seeds when broken', () => {
    const crop = BLOCKS.get('mc:wheat');
    assertEqual(blockDrops(crop.defaultState, null, 1, 0, 0, 0).length, 0);
    const drops = blockDrops(crop.defaultState.with('age', 7), null, 1, 0, 0, 0);
    assertEqual(drops[0].id, 'mc:wheat');
    assertEqual(drops[1].id, 'mc:wheat_seeds');
  });

  it('registers pumpkin and melon stems as seven-stage crops and fruit as harvestable blocks', () => {
    for (const id of STEM_IDS) {
      const stem = BLOCKS.get(id);
      assert(stem, id + ' missing');
      assertEqual(nextCropAge(stem.defaultState), 1);
      assertEqual(nextCropAge(stem.defaultState.with('age', 7)), null);
    }
    assert(BLOCKS.get('mc:pumpkin'), 'pumpkin block missing');
    assert(BLOCKS.get('mc:melon'), 'melon block missing');
    for (const id of ['mc:pumpkin', 'mc:melon', 'mc:pumpkin_seeds', 'mc:melon_seeds']) {
      assert(ITEMS.get(id), id + ' item missing');
    }
    assertEqual(ITEMS.get('mc:melon_slice').food.nutrition, 2);
  });

  it('grows pumpkin and melon stems on hydrated farmland and slows dry stems', () => {
    for (const id of STEM_IDS) {
      const hydrated = makeWorld([
        ['0,64,0', BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)],
        ['0,65,0', BLOCKS.get(id).defaultState],
      ]);
      tickFarming(hydrated, { x: 0, y: 65, z: 0 }, 600);
      assertEqual(hydrated.getBlock(0, 65, 0).get('age'), 1, id + ' did not grow');
      const dry = makeWorld([
        ['0,64,0', BLOCKS.get('mc:farmland').defaultState],
        ['0,65,0', BLOCKS.get(id).defaultState],
      ]);
      tickFarming(dry, { x: 0, y: 65, z: 0 }, 600);
      assertEqual(dry.getBlock(0, 65, 0).get('age'), 0, id + ' grew too quickly on dry soil');
      tickFarming(dry, { x: 0, y: 65, z: 0 }, DRY_WHEAT_GROWTH_INTERVAL);
      assertEqual(dry.getBlock(0, 65, 0).get('age'), 1, id + ' did not grow on dry interval');
    }
  });

  it('places mature stem fruit only in adjacent air above suitable soil, deterministically', () => {
    const entries = [
      ['0,64,0', BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)],
      ['0,65,0', BLOCKS.get('mc:pumpkin_stem').defaultState.with('age', 7)],
      ['1,64,0', BLOCKS.get('mc:dirt').defaultState],
      ['-1,64,0', BLOCKS.get('mc:dirt').defaultState],
      ['0,64,1', BLOCKS.get('mc:dirt').defaultState],
      ['0,64,-1', BLOCKS.get('mc:dirt').defaultState],
    ];
    let seed = 0, expected = null;
    for (; seed < 100; seed++) {
      expected = chooseStemFruitTarget(makeWorld(entries), 0, 65, 0, seed, 600, 'mc:pumpkin_stem');
      if (expected) break;
    }
    assert(expected, 'could not find deterministic valid fruit roll');
    const world = makeWorld(entries);
    world.seed = seed;
    const changed = tickFarming(world, { x: 0, y: 65, z: 0 }, 600);
    assertEqual(world.getBlock(expected.x, expected.y, expected.z).block.id, 'mc:pumpkin');
    assert(changed.some((change) => change.x === expected.x && change.z === expected.z), 'fruit change was not returned for replication');
  });

  it('grows both pumpkin and melon fruit from the matching mature stem', () => {
    for (const [stemId, fruitId] of [['mc:pumpkin_stem', 'mc:pumpkin'], ['mc:melon_stem', 'mc:melon']]) {
      const entries = [
        ['0,64,0', BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)],
        ['0,65,0', BLOCKS.get(stemId).defaultState.with('age', 7)],
        ['1,64,0', BLOCKS.get('mc:dirt').defaultState],
        ['-1,64,0', BLOCKS.get('mc:dirt').defaultState],
        ['0,64,1', BLOCKS.get('mc:dirt').defaultState],
        ['0,64,-1', BLOCKS.get('mc:dirt').defaultState],
      ];
      let seed = 0, target = null;
      for (; seed < 100; seed++) {
        target = chooseStemFruitTarget(makeWorld(entries), 0, 65, 0, seed, 600, stemId);
        if (target) break;
      }
      assert(target, 'no valid fruit target for ' + stemId);
      const world = makeWorld(entries);
      world.seed = seed;
      tickFarming(world, { x: 0, y: 65, z: 0 }, 600);
      assertEqual(world.getBlock(target.x, target.y, target.z).block.id, fruitId);
    }
  });

  it('does not spawn fruit on the same tick a stem reaches maturity', () => {
    const entries = [
      ['0,64,0', BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)],
      ['0,65,0', BLOCKS.get('mc:pumpkin_stem').defaultState.with('age', 6)],
      ['1,64,0', BLOCKS.get('mc:dirt').defaultState],
      ['-1,64,0', BLOCKS.get('mc:dirt').defaultState],
      ['0,64,1', BLOCKS.get('mc:dirt').defaultState],
      ['0,64,-1', BLOCKS.get('mc:dirt').defaultState],
    ];
    const world = makeWorld(entries);
    world.seed = 3;
    tickFarming(world, { x: 0, y: 65, z: 0 }, 600);
    assertEqual(world.getBlock(0, 65, 0).get('age'), 7);
    for (const [x, z] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      assertEqual(world.getBlock(x, 65, z).block.id, 'mc:air');
    }
  });

  it('requires farmland under the mature stem even when neighboring soil is valid', () => {
    const entries = [
      ['0,64,0', BLOCKS.get('mc:dirt').defaultState],
      ['0,65,0', BLOCKS.get('mc:melon_stem').defaultState.with('age', 7)],
      ['1,64,0', BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)],
      ['-1,64,0', BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)],
      ['0,64,1', BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)],
      ['0,64,-1', BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)],
    ];
    const world = makeWorld(entries);
    world.seed = 12;
    tickFarming(world, { x: 0, y: 65, z: 0 }, 600);
    for (const [x, z] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      assertEqual(world.getBlock(x, 65, z).block.id, 'mc:air');
    }
  });

  it('skips occupied fruit positions instead of replacing existing blocks', () => {
    const entries = [
      ['0,64,0', BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)],
      ['0,65,0', BLOCKS.get('mc:pumpkin_stem').defaultState.with('age', 7)],
      ['1,64,0', BLOCKS.get('mc:dirt').defaultState],
      ['-1,64,0', BLOCKS.get('mc:dirt').defaultState],
      ['0,64,1', BLOCKS.get('mc:dirt').defaultState],
      ['0,64,-1', BLOCKS.get('mc:dirt').defaultState],
      ['1,65,0', BLOCKS.get('mc:stone').defaultState],
    ];
    let seed = 0, target = null;
    for (; seed < 100; seed++) {
      target = chooseStemFruitTarget(makeWorld(entries), 0, 65, 0, seed, 600, 'mc:pumpkin_stem');
      if (target && target.x !== 1) break;
    }
    assert(target, 'no unoccupied fruit position found');
    const world = makeWorld(entries);
    world.seed = seed;
    tickFarming(world, { x: 0, y: 65, z: 0 }, 600);
    assertEqual(world.getBlock(1, 65, 0).block.id, 'mc:stone');
    assertEqual(world.getBlock(target.x, target.y, target.z).block.id, 'mc:pumpkin');
  });

  it('does not spawn fruit when all adjacent soil is unsuitable or spaces are blocked', () => {
    const entries = [
      ['0,64,0', BLOCKS.get('mc:farmland').defaultState.with('moisture', 7)],
      ['0,65,0', BLOCKS.get('mc:melon_stem').defaultState.with('age', 7)],
      ['1,64,0', BLOCKS.get('mc:stone').defaultState],
      ['-1,64,0', BLOCKS.get('mc:stone').defaultState],
      ['0,64,1', BLOCKS.get('mc:stone').defaultState],
      ['0,64,-1', BLOCKS.get('mc:stone').defaultState],
    ];
    const world = makeWorld(entries);
    world.seed = 0;
    tickFarming(world, { x: 0, y: 65, z: 0 }, 600);
    for (const [x, z] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      assertEqual(world.getBlock(x, 65, z).block.id, 'mc:air');
    }
  });

  it('drops melon slices and matching seeds from stems', () => {
    const melon = blockDrops(BLOCKS.get('mc:melon').defaultState, null, 4, 0, 64, 0);
    assertEqual(melon[0].id, 'mc:melon_slice');
    assert(melon[0].count >= 3 && melon[0].count <= 7);
    const pumpkin = blockDrops(BLOCKS.get('mc:pumpkin').defaultState, null, 4, 0, 64, 0);
    assertEqual(pumpkin[0].id, 'mc:pumpkin');
    assertEqual(pumpkin[0].count, 1);
    const pumpkinStem = blockDrops(BLOCKS.get('mc:pumpkin_stem').defaultState, null, 5, 0, 64, 0);
    assert(pumpkinStem.length <= 1);
    if (pumpkinStem.length) assertEqual(pumpkinStem[0].id, 'mc:pumpkin_seeds');
    const melonStem = blockDrops(BLOCKS.get('mc:melon_stem').defaultState, null, 6, 0, 64, 0);
    assert(melonStem.length <= 1);
    if (melonStem.length) assertEqual(melonStem[0].id, 'mc:melon_seeds');
  });

  it('adds pumpkin seed, melon seed and melon block recipes', () => {
    assertEqual(RECIPES.producing('mc:pumpkin_seeds').length, 1);
    assertEqual(RECIPES.producing('mc:melon_seeds').length, 1);
    assertEqual(RECIPES.producing('mc:melon').length, 1);
    assertEqual(RECIPES.producing('mc:melon')[0].pattern.join('/'), 'MMM/MMM/MMM');
  });

  it('allows bone meal on all six ageable crop families, including both stems', () => {
    for (const id of ['mc:wheat', 'mc:carrots', 'mc:potatoes', 'mc:beetroots', ...STEM_IDS]) {
      assertEqual(canApplyBoneMeal(id, 0), true, id + ' should accept bone meal');
      assertEqual(canApplyBoneMeal(id, 6), true, id + ' should accept bone meal before maturity');
      assertEqual(canApplyBoneMeal(id, 7), false, id + ' should reject bone meal when mature');
      const age = boneMealAge(2, 123, 4, 65, 8, 600);
      assert(age >= 4 && age <= 7, 'bone meal must advance by 2–5 stages');
      assertEqual(boneMealAge(2, 123, 4, 65, 8, 600), age, 'bone meal result must be deterministic');
      assertEqual(boneMealAge(7, 123, 4, 65, 8, 600), null, 'mature crop must not grow further');
    }
    assertEqual(canApplyBoneMeal('mc:pumpkin', 0), false);
    assertEqual(canApplyBoneMeal('mc:stone', 0), false);
    assertEqual(canApplyBoneMeal('mc:wheat', 7), false);
  });

  it('retains bread and wooden hoe crafting recipes', () => {
    assertEqual(RECIPES.producing('mc:bread').length, 1);
    assertEqual(RECIPES.producing('mc:wooden_hoe').length, 1);
  });  it('retains bread and wooden hoe crafting recipes', () => {
    assertEqual(RECIPES.producing('mc:bread').length, 1);
    assertEqual(RECIPES.producing('mc:wooden_hoe').length, 1);
  });
});
