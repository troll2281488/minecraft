/**
 * Chest and furnace screens (Java 1.12.2). A prototype mixin, applied to Game in main.js.
 *
 * The screen is built in code as an overlay, so no index.html markup is needed. Logic
 * lives in game/containers.js. Contents are kept in memory per block position and are
 * not yet saved to the .mcw file. Breaking a container does not drop its contents yet.
 *
 * Clicks: left click takes, swaps or merges with the cursor; right click takes half or
 * puts down one; shift-click moves a stack between the player's inventory and the container.
 */
import { Chest, Furnace, SMELTING, SMELT_TICKS, serializeContainer, deserializeContainer } from './containers.js';
import { ItemStack } from '../world/item.js';

const OVERLAY_ID = 'container-overlay';

const STYLE = `
#${OVERLAY_ID} { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex;
  align-items:center; justify-content:center; z-index:50; font-family:system-ui,sans-serif; }
#${OVERLAY_ID} .panel { position:relative; isolation:isolate; background:#c6c6c6; border:3px solid #000; padding:12px; color:#222; width:max-content; max-width:calc(100vw - 24px); box-sizing:border-box; box-shadow:0 12px 36px rgba(0,0,0,.5); }
#${OVERLAY_ID} .panel::before { content:""; position:absolute; inset:0; z-index:-1; background-image:url("https://raw.githubusercontent.com/ItsBrian/minecraft-textures/main/gui/container/generic_54.png"); background-size:100% 100%; opacity:.42; pointer-events:none; }
#${OVERLAY_ID}[data-kind="furnace"] .panel::before { background-image:url("https://raw.githubusercontent.com/ItsBrian/minecraft-textures/main/gui/container/furnace.png"); opacity:.48; }
#${OVERLAY_ID} h3 { margin:0 0 8px; font-size:16px; color:#222; text-shadow:1px 1px rgba(255,255,255,.45); }
#${OVERLAY_ID} .row { display:flex; gap:4px; margin-bottom:8px; flex-wrap:wrap; }
#${OVERLAY_ID} .row.slots-9 { display:grid; grid-template-columns:repeat(9,40px); gap:4px; }
#${OVERLAY_ID} .slot { box-sizing:border-box; width:40px; height:40px; background:#8b8b8b; border:2px solid #373737; border-radius:0; display:flex; align-items:center; justify-content:center; font-size:11px; cursor:pointer; text-align:center; overflow:hidden; color:#fff; user-select:none; box-shadow:inset 2px 2px 0 rgba(0,0,0,.32),inset -2px -2px 0 rgba(255,255,255,.22); }
#${OVERLAY_ID} .slot.empty { background:#8b8b8b; }
#${OVERLAY_ID} .slot img { width:32px; height:32px; object-fit:contain; image-rendering:pixelated; }
#${OVERLAY_ID} .slot .n { position:absolute; right:2px; bottom:0; color:#fff; text-shadow:1px 1px #000; font-size:12px; pointer-events:none; }
#${OVERLAY_ID} .slot { position:relative; }
#${OVERLAY_ID} .bar { height:8px; background:#555; margin:6px 0; }
#${OVERLAY_ID} .bar > div { height:100%; background:#e8a53a; }
#${OVERLAY_ID} .hint { font-size:12px; color:#333; margin-top:6px; }
#${OVERLAY_ID} button { font:inherit; padding:4px 10px; margin-top:6px; }
@media(max-width:480px) { #${OVERLAY_ID} .row.slots-9 { grid-template-columns:repeat(9,minmax(0,1fr)); } #${OVERLAY_ID} .slot { width:100%; height:auto; aspect-ratio:1; } }
`;

