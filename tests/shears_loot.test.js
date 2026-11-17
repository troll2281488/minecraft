import { describe, it, assertEqual } from './framework.js';
import { shearSheep } from '../src/entity/mobs.js';
import '../src/world/blocks/index.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { BLOCKS } from '../src/world/block.js';
import { blockDrops } from '../src/game/interaction.js';

describe('sheep shearing', () => {
  it('shears an adult sheep once and drops one to three wool', () => {
    const sheep = { type: 'sheep', sheared: false };
    const drops = shearSheep(sheep, () => 0.999);
    assertEqual(sheep.sheared, true);
    assertEqual(drops[0].id, 'mc:white_wool');
    assertEqual(drops[0].count, 3);
  });
  it('cannot shear a sheep twice or shear another mob', () => {
    const sheep = { type: 'sheep', sheared: true };
    assertEqual(shearSheep(sheep).length, 0);
    assertEqual(shearSheep({ type: 'pig' }).length, 0);
  });
  it('shears harvest leaf blocks themselves rather than saplings', () => {
    const leaves = BLOCKS.get('mc:oak_leaves').defaultState;
    const drops = blockDrops(leaves, ItemStack.of('mc:shears'), 1, 0, 64, 0);
    assertEqual(drops[0].id, 'mc:oak_leaves');
  });
  it('registers shears with vanilla iron durability', () => {
    assertEqual(ITEMS.get('mc:shears').maxDamage, 238);
    assertEqual(ITEMS.get('mc:shears').tool, 'shears');
  });
});
