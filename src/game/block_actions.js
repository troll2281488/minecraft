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
import { pistonVector } from './pistons.js';
import { hiveHarvestResult, hasCampfireSmoke } from './bee_hives.js';
import { compostChance, nextComposterLevel, boneMealAge, compostRoll, canApplyBoneMeal } from './composting.js';
import { canPlantSugarCane, sweetBerryHarvest } from './farming.js';
import { refreshWallConnections } from './wall_updates.js';
import { planBucketInteraction } from './bucket.js';
import { planCauldronInteraction } from './cauldron.js';
import { canSleepAt, hasNearbySleepHostile } from './sleep.js';
import { weatherAt } from './weather.js';
import { absorbWaterAround } from './sponge.js';
import { POTION_ITEMS } from '../entity/status_effects.js';
import { planCampfireFoodInteraction } from './campfire_cooking.js';
import { findEnderPearlLanding } from './ender_pearl.js';

export const BlockActionsMixin = {
  _refreshWallConnections(...positions) {
    return refreshWallConnections(this.world, this.multiplayer, ...positions);
  },

  _breakBlock() {
    if (!this.hit) return;
    const { x, y, z, state } = this.hit;
    const isDoor = state.block.renderShape === 'door';
    const isPistonHead = state.block.id === 'mc:piston_head';
    const isPistonBase = state.block.id === 'mc:piston' || state.block.id === 'mc:sticky_piston';
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
        const storedXP = ['furnace', 'smoker', 'blast_furnace'].includes(container.type) ? (container.data.xpStored || 0) : 0;
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
    this._refreshWallConnections({ x, y, z });
    // Breaking either half of an extended piston removes its internal head
    // and clears the paired base state. Internal heads never drop an item.
    if (isPistonHead) {
      const vector = pistonVector(state.get('facing'));
      if (vector) {
        const [dx, dy, dz] = vector;
        const bx = x - dx, by = y - dy, bz = z - dz;
        const base = this.world.getBlock(bx, by, bz);
        if ((base.block.id === 'mc:piston' || base.block.id === 'mc:sticky_piston') && base.get('extended')) {
          const retracted = base.with('extended', false);
          this.world.setBlock(bx, by, bz, retracted);
          this.multiplayer?.pushBlockChange(bx, by, bz, retracted);
        }
      }
    } else if (isPistonBase && state.get('extended')) {
      const vector = pistonVector(state.get('facing'));
      if (vector) {
        const [dx, dy, dz] = vector;
        const hx = x + dx, hy = y + dy, hz = z + dz;
        if (this.world.getBlock(hx, hy, hz).block.id === 'mc:piston_head') {
          this.world.setBlock(hx, hy, hz, AIR.defaultState);
          this.multiplayer?.pushBlockChange(hx, hy, hz, AIR.defaultState);
        }
      }
    }
    this._removeAttachedRedstoneDevices?.(x, y, z);
    if (isDoor) {
      this.world.setBlock(x, pairedDoorY, z, AIR.defaultState);
      this.multiplayer?.pushBlockChange(x, pairedDoorY, z, AIR.defaultState);
    } else {
      // Removing the supporting block also removes the complete door above it.
      // Only the lower half produces the single door item in Survival.
      const doorLower = this.world.getBlock(x, y + 1, z);
      if (doorLower.block.renderShape === 'door' && doorLower.get('half') === 'lower') {
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
    if (this.inventory?.held?.item?.id === 'mc:ender_pearl') {
      const last = this.player.lastEnderPearlUse ?? -1000;
      if (this.tickCount - last < 20) {
        this.ui.toast('Эндер-жемчуг ещё перезаряжается');
        return;
      }
      const landing = findEnderPearlLanding(this.world, this.hit);
      if (!landing) {
        this.ui.toast('Здесь нельзя безопасно телепортироваться', { error: true });
        return;
      }
      this.player.lastEnderPearlUse = this.tickCount;
      this.player.x = landing.x; this.player.y = landing.y; this.player.z = landing.z;
      this.player.vx = 0; this.player.vy = 0; this.player.vz = 0;
      if (this.player.gamemode === GAMEMODE.SURVIVAL) {
        this.inventory.consumeHeld(1);
        this.player.health = Math.max(0, this.player.health - 5);
      }
      this.sounds?.play('cast');
      this.ui.toast('Телепортация эндер-жемчугом');
      return;
    }
    if (this.inventory?.held?.item?.id === 'mc:goat_horn') {
      const last = this.player.lastGoatHornUse ?? -1000;
      if (this.tickCount - last < 140) {
        this.ui.toast('Рог ещё перезаряжается');
        return;
      }
      this.player.lastGoatHornUse = this.tickCount;
      this.sounds?.play('goatHorn');
      this.ui.toast('Ты протрубил в козий рог');
      return;
    }
    if (this.entities?.boostPigFromPlayer()) return;
    const villager = this.entities?.targetedMob();
    if (villager?.type === 'villager') {
      this._openVillagerTrade(villager);
      return;
    }
    const heldItem = this.inventory?.held?.item;
    const heldStack = this.inventory?.held;
    if (this.hit?.state?.block?.id === 'mc:jukebox') {
      const { x, y, z, state } = this.hit;
      const record = state.get('record') || 'none';
      const discIds = { 'mc:music_disc_13': '13', 'mc:music_disc_cat': 'cat', 'mc:music_disc_otherside': 'otherside' };
      const discId = heldStack?.item?.id;
      if (record !== 'none' && (!heldStack || heldStack.isEmpty)) {
        const next = state.with('record', 'none');
        if (this.world.setBlock(x, y, z, next)) {
          this.multiplayer?.pushBlockChange(x, y, z, next);
          const itemId = 'mc:music_disc_' + record;
          const leftover = this.inventory.addItem(itemId, 1);
          if (leftover > 0) this.entities?.spawnItemStackAt(new ItemStack(ITEMS.get(itemId), 1), this.player.x, this.player.y + 0.5, this.player.z);
          this.sounds?.play('chestClose');
          this.ui.toast('Пластинка извлечена');
        }
        return;
      }
      if (record === 'none' && discIds[discId]) {
        const next = state.with('record', discIds[discId]);
        if (this.world.setBlock(x, y, z, next)) {
          this.multiplayer?.pushBlockChange(x, y, z, next);
          if (this.player.gamemode === GAMEMODE.SURVIVAL) this.inventory.consumeHeld(1);
          this.sounds?.play('chestOpen');
          this.ui.toast('Пластинка помещена в проигрыватель');
        }
        return;
      }
    }
    if (this.hit?.state?.block?.id === 'mc:cauldron' && heldItem) {
      const { x, y, z, state } = this.hit;
      const plan = planCauldronInteraction(heldItem.id, state.get('level'));
      if (plan) {
        const next = state.with('level', plan.nextLevel);
        this.world.setBlock(x, y, z, next);
        this.multiplayer?.pushBlockChange(x, y, z, next);
        if (this.player.gamemode === GAMEMODE.SURVIVAL) {
          this.inventory.consumeHeld(1);
          const leftover = this.inventory.addItem(plan.resultItem, 1);
          if (leftover > 0) {
            const item = ITEMS.get(plan.resultItem);
            if (item) this.entities?.spawnItemStackAt(new ItemStack(item, 1), this.player.x, this.player.y + 0.5, this.player.z);
          }
        }
        this.sounds?.play('place', 'water');
        this.ui.toast(plan.message);
        return;
      }
      this.ui.toast('Котёл не может принять этот предмет или уровень воды не подходит');
      return;
    }
    if (heldItem && this.hit) {
      const hitState = this.hit.state;
      let target = null;
      if (heldItem.id !== 'mc:bucket') target = placementTarget(this.world, this.hit);
      const targetState = target ? this.world.getBlock(target.x, target.y, target.z) : null;
      const plan = planBucketInteraction(
        heldItem.id, hitState.block.id, hitState.get('level'), targetState?.block,
      );
      if (plan) {
        if (plan.type === 'scoop') {
          this.world.setBlock(this.hit.x, this.hit.y, this.hit.z, AIR.defaultState);
          this.multiplayer?.pushBlockChange(this.hit.x, this.hit.y, this.hit.z, AIR.defaultState);
        } else {
          const fluidState = BLOCKS.get(plan.fluid)?.defaultState;
          if (!fluidState || !this.world.setBlock(target.x, target.y, target.z, fluidState)) return;
          this.multiplayer?.pushBlockChange(target.x, target.y, target.z, fluidState);
        }
        if (this.player.gamemode === GAMEMODE.SURVIVAL) {
          this.inventory.consumeHeld(1);
          const leftover = this.inventory.addItem(plan.resultItem, 1);
          if (leftover > 0) {
            const item = ITEMS.get(plan.resultItem);
            if (item) this.entities?.spawnItemStackAt(new ItemStack(item, 1), this.player.x, this.player.y + 0.5, this.player.z);
          }
        }
        this.sounds?.play(plan.fluid === 'mc:lava' ? 'lava' : 'water');
        this.ui.toast(plan.type === 'scoop' ? 'Жидкость набрана в ведро' : 'Жидкость вылита из ведра');
        return;
      }
    }
    if (this.hit?.state?.block?.id === 'mc:composter') {
      const { x, y, z, state } = this.hit;
      const level = state.get('level');
      if (level >= 8) {
        if (!this.inventory.held.isEmpty) {
          this.ui.toast('Освободи руку, чтобы забрать костную муку');
          return;
        }
        const empty = state.with('level', 0);
        this.world.setBlock(x, y, z, empty);
        this.multiplayer?.pushBlockChange(x, y, z, empty);
        if (this.player.gamemode === GAMEMODE.SURVIVAL) this.inventory.addItem('mc:bone_meal', 1);
        this.sounds?.play('place', 'wood');
        this.ui.toast('Получена костная мука');
        return;
      }
      const itemId = heldItem?.id;
      const chance = compostChance(itemId);
      if (chance === null) {
        this.ui.toast('Этот предмет нельзя компостировать');
        return;
      }
      const roll = compostRoll(this.world.seed, x, y, z, this.tickCount, itemId);
      const nextLevel = nextComposterLevel(level, chance, roll);
      if (this.player.gamemode === GAMEMODE.SURVIVAL) this.inventory.consumeHeld(1);
      if (nextLevel !== level) {
        const next = state.with('level', nextLevel);
        this.world.setBlock(x, y, z, next);
        this.multiplayer?.pushBlockChange(x, y, z, next);
      }
      this.sounds?.play('place', 'wood');
      this.ui.toast(nextLevel === level ? 'Предмет переработан, но слой не добавлен'
        : nextLevel >= 8 ? 'Компост готов — забери костную муку'
        : 'Компостер заполнен: ' + nextLevel + '/8');
      return;
    }
    if (heldItem?.id === 'mc:bone_meal' && this.hit &&
        canApplyBoneMeal(this.hit.state.block.id, this.hit.state.get('age'))) {
      const { x, y, z, state } = this.hit;
      const nextAge = boneMealAge(state.get('age'), this.world.seed, x, y, z, this.tickCount);
      if (nextAge === null) {
        this.ui.toast('Растение уже созрело');
        return;
      }
      const next = state.with('age', nextAge);
      this.world.setBlock(x, y, z, next);
      this.multiplayer?.pushBlockChange(x, y, z, next);
      if (this.player.gamemode === GAMEMODE.SURVIVAL) this.inventory.consumeHeld(1);
      this.sounds?.play('place', 'grass');
      this.ui.toast('Рост ускорен костной мукой');
      return;
    }
    if (this.hit && ['mc:bee_nest', 'mc:beehive'].includes(this.hit.state.block.id)) {
      const { x, y, z, state } = this.hit;
      const smokeCalmed = hasCampfireSmoke(this.world, x, y, z);
      const result = hiveHarvestResult(state, heldItem?.id, smokeCalmed);
      if (result) {
        if (!result.ok) {
          this.ui.toast(result.reason === 'not_full' ? 'В улье пока недостаточно мёда'
            : result.reason === 'bees_angry' ? 'Нужен дым от костра под ульем'
            : 'Нужны ножницы или стеклянная бутылочка');
          return;
        }
        if (this.player.gamemode === GAMEMODE.SURVIVAL) {
          if (result.tool === 'shears') this.inventory.damageHeld(1);
          else this.inventory.consumeHeld(1);
          for (const drop of result.drops) this.inventory.addItem(drop.id, drop.count);
        }
        const next = state.with('honey_level', result.nextLevel);
        this.world.setBlock(x, y, z, next);
        this.multiplayer?.pushBlockChange(x, y, z, next);
        this.sounds?.play('place', 'honey');
        this.ui.toast(result.tool === 'shears' ? 'Собраны пчелиные соты' : 'Мёд собран в бутылочку');
        return;
      }
    }
    if (this.hit?.state?.block?.id === 'mc:redstone_ore') {
      this._activateRedstoneOre?.(this.hit.x, this.hit.y, this.hit.z);
      return;
    }

    if (this.hit?.state?.block?.id === 'mc:bed') {
      const nearbyHostile = hasNearbySleepHostile(
        this.entities?.mobs, this.player.x, this.player.y, this.player.z,
      );
      const sleep = canSleepAt(this.world.dimension, this.world.time, nearbyHostile,
        weatherAt(this.world.seed, this.world.time));
      if (!sleep.ok) {
        this.ui.toast(sleep.reason, { error: true });
      } else {
        this.worldMeta.spawnPoint = { x: this.hit.x + 0.5, y: this.hit.y + 1, z: this.hit.z + 0.5 };
        this.world.time = 0;
        this._save(false).catch(() => {});
        this.ui.toast('Точка возрождения установлена. Ночь пропущена.');
      }
      return;
    }
    if (this.hit?.state?.block?.id === 'mc:campfire') {
      const plan = planCampfireFoodInteraction(this.hit.state, heldItem?.id || null);
      if (plan?.type === 'insert') {
        if (this.world.setBlock(this.hit.x, this.hit.y, this.hit.z, plan.state)) {
          this.multiplayer?.pushBlockChange(this.hit.x, this.hit.y, this.hit.z, plan.state);
          if (this.player.gamemode === GAMEMODE.SURVIVAL) this.inventory.consumeHeld(1);
          this.sounds?.play('place', 'food');
          this.ui.toast('Еда помещена на костёр');
        }
        return;
      }
      if (plan?.type === 'collect') {
        if (this.world.setBlock(this.hit.x, this.hit.y, this.hit.z, plan.state)) {
          this.multiplayer?.pushBlockChange(this.hit.x, this.hit.y, this.hit.z, plan.state);
          const leftover = this.inventory.addItem(plan.itemId, 1);
          if (leftover > 0) this.entities?.spawnItemStackAt(new ItemStack(ITEMS.get(plan.itemId), 1), this.player.x, this.player.y + 0.5, this.player.z);
          this.sounds?.play('furnace');
          this.ui.toast('Готово: ' + plan.itemId.replace('mc:cooked_', '').replace('mc:', ''));
        }
        return;
      }
      if (heldItem?.food && plan === null && (this.hit.state.get('food') || 'none') !== 'none') {
        this.ui.toast('На костре уже готовится еда');
        return;
      }
    }
    if (this.hit?.state?.block?.id === 'mc:campfire' && heldItem?.id === 'mc:water_bucket') {
      const { x, y, z, state } = this.hit;
      if (state.get('lit') !== false) {
        const extinguished = state.with('lit', false);
        this.world.setBlock(x, y, z, extinguished);
        this.multiplayer?.pushBlockChange(x, y, z, extinguished);
        if (this.player.gamemode === GAMEMODE.SURVIVAL) {
          this.inventory.consumeHeld(1);
          this.inventory.addItem('mc:bucket', 1);
        }
        this.sounds?.play('water');
        this.ui.toast('Костёр потушен');
      } else {
        this.ui.toast('Костёр уже потушен');
      }
      return;
    }
    if (['mc:flint_and_steel', 'mc:fire_charge'].includes(heldItem?.id) && this.hit) {
      if (this.hit.state.block.id === 'mc:campfire') {
        const lit = this.hit.state.with('lit', true);
        if (this.world.setBlock(this.hit.x, this.hit.y, this.hit.z, lit)) {
          this.multiplayer?.pushBlockChange(this.hit.x, this.hit.y, this.hit.z, lit);
          if (heldItem.id === 'mc:fire_charge') this.inventory.consumeHeld(1); else this.inventory.damageHeld(1);
          this.sounds?.play('furnace');
          this.ui.toast('Костёр разожжён');
        }
        return;
      }
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
        if(activated){if (heldItem.id === 'mc:fire_charge') this.inventory.consumeHeld(1); else this.inventory.damageHeld(1);this.ui.toast('Портал активирован! Нажми ПКМ по порталу, чтобы войти.');}
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
    if (this.entities?.useLeadFromPlayer()) return;
    if (this.entities?.tameFromPlayer()) return;
    if (this.entities?.useFishingRod()) return;
    if (this.entities?.shearFromPlayer()) return;
    if (this.entities?.milkCowFromPlayer()) return;
    if (this.entities?.feedAnimalFromPlayer()) return;
    if (this._farmInteraction()) return;
    const sneaking = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.hit && !sneaking && ['button', 'lever'].includes(this.hit.state.block.renderShape)) {
      const state = this.hit.state;
      const powered = state.block.renderShape === 'lever' ? !state.get('powered') : true;
      const next = state.with('powered', powered);
      this.world.setBlock(this.hit.x, this.hit.y, this.hit.z, next);
      this.multiplayer?.pushBlockChange(this.hit.x, this.hit.y, this.hit.z, next);
      if (state.block.renderShape === 'button') {
        this._redstoneDeviceTimers ||= new Map();
        const wooden = !['mc:stone_button', 'mc:polished_blackstone_button'].includes(state.block.id);
        this._redstoneDeviceTimers.set(`${this.hit.x},${this.hit.y},${this.hit.z}`, { due: this.tickCount + (wooden ? 30 : 20) });
      }
      this._applyAdjacentRedstonePower?.(this.hit.x, this.hit.y, this.hit.z, powered);
      return true;
    }
    if (this.hit && !sneaking && this.hit.state.block.id === 'mc:note_block') {
      const state = this.hit.state;
      const next = state.with('note', (state.get('note') + 1) % 25);
      this.world.setBlock(this.hit.x, this.hit.y, this.hit.z, next);
      this.multiplayer?.pushBlockChange(this.hit.x, this.hit.y, this.hit.z, next);
      const support = this.world.getBlock(this.hit.x, this.hit.y - 1, this.hit.z);
      this.sounds?.playNote(next.get('note'), support.block.soundGroup || 'wood');
      return true;
    }
    if (this.hit && !sneaking && this.hit.state.block.id === 'mc:daylight_detector') {
      const state = this.hit.state;
      const next = state.with('inverted', !state.get('inverted'));
      this.world.setBlock(this.hit.x, this.hit.y, this.hit.z, next);
      this.multiplayer?.pushBlockChange(this.hit.x, this.hit.y, this.hit.z, next);
      return true;
    }
    if (this.hit && !sneaking && this.hit.state.block.renderShape === 'comparator') {
      const state = this.hit.state;
      const next = state.with('mode', state.get('mode') === 'compare' ? 'subtract' : 'compare');
      this.world.setBlock(this.hit.x, this.hit.y, this.hit.z, next);
      this.multiplayer?.pushBlockChange(this.hit.x, this.hit.y, this.hit.z, next);
      return true;
    }
    if (this.hit && !sneaking && this.hit.state.block.renderShape === 'repeater') {
      const state = this.hit.state;
      const next = state.with('delay', state.get('delay') % 4 + 1);
      this.world.setBlock(this.hit.x, this.hit.y, this.hit.z, next);
      this.multiplayer?.pushBlockChange(this.hit.x, this.hit.y, this.hit.z, next);
      return true;
    }
    if (this.hit && !sneaking && this.hit.state.block.renderShape === 'fence_gate') {
      const { x, y, z, state } = this.hit;
      const next = state.with('open', !state.get('open'));
      this.world.setBlock(x, y, z, next);
      this.multiplayer?.pushBlockChange(x, y, z, next);
      this.sounds?.play('place', 'wood');
      return true;
    }
    if (this.hit && !sneaking && this.hit.state.block.renderShape === 'trapdoor') {
      const trapdoor = this.hit.state;
      // Iron trapdoors require redstone; wooden variants can be used by hand.
      if (trapdoor.block.id === 'mc:iron_trapdoor') return true;
      const next = trapdoor.with('open', !trapdoor.get('open'));
      this.world.setBlock(this.hit.x, this.hit.y, this.hit.z, next);
      this.multiplayer?.pushBlockChange(this.hit.x, this.hit.y, this.hit.z, next);
      return true;
    }
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
    if (!sneaking && this._drinkHeldPotion()) return;
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

    if (id === 'mc:sweet_berry_bush') {
      const harvest = sweetBerryHarvest(state);
      if (!harvest) {
        this.ui.toast('The berry bush is not ripe');
        return true;
      }
      const leftover = this.inventory.addItem('mc:sweet_berries', harvest.count);
      if (leftover > 0) this.entities?.spawnItemStackAt(new ItemStack(ITEMS.get('mc:sweet_berries'), leftover), x, y + 0.5, z);
      this.world.setBlock(x, y, z, harvest.state);
      this.multiplayer?.pushBlockChange(x, y, z, harvest.state);
      this.ui.toast(`Collected ${harvest.count} sweet berries`);
      return true;
    }

    if (held.item?.id === 'mc:sweet_berries' && ['mc:grass_block', 'mc:dirt', 'mc:coarse_dirt', 'mc:podzol'].includes(id)) {
      const targetY = y + 1;
      const above = this.world.getBlock(x, targetY, z);
      if (above.block.id === 'mc:air' || above.block.replaceable) {
        const bush = BLOCKS.get('mc:sweet_berry_bush')?.defaultState;
        if (bush && this.world.setBlock(x, targetY, z, bush)) {
          this.multiplayer?.pushBlockChange(x, targetY, z, bush);
          if (survival) this.inventory.consumeHeld(1);
          this.ui.toast('Sweet berry bush planted');
        }
      }
      return true;
    }

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

    // Wheat, carrots, potatoes and beetroot seeds all plant on farmland.
    const cropForSeed = {
      'mc:wheat_seeds': 'mc:wheat',
      'mc:carrot': 'mc:carrots',
      'mc:potato': 'mc:potatoes',
      'mc:beetroot_seeds': 'mc:beetroots',
      'mc:pumpkin_seeds': 'mc:pumpkin_stem',
      'mc:melon_seeds': 'mc:melon_stem',
    };
    const plantedCrop = cropForSeed[held.item?.id];
    if (held.item?.id === 'mc:sugar_cane' && canPlantSugarCane(this.world, x, y, z)) {
      const targetY = y + 1;
      const above = this.world.getBlock(x, targetY, z);
      if (above.block.id === 'mc:air' || above.block.replaceable) {
        const cane = BLOCKS.get('mc:sugar_cane')?.defaultState;
        if (cane && this.world.setBlock(x, targetY, z, cane)) {
          this.multiplayer?.pushBlockChange(x, targetY, z, cane);
          if (survival) this.inventory.consumeHeld(1);
          this.ui.toast('Sugar cane planted');
        }
      }
      return true;
    }
    if (plantedCrop && id === 'mc:farmland') {
      const cropPos = { x, y: y + 1, z };
      const above = this.world.getBlock(cropPos.x, cropPos.y, cropPos.z);
      if (above.block.id === 'mc:air' || above.block.replaceable) {
        const crop = BLOCKS.get(plantedCrop)?.defaultState;
        if (crop && this.world.setBlock(cropPos.x, cropPos.y, cropPos.z, crop)) {
          this.multiplayer?.pushBlockChange(cropPos.x, cropPos.y, cropPos.z, crop);
          if (survival) this.inventory.consumeHeld(1);
          const labels = { 'mc:wheat': 'Wheat', 'mc:carrots': 'Carrots', 'mc:potatoes': 'Potatoes', 'mc:beetroots': 'Beetroot', 'mc:pumpkin_stem': 'Pumpkin', 'mc:melon_stem': 'Melon' };
          this.ui.toast(labels[plantedCrop] + ' planted');
        }
      }
      return true;
    }

    // Harvest all supported crops through the same deterministic drop table
    // used by normal block breaking.
    if (['mc:wheat', 'mc:carrots', 'mc:potatoes', 'mc:beetroots'].includes(id)) {
      if (state.get('age') < 7) {
        this.ui.toast('Crop is not ripe');
        return true;
      }
      this.world.setBlock(x, y, z, AIR.defaultState);
      this.multiplayer?.pushBlockChange(x, y, z, AIR.defaultState);
      if (survival) {
        const drops = blockDrops(state, this.inventory.held, this.world.seed, x, y, z);
        for (const drop of drops) this.inventory.addItem(drop.id, drop.count);
      }
      this.ui.toast('Crop harvested');
      return true;
    }
    return false;
  },

  _drinkHeldPotion() {
    const player = this.player;
    const stack = this.inventory?.held;
    if (!player || !stack || stack.isEmpty || player.gamemode === GAMEMODE.SPECTATOR) return false;
    const itemId = stack.item.id;
    if (itemId === 'mc:milk_bucket') {
      player.effects?.clear();
      if (player.gamemode === GAMEMODE.SURVIVAL) {
        this.inventory.consumeHeld(1);
        const leftover = this.inventory.addItem('mc:bucket', 1);
        if (leftover > 0) this.entities?.spawnItemStackAt(new ItemStack(ITEMS.get('mc:bucket'), 1), player.x, player.y + 0.5, player.z);
      }
      this.sounds?.play('eat');
      this.ui.toast('Эффекты сняты молоком');
      return true;
    }
    const potion = POTION_ITEMS[itemId];
    if (!potion) return false;
    player.effects.apply(potion.effect, potion.duration, potion.amplifier ?? 0);
    if (potion.instant === 'healing') player.health = Math.min(20, player.health + 4 * (potion.amplifier + 1));
    if (player.gamemode === GAMEMODE.SURVIVAL) {
      this.inventory.consumeHeld(1);
      const leftover = this.inventory.addItem('mc:glass_bottle', 1);
      if (leftover > 0) this.entities?.spawnItemStackAt(new ItemStack(ITEMS.get('mc:glass_bottle'), 1), player.x, player.y + 0.5, player.z);
    }
    this.sounds?.play('eat');
    this.ui.toast('Выпито зелье: ' + itemId.replace('mc:potion_', '').replaceAll('_', ' '));
    return true;
  },

  _eatHeldFood() {
    const player = this.player;
    const stack = this.inventory.held;
    const food = stack.item?.food;
    if (!player || player.gamemode !== GAMEMODE.SURVIVAL || stack.isEmpty || !food) return false;
    if (!player.vitals.eat(food)) return false;
    const itemId = stack.item.id;
    const containerItem = stack.item.containerItem || (itemId === 'mc:honey_bottle' ? 'mc:glass_bottle' : null);
    this.inventory.consumeHeld(1);
    if (containerItem) {
      const leftover = this.inventory.addItem(containerItem, 1);
      if (leftover > 0) {
        const item = ITEMS.get(containerItem);
        if (item) this.entities?.spawnItemStackAt(new ItemStack(item, 1), player.x, player.y + 0.5, player.z);
      }
    }
    this.sounds?.play('eat');
    this.ui.toast('Eating: ' + itemId.replace('mc:', '').replaceAll('_', ' '));
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
    if (['button', 'lever'].includes(block.renderShape)) {
      const face = state.get('face'), facing = state.get('facing');
      const support = face === 'floor' ? this.world.getBlock(target.x, target.y - 1, target.z)
        : face === 'ceiling' ? this.world.getBlock(target.x, target.y + 1, target.z)
        : facing === 'north' ? this.world.getBlock(target.x, target.y, target.z + 1)
        : facing === 'south' ? this.world.getBlock(target.x, target.y, target.z - 1)
        : facing === 'east' ? this.world.getBlock(target.x - 1, target.y, target.z)
        : this.world.getBlock(target.x + 1, target.y, target.z);
      if (!support.block.solid || !support.block.opaqueCube) return;
    }
    if (block.id === 'mc:hopper') {
      const support = this.world.getBlock(target.x, target.y - 1, target.z);
      if (!support.block.solid) return;
    }
    if (block.id === 'mc:redstone_torch') {
      if (this.hit.face?.dy !== 1) return;
      const support = this.world.getBlock(target.x, target.y - 1, target.z);
      if (!support.block.solid || !support.block.opaqueCube) return;
    }
    if (block.id === 'mc:daylight_detector') {
      if (this.hit.face?.dy !== 1) return;
      const support = this.world.getBlock(target.x, target.y - 1, target.z);
      if (!support.block.solid || !support.block.opaqueCube) return;
    }
    if (['repeater', 'comparator'].includes(block.renderShape)) {
      if (this.hit.face?.dy !== 1) return;
      const support = this.world.getBlock(target.x, target.y - 1, target.z);
      if (!support.block.solid || !support.block.opaqueCube) return;
    }
    if (block.renderShape === 'redstone_wire') {
      const support = this.world.getBlock(target.x, target.y - 1, target.z);
      if (!support.block.solid || !support.block.opaqueCube) return;
    }
    if (['pressure_plate', 'weighted_pressure_plate'].includes(block.renderShape)) {
      if (this.hit.face?.dy !== 1) return;
      const support = this.world.getBlock(target.x, target.y - 1, target.z);
      if (!support.block.solid || !support.block.opaqueCube) return;
    }
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
      if (block.id !== 'mc:sponge') this.multiplayer?.pushBlockChange(target.x, target.y, target.z, state);
    }
    if (block.id === 'mc:sponge') {
      const absorbed = absorbWaterAround(this.world, target.x, target.y, target.z);
      if (absorbed.length > 0) {
        const wet = this.world.dimension === 'nether'
          ? BLOCKS.get('mc:sponge')?.defaultState
          : BLOCKS.get('mc:wet_sponge')?.defaultState;
        if (wet && this.world.setBlock(target.x, target.y, target.z, wet)) {
          this.multiplayer?.pushBlockChanges?.([
            ...absorbed,
            { x: target.x, y: target.y, z: target.z, state: wet },
          ]);
        }
      } else {
        this.multiplayer?.pushBlockChange(target.x, target.y, target.z, state);
      }
    }
    this._refreshWallConnections({ x: target.x, y: target.y, z: target.z },
      ...(block.renderShape === 'door' ? [{ x: target.x, y: target.y + 1, z: target.z }] : []));
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
