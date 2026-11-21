import { describe, it, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import {
  tickFarming, nextWheatAge, nextCropAge, hasNearbyWaterSource,
  FARMLAND_MAX_MOISTURE, DRY_WHEAT_GROWTH_INTERVAL,
} from '../src/game/farming.js';
import { RECIPES } from '../src/game/recipes.js';
import { blockDrops } from '../src/game/interaction.js';

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

describe('wheat farming and farmland hydration', () => {
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

  it('retains bread and wooden hoe crafting recipes', () => {
    assertEqual(RECIPES.producing('mc:bread').length, 1);
    assertEqual(RECIPES.producing('mc:wooden_hoe').length, 1);
  });
});
