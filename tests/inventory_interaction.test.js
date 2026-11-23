import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { Inventory, SLOT, ARMOR_ORDER, armorSlotIndex } from '../src/game/inventory.js';
import { ItemStack } from '../src/world/item.js';

describe('inventory drag and armor slot rules', () => {
  it('keeps the vanilla internal armor order and reverse GUI order', () => {
    assertEqual(ARMOR_ORDER.join(','), 'boots,leggings,chestplate,helmet');
    assertEqual(armorSlotIndex('boots'), 36);
    assertEqual(armorSlotIndex('leggings'), 37);
    assertEqual(armorSlotIndex('chestplate'), 38);
    assertEqual(armorSlotIndex('helmet'), 39);
    assertEqual(armorSlotIndex('elytra'), -1);
  });

  it('moves a full stack directly to an empty slot', () => {
    const inventory = new Inventory();
    inventory.set(9, ItemStack.of('mc:stone', 32));
    assertEqual(inventory.moveSlot(9, 10), true);
    assertEqual(inventory.get(9).isEmpty, true);
    assertEqual(inventory.get(10).count, 32);
  });

  it('merges only the available capacity and keeps the source remainder', () => {
    const inventory = new Inventory();
    inventory.set(9, ItemStack.of('mc:stone', 10));
    inventory.set(10, ItemStack.of('mc:stone', 60));
    assertEqual(inventory.moveSlot(9, 10), true);
    assertEqual(inventory.get(10).count, 64);
    assertEqual(inventory.get(9).count, 6);
  });

  it('swaps different stacks when both slots accept them', () => {
    const inventory = new Inventory();
    inventory.set(9, ItemStack.of('mc:stone', 4));
    inventory.set(10, ItemStack.of('mc:dirt', 7));
    assertEqual(inventory.moveSlot(9, 10), true);
    assertEqual(inventory.get(9).item.id, 'mc:dirt');
    assertEqual(inventory.get(10).item.id, 'mc:stone');
  });

  it('allows a matching armor piece to be dragged into its equipment slot', () => {
    const inventory = new Inventory();
    inventory.set(9, ItemStack.of('mc:iron_helmet'));
    assertEqual(inventory.moveSlot(9, SLOT.ARMOR_END), true);
    assertEqual(inventory.get(SLOT.ARMOR_END).item.id, 'mc:iron_helmet');
    assertEqual(inventory.get(9).isEmpty, true);
  });

  it('rejects a mismatched armor piece without losing or moving it', () => {
    const inventory = new Inventory();
    inventory.set(9, ItemStack.of('mc:iron_helmet'));
    assertEqual(inventory.moveSlot(9, SLOT.ARMOR_START), false);
    assertEqual(inventory.get(9).item.id, 'mc:iron_helmet');
    assertEqual(inventory.get(SLOT.ARMOR_START).isEmpty, true);
  });

  it('prevents ordinary and right-click placement of non-armor into armor slots', () => {
    const inventory = new Inventory();
    inventory.cursor = ItemStack.of('mc:stone');
    assertEqual(inventory.clickSlot(SLOT.ARMOR_END), false);
    assertEqual(inventory.rightClickSlot(SLOT.ARMOR_END), false);
    assertEqual(inventory.cursor.item.id, 'mc:stone');
    assertEqual(inventory.get(SLOT.ARMOR_END).isEmpty, true);
  });

  it('left-click swaps matching worn armor with the cursor', () => {
    const inventory = new Inventory();
    inventory.set(SLOT.ARMOR_END, ItemStack.of('mc:iron_helmet'));
    inventory.cursor = ItemStack.of('mc:diamond_helmet');
    assertEqual(inventory.clickSlot(SLOT.ARMOR_END), true);
    assertEqual(inventory.get(SLOT.ARMOR_END).item.id, 'mc:diamond_helmet');
    assertEqual(inventory.cursor.item.id, 'mc:iron_helmet');
  });

  it('balances final stack sizes when distributing over a partial stack and an empty slot', () => {
    const inventory = new Inventory();
    inventory.set(0, ItemStack.of('mc:stone', 10));
    inventory.cursor = ItemStack.of('mc:stone', 64);
    assertEqual(inventory.distributeCursor([0, 1]), true);
    assertEqual(inventory.get(0).count, 37);
    assertEqual(inventory.get(1).count, 37);
    assertEqual(inventory.cursor.isEmpty, true);
  });

  it('distributes a remainder deterministically to the first slots', () => {
    const inventory = new Inventory();
    inventory.cursor = ItemStack.of('mc:stone', 64);
    assertEqual(inventory.distributeCursor([2, 1, 0]), true);
    assertEqual(inventory.get(2).count, 22);
    assertEqual(inventory.get(1).count, 21);
    assertEqual(inventory.get(0).count, 21);
  });

  it('does not mutate inventory when a drag targets the same slot or an invalid index', () => {
    const inventory = new Inventory();
    inventory.set(9, ItemStack.of('mc:stone', 3));
    assertEqual(inventory.moveSlot(9, 9), false);
    assertEqual(inventory.moveSlot(9, 99), false);
    assertEqual(inventory.get(9).count, 3);
  });
});
