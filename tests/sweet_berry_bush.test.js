import { describe, it, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import { tickFarming, nextSweetBerryBushAge, sweetBerryHarvest } from '../src/game/farming.js';
import { compostChance } from '../src/game/composting.js';

function makeWorld(entries = []) {
  const blocks = new Map(entries);
  return {
    getBlock(x, y, z) {
      return blocks.get(`${x},${y},${z}`) ?? BLOCKS.get('mc:air').defaultState;
    },
    setBlock(x, y, z, state) {
      blocks.set(`${x},${y},${z}`, state);
      return true;
    },
  };
}

describe('Java sweet berry bush farming', () => {
  it('registers berry food and a non-inventory bush block', () => {
    assertEqual(ITEMS.get('mc:sweet_berries')?.food?.nutrition, 2);
    assertEqual(BLOCKS.get('mc:sweet_berry_bush')?.defaultState.get('age'), 0);
  });

  it('grows only to age three and requires suitable soil', () => {
    const bush = BLOCKS.get('mc:sweet_berry_bush').defaultState;
    assertEqual(nextSweetBerryBushAge(bush), 1);
    assertEqual(nextSweetBerryBushAge(bush.with('age', 2)), 3);
    assertEqual(nextSweetBerryBushAge(bush.with('age', 3)), null);
    const world = makeWorld([
      ['0,64,0', BLOCKS.get('mc:grass_block').defaultState],
      ['0,65,0', bush],
      ['1,64,0', BLOCKS.get('mc:stone').defaultState],
      ['1,65,0', bush],
    ]);
    const changes = tickFarming(world, { x: 0, y: 65, z: 0 }, 600);
    assertEqual(world.getBlock(0, 65, 0).get('age'), 1);
    assertEqual(world.getBlock(1, 65, 0).get('age'), 0);
    assertEqual(changes.length, 1);
  });

  it('harvests ripe bushes and resets them to the regrowth stage', () => {
    const bush = BLOCKS.get('mc:sweet_berry_bush').defaultState.with('age', 3);
    assertEqual(sweetBerryHarvest(bush.with('age', 1), () => 0), null);
    const result = sweetBerryHarvest(bush, () => 0);
    assertEqual(result.count, 2);
    assertEqual(result.state.get('age'), 1);
    assertEqual(sweetBerryHarvest(BLOCKS.get('mc:stone').defaultState), null);
  });

  it('adds sweet berries to the composter input table', () => {
    assertEqual(compostChance('mc:sweet_berries'), 0.30);
  });
});
