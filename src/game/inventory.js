/**
 * The player inventory and its click rules.
 *
 * Slot layout matches vanilla exactly:
 *
 *   0..8    hotbar
 *   9..35   main storage
 *   36..39  armour (boots, leggings, chestplate, helmet)
 *   40      offhand
 *
 * That ordering is not arbitrary -- the hotbar comes first because it is what
 * gets saved and restored most often, and because shift-click transfer rules
 * are defined in terms of these ranges.
 *
 * The click rules are the fiddly part, and they matter: picking up half a stack
 * with right-click, dragging to distribute evenly, shift-clicking to the far
 * container. Getting these subtly wrong is the kind of thing that makes an
 * inventory feel wrong without a player being able to say why.
 */

import {  } from '../core/constants.js';
import { ItemStack, ITEMS } from '../world/item.js';

export const SLOT = {
  HOTBAR_START: 0,
  HOTBAR_END: 8,
  MAIN_START: 9,
  MAIN_END: 35,
  ARMOR_START: 36,
  ARMOR_END: 39,
  OFFHAND: 40,
  TOTAL: 41,
};

export class Inventory {
  constructor(size = SLOT.TOTAL) {
    /** @type {ItemStack[]} never null -- empty slots hold ItemStack.EMPTY clones */
    this.slots = Array.from({ length: size }, () => ItemStack.EMPTY.clone());
    this.selectedSlot = 0;
    /** The stack held by the cursor while a container screen is open. */
    this.cursor = ItemStack.EMPTY.clone();
    this.version = 0; // bumped on every change, so UI can skip redundant redraws
  }

  get(index) {
    return this.slots[index] ?? ItemStack.EMPTY;
  }

  set(index, stack) {
    this.slots[index] = stack ?? ItemStack.EMPTY.clone();
    this.version++;
  }

  get held() {
    return this.get(this.selectedSlot);
  }

  /** Swap the selected hotbar stack with the offhand stack (Java key F behavior). */
  swapHeldWithOffhand() {
    if (this.slots.length <= SLOT.OFFHAND ||
        !Number.isInteger(this.selectedSlot) ||
        this.selectedSlot < SLOT.HOTBAR_START ||
        this.selectedSlot > SLOT.HOTBAR_END) return false;
    const held = this.slots[this.selectedSlot];
    this.slots[this.selectedSlot] = this.slots[SLOT.OFFHAND];
    this.slots[SLOT.OFFHAND] = held;
    this.version++;
    return true;
  }

  /**
   * Add items, filling partial stacks before empty slots.
   *
   * Topping up existing stacks first is what stops a full inventory rejecting
   * items it plainly has room for.
   *
   * @returns {number} how many could not fit
   */
  add(stack) {
    if (stack.isEmpty) return 0;
    let remaining = stack.count;

    for (const pass of ['merge', 'empty']) {
      for (let i = SLOT.HOTBAR_START; i <= SLOT.MAIN_END; i++) {
        if (remaining <= 0) break;
        const slot = this.slots[i];

        if (pass === 'merge') {
          if (slot.isEmpty || !slot.canStackWith(stack)) continue;
          const room = slot.maxStackSize - slot.count;
          const moved = Math.min(room, remaining);
          slot.count += moved;
          remaining -= moved;
        } else {
          if (!slot.isEmpty) continue;
          const moved = Math.min(stack.maxStackSize, remaining);
          this.slots[i] = new ItemStack(stack.item, moved, stack.damage, stack.data);
          remaining -= moved;
        }
      }
      if (remaining <= 0) break;
    }

    this.version++;
    return remaining;
  }

  addItem(itemId, count = 1) {
    const item = ITEMS.get(itemId);
    if (!item) return count;
    return this.add(new ItemStack(item, count));
  }

  /** Total count of an item across the inventory. */
  countOf(itemId) {
    let total = 0;
    for (const slot of this.slots) {
      if (!slot.isEmpty && slot.item.id === itemId) total += slot.count;
    }
    return total;
  }

