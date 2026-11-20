import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Inventory } from '../src/game/inventory.js';
import { ItemStack } from '../src/world/item.js';

describe('Java left-drag inventory distribution', () => {
  it('distributes a cursor stack as evenly as possible', () => {
    const inventory = new Inventory();
    inventory.cursor = ItemStack.of('mc:torch', 10);

    assert(inventory.distributeCursor([0, 1, 2]));
    assertEqual(inventory.get(0).count, 4);
    assertEqual(inventory.get(1).count, 3);
    assertEqual(inventory.get(2).count, 3);
    assert(inventory.cursor.isEmpty, 'all items should be placed');
  });

  it('tops up compatible stacks and leaves an incompatible slot untouched', () => {
    const inventory = new Inventory();
    inventory.set(0, ItemStack.of('mc:torch', 60));
    inventory.set(1, ItemStack.of('mc:stick', 5));
    inventory.cursor = ItemStack.of('mc:torch', 12);

    assert(inventory.distributeCursor([0, 1, 2]));
    assertEqual(inventory.get(0).count, 64);
    assertEqual(inventory.get(1).item.id, 'mc:stick');
    assertEqual(inventory.get(2).count, 8);
    assert(inventory.cursor.isEmpty);
  });

  it('ignores duplicate and out-of-range slots and preserves leftovers', () => {
    const inventory = new Inventory();
    inventory.cursor = ItemStack.of('mc:torch', 70);

    assert(inventory.distributeCursor([0, 0, 1, 40, -1, 1]));
    assertEqual(inventory.get(0).count, 35);
    assertEqual(inventory.get(1).count, 35);
    assert(inventory.cursor.isEmpty);
  });

  it('does not consume the cursor when no selected slot can accept the item', () => {
    const inventory = new Inventory();
    inventory.set(0, ItemStack.of('mc:stick', 4));
    inventory.cursor = ItemStack.of('mc:torch', 7);

    assert(!inventory.distributeCursor([0, 40]));
    assertEqual(inventory.cursor.count, 7);
    assertEqual(inventory.get(0).item.id, 'mc:stick');
  });
});
