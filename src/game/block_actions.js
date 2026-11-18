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
import { drainContainer } from './containers.js';

export const BlockActionsMixin = {
  _breakBlock() {
    if (!this.hit) return;
    const { x, y, z, state } = this.hit;
    if (state.block.isUnbreakable && this.player.gamemode !== GAMEMODE.CREATIVE) return;

    // Container block entities belong to this exact position. Remove them on
    // every break (including creative) so replacing the block cannot resurrect
    // old contents. Survival receives the stored stacks with damage/data intact.
    const containerKey = `${x},${y},${z}`;
    const container = this._containers?.get(containerKey);
    if (container) {
      this._containers.delete(containerKey);
      if (this.player.gamemode === GAMEMODE.SURVIVAL) {
        for (const stack of drainContainer(container.type, container.data)) this.inventory.add(stack);
      }
    }

    if (this.player.gamemode === GAMEMODE.SURVIVAL) {
      // Seeded from the world seed and block position, so drops are
      // reproducible rather than depending on a global RNG.
      const drops = blockDrops(state, this.inventory.held, this.world.seed, x, y, z);
      for (const drop of drops) this.inventory.addItem(drop.id, drop.count);
      if (this.inventory.held.item?.tool) this.inventory.damageHeld(1);
    }

    this.world.setBlock(x, y, z, AIR.defaultState);
    this.multiplayer?.pushBlockChange(x, y, z, AIR.defaultState);
    this.mining.reset();
  },

  _useOrPlace() {
    if (this.entities?.useFishingRod()) return;
    if (this.entities?.shearFromPlayer()) return;
    if (this._farmInteraction()) return;
    const sneaking = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.hit && !sneaking) {
      const handler = USABLE_BLOCKS[this.hit.state.block.id];
      if (handler) { handler(this); return; }
    }

    // Eating takes priority over block placement, as using a food item does in
    // survival. A full food bar prevents ordinary food from being consumed.
    if (!sneaking && this._eatHeldFood()) return;
    this._placeBlock();
  },

  _farmInteraction() {
    if (!this.hit || !this.player) return false;
    const { x, y, z, state } = this.hit;
    const held = this.inventory.held;
    const id = state.block.id;
    const survival = this.player.gamemode === GAMEMODE.SURVIVAL;

    // Hoe grass/dirt from the top face to prepare a planting bed.
    if (held.item?.tool === 'hoe' && this.hit.face?.dy === 1 &&
        ['mc:grass_block', 'mc:dirt', 'mc:coarse_dirt'].includes(id)) {
      const farmland = BLOCKS.get('mc:farmland').defaultState;
      if (this.world.setBlock(x, y, z, farmland)) {
        this.multiplayer?.pushBlockChange(x, y, z, farmland);
        if (survival) this.inventory.damageHeld(1);
        this.ui.toast('Farmland');
      }
      return true;
    }

    // Seeds are planted on farmland, occupying the air block directly above it.
    if (held.item?.id === 'mc:wheat_seeds' && id === 'mc:farmland') {
      const cropPos = { x, y: y + 1, z };
      const above = this.world.getBlock(cropPos.x, cropPos.y, cropPos.z);
      if (above.block.id === 'mc:air' || above.block.replaceable) {
        const crop = BLOCKS.get('mc:wheat').defaultState;
        if (this.world.setBlock(cropPos.x, cropPos.y, cropPos.z, crop)) {
          this.multiplayer?.pushBlockChange(cropPos.x, cropPos.y, cropPos.z, crop);
          if (survival) this.inventory.consumeHeld(1);
          this.ui.toast('Wheat planted');
        }
      }
      return true;
    }

    // Mature wheat gives wheat plus a small seed return; immature crops cannot
    // be harvested early for a guaranteed drop.
    if (id === 'mc:wheat') {
      if (state.get('age') < 7) {
        this.ui.toast('Wheat is not ripe');
        return true;
      }
      this.world.setBlock(x, y, z, AIR.defaultState);
      this.multiplayer?.pushBlockChange(x, y, z, AIR.defaultState);
      if (survival) {
        this.inventory.addItem('mc:wheat', 1);
        this.inventory.addItem('mc:wheat_seeds', 1 + Math.floor(Math.random() * 3));
      }
      this.ui.toast('Wheat harvested');
      return true;
    }
    return false;
  },

  _eatHeldFood() {
    const player = this.player;
    const stack = this.inventory.held;
    const food = stack.item?.food;
    if (!player || player.gamemode !== GAMEMODE.SURVIVAL || stack.isEmpty || !food) return false;
    if (!player.vitals.eat(food)) return false;
    this.inventory.consumeHeld(1);
    this.ui.toast('Eating');
    return true;
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
    if (!this.world.setBlock(target.x, target.y, target.z, state)) return;
    this.multiplayer?.pushBlockChange(target.x, target.y, target.z, state);

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
