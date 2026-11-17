/**
 * The inventory screens: opening the personal 2x2, the crafting table's 3x3, the
 * creative picker, and the slot-click handling behind all three.
 *
 * Extracted from main.js as a prototype mixin so the bodies move unchanged -- see
 * the note in main.js.
 *
 * Worth knowing when this is next touched: the `kind === 'craft'` branch of
 * _onInventoryClick is a hand-reimplementation of Inventory.clickSlot /
 * rightClickSlot. Those two are covered by tests/gameplay.test.js; this copy is not,
 * and it is the copy that ships. Giving CraftingGrid the same click surface as
 * Inventory would delete it, but that is a behaviour change, not a move, so it is
 * deliberately left for a follow-up rather than smuggled into an extraction.
 */

import { CraftingGrid } from './inventory.js';
import { RECIPES } from './recipes.js';
import { ItemStack } from '../world/item.js';
import { creativeItemList } from './creative.js';

export const InventoryControllerMixin = {
  _rebuildInventoryUI() {
    this.ui.buildInventory(this.inventory, this.craftingGrid, {
      onClick: (kind, index, button, shift) => this._onInventoryClick(kind, index, button, shift),
    });
  },

  _openInventory() {
    // The player may have last used a 3x3 table; restore the 2x2 grid.
    if (this.craftingGrid.size !== 2) {
      this.craftingGrid = new CraftingGrid(2, RECIPES);
      this._rebuildInventoryUI();
    }
    this.ui.setInventoryTitle('Inventory');
    this._showInventoryScreen();
  },

  _openCraftingTable() {
    this.craftingGrid = new CraftingGrid(3, RECIPES);
    this._rebuildInventoryUI();
    this.ui.setInventoryTitle('Crafting Table');
    this._showInventoryScreen();
  },

  _showInventoryScreen() {
    this.inventoryOpen = true;
    document.exitPointerLock?.();
    this.ui.showScreen('inventory');
    this.ui.setHudVisible(true);
    this.ui.updateInventory(this.inventory, this.craftingGrid, true);
  },

  _openCreativeInventory() {
    if (!this._creativeBuilt) this._buildCreativeUI();
    this.inventoryOpen = true;
    this.creativeOpen = true;
    document.exitPointerLock?.();
    this.ui.showScreen('creative');
    this.ui.setHudVisible(true);
    this.ui.updateCreativeInventory(this.inventory);
    this.ui.focusCreativeSearch();
  },

  _buildCreativeUI() {
    this.ui.buildCreativeInventory(creativeItemList(), {
      onPick: (item, button) => {
        // Left grabs a full stack, right grabs one.
        const count = button === 2 ? 1 : item.stackSize;
        this.inventory.cursor = new ItemStack(item, count);
        this.ui.updateCreativeInventory(this.inventory);
      },
      onHotbar: (index, button) => {
        if (button === 2) this.inventory.rightClickSlot(index);
        else this.inventory.clickSlot(index);
        this.ui.updateCreativeInventory(this.inventory);
      },
    });
    this._creativeBuilt = true;
  },

  _closeInventory() {
    if (this.creativeOpen) {
      // Creative items are infinite; a leftover cursor stack is discarded rather
      // than dropped into the world (matching vanilla creative).
      this.inventory.cursor = ItemStack.EMPTY.clone();
      this.inventory.version++;
      this.creativeOpen = false;
    } else {
      // Survival: return the crafting grid and cursor so closing never destroys
      // items.
      for (const stack of this.craftingGrid.drain()) this.inventory.add(stack);
      const cursor = this.inventory.takeCursor();
      if (!cursor.isEmpty) this.inventory.add(cursor);
    }

    this.inventoryOpen = false;
    this.ui.hideAllScreens();
    this.ui.setHudVisible(true);
    this._requestPointerLock();
  },

  _onInventoryClick(kind, index, button, shift) {
    const inv = this.inventory;
    const grid = this.craftingGrid;

    if (kind === 'result') {
      if (!grid.matched || grid.result.isEmpty) return;
      const output = grid.result.clone();
      if (inv.cursor.isEmpty) inv.cursor = output;
      else if (inv.cursor.canStackWith(output)) inv.cursor.mergeFrom(output);
      else return; // hands full with something else
      grid.consume();
      inv.version++;
    } else if (kind === 'craft') {
      const slot = grid.get(index);
      const cursor = inv.cursor;
      if (button === 2) {
        if (cursor.isEmpty && !slot.isEmpty) {
          inv.cursor = slot.split(Math.ceil(slot.count / 2));
        } else if (!cursor.isEmpty && (slot.isEmpty || slot.canStackWith(cursor))) {
          if (slot.isEmpty) grid.slots[index] = cursor.split(1);
          else { slot.count++; cursor.count--; }
          if (cursor.count <= 0) inv.cursor = ItemStack.EMPTY.clone();
        }
      } else if (cursor.isEmpty) {
        inv.cursor = slot;
        grid.slots[index] = ItemStack.EMPTY.clone();
      } else if (slot.isEmpty) {
        grid.slots[index] = cursor;
        inv.cursor = ItemStack.EMPTY.clone();
      } else if (slot.canStackWith(cursor)) {
        slot.mergeFrom(cursor);
        if (cursor.count <= 0) inv.cursor = ItemStack.EMPTY.clone();
      } else {
        grid.slots[index] = cursor;
        inv.cursor = slot;
      }
      grid.refresh();
      inv.version++;
    } else if (shift) {
      inv.shiftClickSlot(index);
    } else if (button === 2) {
      inv.rightClickSlot(index);
    } else {
      inv.clickSlot(index);
    }

    this.ui.updateInventory(this.inventory, this.craftingGrid, true);
  },
};