function ensureStyle() {
  if (document.getElementById('container-style')) return;
  const s = document.createElement('style');
  s.id = 'container-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

function label(stack) {
  if (!stack || stack.isEmpty) return '';
  const name = stack.item.id.replace('mc:', '').replace(/_/g, ' ');
  return `${name}${stack.count > 1 ? ` <span class="n">${stack.count}</span>` : ''}`;
}

export const ContainerScreensMixin = {
  /** Export all placed chest/furnace inventories as save-file block entities. */
  _serializeContainers() {
    const records = [];
    for (const [key, entry] of this._containers ?? []) {
      const state = serializeContainer(entry.type, entry.data);
      if (state) records.push({ key, ...state });
    }
    return records;
  },

  /** Restore block-entity state after the player's save has been loaded. */
  _restoreContainers(records) {
    this._containers = new Map();
    if (!Array.isArray(records)) return;
    for (const record of records) {
      if (typeof record?.key !== 'string' || !/^-?\d+,-?\d+,-?\d+$/.test(record.key)) continue;
      const restored = deserializeContainer(record);
      if (restored) this._containers.set(record.key, restored);
    }
  },
  _containerKey(x, y, z) { return `${x},${y},${z}`; },

  /** Chest contents, created on first open. */
  _chestAt(x, y, z) {
    this._containers ??= new Map();
    const key = this._containerKey(x, y, z);
    if (!this._containers.has(key)) this._containers.set(key, { type: 'chest', data: new Chest() });
    return this._containers.get(key).data;
  },

  _furnaceAt(x, y, z) {
    this._containers ??= new Map();
    const key = this._containerKey(x, y, z);
    if (!this._containers.has(key)) this._containers.set(key, { type: 'furnace', data: new Furnace() });
    return this._containers.get(key).data;
  },

  _openChest(x, y, z) {
    this._openContainer({ title: 'Сундук', slots: this._chestAt(x, y, z).slots, kind: 'chest' });
  },

  _openFurnace(x, y, z) {
    const furnace = this._furnaceAt(x, y, z);
    this._openContainer({ title: 'Печь', furnace, kind: 'furnace' });
  },

  /** Advance every furnace that exists in the world. Called from the fixed tick. */
  _tickFurnaces() {
    if (!this._containers) return;
    for (const { type, data } of this._containers.values()) {
      if (type === 'furnace') data.tick();
    }
  },

  _openContainer(spec) {
    ensureStyle();
    this._closeContainer();
    this._activeContainer = spec;
    this.inventoryOpen = true;
    document.exitPointerLock?.();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.dataset.kind = spec.kind;
    document.body.appendChild(overlay);
    this._renderContainer();
    this._containerTimer = setInterval(() => this._renderContainer(), 250);
    overlay.onclick = (e) => {
      const el = e.target.closest?.('[data-kind]');
      if (!el) return;
      this._onContainerClick(el.dataset.kind, Number(el.dataset.index), e.button ?? 0, e.shiftKey);
    };
    overlay.oncontextmenu = (e) => e.preventDefault();
    overlay.onmousedown = (e) => {
      if (e.button === 2) {
        const el = e.target.closest?.('[data-kind]');
        if (el) this._onContainerClick(el.dataset.kind, Number(el.dataset.index), 2, false);
      }
    };
  },

  _closeContainer() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
    clearInterval(this._containerTimer);
    this._activeContainer = null;
    this.inventoryOpen = false;
    this._requestPointerLock?.();
  },

  _slotHtml(kind, index, stack) {
    if (!stack || stack.isEmpty) {
      return `<div class="slot empty" data-kind="${kind}" data-index="${index}"></div>`;
    }
    const icon = this.ui?.icons?.get(stack.item.id);
    const image = icon ? `<img src="${icon}" alt="" style="width:32px;height:32px;object-fit:contain;image-rendering:pixelated">` : '';
    const count = stack.count > 1 ? `<span class="n">${stack.count}</span>` : '';
    return `<div class="slot" data-kind="${kind}" data-index="${index}">${image}${count}</div>`;
  },

  _renderContainer() {
    const overlay = document.getElementById(OVERLAY_ID);
    const spec = this._activeContainer;
    if (!overlay || !spec) return;
    const inv = this.inventory;
    let body = '';
    if (spec.kind === 'chest') {
      body += `<h3>${spec.title}</h3><div class="row">`;
      for (let i = 0; i < spec.slots.length; i++) body += this._slotHtml('chest', i, spec.slots[i]);
      body += '</div>';
    } else {
      const f = spec.furnace;
      const pct = f.cookProgress / SMELT_TICKS;
      const burn = f.burnTotal > 0 ? f.burnLeft / f.burnTotal : 0;
      body += `<h3>${spec.title}</h3>`;
      body += `<div class="row">${this._slotHtml('furnace-in', 0, f.input)}`;
      body += `${this._slotHtml('furnace-out', 0, f.output)}</div>`;
      body += `<div class="bar"><div style="width:${Math.round(pct * 100)}%"></div></div>`;
      body += `<div class="row">${this._slotHtml('furnace-fuel', 0, f.fuel)}`;
      body += `<span class="hint">Топливо: ${Math.round(burn * 100)}%</span></div>`;
    }
    body += '<h3>Инвентарь</h3><div class="row slots-9">';
    // Java order: 27 main-inventory slots, followed by the 9-slot hotbar.
    // Armour and offhand are omitted until this screen has dedicated slots.
    for (let i = 9; i <= 35; i++) body += this._slotHtml('inv', i, inv.slots[i]);
    body += '</div><div class="row slots-9">';
    for (let i = 0; i <= 8; i++) body += this._slotHtml('inv', i, inv.slots[i]);
    body += '</div>';
    body += `<div class="hint">В курсоре: ${inv.cursor?.isEmpty ? 'пусто' : label(inv.cursor)}. Shift-клик переносит стак. Esc — закрыть.</div>`;
    body += '<button id="container-close">Закрыть</button>';
    overlay.innerHTML = `<div class="panel">${body}</div>`;
    overlay.querySelector('#container-close').onclick = () => this._closeContainer();
  },

  /** Take, swap, merge or put down between a slot and the cursor. Returns nothing. */
  _onContainerClick(kind, index, button, shift) {
    const inv = this.inventory;
    const spec = this._activeContainer;
    if (!spec) return;

    if (kind === 'inv') {
      if (shift && spec.kind === 'chest') {
        const stack = inv.slots[index];
        if (!stack.isEmpty && this._moveToChest(spec, stack)) {
          inv.slots[index] = ItemStack.EMPTY.clone();
        }
      } else if (shift) {
        inv.shiftClickSlot(index);
      } else if (button === 2) {
        inv.rightClickSlot(index);
      } else {
        inv.clickSlot(index);
      }
      inv.version++;
      this._renderContainer();
      return;
    }

    // Container side: resolve the target slot array and index.
    const target = this._containerSlot(spec, kind, index);
    if (!target) return;
    const { get, set } = target;
    const cursor = inv.cursor;
    if (target.outputOnly) {
      const output = get();
      if (!output.isEmpty && cursor.isEmpty) {
        const amount = button === 2 ? Math.ceil(output.count / 2) : output.count;
        inv.cursor = output.split(amount);
        set(output.count > 0 ? output : ItemStack.EMPTY.clone());
      } else if (!output.isEmpty && !cursor.isEmpty && cursor.canStackWith(output)) {
        const wanted = button === 2 ? 1 : output.count;
        const moved = Math.min(wanted, cursor.maxStackSize - cursor.count);
        cursor.count += moved;
        output.count -= moved;
        set(output.count > 0 ? output : ItemStack.EMPTY.clone());
      }
    } else if (!cursor.isEmpty && target.accepts && !target.accepts(cursor.item)) {
      return;
    } else {
      this._swapWithCursor(get(), set, button);
    }
    inv.version++;
    this._renderContainer();
  },

  _containerSlot(spec, kind, index) {
    if (kind === 'chest') {
      return { get: () => spec.slots[index], set: (v) => { spec.slots[index] = v; } };
    }
    const f = spec.furnace;
    if (kind === 'furnace-in') return {
      get: () => f.input, set: (v) => { f.input = v; },
      accepts: (item) => SMELTING.has(item.id),
    };
    if (kind === 'furnace-fuel') return {
      get: () => f.fuel, set: (v) => { f.fuel = v; },
      accepts: (item) => item.fuelTicks > 0,
    };
    if (kind === 'furnace-out') {
      // Output only ever gives items to the cursor; it never accepts them.
      return {
        get: () => f.output,
        set: (v) => { f.output = v; },
        outputOnly: true,
      };
    }
    return null;
  },

  _swapWithCursor(slotStack, set, button) {
    const inv = this.inventory;
    const cursor = inv.cursor;
    if (button === 2) {
      if (cursor.isEmpty && !slotStack.isEmpty) {
        inv.cursor = slotStack.split(Math.ceil(slotStack.count / 2));
        set(slotStack.count > 0 ? slotStack : ItemStack.EMPTY.clone());
      } else if (!cursor.isEmpty && (slotStack.isEmpty || slotStack.canStackWith(cursor))) {
        if (slotStack.isEmpty) set(cursor.split(1));
        else { slotStack.count++; cursor.count--; }
        if (cursor.count <= 0) inv.cursor = ItemStack.EMPTY.clone();
      }
      return;
    }
    if (cursor.isEmpty) {
      inv.cursor = slotStack;
      set(ItemStack.EMPTY.clone());
    } else if (slotStack.isEmpty) {
      set(cursor);
      inv.cursor = ItemStack.EMPTY.clone();
    } else if (slotStack.canStackWith(cursor)) {
      slotStack.mergeFrom(cursor);
      if (cursor.count <= 0) inv.cursor = ItemStack.EMPTY.clone();
    } else {
      set(cursor);
      inv.cursor = slotStack;
    }
  },

  /** Move as much of `stack` into the chest as fits. Returns true if all of it moved. */
  _moveToChest(spec, stack) {
    const chest = new Chest();
    chest.slots = spec.slots;
    const rest = chest.insert(stack.clone());
    stack.count = rest;
    return rest === 0;
  },
};
