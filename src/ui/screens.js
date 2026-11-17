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
        this.multiplayer.sendChat(chat.value);
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

  async _deleteSelectedWorld() {
    const world = this.worlds.find((w) => w.id === this.selectedWorldId);
    if (!world) return;
    if (!confirm(`Delete "${world.name}" permanently? This cannot be undone.`)) return;
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
