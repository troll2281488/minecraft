/**
 * Equipping armour into the four armour slots, Java 1.12.2.
 *
 * Inventory layout: slots 36..39 are helmet, chestplate, leggings, boots (matching
 * SLOT.ARMOR_START in game/inventory.js). A piece only goes into the slot for its
 * armorSlot. Putting a piece onto an occupied slot swaps the two stacks.
 */
import { SLOT } from './inventory.js';

export const ARMOR_ORDER = ['helmet', 'chestplate', 'leggings', 'boots'];

/** Index into the inventory for a given armour slot name. */
export function armorSlotIndex(slotName) {
  const i = ARMOR_ORDER.indexOf(slotName);
  return i === -1 ? -1 : SLOT.ARMOR_START + i;
}

/**
 * Try to equip `stack` into its armour slot inside `slots` (mutates `slots`).
 * Returns the stack now held by the cursor (swapped-out piece, or empty).
 * Returns null and leaves slots untouched if the item is not armour.
 */
export function equipArmor(slots, stack, emptyStack) {
  const slotName = stack?.item?.armorSlot;
  const index = armorSlotIndex(slotName);
  if (index === -1) return null;
  const previous = slots[index];
  slots[index] = stack;
  return previous && !previous.isEmpty ? previous : emptyStack;
}
