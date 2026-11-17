import { describe, it, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { growNearbyWheat, nextWheatAge } from '../src/game/farming.js';
import { RECIPES } from '../src/game/recipes.js';

describe('wheat farming', () => {
  it('increments crop age up to seven', () => {
    const wheat = BLOCKS.get('mc:wheat');
    assertEqual(nextWheatAge(wheat.defaultState), 1);
    assertEqual(nextWheatAge(wheat.defaultState.with('age', 6)), 7);
    assertEqual(nextWheatAge(wheat.defaultState.with('age', 7)), null);
  });

  it('grows planted wheat above farmland on the 600-tick interval', () => {
    const wheat = BLOCKS.get('mc:wheat').defaultState;
    const farmland = BLOCKS.get('mc:farmland').defaultState;
    const blocks = new Map([['0,64,0', farmland], ['0,65,0', wheat]]);
    const world = {
      getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) ?? BLOCKS.get('mc:air').defaultState; },
      setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); return true; },
    };
    const changed = growNearbyWheat(world, { x: 0.5, y: 65, z: 0.5 }, 600);
    assertEqual(changed.length, 1);
    assertEqual(world.getBlock(0, 65, 0).get('age'), 1);
  });

  it('has a bread recipe and craftable wooden hoe', () => {
    assertEqual(RECIPES.producing('mc:bread').length, 1);
    assertEqual(RECIPES.producing('mc:wooden_hoe').length, 1);
  });

  it('does not grow without farmland or between growth intervals', () => {
    const wheat = BLOCKS.get('mc:wheat').defaultState;
    const blocks = new Map([['0,65,0', wheat]]);
    const world = {
      getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) ?? BLOCKS.get('mc:air').defaultState; },
      setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); return true; },
    };
    assertEqual(growNearbyWheat(world, { x: 0, y: 65, z: 0 }, 600).length, 0);
    assertEqual(growNearbyWheat(world, { x: 0, y: 65, z: 0 }, 601).length, 0);
    assertEqual(world.getBlock(0, 65, 0).get('age'), 0);
  });
});
