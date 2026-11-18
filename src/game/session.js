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
import { Inventory, CraftingGrid } from './inventory.js';
import { RECIPES } from './recipes.js';
import * as storage from '../save/storage.js';
import { buildSave, exportWorld } from '../save/io.js';
import { materializeChunk, decodeChunkBinary, encodeChunk } from '../save/format.js';

export const SessionMixin = {
  async _enterWorld(meta, playerJson) {
    this.worldMeta = meta;
    this.ui.showScreen('loading');
    this.ui.setLoadingProgress(0, 'Starting terrain workers...');

    this._stopTitlePreview?.();
    this.world?.dispose();
    this.chunkRenderer.dispose();

    this.world = new World({ seed: meta.seed, textureTable: this.textureTable });
    this.entities?.reset();
    this.world.time = meta.time ?? 0;

    // Load any chunks already saved for this world before generating new ones,
    // so returning to a world shows what the player built rather than fresh
    // terrain generated over the top of it.
    // Online rooms are generated from the room seed and their block edits live
    // in Firebase. Loading this browser's private cached chunks here would make
    // every participant see a different terrain snapshot.
    if (!this.multiplayer?.roomId) {
      const saved = await storage.getAllChunks(meta.id, 'mc:overworld');
      for (const record of saved) {
        const chunk = materializeChunk(
          ...record.key.split(',').map(Number),
          decodeChunkBinary(record.bytes),
        );
        this.world.adoptChunk(chunk);
      }
    }

    this.player = new Player().loadFrom(playerJson);
    this.inventory.loadFrom(playerJson?.inventory);
    this.inventory.selectedSlot = playerJson?.selectedSlot ?? 0;

    const isNew = !playerJson;
    await this._waitForSpawnChunks(isNew);

    if (isNew) {
      const spawn = await this._findSafeSpawn();
      this.player.teleport(spawn.x, spawn.y, spawn.z);
      this._giveStartingItems();
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
    const target = 25;
    const deadline = performance.now() + 15000;

    while (performance.now() < deadline) {
      this.world.requestAround(this.player.x, this.player.z, 3, 12);
      const ready = this.world.chunkCount;
      this.ui.setLoadingProgress(
        Math.min(1, ready / target),
        `Generated ${ready} of ~${target} chunks`,
      );
      if (ready >= target) break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
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
    const spawn = await this._findSafeSpawn();
    this.player.teleport(spawn.x, spawn.y, spawn.z);
    this.player.health = 20;
    this.player.vitals = new this.player.vitals.constructor();
    this.player.fallDistance = 0;
    this.player.input = { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false };
    this.entities?.reset();
    this.deathScreenOpen = false;
    this.paused = false;
    document.getElementById('death-screen')?.classList.add('hidden');
    document.body.classList.remove('menu-active');
    this._requestPointerLock();
    await this._save(false);
    this.ui.toast('Ты возродился на точке появления. Инвентарь сохранён.');
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

    await storage.putChunks(this.worldMeta.id, 'mc:overworld', dirty);
    await storage.putPlayer(this.worldMeta.id, 'local', {
      ...this.player.toJSON(),
      inventory: this.inventory.toJSON(),
      // Inventory owns the hotbar selection -- Player used to carry a second
      // copy that nothing ever assigned, so this persisted as 0 every time and
      // the selected slot was silently lost on reload.
      selectedSlot: this.inventory.selectedSlot,
    });
    await storage.putWorld({ ...this.worldMeta, time: this.world.time });

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
