/**
 * Armour-slot helpers for the Java Edition player inventory.
 *
 * Internal slots 36..39 are boots, leggings, chestplate, helmet. The inventory
 * module owns the canonical order and index mapping so save and UI code agree.
 */
import { SLOT, ARMOR_ORDER, armorSlotIndex } from './inventory.js';

export { ARMOR_ORDER, armorSlotIndex };

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
