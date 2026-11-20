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
import { experienceForBlock, experienceForSpawner, experienceForVillagerTrade } from '../entity/experience.js';
import {
  placementTarget, orientPlacement, blockDrops, wouldTrapPlayer, canHarvest,
} from './interaction.js';
import { USABLE_BLOCKS } from './usable_blocks.js';
import { drainContainer } from './containers.js';
import { getVillagerOffers, executeVillagerTrade } from '../entity/villager_trades.js';

export const BlockActionsMixin = {
  _breakBlock() {
    if (!this.hit) return;
    const { x, y, z, state } = this.hit;
    const isDoor = state.block.renderShape === 'door';
    const doorHalf = isDoor ? state.get('half') : null;
    const pairedDoorY = isDoor ? y + (doorHalf === 'upper' ? -1 : 1) : null;
    if (state.block.isUnbreakable && this.player.gamemode !== GAMEMODE.CREATIVE) return;

    // Container block entities belong to this exact position. Remove them on
    // every break (including creative) so replacing the block cannot resurrect
    // old contents. Survival receives the stored stacks with damage/data intact.
    const containerKey = `${x},${y},${z}`;
    const container = this._containers?.get(containerKey);
    if (container) {
      this._containers.delete(containerKey);
      this.multiplayer?.removeContainerState(containerKey);
      if (this.player.gamemode === GAMEMODE.SURVIVAL) {
        const storedXP = container.type === 'furnace' ? (container.data.xpStored || 0) : 0;
        const wholeXP = Math.floor(storedXP);
        const droppedXP = wholeXP + (Math.random() < storedXP - wholeXP ? 1 : 0);
        if (droppedXP > 0) this.entities?.spawnExperienceOrbs(droppedXP, x + 0.5, y + 0.5, z + 0.5);
        for (const stack of drainContainer(container.type, container.data)) this.inventory.add(stack);
      }
    }

    if (this.player.gamemode === GAMEMODE.SURVIVAL) {
      // Seeded from the world seed and block position, so drops are
      // reproducible rather than depending on a global RNG.
      // The upper door half is dependent on the lower half and never drops an item.
      const drops = isDoor && doorHalf === 'upper'
        ? [] : blockDrops(state, this.inventory.held, this.world.seed, x, y, z);
      for (const drop of drops) this.inventory.addItem(drop.id, drop.count);
      // Ore XP is awarded only for a valid survival harvest, never for creative breaking.
      if (canHarvest(state.block, this.inventory.held)) {
        // Java 1.19 spawners never drop as items; a pickaxe releases 15–43 XP.
        const experience = state.block.id === 'mc:mob_spawner'
          ? experienceForSpawner()
          : experienceForBlock(state.block.id);
        if (experience > 0) this.entities?.spawnExperienceOrbs(experience, x + 0.5, y + 0.5, z + 0.5);
      }
      if (this.inventory.held.item?.tool) this.inventory.damageHeld(1);
    }

    this.entities?.spawnBlockParticles(x, y, z, state.block.id);
    this.sounds?.play('break', state.block.soundGroup || 'stone');
    this.world.setBlock(x, y, z, AIR.defaultState);
    this.multiplayer?.pushBlockChange(x, y, z, AIR.defaultState);
    if (isDoor) {
      this.world.setBlock(x, pairedDoorY, z, AIR.defaultState);
      this.multiplayer?.pushBlockChange(x, pairedDoorY, z, AIR.defaultState);
    } else {
      // Removing the supporting block also removes the complete door above it.
      // Only the lower half produces the single door item in Survival.
      const doorLower = this.world.getBlock(x, y + 1, z);
      if (doorLower.block.renderShape === 'door' && doorLower.get('half') === 'lower') {
        const doorUpper = this.world.getBlock(x, y + 2, z);
        this.world.setBlock(x, y + 1, z, AIR.defaultState);
        this.world.setBlock(x, y + 2, z, AIR.defaultState);
        this.multiplayer?.pushBlockChange(x, y + 1, z, AIR.defaultState);
        this.multiplayer?.pushBlockChange(x, y + 2, z, AIR.defaultState);
        if (this.player.gamemode === GAMEMODE.SURVIVAL) this.inventory.addItem(doorLower.block.id, 1);
      }
    }
    this.mining.reset();
  },

  _useOrPlace() {
    const villager = this.entities?.targetedMob();
    if (villager?.type === 'villager') {
      this._openVillagerTrade(villager);
      return;
    }
    const heldItem = this.inventory?.held?.item;
    if (this.hit?.state?.block?.id === 'mc:bed') {
      if (this.world.dimension !== 'overworld') {
        this.ui.toast('В этом измерении нельзя спать.', { error: true });
      } else {
        this.worldMeta.spawnPoint = { x: this.hit.x + 0.5, y: this.hit.y + 1, z: this.hit.z + 0.5 };
        this.world.time = 1000;
        this._save(false).catch(() => {});
        this.ui.toast('Точка возрождения установлена. Ночь пропущена.');
      }
      return;
    }
    if (heldItem?.id === 'mc:flint_and_steel' && this.hit) {
      if (this.hit.state.block.id === 'mc:portal') {
        const target = this.world.dimension === 'nether' ? 'overworld' : 'nether';
        this._switchDimension(target).catch((error) => this.ui.toast('Портал: ' + error.message, { error: true }));
        return;
      }
      if (this.hit.state.block.id === 'mc:obsidian') {
        const portal = BLOCKS.get('mc:portal')?.defaultState;
        let activated = false;
        if (portal) for (let x0=this.hit.x-3; x0<=this.hit.x && !activated; x0++) for (let y0=this.hit.y-4; y0<=this.hit.y && !activated; y0++) {
          let valid=true;
          for(let dx=0;dx<4&&valid;dx++) for(let dy=0;dy<5;dy++) {
            const edge=dx===0||dx===3||dy===0||dy===4;
            const id=this.world.getBlock(x0+dx,y0+dy,this.hit.z).block.id;
            if(edge?id!=='mc:obsidian':id!=='mc:air'){valid=false;break;}
          }
          if(!valid) continue;
          for(let dx=1;dx<=2;dx++) for(let dy=1;dy<=3;dy++) {
            this.world.setBlock(x0+dx,y0+dy,this.hit.z,portal);
            this.multiplayer?.pushBlockChange(x0+dx,y0+dy,this.hit.z,portal);
          }
          activated=true;
        }
        if(activated){this.inventory.damageHeld(1);this.ui.toast('Портал активирован! Нажми ПКМ по порталу, чтобы войти.');}
        else this.ui.toast('Сначала восстанови рамку портала обсидианом.');
        return;
      }
    }
    // Right-click equips armour directly from the selected hotbar stack.
    if (heldItem?.armorSlot && this.player?.gamemode === GAMEMODE.SURVIVAL) {
      const slots = { boots: 36, leggings: 37, chestplate: 38, helmet: 39 };
      const slot = slots[heldItem.armorSlot];
      if (slot !== undefined) {
        const equipped = this.inventory.held;
        const worn = this.inventory.get(slot);
        if (worn.isEmpty) {
          this.inventory.set(slot, new ItemStack(equipped.item, 1, equipped.damage, equipped.data));
          this.inventory.consumeHeld(1);
        } else {
          this.inventory.set(slot, new ItemStack(equipped.item, 1, equipped.damage, equipped.data));
          this.inventory.set(this.inventory.selectedSlot, new ItemStack(worn.item, 1, worn.damage, worn.data));
        }
        this.sounds?.play('equip');
        this.ui.toast('Надето: ' + heldItem.armorSlot);
      }
      return;
    }
    if (heldItem?.spawnEggMob && this.hit) {
      const spawned = this.entities?.spawnFromEgg(heldItem.spawnEggMob, this.hit.x, this.hit.z);
      if (spawned) this.ui.toast(`Spawned ${heldItem.spawnEggMob}`);
      return;
    }
    if (this.entities?.tameFromPlayer()) return;
    if (this.entities?.useFishingRod()) return;
    if (this.entities?.shearFromPlayer()) return;
    if (this.entities?.feedAnimalFromPlayer()) return;
    if (this._farmInteraction()) return;
    const sneaking = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.hit && !sneaking && this.hit.state.block.renderShape === 'door') {
      const doorState = this.hit.state;
      // Iron doors require a redstone signal; manual interaction only works on wood.
      if (doorState.block.id === 'mc:iron_door') return true;
      const lowerY = doorState.get('half') === 'upper' ? this.hit.y - 1 : this.hit.y;
      const lower = this.world.getBlock(this.hit.x, lowerY, this.hit.z);
      const upper = this.world.getBlock(this.hit.x, lowerY + 1, this.hit.z);
      if (lower.block.renderShape === 'door' && upper.block.renderShape === 'door') {
        const open = !lower.get('open');
        const nextLower = lower.with('open', open);
        const nextUpper = upper.with('open', open);
        this.world.setBlock(this.hit.x, lowerY, this.hit.z, nextLower);
        this.world.setBlock(this.hit.x, lowerY + 1, this.hit.z, nextUpper);
        this.multiplayer?.pushBlockChange(this.hit.x, lowerY, this.hit.z, nextLower);
        this.multiplayer?.pushBlockChange(this.hit.x, lowerY + 1, this.hit.z, nextUpper);
      }
      return true;
    }
    if (this.hit && !sneaking) {
      const handler = USABLE_BLOCKS[this.hit.state.block.id];
      if (handler) { handler(this); return; }
    }

    // Eating takes priority over block placement, as using a food item does in
    // survival. A full food bar prevents ordinary food from being consumed.
    if (!sneaking && this._eatHeldFood()) return;
    this._placeBlock();
  },

  _openVillagerTrade(villager) {
    if (!villager || villager.type !== 'villager' || this.tradeOpen) return;
    this.tradeOpen = true;
    this.keys.clear();
    this.mouseButtons.clear();
    this.mining.reset();
    document.exitPointerLock?.();

    const refresh = () => this.ui.openVillagerTrade(
      villager,
      getVillagerOffers(villager),
      this.inventory,
      {
        onTrade: (offerId) => {
          const result = executeVillagerTrade(villager, offerId, this.inventory);
          if (!result.ok) {
            this.ui.toast(result.reason, { error: true });
          } else {
            this.ui.updateHotbar(this.inventory);
            if (this.player?.gamemode === GAMEMODE.SURVIVAL) {
              this.entities?.spawnExperienceOrbs(
                experienceForVillagerTrade(), villager.x, villager.y + 0.5, villager.z,
              );
            }
            this.ui.toast(result.unlocked ? 'Новая сделка открыта!' : 'Обмен выполнен');
            refresh();
          }
        },
        onClose: () => this._closeVillagerTrade(),
      },
    );
    refresh();
  },

  _closeVillagerTrade() {
    if (!this.tradeOpen) return;
    this.tradeOpen = false;
    this.ui.closeVillagerTrade();
    this._requestPointerLock();
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

    let state = orientPlacement(block, this.player, this.hit);
    if (block.renderShape === 'door') {
      const above = this.world.getBlock(target.x, target.y + 1, target.z);
      const support = this.world.getBlock(target.x, target.y - 1, target.z);
      if ((!above.block.replaceable && above.block.id !== 'mc:air') || !support.block.solid) return;
      state = state.with('half', 'lower');
      const upper = state.with('half', 'upper');
      if (!this.world.setBlock(target.x, target.y, target.z, state)) return;
      if (!this.world.setBlock(target.x, target.y + 1, target.z, upper)) {
        this.world.setBlock(target.x, target.y, target.z, AIR.defaultState);
        return;
      }
      this.multiplayer?.pushBlockChange(target.x, target.y, target.z, state);
      this.multiplayer?.pushBlockChange(target.x, target.y + 1, target.z, upper);
    } else {
      if (!this.world.setBlock(target.x, target.y, target.z, state)) return;
      this.multiplayer?.pushBlockChange(target.x, target.y, target.z, state);
    }
    this.sounds?.play('place', block.soundGroup || 'stone');
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