  /** Remove up to `count`, returning how many were actually removed. */
  remove(itemId, count) {
    let remaining = count;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (slot.isEmpty || slot.item.id !== itemId) continue;
      const taken = Math.min(slot.count, remaining);
      slot.count -= taken;
      remaining -= taken;
      if (slot.count <= 0) this.slots[i] = ItemStack.EMPTY.clone();
    }
    this.version++;
    return count - remaining;
  }

  /** Consume one from the selected hotbar slot. */
  consumeHeld(amount = 1) {
    const slot = this.slots[this.selectedSlot];
    if (slot.isEmpty) return false;
    slot.count -= amount;
    if (slot.count <= 0) this.slots[this.selectedSlot] = ItemStack.EMPTY.clone();
    this.version++;
    return true;
  }

  /** Apply durability damage to the held item, clearing it if it breaks. */
  damageHeld(amount = 1) {
    const slot = this.slots[this.selectedSlot];
    if (slot.isEmpty || !slot.item.isDamageable) return false;
    const broke = slot.applyDamage(amount);
    if (broke) this.slots[this.selectedSlot] = ItemStack.EMPTY.clone();
    this.version++;
    return broke;
  }

  /** First slot holding this item, or -1. Used by pick-block. */
  findSlot(itemId) {
    return this.slots.findIndex((s) => !s.isEmpty && s.item.id === itemId);
  }

  // -- Click handling -----------------------------------------------------

  clickSlot(index) {
    const slot = this.get(index);
    const cursor = this.cursor;

    if (cursor.isEmpty) {
      this.cursor = slot;
      this.slots[index] = ItemStack.EMPTY.clone();
    } else if (slot.isEmpty) {
      this.slots[index] = cursor;
      this.cursor = ItemStack.EMPTY.clone();
    } else if (slot.canStackWith(cursor)) {
      slot.mergeFrom(cursor);
      if (cursor.count <= 0) this.cursor = ItemStack.EMPTY.clone();
    } else {
      this.slots[index] = cursor;
      this.cursor = slot;
    }
    this.version++;
  }

  /** Distribute a cursor stack as evenly as possible across dragged player slots. */
  distributeCursor(indices) {
    if (this.cursor.isEmpty || !Array.isArray(indices)) return false;
    const unique = [...new Set(indices)].filter((index) =>
      Number.isInteger(index) && index >= SLOT.HOTBAR_START &&
      index <= SLOT.MAIN_END && index < this.slots.length);
    const eligible = unique.filter((index) => {
      const slot = this.slots[index];
      return slot.isEmpty || (slot.canStackWith(this.cursor) && slot.count < slot.maxStackSize);
    });
    if (!eligible.length) return false;

    let remaining = this.cursor.count;
    for (let i = 0; i < eligible.length && remaining > 0; i++) {
      const index = eligible[i];
      const slot = this.slots[index];
      const targetsLeft = eligible.length - i;
      const fairShare = Math.ceil(remaining / targetsLeft);
      const room = slot.isEmpty ? this.cursor.maxStackSize : slot.maxStackSize - slot.count;
      const moved = Math.min(fairShare, room, remaining);
      if (moved <= 0) continue;
      if (slot.isEmpty) {
        this.slots[index] = new ItemStack(this.cursor.item, moved, this.cursor.damage, this.cursor.data);
      } else {
        slot.count += moved;
      }
      remaining -= moved;
    }

    this.cursor.count = remaining;
    if (remaining <= 0) this.cursor = ItemStack.EMPTY.clone();
    this.version++;
    return true;
  }

  rightClickSlot(index) {
    const slot = this.get(index);
    const cursor = this.cursor;

    if (cursor.isEmpty) {
      if (slot.isEmpty) return;
      const half = Math.ceil(slot.count / 2);
      this.cursor = slot.split(half);
      if (slot.count <= 0) this.slots[index] = ItemStack.EMPTY.clone();
    } else if (slot.isEmpty) {
      this.slots[index] = cursor.split(1);
      if (cursor.count <= 0) this.cursor = ItemStack.EMPTY.clone();
    } else if (slot.canStackWith(cursor) && slot.count < slot.maxStackSize) {
      slot.count++;
      cursor.count--;
      if (cursor.count <= 0) this.cursor = ItemStack.EMPTY.clone();
    }
    this.version++;
  }

  shiftClickSlot(index) {
    const slot = this.get(index);
    if (slot.isEmpty) return;

    const armorTargets = { boots: 36, leggings: 37, chestplate: 38, helmet: 39 };
    const armorTarget = armorTargets[slot.item?.armorSlot];
    if (armorTarget !== undefined && index < SLOT.ARMOR_START &&
        this.slots[armorTarget].isEmpty) {
      // Vanilla only auto-equips into an empty armor slot. If it is occupied,
      // continue with the ordinary shift-transfer instead of swapping gear out.
      this.slots[armorTarget] = slot;
      this.slots[index] = ItemStack.EMPTY.clone();
      this.version++;
      return;
    }

    const toHotbar = index >= SLOT.MAIN_START;
    const start = toHotbar ? SLOT.HOTBAR_START : SLOT.MAIN_START;
    const end = toHotbar ? SLOT.HOTBAR_END : SLOT.MAIN_END;

    for (let i = start; i <= end; i++) {
      if (slot.count <= 0) break;
      const target = this.slots[i];
      if (target.isEmpty || !target.canStackWith(slot)) continue;
      target.mergeFrom(slot);
    }
    if (slot.count > 0) {
      for (let i = start; i <= end; i++) {
        if (!this.slots[i].isEmpty) continue;
        this.slots[i] = slot;
        this.slots[index] = ItemStack.EMPTY.clone();
        break;
      }
    }
    if (slot.count <= 0) this.slots[index] = ItemStack.EMPTY.clone();
    this.version++;
  }

  takeCursor() {
    const stack = this.cursor;
    this.cursor = ItemStack.EMPTY.clone();
    this.version++;
    return stack;
  }

  toJSON() {
    const out = [];
    this.slots.forEach((stack, index) => {
      if (stack.isEmpty) return;
      out.push({ slot: index, ...stack.toJSON() });
    });
    return out;
  }

  loadFrom(json) {
    this.slots = Array.from({ length: SLOT.TOTAL }, () => ItemStack.EMPTY.clone());
    for (const entry of json ?? []) {
      if (entry.slot == null || entry.slot >= SLOT.TOTAL) continue;
      this.slots[entry.slot] = ItemStack.fromJSON(entry);
    }
    this.version++;
    return this;
  }
}

