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
import { actionRows, bindKey, resetKeys, keyLabel } from '../game/keybinds.js';

export const ScreensMixin = {
  _setupScreens() {
    const ui = this.ui;
    const byId = (id) => document.getElementById(id);

    byId('btn-singleplayer').onclick = () => this._showWorldList();
    byId('btn-settings').onclick = () => this._openSettings();
    byId('btn-settings-back').onclick = () => this.ui.showScreen(this._settingsReturnScreen || 'title');
    byId('btn-fullscreen').onclick = async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { this.ui.toast('Полноэкранный режим недоступен', { error: true }); } };
    byId('setting-fov').oninput = (e) => { this.fieldOfView = Number(e.target.value); byId('setting-fov-value').textContent = this.fieldOfView + '°'; this._saveSettings(); };
    byId('btn-rename-world').onclick = () => this._renameSelectedWorld();
    byId('btn-duplicate-world').onclick = () => this._duplicateSelectedWorld();
    this._loadSettings();
    this._buildKeybindSettings();
    byId('setting-distance').oninput = (e) => {
      this.renderDistance = Number(e.target.value);
      byId('setting-distance-value').textContent = this.renderDistance + ' чанков';
      this._saveSettings();
    };
    byId('setting-simulation-distance').oninput = (e) => {\n      this.simulationDistance = Number(e.target.value);\n      byId('setting-simulation-distance-value').textContent = this.simulationDistance + ' чанков';\n      this._saveSettings();\n    };\n    byId('setting-simulation').onchange = (e) => { this.mobSimulationEnabled = e.target.checked; this._saveSettings(); };\n    byId('setting-particles').onchange = (e) => { this.particlesMode = e.target.value; this.entities?.blockParticles?.splice(0); this._saveSettings(); };\n    byId('setting-sensitivity').oninput = (e) => {
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
    const suggestions = byId('command-suggestions');
    const commandHints = [
      ['/help', 'список команд'],
      ['/gamemode creative', 'творческий режим'],
      ['/gamemode survival', 'выживание'],
      ['/gamemode spectator', 'наблюдатель'],
      ['/give diamond 64', 'выдать предмет'],
      ['/tp 0 80 0', 'телепорт по координатам'],
      ['/setblock 0 80 0 stone', 'поставить блок (creative)'],
      ['/time set day', 'день'],
      ['/time set night', 'ночь'],
      ['/time add 1000', 'прибавить время'],
      ['/heal', 'здоровье, еда и воздух'],
      ['/fly', 'полёт (creative)'],
      ['/spawn', 'вернуться на безопасный спавн'],
      ['/save', 'сохранить мир'],
      ['/seed', 'показать seed'],
      ['/whereami', 'показать координаты'],
    ];
    chat.addEventListener('input', () => {
      const value = chat.value.trim().toLowerCase();
      if (!value.startsWith('/')) { suggestions.classList.add('hidden'); suggestions.replaceChildren(); return; }
      const matches = commandHints.filter(([command]) => command.startsWith(value) || value === '/');
      suggestions.replaceChildren();
      for (const [command, description] of matches.slice(0, 8)) {
        const option = document.createElement('div');
        option.textContent = `${command}  —  ${description}`;
        option.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          chat.value = command;
          chat.focus();
          chat.setSelectionRange(chat.value.length, chat.value.length);
          chat.dispatchEvent(new Event('input'));
        });
        suggestions.append(option);
      }
      suggestions.classList.toggle('hidden', matches.length === 0);
    });
    chat.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.code === 'Enter') {
        const message = chat.value.trim();
        if (message.startsWith('/')) this._runCommand(message);
        else this.multiplayer.sendChat(message);
        chat.value = '';
        suggestions.classList.add('hidden');
        suggestions.replaceChildren();
        this.chatOpen = false;
        chat.classList.add('hidden');
        // Wait for the next canvas click to reacquire Pointer Lock.
        // Keyboard events are not accepted consistently by all browsers.
      } else if (event.code === 'Escape') {
        this.chatOpen = false;
        chat.classList.add('hidden');
        suggestions.classList.add('hidden');
        // Wait for the next canvas click to reacquire Pointer Lock.
        // Keyboard events are not accepted consistently by all browsers.
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

    byId('btn-resume').onclick = () => this._resume();\n    byId('btn-pause-settings').onclick = () => this._openSettings();
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
    this.renderDistance = Math.max(2, Math.min(16, Number(saved.renderDistance) || 8));
    this.mouseSensitivity = Math.max(0.04, Math.min(0.5, Number(saved.mouseSensitivity) || 0.15));
    this.graphicsQuality = ['performance','balanced','high'].includes(saved.graphicsQuality) ? saved.graphicsQuality : 'balanced';
    this.fieldOfView = Math.max(50, Math.min(110, Number(saved.fieldOfView) || 70));\n    this.simulationDistance = Math.max(2, Math.min(12, Number(saved.simulationDistance) || 6));\n    this.mobSimulationEnabled = saved.mobSimulationEnabled !== false;\n    this.particlesMode = ['all','reduced','off'].includes(saved.particlesMode) ? saved.particlesMode : 'all';
    document.getElementById('setting-distance').value = this.renderDistance;
    document.getElementById('setting-distance-value').textContent = this.renderDistance + ' чанков';
    document.getElementById('setting-simulation-distance').value = this.simulationDistance;\n    document.getElementById('setting-simulation-distance-value').textContent = this.simulationDistance + ' чанков';\n    document.getElementById('setting-simulation').checked = this.mobSimulationEnabled;\n    document.getElementById('setting-particles').value = this.particlesMode;\n    document.getElementById('setting-sensitivity').value = this.mouseSensitivity;
    document.getElementById('setting-quality').value = this.graphicsQuality;
    document.getElementById('setting-fov').value = this.fieldOfView;
    document.getElementById('setting-fov-value').textContent = this.fieldOfView + '°';
    this._saveSettings();
    this._resize?.();
  },

  _buildKeybindSettings() {
    const panel = document.querySelector('#settings-screen .panel');
    if (!panel) return;
    let section = document.getElementById('keybind-settings');
    if (!section) {
      section = document.createElement('section');
      section.id = 'keybind-settings';
      section.innerHTML = '<h2>Управление</h2><div class="keybind-list"></div><button id="btn-reset-keybinds" class="secondary" type="button">Сбросить клавиши</button><p class="sub">Нажми на клавишу действия, затем нажми новую клавишу. Esc отменяет переназначение.</p>';
      const back = document.getElementById('btn-settings-back');
      panel.insertBefore(section, back);
      section.querySelector('#btn-reset-keybinds').addEventListener('click', () => {
        resetKeys();
        this._buildKeybindSettings();
        this.ui.toast('Управление сброшено');
      });
    }
    const list = section.querySelector('.keybind-list');
    list.replaceChildren();
    for (const row of actionRows()) {
      const line = document.createElement('div');
      line.className = 'settings-row keybind-row';
      const label = document.createElement('span');
      label.textContent = row.label;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary keybind-button';
      button.textContent = this._rebindingAction === row.action ? 'Нажми клавишу…' : keyLabel(row.code);
      button.setAttribute('aria-label', 'Назначить клавишу: ' + row.label);
      button.addEventListener('click', () => {
        this._rebindingAction = row.action;
        this._buildKeybindSettings();
      });
      line.append(label, button);
      list.append(line);
    }
  },

  _saveSettings() {
    try {
      localStorage.setItem('voxel-game-settings', JSON.stringify({
        renderDistance: this.renderDistance,
        mouseSensitivity: this.mouseSensitivity,
        graphicsQuality: this.graphicsQuality,
        fieldOfView: this.fieldOfView,\n        simulationDistance: this.simulationDistance,\n        mobSimulationEnabled: this.mobSimulationEnabled,\n        particlesMode: this.particlesMode,
      }));
    } catch {}
  },

  _openSettings() {
    this._loadSettings();
    this._buildKeybindSettings();
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
    for (const dim of ['mc:overworld','mc:the_nether','mc:the_end']) {
      const chunks = await storage.getAllChunks(world.id, dim);
      if (chunks.length) await storage.putChunks(id, dim, chunks.map((chunk) => {
        const parts = chunk.key.split(',').map(Number);
        return { cx: parts[0], cz: parts[1], bytes: chunk.bytes };
      }));
    }
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
    const player = await storage.getPlayer(meta.id, 'local');
    const dimensions = {};
    for (const dim of ['mc:overworld','mc:the_nether','mc:the_end']) {
      const records = await storage.getAllChunks(meta.id, dim);
      const chunks = {};
      for (const record of records) chunks[record.key] = record.bytes;
      dimensions[dim] = { encodedChunks: chunks };
    }

    const save = buildSave(
      { name: meta.name, seed: meta.seed, generatorVersion: meta.generatorVersion,
        time: meta.time ?? 0, createdWith: meta.createdWith, dimension: meta.dimension ?? 'overworld' },
      player ? { local: player } : {},
      dimensions,
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
      dimension: ['overworld','nether','end'].includes(level.dimension) ? level.dimension : 'overworld',
      createdWith: level.createdWith ?? result.fromVersion,
    });

    for (const dimId of ['mc:overworld','mc:the_nether','mc:the_end']) {
      const dim = result.save.dimensions?.[dimId];
      if (!dim?.liveChunks) continue;
      const entries = [];
      for (const [, chunk] of dim.liveChunks) {
        entries.push({ cx: chunk.cx, cz: chunk.cz, bytes: encodeChunk(chunk) });
      }
      await storage.putChunks(meta.id, dimId, entries);
    }

    const player = Object.values(result.save.players ?? {})[0];
    if (player) await storage.putPlayer(meta.id, 'local', player);

    this.ui.toast(result.summary, { duration: 9000 });
    await this._showWorldList();
  },
};
