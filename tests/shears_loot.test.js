import { describe, it, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { ItemStack } from '../src/world/item.js';
import { BLOCKS } from '../src/world/block.js';
import { blockDrops } from '../src/game/interaction.js';

describe('shears loot', () => {
  it('shears harvest leaf blocks themselves rather than saplings', () => {
    const leaves = BLOCKS.get('mc:oak_leaves').defaultState;
    const drops = blockDrops(leaves, ItemStack.of('mc:shears'), 1, 0, 64, 0);
    assertEqual(drops[0].id, 'mc:oak_leaves');
  });
});
