/**
 * Raw input: pointer lock, the keybind table, and the pause / resume / resize
 * handlers that sit alongside it.
 *
 * Extracted from main.js as a prototype mixin so the bodies move unchanged -- see
 * the note in main.js. The keys/mouseButtons Sets stay on Game, because the tick
 * loop polls them every tick; moving that state is a behaviour change, not a move.
 */

import { GAMEMODE } from '../entity/player.js';

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
      if (!locked && this.running && !this.paused && !this.inventoryOpen) this._pause();
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || !this.player) return;
      const sensitivity = 0.15;
      this.player.look(e.movementX * sensitivity, e.movementY * sensitivity);
    });

    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.mouseButtons.add(e.button);
      if (e.button === 2) this._useOrPlace();
      if (e.button === 1) this._pickBlock();
    });
    document.addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
      if (e.button === 0) this.mining.reset();
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('wheel', (e) => {
      if (!this.running || this.paused || this.inventoryOpen) return;
      const direction = Math.sign(e.deltaY);
      this.inventory.selectedSlot = (this.inventory.selectedSlot + direction + 9) % 9;
      this.ui.flashItemName(this.inventory.held);
    }, { passive: true });

    document.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));

    window.addEventListener('resize', () => this._resize());
    window.addEventListener('beforeunload', () => {
      // Best-effort: async work cannot be awaited here, but the synchronous
      // encode still queues the write in most browsers.
      if (this.running) this._save(false);
    });

    this._resize();
  },

  _onKeyDown(e) {
    if (e.repeat) return;
    this.keys.add(e.code);

    if (e.code === 'Escape') {
      if (this.inventoryOpen) this._closeInventory();
      else if (this.running && !this.paused) this._pause();
      else if (this.running && this.paused) this._resume();
      return;
    }

    if (!this.running || this.paused) return;

    if (e.code === 'KeyE') {
      e.preventDefault();
      if (this.inventoryOpen) this._closeInventory();
      else if (this.player.gamemode === GAMEMODE.CREATIVE) this._openCreativeInventory();
      else this._openInventory();
      return;
    }

    if (this.inventoryOpen) return;

    if (e.code === 'F3') {
      e.preventDefault();
      this.showDebug = !this.showDebug;
      this.ui.setDebugVisible(this.showDebug);
      return;
    }

    if (e.code === 'KeyF' && this.player.gamemode === GAMEMODE.CREATIVE) {
      this.player.flying = !this.player.flying;
      this.ui.toast(this.player.flying ? 'Flying enabled' : 'Flying disabled', { duration: 1500 });
      return;
    }

    if (e.code === 'KeyQ') {
      this.inventory.consumeHeld(1);
      return;
    }

    const digit = e.code.match(/^Digit([1-9])$/);
    if (digit) {
      this.inventory.selectedSlot = Number(digit[1]) - 1;
      this.ui.flashItemName(this.inventory.held);
    }
  },

  _requestPointerLock() {
    this.canvas.requestPointerLock?.();
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
    this._requestPointerLock();
    this.lastFrameTime = performance.now();
    this.accumulator = 0;
  },

  _toggleGamemode() {
    const creative = this.player.gamemode === GAMEMODE.CREATIVE;
    this.player.gamemode = creative ? GAMEMODE.SURVIVAL : GAMEMODE.CREATIVE;
    if (creative) this.player.flying = false;
    this.ui.toast(`Game mode: ${this.player.gamemode}`);
  },

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  },
};
