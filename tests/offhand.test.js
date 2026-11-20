import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Inventory, SLOT } from '../src/game/inventory.js';
import { Item, ItemStack } from '../src/world/item.js';

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

describe('Java armor shift-click', () => {
  it('auto-equips armor when its target slot is empty', () => {
    const inventory = new Inventory();
    const helmet = new Item('test:helmet', { armorSlot: 'helmet', stackSize: 1 });
    inventory.set(0, new ItemStack(helmet, 1));

    inventory.shiftClickSlot(0);

    assert(inventory.get(0).isEmpty, 'source slot should be cleared');
    assertEqual(inventory.get(39).item.id, 'test:helmet');
  });

  it('does not replace already equipped armor; transfers to storage instead', () => {
    const inventory = new Inventory();
    const helmet = new Item('test:helmet', { armorSlot: 'helmet', stackSize: 1 });
    const otherHelmet = new Item('test:other_helmet', { armorSlot: 'helmet', stackSize: 1 });
    inventory.set(0, new ItemStack(helmet, 1));
    inventory.set(39, new ItemStack(otherHelmet, 1));

    inventory.shiftClickSlot(0);

    assertEqual(inventory.get(39).item.id, 'test:other_helmet', 'equipped armor was displaced');
    assert(inventory.get(0).isEmpty, 'source stack should transfer out');
    assertEqual(inventory.get(9).item.id, 'test:helmet', 'incoming armor should go to main storage');
  });
});
