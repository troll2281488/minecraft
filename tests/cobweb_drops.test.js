import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ItemStack } from '../src/world/item.js';
import { blockDrops } from '../src/game/interaction.js';

describe('Java cobweb harvesting', () => {
  it('drops the cobweb block when harvested with shears', () => {
    const drops = blockDrops(BLOCKS.get('mc:cobweb').defaultState, ItemStack.of('mc:shears'));
    assertEqual(drops.length, 1);
    assertEqual(drops[0].id, 'mc:cobweb');
  });

  it('drops string when harvested with a sword', () => {
    const drops = blockDrops(BLOCKS.get('mc:cobweb').defaultState, ItemStack.of('mc:wooden_sword'));
    assertEqual(drops.length, 1);
    assertEqual(drops[0].id, 'mc:string');
    assertEqual(drops[0].count, 1);
  });

  it('does not drop an item when broken with an unsuitable tool', () => {
    assertEqual(blockDrops(BLOCKS.get('mc:cobweb').defaultState, ItemStack.of('mc:wooden_pickaxe')).length, 0);
  });
});
