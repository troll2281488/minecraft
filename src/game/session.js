/**
 * World session lifecycle: entering and leaving a world, waiting for spawn chunks,
 * and persistence (manual save, autosave, and the export of the world in play).
 *
 * Extracted from main.js as a prototype mixin so the bodies move unchanged -- see the
 * note in main.js.
 */

import { SAVE } from '../core/constants.js';
import { World } from '../world/world.js';
import { Player } from '../entity/player.js';
import { BLOCKS } from '../world/block.js';
import { ItemStack } from '../world/item.js';
import { Inventory, CraftingGrid } from './inventory.js';
import { RECIPES } from './recipes.js';
import * as storage from '../save/storage.js';
import { buildSave, exportWorld } from '../save/io.js';
import { materializeChunk, decodeChunkBinary, encodeChunk } from '../save/format.js';

const SAVE_DIMENSION = { overworld: 'mc:overworld', nether: 'mc:the_nether', end: 'mc:the_end' };

export const SessionMixin = {
  async _enterWorld(meta, playerJson) {
    this.worldMeta = meta;
    this.ui.showScreen('loading');
    this.ui.setLoadingProgress(0, 'Starting terrain workers...');

    this._stopTitlePreview?.();
    this.world?.dispose();
    this.chunkRenderer.dispose();

    this.world = new World({ seed: meta.seed, textureTable: this.textureTable, dimension: meta.dimension || 'overworld' });
    this.entities?.reset();
    this.world.time = meta.time ?? 0;

    // Load any chunks already saved for this world before generating new ones,
    // so returning to a world shows what the player built rather than fresh
    // terrain generated over the top of it.
    // Online rooms are generated from the room seed and their block edits live
    // in Firebase. Loading this browser's private cached chunks here would make
    // every participant see a different terrain snapshot.
    if (!this.multiplayer?.roomId) {
      const saved = await storage.getAllChunks(meta.id, SAVE_DIMENSION[this.world.dimension]);
      for (const record of saved) {
        const chunk = materializeChunk(
          ...record.key.split(',').map(Number),
          decodeChunkBinary(record.bytes),
        );
        this.world.adoptChunk(chunk);
      }
    }

    this.player = new Player().loadFrom(playerJson);
    this.player.name = meta.playerName || 'Игрок';
    this.inventory.loadFrom(playerJson?.inventory);
    this.inventory.selectedSlot = playerJson?.selectedSlot ?? 0;
    // Container inventories are block-entity state. Keep them out of online
    // rooms until their authoritative state is synchronized by the server.
    this._restoreContainers?.(this.multiplayer?.roomId ? [] : playerJson?.containers);

    const isNew = !playerJson;
    await this._waitForSpawnChunks(isNew);
    // Mobs are world state, not player state; restore them only for local worlds.
    this.entities?.loadFrom?.(this.multiplayer?.roomId ? [] : playerJson?.mobs);

    if (isNew) {
      const spawn = await this._findSafeSpawn();
      this.player.teleport(spawn.x, spawn.y, spawn.z);
      if (meta.bonusChest && !meta.bonusChestSpawned) {
        const chestX = Math.floor(spawn.x + 2), chestY = Math.floor(spawn.y), chestZ = Math.floor(spawn.z + 1);
        const chestBlock = BLOCKS.get('mc:chest');
        if (chestBlock && this.world.setBlock(chestX, chestY, chestZ, chestBlock.defaultState)) {
          const chest = this._chestAt(chestX, chestY, chestZ);
          for (const [id, count] of [['mc:oak_planks', 16], ['mc:stick', 8], ['mc:bread', 3], ['mc:apple', 3], ['mc:wooden_pickaxe', 1], ['mc:wooden_axe', 1]]) {
            const item = ItemStack.of(id, count);
            if (item) chest.insert(item);
          }
          meta.bonusChestSpawned = true;
          await storage.putWorld(meta);
        }
      }
    } else {
      // Old saves may contain the previous ocean fallback position. Inspect
      // the player's feet column down to the first solid floor: if water is
      // encountered first, move them to dry terrain before starting physics.
      const x = Math.floor(this.player.x);
      const z = Math.floor(this.player.z);
      const feetY = Math.floor(this.player.y);
      let waterBelow = false;
      for (let depth = 0; depth <= 32; depth++) {
        const block = this.world.getBlock(x, feetY - depth, z).block;
        if (block.id === 'mc:water') { waterBelow = true; break; }
        if (block.solid) break;
      }
      if (waterBelow || this.player._isInWater(this.world) || this.player._isHeadUnderwater(this.world)) {
        const spawn = await this._findSafeSpawn();
        this.player.teleport(spawn.x, spawn.y, spawn.z);
        this.ui.toast('Старая точка появления была в воде — перенёс тебя на сушу.', { duration: 6000 });
      }
    }

    this.craftingGrid = new CraftingGrid(2, RECIPES);
    this._rebuildInventoryUI();

    document.getElementById('pause-world-name').textContent =
      `${meta.name} · seed ${meta.seed}`;

    this.ui.hideAllScreens();
    this.ui.setHudVisible(true);
    this.running = true;
    this.paused = false;
    this.lastFrameTime = performance.now();
    this._requestPointerLock();
    if (!this._loopStarted) {
      this._loopStarted = true;
      requestAnimationFrame((t) => this._frame(t));
    }
  },


  async _switchDimension(dimension) {
    const next = String(dimension || '').toLowerCase();
    if (!['overworld','nether','end'].includes(next)) throw new Error('Измерение: overworld, nether или end');
    if (!this.world || next === this.world.dimension) return;
    await this._save(false);
    const previous = this.world.dimension;
    const oldX = this.player.x, oldZ = this.player.z;
    this.world.dispose();
    this.chunkRenderer.dispose();
    this.world = new World({ seed: this.worldMeta.seed, textureTable: this.textureTable, dimension: next });
    this.worldMeta.dimension = next;
    this.entities?.reset();
    this.world.time = this.worldMeta.time ?? 0;
    if (!this.multiplayer?.roomId) {
      const saved = await storage.getAllChunks(this.worldMeta.id, SAVE_DIMENSION[next]);
      for (const record of saved) {
        const [cx,cz] = record.key.split(',').map(Number);
        this.world.adoptChunk(materializeChunk(cx,cz,decodeChunkBinary(record.bytes)));
      }
    }
    let x=oldX,z=oldZ,y=80;
    if (previous==='overworld' && next==='nether') { x=oldX/8; z=oldZ/8; y=64; }
    else if (previous==='nether' && next==='overworld') { x=oldX*8; z=oldZ*8; y=80; }
    else if (next==='end') { x=0; z=0; y=80; }
    else if (next==='overworld') { x=0; z=0; y=80; }
    this.player.teleport(x,y,z);
    await this._waitForSpawnChunks(false);
    const safe = this.world.findSpawn(Math.floor(x),Math.floor(z),32);
    if (safe) this.player.teleport(safe.x,safe.y,safe.z);
    if (next === 'nether') {
      const obsidian=BLOCKS.get('mc:obsidian')?.defaultState;
      const landingX=Math.floor(this.player.x), landingZ=Math.floor(this.player.z);
      if(obsidian) for(let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++) {
        this.world.setBlock(landingX+dx,63,landingZ+dz,obsidian);
        this.world.setBlock(landingX+dx,64,landingZ+dz,BLOCKS.get('mc:air').defaultState);
        this.world.setBlock(landingX+dx,65,landingZ+dz,BLOCKS.get('mc:air').defaultState);
        this.world.setBlock(landingX+dx,66,landingZ+dz,BLOCKS.get('mc:air').defaultState);
      }
      this.player.teleport(landingX+0.5,64,landingZ-0.5);
      // Build a lit return gate on the safe landing pad, aligned with the entry coordinates.
      const portal=BLOCKS.get('mc:portal')?.defaultState, gateX=landingX-1, gateZ=landingZ;
      if(obsidian&&portal) {
        for(let dx=0;dx<4;dx++) for(let dy=0;dy<5;dy++) if(dx===0||dx===3||dy===0||dy===4) this.world.setBlock(gateX+dx,64+dy,gateZ,obsidian);
        for(let dx=1;dx<=2;dx++) for(let dy=1;dy<=3;dy++) this.world.setBlock(gateX+dx,64+dy,gateZ,portal);
      }
      const baseX=36,baseZ=36;
      for(const [dx,dz] of [[0,0],[4,2],[-3,4]]) this.entities?._spawn?.('blaze',baseX+dx,baseZ+dz,{y:53});
      if(!this.worldMeta.netherFortressLootPlaced) {
        const chest=this._chestAt?.(46,53,36);
        if(chest) for(const [id,count] of [['mc:gold_ingot',5],['mc:iron_ingot',4],['mc:diamond',2],['mc:blaze_rod',2]]) { const stack=ItemStack.of(id,count); if(stack) chest.insert(stack); }
        this.worldMeta.netherFortressLootPlaced=true;
      }
    }
    await storage.putWorld({ ...this.worldMeta, dimension: next, time: this.world.time });
    this.ui.toast('Измерение: '+({overworld:'Обычный мир',nether:'Нижний мир',end:'Край'})[next]);
  },

  async _findSafeSpawn() {
    // Expand the generated search area instead of silently falling back into
    // the ocean when the initial chunks happen to be offshore.
    for (const radiusBlocks of [48, 96, 192]) {
      const radiusChunks = Math.ceil(radiusBlocks / 16);
      const deadline = performance.now() + 2500;
      while (performance.now() < deadline) {
        this.world.requestAround(0, 0, radiusChunks, 64);
        const spawn = this.world.findSpawn(0, 0, radiusBlocks);
        if (spawn) return spawn;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    // A fully oceanic generated area is rare, but never put the player in
    // water: make a small temporary safe platform at the world origin.
    const stone = BLOCKS.get('mc:stone')?.defaultState;
    if (!stone || !this.world.hasChunk(0, 0)) {
      throw new Error('Не удалось подготовить безопасную точку появления: центральный чанк не загружен.');
    }
    for (let z = -6; z <= 6; z++) {
      for (let x = -6; x <= 6; x++) this.world.setBlock(x, 79, z, stone);
    }
    this.ui.toast('Рядом не нашлось суши — создана временная платформа для безопасного появления.', { duration: 6000 });
    return { x: 0.5, y: 80, z: 0.5 };
  },

  async _waitForSpawnChunks(isNew) {
    // Prepare a complete playable area around spawn before hiding the loading
    // screen. The world is infinite, so preload the initial 9x9-diameter
    // neighbourhood (49 chunks in a radius-4 circle), not the whole world.
    const target = 49;
    const deadline = performance.now() + 30000;

    while (performance.now() < deadline) {
      this.world.requestAround(this.player.x, this.player.z, 4, 32);
      const ready = this.world.chunkCount;
      // Mesh while the loading overlay is still visible; otherwise generated
      // chunks exist but render as empty sky for the first several frames.
      this.chunkRenderer.update(this.world, this.player.x, this.player.z, 8, null);
      const meshesReady = this.world.dirtyMeshes.size === 0;
      const progress = Math.min(0.96, (ready / target) * 0.82 + (meshesReady ? 0.14 : 0));
      this.ui.setLoadingProgress(
        progress,
        `Preparing terrain: ${Math.min(ready, target)}/${target} chunks · ${meshesReady ? 'meshes ready' : 'building meshes'}`,
      );
      if (ready >= target && meshesReady) break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    this.ui.setLoadingProgress(1, 'Terrain ready');
    void isNew;
  },

  _giveStartingItems() {
    // A short starting kit. Not vanilla behaviour, but Phase 1 has no furnace
    // or chest, and handing over a pickaxe makes the whole block catalog
    // reachable in the first minute rather than the first hour.
    this.inventory.addItem('mc:stone_pickaxe', 1);
    this.inventory.addItem('mc:stone_axe', 1);
    this.inventory.addItem('mc:stone_shovel', 1);
    this.inventory.addItem('mc:torch', 32);
    this.inventory.addItem('mc:oak_planks', 64);
  },

  async _respawnAfterDeath() {
    if (!this.world || !this.player) return;
    let spawn;
    const savedSpawn = this.worldMeta?.spawnPoint;
    if (this.world.dimension !== 'overworld') await this._switchDimension('overworld');
    if (savedSpawn && Number.isFinite(savedSpawn.x) && Number.isFinite(savedSpawn.y) && Number.isFinite(savedSpawn.z)) {
      this.player.teleport(savedSpawn.x, savedSpawn.y, savedSpawn.z);
      this.world.requestAround(savedSpawn.x, savedSpawn.z, 4, 32);
      await this._waitForSpawnChunks(false);
      spawn = savedSpawn;
    } else spawn = await this._findSafeSpawn();
    this.entities?.reset();
    if (this.worldMeta?.keepInventory === false) {
      for (let slot = 0; slot < this.inventory.slots.length; slot++) {
        const stack = this.inventory.get(slot);
        if (!stack.isEmpty) { this.entities?.dropStack(stack.clone()); this.inventory.set(slot, null); }
      }
    }
    this.player.teleport(spawn.x, spawn.y, spawn.z);
    this.player.health = 20;
    this.player.vitals = new this.player.vitals.constructor();
    this.player.fallDistance = 0;
    this.player.input = { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false };
    this.deathScreenOpen = false;
    this.paused = false;
    document.getElementById('death-screen')?.classList.add('hidden');
    document.body.classList.remove('menu-active');
    this._requestPointerLock();
    await this._save(false);
    this.ui.toast(this.worldMeta?.keepInventory === false ? 'Ты возродился. Предметы остались на месте гибели.' : 'Ты возродился на точке появления. Инвентарь сохранён.');
  },

  async _quitToTitle() {
    await this._save(false);
    await this.multiplayer?.leaveRoom();
    this.running = false;
    this.paused = true;
    document.exitPointerLock?.();
    this.ui.setHudVisible(false);
    this.world?.dispose();
    this.world = null;
    this.entities?.reset();
    this.chunkRenderer.dispose();
    this.ui.showScreen('title');
    this._startTitlePreview?.();
  },

  async _save(showToast) {
    if (!this.world || !this.worldMeta) return;

    const dirty = [];
    for (const chunk of this.world.chunks.values()) {
      if (!chunk.dirty) continue;
      dirty.push({ cx: chunk.cx, cz: chunk.cz, bytes: encodeChunk(chunk) });
      chunk.dirty = false;
    }

    await storage.putChunks(this.worldMeta.id, SAVE_DIMENSION[this.world.dimension], dirty);
    await storage.putPlayer(this.worldMeta.id, 'local', {
      ...this.player.toJSON(),
      inventory: this.inventory.toJSON(),
      // Inventory owns the hotbar selection -- Player used to carry a second
      // copy that nothing ever assigned, so this persisted as 0 every time and
      // the selected slot was silently lost on reload.
      selectedSlot: this.inventory.selectedSlot,
      // Chest contents and furnace timers survive reloads and world exports.
      containers: this.multiplayer?.roomId ? [] : this._serializeContainers?.() ?? [],
      // Preserve nearby creatures, including health and sheep shearing, in local saves.
      mobs: this.multiplayer?.roomId ? [] : this.entities?.toJSON?.() ?? [],
    });
    await storage.putWorld({ ...this.worldMeta, time: this.world.time, dimension: this.world.dimension });

    if (showToast) {
      this.ui.toast(`Saved ${dirty.length} modified chunk${dirty.length === 1 ? '' : 's'}.`);
    }
  },

  _persist(promise, what) {
    promise.catch((err) => {
      console.error(`[save] ${what} failed:`, err);
      this.ui.toast(
        `Could not save (${what}): ${err.message}\nYour world may not be saved. ` +
        `Try exporting it from the pause menu.`,
        { error: true, duration: 12000 },
      );
    });
  },

  async _exportCurrent() {
    await this._save(false);
    this.selectedWorldId = this.worldMeta.id;
    await this._exportSelectedWorld();
  },
};
