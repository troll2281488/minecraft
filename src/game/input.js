/**
 * Raw input: pointer lock, the keybind table, and the pause / resume / resize
 * handlers that sit alongside it.
 *
 * Extracted from main.js as a prototype mixin so the bodies move unchanged -- see
 * the note in main.js. The keys/mouseButtons Sets stay on Game, because the tick
 * loop polls them every tick; moving that state is a behaviour change, not a move.
 */

import { GAMEMODE } from '../entity/player.js';
import { ITEMS, ItemStack } from '../world/item.js';
import { BLOCKS, parseStateString } from '../world/block.js';
import { isAction, bindKey } from './keybinds.js';
import { findNearestStructure } from '../world/gen/terrain.js';

export const InputMixin = {
  _setupInput() {
    const canvas = this.canvas;

    canvas.addEventListener('click', () => {
      if (this.running && !this.paused && !this.inventoryOpen) this._requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      canvas.classList.toggle('locked', locked);
      // Losing the lock mid-game means the player pressed Escape, so pause
      // rather than leaving them unable to look around with no explanation.
      if (!locked && this.running && !this.paused && !this.inventoryOpen && !this.tradeOpen && !this.chatOpen) this._pause();
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || !this.player) return;
      const sensitivity = this.mouseSensitivity ?? 0.15;
      this.player.look(e.movementX * sensitivity, e.movementY * sensitivity);
    });

    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.mouseButtons.add(e.button);
      if (e.button === 0 && this.player) this.player.attackTime = 8;
      if (e.button === 2) this._useOrPlace();
      if (e.button === 1) this._pickBlock();
    });
    document.addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
      if (e.button === 0) this.mining.reset();
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('wheel', (e) => {
      // Ctrl+wheel and Cmd+wheel are browser zoom gestures. While the game is
      // active, consume them instead of letting the page resize the game UI.
      if (this.running && (e.ctrlKey || e.metaKey)) {
        if (!this.paused && !this.inventoryOpen && Math.sign(e.deltaY) !== 0) {
          this.inventory.selectedSlot = (this.inventory.selectedSlot + Math.sign(e.deltaY) + 9) % 9;
          this.ui.flashItemName(this.inventory.held);
          this.ui.updateHotbar(this.inventory);
        }
        e.preventDefault();
        return;
      }
      if (!this.running || this.paused || this.inventoryOpen) return;
      const direction = Math.sign(e.deltaY);
      if (direction === 0) return;
      this.inventory.selectedSlot = (this.inventory.selectedSlot + direction + 9) % 9;
      this.ui.flashItemName(this.inventory.held);
      e.preventDefault();
    }, { passive: false, capture: true });

    document.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));

    // Clear held inputs when the tab loses focus; otherwise keys can stick.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
      this.mining.reset();
    });

    // Ask for confirmation only when the browser is actually leaving/reloading
    // the active world. Modifier shortcuts by themselves never trigger this.
    window.addEventListener('beforeunload', (event) => {
      if (!this.running) return;
      event.preventDefault();
      event.returnValue = '';
    });

    window.addEventListener('resize', () => this._resize());
    this._resize();
  },

  _onKeyDown(e) {
    if (this._rebindingAction) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        this._rebindingAction = null;
        this._buildKeybindSettings();
        return;
      }
      if (e.code.startsWith('Mouse')) return;
      const action = this._rebindingAction;
      this._rebindingAction = null;
      bindKey(action, e.code);
      this._buildKeybindSettings();
      this.ui.toast('Клавиша управления изменена');
      return;
    }
    // Keep browser-level shortcuts and zoom gestures from hijacking gameplay.
    // Do this before the repeat guard so holding Ctrl cannot re-enable defaults.
    if (this.running && !this.chatOpen &&
        (((e.ctrlKey || e.metaKey) && e.code !== 'KeyW') ||
         e.code === 'F3' || e.code === 'F5' || e.code === 'F11' || e.code === 'F12')) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.repeat) return;
    this.keys.add(e.code);

    if (e.code === 'Escape') {
      if (this.tradeOpen) { this._closeVillagerTrade(); return; }
      if (this._activeContainer) this._closeContainer();
      else if (this.inventoryOpen) this._closeInventory();
      else if (this.running && !this.paused) this._pause();
      else if (this.running && this.paused) this._resume();
      return;
    }

    if (!this.running || this.paused) return;

    if (isAction(e.code, 'jump')) {
      e.preventDefault();
      if (this.player?.gamemode === GAMEMODE.CREATIVE) {
        const now = performance.now();
        if (this.lastCreativeJump && now - this.lastCreativeJump < 300) {
          this.player.flying = !this.player.flying;
          this.lastCreativeJump = 0;
          this.ui.toast(this.player.flying ? 'Полёт включён · Space вверх · Shift вниз' : 'Полёт выключен', { duration: 1800 });
        } else {
          this.lastCreativeJump = now;
        }
      }
    }

    if (isAction(e.code, 'inventory')) {
      e.preventDefault();
      if (this._activeContainer) this._closeContainer();
      else if (this.inventoryOpen) this._closeInventory();
      else if (this.player.gamemode === GAMEMODE.CREATIVE) this._openCreativeInventory();
      else this._openInventory();
      return;
    }

    if (this.inventoryOpen) return;

    if (isAction(e.code, 'chat') && !this.inventoryOpen) {
      e.preventDefault();
      const chat = document.getElementById('chat-entry');
      this.chatOpen = true;
      chat.classList.remove('hidden');
      document.exitPointerLock?.();
      chat.focus();
      return;
    }

    if (e.code === 'F3') {
      e.preventDefault();
      this.showDebug = !this.showDebug;
      this.ui.setDebugVisible(this.showDebug);
      return;
    }

    if (e.code === 'F5') {
      e.preventDefault();
      // Exact vanilla-style cycle, starting from first person:
      // first press = rear view, second = front view, third = first person.
      const currentMode = Number.isInteger(this.cameraMode) ? this.cameraMode : 2;
      this.cameraMode = (currentMode + 1) % 3;
      this.thirdPerson = this.cameraMode === 0 || this.cameraMode === 1;
      this.frontThirdPerson = this.cameraMode === 1;
      const cameraNames = ['Вид со спины', 'Вид спереди', 'От первого лица'];
      this.ui.toast(cameraNames[this.cameraMode], { duration: 1200 });
      return;
    }

    if (isAction(e.code, 'fly') && this.player.gamemode === GAMEMODE.CREATIVE) {
      this.player.flying = !this.player.flying;
      this.ui.toast(this.player.flying ? 'Flying enabled' : 'Flying disabled', { duration: 1500 });
      return;
    }

    if (isAction(e.code, 'drop')) {
      const held = this.inventory.held;
      if (!held.isEmpty) {
        const dropped = e.ctrlKey ? held.clone() : held.split(1);
        if (e.ctrlKey || held.isEmpty) this.inventory.set(this.inventory.selectedSlot, ItemStack.EMPTY.clone());
        else this.inventory.version++;
        this.entities?.dropStack(dropped);
        this.sounds?.play('drop');
        this.ui.updateHotbar(this.inventory);
      }
      e.preventDefault();
      return;
    }

    const digit = e.code.match(/^Digit([1-9])$/);
    if (digit) {
      this.inventory.selectedSlot = Number(digit[1]) - 1;
      this.ui.flashItemName(this.inventory.held);
    }
  },



  _runCommand(raw) {
    const cleaned = String(raw || '').trim();
    const args = (cleaned.startsWith('/') ? cleaned.slice(1) : cleaned).split(' ').filter(Boolean);
    const command = (args.shift() || '').toLowerCase();
    const reply = (message, error = false) => {
      this.multiplayer?.addChat(`[Команда] ${message}`);
      if (error) this.ui.toast(message, { error: true });
      else this.ui.toast(message, { duration: 2500 });
    };
    if (!command) return;
    if (command === 'help' || command === '?') {
      reply('Команды: /locate <структура> · /dimension overworld|nether|end · /gamemode creative|survival|spectator · /give <предмет> [кол-во] · /tp <игрок> или /tp <x> <y> <z> · /setblock <x> <y> <z> <блок> · /time set day|night · /time add <тики> · /heal · /fly · /spawn · /save · /seed · /whereami');
      return;
    }

    if (command === 'dimension' || command === 'dim') {
      const target = (args[0] || '').toLowerCase();
      if (!['overworld','nether','end'].includes(target)) {
        reply('Использование: /dimension overworld|nether|end', true); return;
      }
      this._switchDimension(target).catch((error) => reply('Не удалось сменить измерение: '+error.message,true));
      return;
    }
    if (command === 'locate') {
      const rawStructure=(args[0]||'').toLowerCase();
      const structure=rawStructure==='endcity'?'end_city':rawStructure==='desert_pyramid'?'desert_temple':rawStructure;
      if(!structure){reply('Использование: /locate village|mineshaft|dungeon|stronghold|desert_temple|jungle_temple|swamp_hut|igloo|mansion|monument|fossil|fortress|end_city',true);return;}
      const found=findNearestStructure(this.worldMeta?.seed ?? this.world.seed,this.world.dimension,structure,this.player.x,this.player.z,16000);
      if(!found){reply('Структура не найдена поблизости или недоступна в этом измерении.',true);return;}
      reply('Ближайшая '+structure+': X '+Math.floor(found.x)+' Y '+Math.floor(found.y??64)+' Z '+Math.floor(found.z)+' · '+Math.round(found.distance)+' блоков');
      return;
    }
    if (command === 'save') {
      this._save(true).then(() => reply('Мир сохранён')).catch((error) => reply(`Ошибка сохранения: ${error.message}`, true));
      return;
    }
    if (command === 'seed') {
      reply(`Ключ мира: ${this.worldMeta?.seed ?? 'неизвестен'}`);
      return;
    }
    if (command === 'whereami' || command === 'pos') {
      reply(`Координаты: X ${this.player.x.toFixed(1)} Y ${this.player.y.toFixed(1)} Z ${this.player.z.toFixed(1)}`);
      return;
    }
    if (command === 'spawn') {
      this._findSafeSpawn().then((spawn) => {
        this.player.teleport(spawn.x, spawn.y, spawn.z);
        reply('Телепортировано на безопасную точку появления');
      }).catch((error) => reply(error.message, true));
      return;
    }
    if (command === 'heal') {
      this.player.health = 20;
      this.player.vitals.food = 20;
      this.player.vitals.saturation = 5;
      this.player.air = 300;
      reply('Здоровье, голод и воздух восстановлены');
      return;
    }
    if (command === 'gamemode' || command === 'gm') {
      const mode = (args[0] || '').toLowerCase();
      const modes = { c: GAMEMODE.CREATIVE, creative: GAMEMODE.CREATIVE, s: GAMEMODE.SURVIVAL, survival: GAMEMODE.SURVIVAL, spectator: GAMEMODE.SPECTATOR, sp: GAMEMODE.SPECTATOR };
      if (!modes[mode]) { reply('Использование: /gamemode creative|survival|spectator', true); return; }
      this.player.gamemode = modes[mode];
      this.player.flying = this.player.gamemode === GAMEMODE.SPECTATOR;
      reply(`Режим игры: ${this.player.gamemode}`);
      return;
    }
    if (command === 'tp' || command === 'teleport') {
      // /tp <player> resolves a connected player in the current room.
      if (args.length === 1 && !Number.isFinite(Number(args[0]))) {
        const query = args[0].toLowerCase();
        const players = [...(this.multiplayer?.remotePlayers?.values() || [])];
        const target = query === '@p'
          ? players.sort((a, b) => Math.hypot(a.x - this.player.x, a.z - this.player.z) - Math.hypot(b.x - this.player.x, b.z - this.player.z))[0]
          : players.find((p) => p.name.toLowerCase() === query) ||
            players.find((p) => p.name.toLowerCase().includes(query));
        if (!target) {
          reply(`Игрок «${args[0]}» не найден в этой комнате. Проверь, что он подключён.`, true);
          return;
        }
        this.player.teleport(target.x, target.y, target.z);
        this.world.requestAround(this.player.x, this.player.z, this.renderDistance, 12);
        reply(`Телепортировано к игроку ${target.name}`);
        return;
      }
      const coords = args.slice(0, 3).map(Number);
      if (coords.length !== 3 || !coords.every(Number.isFinite) || Math.abs(coords[0]) > 30000000 || Math.abs(coords[2]) > 30000000 || coords[1] < -64 || coords[1] > 320) {
        reply('Использование: /tp <игрок> или /tp <x> <y> <z>', true); return;
      }
      this.player.teleport(coords[0] + 0.5, coords[1], coords[2] + 0.5);
      this.world.requestAround(this.player.x, this.player.z, this.renderDistance, 12);
      reply(`Телепорт: ${coords.join(' ')}`);
      return;
    }

    if (this.player.gamemode !== GAMEMODE.CREATIVE) {
      reply('Команды тестирования доступны в творческом режиме. Введи /gamemode creative.', true);
      return;
    }
    if (command === 'give' || command === 'i') {
      const rawId = (args[0] || '').toLowerCase();
      const id = rawId.includes(':') ? rawId : `mc:${rawId}`;
      const count = Math.max(1, Math.min(64, Number.parseInt(args[1] || '1', 10) || 1));
      if (!ITEMS.get(id)) { reply(`Неизвестный предмет: ${id}`, true); return; }
      const leftover = this.inventory.addItem(id, count);
      reply(`Выдано ${count - leftover}/${count}: ${id}${leftover ? ` (не поместилось: ${leftover})` : ''}`);
      return;
    }
    if (command === 'time') {
      const action = (args[0] || 'set').toLowerCase();
      if (action === 'add') {
        const amount = Number(args[1]);
        if (!Number.isFinite(amount) || amount < 0 || amount > 24000) { reply('Использование: /time add <0..24000>', true); return; }
        this.world.time = (this.world.time + Math.floor(amount)) % 24000;
        reply(`Время мира: ${this.world.time} тиков`);
        return;
      }
      const when = (action === 'set' ? args[1] : action || args[0] || '').toLowerCase();
      if (when !== 'day' && when !== 'night' && when !== 'noon' && when !== 'midnight') {
        reply('Использование: /time set day|noon|night|midnight или /time add <тики>', true); return;
      }
      this.world.time = ({ day: 1000, noon: 6000, night: 13000, midnight: 18000 })[when];
      reply(`Установлено время: ${when}`);
      return;
    }
    if (command === 'setblock') {
      const [sx, sy, sz, rawBlock] = args;
      const x = Number(sx), y = Number(sy), z = Number(sz);
      const id = String(rawBlock || '').includes(':') ? rawBlock : `mc:${rawBlock || ''}`;
      if (![x, y, z].every(Number.isInteger) || y < 0 || y > 255 || !BLOCKS.get(id)) {
        reply('Использование: /setblock <x> <y> <z> <блок>', true); return;
      }
      this.world.requestAround(x, z, this.renderDistance, 12);
      const state = BLOCKS.get(id).defaultState;
      if (!this.world.setBlock(x, y, z, state)) {
        reply('Чанк ещё не загружен или блок не изменился. Попробуй снова через секунду.', true); return;
      }
      this.multiplayer?.pushBlockChange(x, y, z, state);
      reply(`Установлен ${id} на ${x} ${y} ${z}`);
      return;
    }
    if (command === 'fly') {
      this.player.flying = !this.player.flying;
      reply(this.player.flying ? 'Полёт включён' : 'Полёт выключен');
      return;
    }
    reply(`Неизвестная команда: /${command}. Введи /help.`, true);
  },

  _requestPointerLock() {
    // Pointer Lock must be requested from a fresh user gesture. Browsers can
    // reject an immediate re-lock after Escape, so handle the rejection.
    if (!this.running || this.paused || this.inventoryOpen ||
        document.pointerLockElement === this.canvas) return;

    try {
      const request = this.canvas.requestPointerLock?.();
      if (request && typeof request.catch === 'function') {
        request.catch((error) => {
          // This is expected when the browser requires another click after Escape.
          if (error?.name !== 'SecurityError') {
            console.warn('Не удалось захватить курсор:', error);
          }
        });
      }
    } catch (error) {
      if (error?.name !== 'SecurityError') {
        console.warn('Не удалось захватить курсор:', error);
      }
    }
  },

  _pause() {
    this.paused = true;
    document.exitPointerLock?.();
    this.ui.showScreen('pause');
  },

  _resume() {
    this.paused = false;
    this.ui.hideAllScreens();
    this.ui.setHudVisible(true);
    // Do not request Pointer Lock here: after Escape browsers may reject
    // an immediate re-lock. The next click on the canvas acquires it.
    this.lastFrameTime = performance.now();
    this.accumulator = 0;
  },

  _toggleGamemode() {
    const modes = [GAMEMODE.SURVIVAL, GAMEMODE.CREATIVE, GAMEMODE.SPECTATOR];
    const index = modes.indexOf(this.player.gamemode);
    this.player.gamemode = modes[(index + 1) % modes.length];
    this.player.flying = this.player.gamemode === GAMEMODE.SPECTATOR;
    this.ui.toast(`Game mode: ${this.player.gamemode}`);
  },

  _resize() {
    const qualityScale = this.graphicsQuality === 'performance' ? 0.7 : this.graphicsQuality === 'high' ? 1 : 0.85;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * qualityScale;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  },
};
