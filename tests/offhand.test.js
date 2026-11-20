import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Inventory, SLOT } from '../src/game/inventory.js';
import { ItemStack } from '../src/world/item.js';

describe('Java offhand slot', () => {
  it('swaps the selected hotbar stack with offhand', () => {
    const inventory = new Inventory();
    inventory.set(2, ItemStack.of('mc:torch', 12));
    inventory.set(SLOT.OFFHAND, ItemStack.of('mc:stick'));
    inventory.selectedSlot = 2;
    const version = inventory.version;

    assert(inventory.swapHeldWithOffhand(), 'swap should succeed');
    assertEqual(inventory.get(2).item.id, 'mc:stick');
    assertEqual(inventory.get(SLOT.OFFHAND).item.id, 'mc:torch');
    assertEqual(inventory.get(SLOT.OFFHAND).count, 12);
    assertEqual(inventory.version, version + 1);
  });

  it('swaps correctly when either hand is empty', () => {
    const inventory = new Inventory();
    inventory.set(0, ItemStack.of('mc:torch', 4));
    assert(inventory.swapHeldWithOffhand());
    assert(inventory.get(0).isEmpty);
    assertEqual(inventory.get(SLOT.OFFHAND).count, 4);
    assert(inventory.swapHeldWithOffhand());
    assertEqual(inventory.get(0).item.id, 'mc:torch');
    assert(inventory.get(SLOT.OFFHAND).isEmpty);
  });

  it('rejects inventories without an offhand slot', () => {
    const inventory = new Inventory(9);
    assert(!inventory.swapHeldWithOffhand());
  });
});
