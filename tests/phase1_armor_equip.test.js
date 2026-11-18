import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Inventory, SLOT } from '../src/game/inventory.js';
import { ItemStack } from '../src/world/item.js';

/** Shift-click puts armour on (docs/TARGET_1_12_2.md, section 7.4). */
describe('shift-click armour', () => {
  it('puts a helmet from the hotbar into the helmet slot', () => {
    const inv = new Inventory();
    inv.slots[0] = ItemStack.of('mc:iron_helmet', 1);
    inv.shiftClickSlot(0);
    assertEqual(inv.slots[SLOT.ARMOR_START].item.id, 'mc:iron_helmet');
    assert(inv.slots[0].isEmpty, 'hotbar slot should be empty');
  });
  it('swaps out the piece already worn', () => {
    const inv = new Inventory();
    inv.slots[SLOT.ARMOR_START] = ItemStack.of('mc:leather_helmet', 1);
    inv.slots[9] = ItemStack.of('mc:diamond_helmet', 1);
    inv.shiftClickSlot(9);
    assertEqual(inv.slots[SLOT.ARMOR_START].item.id, 'mc:diamond_helmet');
    assertEqual(inv.slots[9].item.id, 'mc:leather_helmet');
  });
});