/**
 * The crafting grid: a small inventory plus a computed result slot.
 *
 * Kept separate from the player inventory because its contents are transient --
 * closing the screen returns them to the player rather than saving them.
 */
export class CraftingGrid {
  constructor(size, recipeBook) {
    this.size = size;
    this.recipeBook = recipeBook;
    this.slots = Array.from({ length: size * size }, () => ItemStack.EMPTY.clone());
    this.result = ItemStack.EMPTY.clone();
    this.matched = null;
  }

  get(index) {
    return this.slots[index];
  }

  set(index, stack) {
    this.slots[index] = stack ?? ItemStack.EMPTY.clone();
    this.refresh();
  }

  refresh() {
    this.matched = this.recipeBook.match(this.slots, this.size);
    this.result = this.recipeBook.resultOf(this.matched);
  }

  consume() {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.isEmpty) continue;
      slot.count--;
      if (slot.count <= 0) this.slots[i] = ItemStack.EMPTY.clone();
    }
    this.refresh();
  }

  drain() {
    const stacks = this.slots.filter((s) => !s.isEmpty);
    this.slots = Array.from({ length: this.size * this.size }, () => ItemStack.EMPTY.clone());
    this.refresh();
    return stacks;
  }

  get isEmpty() {
    return this.slots.every((s) => s.isEmpty);
  }
}
