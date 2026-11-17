/**
 * Breaking, placing, using and picking blocks -- the player's side of block
 * interaction, as opposed to game/interaction.js which holds the pure geometry and
 * timing functions these call into.
 *
 * Extracted from main.js as a prototype mixin so the bodies move unchanged -- see the
 * note in main.js. Deliberately a new module rather than appending to
 * game/interaction.js: that file is pure functions over (world, player, hit) with no
 * Game dependency and is directly unit-tested, and mixing Game-bound methods into it
 * would give it two different kinds of export.
 */

import { BLOCKS, AIR } from '../world/block.js';
import { ITEMS, ItemStack } from '../world/item.js';
import { GAMEMODE } from '../entity/player.js';
import {
  placementTarget, orientPlacement, blockDrops, wouldTrapPlayer,
} from './interaction.js';
import { USABLE_BLOCKS } from './usable_blocks.js';

export const BlockActionsMixin = {
  _breakBlock() {
    if (!this.hit) return;
    const { x, y, z, state } = this.hit;
    if (state.block.isUnbreakable && this.player.gamemode !== GAMEMODE.CREATIVE) return;

    if (this.player.gamemode === GAMEMODE.SURVIVAL) {
      // Seeded from the world seed and block position, so drops are
      // reproducible rather than depending on a global RNG.
      const drops = blockDrops(state, this.inventory.held, this.world.seed, x, y, z);
      for (const drop of drops) this.inventory.addItem(drop.id, drop.count);
      if (this.inventory.held.item?.tool) this.inventory.damageHeld(1);
    }

    this.world.setBlock(x, y, z, AIR.defaultState);\n    this.multiplayer?.pushBlockChange(x, y, z, AIR.defaultState);
    this.mining.reset();
  },

  _useOrPlace() {
    const sneaking = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.hit && !sneaking) {
      const handler = USABLE_BLOCKS[this.hit.state.block.id];
      if (handler) { handler(this); return; }
    }
    this._placeBlock();
  },

  _placeBlock() {
    if (!this.hit || !this.player) return;

    const held = this.inventory.held;
    if (held.isEmpty || !held.item.block) return;

    const block = BLOCKS.get(held.item.block);
    if (!block) return;

    const target = placementTarget(this.world, this.hit);
    if (!target) return;
    if (block.solid && wouldTrapPlayer(this.player, target.x, target.y, target.z)) return;

    const state = orientPlacement(block, this.player, this.hit);
    if (!this.world.setBlock(target.x, target.y, target.z, state)) return;\n    this.multiplayer?.pushBlockChange(target.x, target.y, target.z, state);

    if (this.player.gamemode !== GAMEMODE.CREATIVE) this.inventory.consumeHeld(1);
  },

  _pickBlock() {
    if (!this.hit) return;
    const id = this.hit.state.block.id;
    const slot = this.inventory.findSlot(id);
    if (slot >= 0 && slot < 9) {
      this.inventory.selectedSlot = slot;
    } else if (slot >= 9) {
      const target = this.inventory.selectedSlot;
      const swap = this.inventory.get(slot);
      this.inventory.set(slot, this.inventory.get(target));
      this.inventory.set(target, swap);
    } else if (this.player.gamemode === GAMEMODE.CREATIVE && ITEMS.get(id)) {
      this.inventory.set(this.inventory.selectedSlot, ItemStack.of(id, 1));
    }
    this.ui.flashItemName(this.inventory.held);
  },
};
