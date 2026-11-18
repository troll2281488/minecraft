/**
 * Menu wiring: the title screen, the world list, and the create / load / delete /
 * export / import flows.
 *
 * Every `byId('btn-...').onclick` in the game used to live in main.js, which meant
 * the entry point owned both the DOM plumbing and the game loop. Extracted as a
 * prototype mixin so the bodies move unchanged -- see the note in main.js.
 */

import { SAVE } from '../core/constants.js';
import { GENERATOR_VERSION } from '../world/gen/terrain.js';
import * as storage from '../save/storage.js';
import {
  buildSave, importWorld, exportWorld, describeImportError, enableDropImport,
} from '../save/io.js';
import { encodeChunk } from '../save/format.js';
import { DATA_VERSION } from '../save/migrate.js';

export const ScreensMixin = {
  _setupScreens() {
    const ui = this.ui;
    const byId = (id) => document.getElementById(id);

    byId('btn-singleplayer').onclick = () => this._showWorldList();
    byId('btn-settings').onclick = () => this._openSettings();
    byId('btn-settings-back').onclick = () => this.ui.showScreen('title');
    byId('btn-fullscreen').onclick = async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { this.ui.toast('Полноэкранный режим недоступен', { error: true }); } };
    byId('setting-fov').oninput = (e) => { this.fieldOfView = Number(e.target.value); byId('setting-fov-value').textContent = this.fieldOfView + '°'; this._saveSettings(); };
    byId('btn-rename-world').onclick = () => this._renameSelectedWorld();
    byId('btn-duplicate-world').onclick = () => this._duplicateSelectedWorld();
    this._loadSettings();
    byId('setting-distance').oninput = (e) => {
      this.renderDistance = Number(e.target.value);
      byId('setting-distance-value').textContent = this.renderDistance + ' чанков';
      this._saveSettings();
    };
    byId('setting-sensitivity').oninput = (e) => {
      this.mouseSensitivity = Number(e.target.value);
      this._saveSettings();
    };
    byId('setting-quality').onchange = (e) => {
      this.graphicsQuality = e.target.value;
      this._saveSettings();
      this._resize();
    };

    byId('btn-multiplayer').onclick = async () => {
      this.ui.showScreen('multiplayer');
      byId('mp-nickname').value = this.multiplayer.nickname;
      await this.multiplayer.showLobby();
    };
    byId('btn-mp-back').onclick = () => this.ui.showScreen('title');
    byId('btn-mp-save-nick').onclick = () => {
      const name = byId('mp-nickname').value.trim().slice(0, 20);
      if (!name) return;
      this.multiplayer.setNickname(name)
        .then(() => this.ui.toast('Ник сохранён'))
        .catch((error) => this.ui.toast(`Не удалось обновить ник: ${error.message}`, { error: true }));
    };
    byId('btn-mp-create-room').onclick = () => this.multiplayer.createRoom().catch((e) => this.ui.toast(e.message, { error: true }));
    byId('btn-mp-join-room').onclick = () => this.multiplayer.joinRoom(byId('mp-room-code').value).catch((e) => this.ui.toast(e.message, { error: true }));

    const chat = byId('chat-entry');
    chat.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.code === 'Enter') {
        const message = chat.value.trim();
        if (message.startsWith('/')) this._runCommand(message);
        else this.multiplayer.sendChat(message);
        chat.value = '';
        this.chatOpen = false;
        chat.classList.add('hidden');
        if (this.running && !this.paused) this._requestPointerLock();
      } else if (event.code === 'Escape') {
        this.chatOpen = false;
        chat.classList.add('hidden');
        if (this.running && !this.paused) this._requestPointerLock();
      }
    });
    byId('btn-import').onclick = () => this._importFromPicker();
    byId('btn-worlds-back').onclick = () => ui.showScreen('title');
    byId('btn-new-world').onclick = () => {
      ui.showScreen('create');
      byId('world-name').value = 'New World';
      byId('world-seed').value = '';
    };
    byId('btn-create-back').onclick = () => this._showWorldList();
    byId('btn-create').onclick = () => this._createWorld();
    byId('btn-play').onclick = () => this.selectedWorldId && this._loadWorld(this.selectedWorldId);
    byId('btn-delete-world').onclick = () => this._deleteSelectedWorld();
    byId('btn-export-world').onclick = () => this._exportSelectedWorld();

    byId('btn-resume').onclick = () => this._resume();
    byId('btn-respawn').onclick = () => this._respawnAfterDeath();
    byId('btn-death-save').onclick = () => this._save(true);
    byId('btn-save').onclick = () => this._save(true);
    byId('btn-export').onclick = () => this._exportCurrent();
    byId('btn-gamemode').onclick = () => this._toggleGamemode();
    byId('btn-quit').onclick = () => this._quitToTitle();

    // Drag-and-drop import works from any screen, which is the least surprising
    // behaviour -- a player who drags a file in expects it to open.
    enableDropImport(
      document.body,
      (result) => this._adoptImported(result),
      (err) => ui.toast(describeImportError(err), { error: true, duration: 8000 }),
    );
  },


  _loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('voxel-game-settings') || '{}'); } catch {}
    this.renderDistance = Math.max(3, Math.min(16, Number(saved.renderDistance) || 8));
    this.mouseSensitivity = Math.max(0.04, Math.min(0.5, Number(saved.mouseSensitivity) || 0.15));
    this.graphicsQuality = ['performance','balanced','high'].includes(saved.graphicsQuality) ? saved.graphicsQuality : 'balanced';
    this.fieldOfView = Math.max(50, Math.min(110, Number(saved.fieldOfView) || 70));
    document.getElementById('setting-distance').value = this.renderDistance;
    document.getElementById('setting-distance-value').textContent = this.renderDistance + ' чанков';
    document.getElementById('setting-sensitivity').value = this.mouseSensitivity;
    document.getElementById('setting-quality').value = this.graphicsQuality;
    document.getElementById('setting-fov').value = this.fieldOfView;
    document.getElementById('setting-fov-value').textContent = this.fieldOfView + '°';
    this._saveSettings();
    this._resize?.();
  },

  _saveSettings() {
    try {
      localStorage.setItem('voxel-game-settings', JSON.stringify({
        renderDistance: this.renderDistance,
        mouseSensitivity: this.mouseSensitivity,
        graphicsQuality: this.graphicsQuality,
        fieldOfView: this.fieldOfView,
      }));
    } catch {}
  },

  _openSettings() {
    this._loadSettings();
    this.ui.showScreen('settings');
  },

  async _showWorldList() {
    const worlds = await storage.listWorlds();
    this.worlds = worlds;
    this.selectedWorldId = worlds[0]?.id ?? null;
    this._refreshWorldList();
    this.ui.showScreen('worlds');
  },

  _refreshWorldList() {
    this.ui.renderWorldList(this.worlds, this.selectedWorldId, (id) => {
      this.selectedWorldId = id;
      this._refreshWorldList();
    });
    const hasSelection = !!this.selectedWorldId;
    document.getElementById('btn-play').disabled = !hasSelection;
    document.getElementById('btn-delete-world').disabled = !hasSelection;
    document.getElementById('btn-export-world').disabled = !hasSelection;
    document.getElementById('btn-rename-world').disabled = !hasSelection;
    document.getElementById('btn-duplicate-world').disabled = !hasSelection;
  },

  async _createWorld() {
    const name = document.getElementById('world-name').value.trim() || 'New World';
    const seedText = document.getElementById('world-seed').value.trim();
    const seed = seedText || String(Math.floor(Math.random() * 2 ** 31));

    const meta = await storage.putWorld({
      id: `world-${Date.now()}`,
      name,
      seed,
      generatorVersion: GENERATOR_VERSION,
      time: 0,
      createdWith: DATA_VERSION,
    });

    await this._enterWorld(meta, null);
  },

  async _loadWorld(worldId) {
    const meta = await storage.getWorld(worldId);
    if (!meta) return;
    const player = await storage.getPlayer(worldId, 'local');
    await this._enterWorld(meta, player);
  },

  async _renameSelectedWorld() {
    const world = this.worlds.find((w) => w.id === this.selectedWorldId);
    if (!world) return;
    const name = prompt('Новое название мира:', world.name);
    if (name === null) return;
    const trimmed = name.trim().slice(0, 48);
    if (!trimmed) { this.ui.toast('Название не может быть пустым', { error: true }); return; }
    await storage.putWorld({ ...world, name: trimmed });
    await this._showWorldList();
  },

  async _duplicateSelectedWorld() {
    const world = this.worlds.find((w) => w.id === this.selectedWorldId);
    if (!world) return;
    const id = 'world-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const copy = await storage.putWorld({ ...world, id, name: world.name + ' (копия)', time: world.time ?? 0, createdWith: DATA_VERSION });
    const chunks = await storage.getAllChunks(world.id, 'mc:overworld');
    if (chunks.length) await storage.putChunks(id, 'mc:overworld', chunks.map((chunk) => { const parts = chunk.key.split(',').map(Number); return { cx: parts[0], cz: parts[1], bytes: chunk.bytes }; }));
    const player = await storage.getPlayer(world.id, 'local');
    if (player) await storage.putPlayer(id, 'local', player);
    this.ui.toast('Создана копия «' + copy.name + '»');
    await this._showWorldList();
    this.selectedWorldId = id;
    this._refreshWorldList();
  },

  async _deleteSelectedWorld() {
    const world = this.worlds.find((w) => w.id === this.selectedWorldId);
    if (!world) return;
    if (!confirm(`Удалить мир «${world.name}» навсегда? Это действие нельзя отменить.`)) return;
    await storage.deleteWorld(world.id);
    await this._showWorldList();
  },

  async _exportSelectedWorld() {
    const meta = await storage.getWorld(this.selectedWorldId);
    if (!meta) return;
    const records = await storage.getAllChunks(meta.id, 'mc:overworld');
    const player = await storage.getPlayer(meta.id, 'local');

    const chunks = {};
    for (const record of records) chunks[record.key] = record.bytes;

    const save = buildSave(
      { name: meta.name, seed: meta.seed, generatorVersion: meta.generatorVersion,
        time: meta.time ?? 0, createdWith: meta.createdWith },
      player ? { local: player } : {},
      { 'mc:overworld': { encodedChunks: chunks } },
    );

    const { filename, bytes } = await exportWorld(save);
    this.ui.toast(`Exported ${filename} (${(bytes / 1024).toFixed(0)} KB)`);
  },

  async _importFromPicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SAVE.FILE_EXTENSION;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = await importWorld(await file.arrayBuffer());
        await this._adoptImported(result);
      } catch (err) {
        this.ui.toast(describeImportError(err), { error: true, duration: 8000 });
      }
    };
    input.click();
  },

  async _adoptImported(result) {
    const level = result.save.level ?? {};
    const meta = await storage.putWorld({
      id: `world-${Date.now()}`,
      name: (level.name ?? 'Imported World') + (result.tooNew ? ' (newer)' : ''),
      seed: level.seed ?? '0',
      generatorVersion: level.generatorVersion ?? GENERATOR_VERSION,
      time: level.time ?? 0,
      createdWith: level.createdWith ?? result.fromVersion,
    });

    const dim = result.save.dimensions?.['mc:overworld'];
    if (dim?.liveChunks) {
      const entries = [];
      for (const [, chunk] of dim.liveChunks) {
        entries.push({ cx: chunk.cx, cz: chunk.cz, bytes: encodeChunk(chunk) });
      }
      await storage.putChunks(meta.id, 'mc:overworld', entries);
    }

    const player = Object.values(result.save.players ?? {})[0];
    if (player) await storage.putPlayer(meta.id, 'local', player);

    this.ui.toast(result.summary, { duration: 9000 });
    await this._showWorldList();
  },
};
