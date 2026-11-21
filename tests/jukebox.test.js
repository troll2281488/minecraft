import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { ItemStack } from '../src/world/item.js';
import { blockDrops } from '../src/game/interaction.js';
import { jukeboxComparatorOutput } from '../src/game/redstone_devices.js';

describe('jukebox records', () => {
  it('registers an empty jukebox and record identity state', () => {
    const state = BLOCKS.get('mc:jukebox').defaultState;
    assertEqual(state.get('record'), 'none');
    assertEqual(state.with('record', 'cat').get('record'), 'cat');
    assertEqual(ITEMS.get('mc:music_disc_cat') !== undefined, true);
  });

  it('crafts a jukebox from planks and a diamond', () => {
    const grid = [
      ItemStack.of('mc:oak_planks', 1), ItemStack.of('mc:oak_planks', 1), ItemStack.of('mc:oak_planks', 1),
      ItemStack.of('mc:oak_planks', 1), ItemStack.of('mc:diamond', 1), ItemStack.of('mc:oak_planks', 1),
      ItemStack.of('mc:oak_planks', 1), ItemStack.of('mc:oak_planks', 1), ItemStack.of('mc:oak_planks', 1),
    ];
    assertEqual(RECIPES.match(grid, 3)?.result, 'mc:jukebox');
  });

  it('ejects its disc as a separate drop when broken', () => {
    const state = BLOCKS.get('mc:jukebox').defaultState.with('record', 'otherside');
    const drops = blockDrops(state, { item: { tool: 'axe' } });
    assertEqual(drops.some(drop => drop.id === 'mc:jukebox'), true);
    assertEqual(drops.some(drop => drop.id === 'mc:music_disc_otherside'), true);
  });

  it('outputs full comparator strength only while a disc is inserted', () => {
    assertEqual(jukeboxComparatorOutput('none'), 0);
    assertEqual(jukeboxComparatorOutput('13'), 15);
    assertEqual(jukeboxComparatorOutput('cat'), 15);
  });
});
