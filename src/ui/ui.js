/**
 * DOM user interface: HUD, inventory, and screens.
 *
 * The GUI is HTML and CSS rather than geometry drawn into the canvas. For a
 * project with no build step this is a large practical win -- slot layout,
 * hover states, scrolling world lists, and text rendering are all things the
 * browser already does well, and reimplementing them against a WebGL context
 * would be a substantial amount of code that adds nothing to the game.
 *
 * The canvas keeps the world; the DOM keeps everything on top of it.
 */

import { SLOT } from '../game/inventory.js';
import { VILLAGER_CAREERS } from '../entity/villager_trades.js';
import { RECIPES } from '../game/recipes.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(iconCache) {
    this.icons = iconCache;

    this.screens = {
      title: $('title-screen'),
      settings: $('settings-screen'),
      multiplayer: $('mp-screen'),
      worlds: $('worlds-screen'),
      create: $('create-screen'),
      loading: $('loading-screen'),
      pause: $('pause-screen'),
      inventory: $('inventory-screen'),
      creative: $('creative-screen'),
      villagerTrade: $('villager-trade-screen'),
      error: $('error-screen'),
    };

    this.hud = $('hud');
    this.debug = $('debug');
    this.hotbar = $('hotbar');
    this.hotbarLabel = $('hotbar-label');
    this.toastEl = $('toast');
    this.cursorStack = $('cursor-stack');

    this._toastTimer = null;
    this._labelTimer = null;
    this._hotbarVersion = -1;
    this._invVersion = -1;

    this._buildHotbar();
    this._trackCursor();
  }

  // -- Screens ------------------------------------------------------------

  /** Show exactly one overlay, or none when passed null. */
  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      el.classList.toggle('hidden', key !== name);
    }
    this.current = name;
    // Keep the DOM overlay above the WebGL canvas and make the input target
    // unambiguous while any menu/dialog is open (including the title panorama).
    document.body.classList.toggle('menu-active', name !== null);
  }

  hideAllScreens() {
    for (const el of Object.values(this.screens)) el.classList.add('hidden');
    this.current = null;
    document.body.classList.remove('menu-active');
  }

  setHudVisible(visible) {
    this.hud.classList.toggle('hidden', !visible);
  }

  setLoadingProgress(fraction, detail) {
    $('loading-bar').firstElementChild.style.width = `${Math.round(fraction * 100)}%`;
    if (detail) $('loading-detail').textContent = detail;
  }

  // -- Toast --------------------------------------------------------------

  /**
   * A transient message. Used for save confirmations and import summaries --
   * anything the player should see but not have to dismiss.
   */
  toast(message, { error = false, duration = 4000 } = {}) {
    this.toastEl.textContent = message;
    this.toastEl.classList.toggle('error', error);
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), duration);
  }

  // -- Hotbar -------------------------------------------------------------

  _buildHotbar() {
    this.hotbar.innerHTML = '';
    this.hotbarSlots = [];
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      this.hotbar.appendChild(slot);
      this.hotbarSlots.push(slot);
    }
  }

  /** Redraw the hotbar, skipping the work entirely if nothing changed. */
  updateHotbar(inventory) {
    const stamp = inventory.version * 100 + inventory.selectedSlot;
    if (stamp === this._hotbarVersion) return;
    this._hotbarVersion = stamp;

    for (let i = 0; i < 9; i++) {
      const el = this.hotbarSlots[i];
      el.classList.toggle('selected', i === inventory.selectedSlot);
      this._paintSlot(el, inventory.get(i));
    }
  }

  /** Briefly name the selected item, as vanilla does when scrolling. */
  flashItemName(stack) {
    if (stack.isEmpty) {
      this.hotbarLabel.classList.remove('show');
      return;
    }
    this.hotbarLabel.textContent = prettyName(stack.item.id);
    this.hotbarLabel.classList.add('show');
    clearTimeout(this._labelTimer);
    this._labelTimer = setTimeout(() => this.hotbarLabel.classList.remove('show'), 1800);
  }

  _paintSlot(el, stack) {
    el.innerHTML = '';
    if (!stack || stack.isEmpty) return;

    const icon = this.icons.get(stack.item.id);
    if (icon) {
      const img = document.createElement('img');
      img.src = icon;
      img.alt = '';
      el.appendChild(img);
    }

    if (stack.count > 1) {
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = String(stack.count);
      el.appendChild(count);
    }

    if (stack.item.isDamageable && stack.damage > 0) {
      const remaining = 1 - stack.damage / stack.item.maxDamage;
      const bar = document.createElement('div');
      bar.className = 'durability';
      const fill = document.createElement('span');
      fill.style.width = `${remaining * 100}%`;
      // Green through yellow to red, so a nearly-broken tool is obvious at a
      // glance rather than needing the number read.
      fill.style.background = `hsl(${remaining * 120}, 85%, 45%)`;
      bar.appendChild(fill);
      el.appendChild(bar);
    }
  }

  // -- Inventory screen ---------------------------------------------------

  /**
   * @param {object} handlers  { onSlotClick(index, button, shift), onCraftClick(index, button, shift), onResultClick(button, shift) }
   */
  buildInventory(inventory, grid, handlers) {
    this.invHandlers = handlers;
    const screen = $('inventory-screen');

    const build = (container, count, indexOf, kind) => {
      container.innerHTML = '';
      const slots = [];
      for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'slot';
        const index = indexOf(i);
        el.oncontextmenu = (e) => e.preventDefault();
        el.onmousedown = (e) => {
          e.preventDefault();
          if (e.button === 2) {
            screen._rightDragActive = true;
            screen._rightDragSeen = new Set([kind + ':' + index]);
          }
          handlers.onClick(kind, index, e.button, e.shiftKey);
        };
        el.addEventListener('mouseenter', () => {
          if (!screen._rightDragActive) return;
          const key = kind + ':' + index;
          if (screen._rightDragSeen && screen._rightDragSeen.has(key)) return;
          screen._rightDragSeen?.add(key);
          handlers.onClick(kind, index, 2, false);
        });
        container.appendChild(el);
        slots.push(el);
      }
      return slots;
    };

    screen.oncontextmenu = (e) => e.preventDefault();
    if (!screen._rightDragReleaseBound) {
      document.addEventListener('mouseup', () => {
        screen._rightDragActive = false;
        screen._rightDragSeen = null;
      });
      screen._rightDragReleaseBound = true;
    }
    const dropOnEmpty = (e) => {
      if (e.target.closest?.('.slot, button, input, textarea, select')) return;
      e.preventDefault();
      e.stopPropagation();
      handlers.onDropCursor?.(e.button);
    };
    // Capture pointerdown on the whole inventory overlay. Empty panel space
    // is not a slot, so it drops the cursor stack before any child handler.
    // Keep one listener across inventory rebuilds.
    screen._dropEmptyPointerHandler = dropOnEmpty;
    if (!screen._dropEmptyPointerListener) {
      screen._dropEmptyPointerListener = (event) => screen._dropEmptyPointerHandler?.(event);
      screen.addEventListener('pointerdown', screen._dropEmptyPointerListener, true);
    }
    screen.onmousedown = null;
    this.invMainSlots = build($('inv-main'), 27, (i) => SLOT.MAIN_START + i, 'inventory');
    this.invHotbarSlots = build($('inv-hotbar'), 9, (i) => SLOT.HOTBAR_START + i, 'inventory');
    this.invArmorSlots = build($('inv-armor'), 4, (i) => SLOT.ARMOR_START + i, 'inventory');
    this.craftSlots = build($('craft-grid'), grid.size * grid.size, (i) => i, 'craft');
    this.resultSlots = build($('craft-result'), 1, () => 0, 'result');

    $('craft-grid').className = grid.size === 2 ? 'craft-grid-2' : 'craft-grid-3';
    const craftRow = screen.querySelector('.craft-row');
    if (craftRow && !craftRow.querySelector('#recipe-book-button')) {
      const book = document.createElement('button');
      book.id = 'recipe-book-button';
      book.type = 'button';
      book.textContent = 'Книга рецептов';
      book.style.cssText = 'width:auto;max-width:128px;padding:6px 8px;font-size:11px;margin:0 0 0 8px;white-space:normal;';
      book.onclick = () => this._showRecipeBook();
      craftRow.appendChild(book);
    }
    this._invVersion = -1;
  }

  _showRecipeBook() {
    document.getElementById('recipe-book-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'recipe-book-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:18px;';
    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(760px,96vw);max-height:86vh;overflow:auto;background:#20252d;color:#f1f3f5;border:2px solid #8a98aa;padding:16px;box-shadow:0 12px 40px #000;';
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;';
    const title = document.createElement('h2');
    title.textContent = 'Книга рецептов';
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = 'Закрыть'; close.style.cssText = 'width:auto;margin:0;';
    close.onclick = () => overlay.remove();
    header.append(title, close);
    panel.append(header);
    for (const recipe of RECIPES.recipes) {
      const entry = document.createElement('section');
      entry.style.cssText = 'padding:9px 10px;margin:7px 0;background:#303946;border:1px solid #536174;';
      const result = document.createElement('strong');
      result.textContent = prettyName(recipe.result) + ' ×' + (recipe.count ?? 1);
      const details = document.createElement('pre');
      details.style.cssText = 'white-space:pre-wrap;font:12px/1.5 monospace;color:#d0d8e2;margin-top:5px;';
      if (recipe.pattern) {
        const ingredients = Object.entries(recipe.key).map(([symbol, id]) => {
          const value = Array.isArray(id) ? id.map(prettyName).join(' / ') : prettyName(id);
          return symbol + ' = ' + value;
        }).join(String.fromCharCode(10));
        details.textContent = recipe.pattern.join(String.fromCharCode(10)) + String.fromCharCode(10) + ingredients;
      } else {
        const ingredients = recipe.ingredients.map((id) => Array.isArray(id) ? id.map(prettyName).join(' / ') : prettyName(id));
        details.textContent = 'Без формы: ' + ingredients.join(' + ');
      }
      entry.append(result, details);
      panel.append(entry);
    }
    overlay.append(panel);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
    document.body.append(overlay);
  }

  updateInventory(inventory, grid, force = false) {
    if (!force && inventory.version === this._invVersion) return;
    this._invVersion = inventory.version;

    this.invMainSlots.forEach((el, i) => this._paintSlot(el, inventory.get(SLOT.MAIN_START + i)));
    this.invHotbarSlots.forEach((el, i) => this._paintSlot(el, inventory.get(SLOT.HOTBAR_START + i)));
    this.invArmorSlots?.forEach((el, i) => this._paintSlot(el, inventory.get(SLOT.ARMOR_START + i)));
    this.craftSlots.forEach((el, i) => this._paintSlot(el, grid.get(i)));
    this._paintSlot(this.resultSlots[0], grid.result);

    this._paintCursor(inventory.cursor);
  }

  setInventoryTitle(title) {
    $('inventory-title').textContent = title;
  }

  // -- Creative inventory -------------------------------------------------

  /**
   * Build the creative item palette once.
   *
   * @param {Item[]} items       every creative-visible item
   * @param {object} handlers    { onPick(item, button), onHotbar(index, button, shift) }
   */
  buildCreativeInventory(items, handlers) {
    this.creativeItems = items;
    this.creativeHandlers = handlers;

    const panel = document.querySelector('#creative-screen .creative-panel');
    let tabs = $('creative-tabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.id = 'creative-tabs';
      tabs.className = 'creative-tabs';
      panel.insertBefore(tabs, $('creative-grid'));
    }
    const categories = [
      ['all','Все'], ['blocks','Блоки'], ['building','Строительство'],
      ['nature','Природа'], ['materials','Материалы'], ['tools','Инструменты'],
      ['combat','Боевые'], ['food','Еда'], ['misc','Разное'],
    ];
    tabs.innerHTML = '';
    for (const [id, label] of categories) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.className = id === 'all' ? 'active' : '';
      button.onclick = () => {
        tabs.querySelectorAll('button').forEach((el) => el.classList.toggle('active', el === button));
        this.filterCreativeCategory(id);
      };
      tabs.appendChild(button);
    }
    this.creativeCategory = 'all';
    const grid = $('creative-grid');
    grid.innerHTML = '';
    this.creativeSlots = [];
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'slot';
      const icon = this.icons.get(item.id);
      if (icon) {
        const img = document.createElement('img');
        img.src = icon;
        el.appendChild(img);
      }
      // Search matches both the pretty name and the raw id.
      el.dataset.name = `${prettyName(item.id)} ${item.id}`.toLowerCase();
      const id = item.id;
      el.dataset.category = item.armorSlot || item.tool ? (item.armorSlot || item.tool === 'sword' ? 'combat' : 'tools')
        : item.food ? 'food'
        : item.block ? (/(log|planks|stairs|slab|door|fence|wall|torch)/.test(id) ? 'building' : /(leaves|sapling|flower|grass|fern|mushroom)/.test(id) ? 'nature' : 'blocks')
        : /spawn_egg|bucket|boat|minecart/.test(id) ? 'misc' : 'materials';
      el.title = prettyName(item.id);
      el.oncontextmenu = (e) => e.preventDefault();
      el.onmousedown = (e) => { e.preventDefault(); handlers.onPick(item, e.button, e.shiftKey); };
      grid.appendChild(el);
      this.creativeSlots.push(el);
    }

    const hb = $('creative-hotbar');
    hb.innerHTML = '';
    this.creativeHotbarSlots = [];
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      const index = SLOT.HOTBAR_START + i;
      el.oncontextmenu = (e) => e.preventDefault();
      el.onmousedown = (e) => { e.preventDefault(); handlers.onHotbar(index, e.button, e.shiftKey); };
      hb.appendChild(el);
      this.creativeHotbarSlots.push(el);
    }

    let trash = $('creative-trash');
    if (!trash) {
      trash = document.createElement('button');
      trash.id = 'creative-trash';
      trash.type = 'button';
      trash.textContent = '×';
      trash.title = 'Удалить предмет из курсора';
      trash.setAttribute('aria-label', 'Удалить предмет');
      trash.className = 'creative-trash';
      trash.onmousedown = (e) => { e.preventDefault(); handlers.onTrash?.(); };
      panel.appendChild(trash);
    }

    const search = $('creative-search');
    search.value = '';
    search.oninput = () => this.filterCreative(search.value.trim().toLowerCase());
  }

  filterCreative(query) {
    for (const el of this.creativeSlots) {
      const categoryMatch = this.creativeCategory === 'all' || el.dataset.category === this.creativeCategory;
      el.style.display = categoryMatch && (!query || el.dataset.name.includes(query)) ? '' : 'none';
    }
  }

  filterCreativeCategory(category) {
    this.creativeCategory = category;
    this.filterCreative($('creative-search').value.trim().toLowerCase());
  }

  focusCreativeSearch() {
    // Deferred so the element is visible before focus, or the browser ignores it.
    requestAnimationFrame(() => $('creative-search').focus());
  }

  /**
   * Redraw the creative hotbar, skipping the work entirely if nothing changed.
   *
   * This was the only one of the three update* methods with no version gate, and
   * main.js calls it every frame while the creative screen is open -- so 9 slots
   * had their innerHTML cleared and fresh <img>/<span> nodes built 60+ times a
   * second for no reason. Same stamp shape as updateHotbar: the cursor is part of
   * the drawing, and it changes without inventory.version moving.
   */
  updateCreativeInventory(inventory) {
    const cursor = inventory.cursor;
    const cursorKey = (cursor && !cursor.isEmpty) ? `${cursor.item.id}:${cursor.count}` : '-';
    const stamp = `${inventory.version}:${inventory.selectedSlot}:${cursorKey}`;
    if (stamp === this._creativeVersion) return;
    this._creativeVersion = stamp;

    this.creativeHotbarSlots.forEach((el, i) => this._paintSlot(el, inventory.get(SLOT.HOTBAR_START + i)));
    this._paintCursor(inventory.cursor);
  }

  _paintCursor(stack) {
    if (!stack || stack.isEmpty) {
      this.cursorStack.classList.add('hidden');
      return;
    }
    this.cursorStack.classList.remove('hidden');
    this.cursorStack.innerHTML = '';
    const icon = this.icons.get(stack.item.id);
    if (icon) {
      const img = document.createElement('img');
      img.src = icon;
      this.cursorStack.appendChild(img);
    }
    if (stack.count > 1) {
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = String(stack.count);
      this.cursorStack.appendChild(count);
    }
  }

  _trackCursor() {
    // The held stack follows the pointer, so a drag reads as carrying something
    // rather than as the item teleporting between slots.
    window.addEventListener('mousemove', (e) => {
      this.cursorStack.style.left = `${e.clientX}px`;
      this.cursorStack.style.top = `${e.clientY}px`;
    });
  }

  // -- World list ---------------------------------------------------------

  renderWorldList(worlds, selectedId, onSelect) {
    const list = $('world-list');
    list.innerHTML = '';

    if (worlds.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'sub';
      empty.textContent = 'No worlds yet. Create one to get started.';
      list.appendChild(empty);
      return;
    }

    for (const world of worlds) {
      const entry = document.createElement('div');
      entry.className = 'world-entry' + (world.id === selectedId ? ' selected' : '');

      const name = document.createElement('div');
      name.textContent = world.name;

      const meta = document.createElement('div');
      meta.className = 'meta';
      const played = world.lastPlayed ? new Date(world.lastPlayed).toLocaleDateString() : 'never';
      meta.textContent = `seed ${world.seed ?? '?'} · ${played}`;

      const left = document.createElement('div');
      left.appendChild(name);
      left.appendChild(meta);
      entry.appendChild(left);

      entry.onclick = () => onSelect(world.id);
      list.appendChild(entry);
    }
  }

  // -- Villager trading ----------------------------------------------------

  openVillagerTrade(villager, offers, inventory, handlers) {
    const career = VILLAGER_CAREERS[villager?.villagerCareer] ?? VILLAGER_CAREERS.nitwit;
    const title = $('villager-trade-title');
    const subtitle = $('villager-trade-subtitle');
    const list = $('villager-trade-offers');
    title.textContent = career.label;
    subtitle.textContent = `Обменов совершено: ${villager?.villagerTradeCount ?? 0} · Открыто сделок: ${offers.length}`;
    list.replaceChildren();

    if (!offers.length) {
      const empty = document.createElement('p');
      empty.className = 'sub villager-trade-empty';
      empty.textContent = 'Этот житель пока не предлагает обменов.';
      list.appendChild(empty);
    }

    for (const entry of offers) {
      const row = document.createElement('div');
      row.className = 'villager-trade-row';
      const details = document.createElement('div');
      details.className = 'villager-trade-details';
      const input = document.createElement('span');
      input.textContent = `${entry.inputCount} × ${prettyName(entry.input)}`;
      details.appendChild(input);
      if (entry.input2) {
        const second = document.createElement('span');
        second.textContent = `+ ${entry.input2Count} × ${prettyName(entry.input2)}`;
        details.appendChild(second);
      }
      const arrow = document.createElement('span');
      arrow.className = 'villager-trade-arrow';
      arrow.textContent = '→';
      const output = document.createElement('strong');
      output.textContent = `${entry.outputCount} × ${prettyName(entry.output)}`;
      details.append(arrow, output);
      const button = document.createElement('button');
      button.type = 'button';
      const enough = inventory.countOf(entry.input) >= entry.inputCount &&
        (!entry.input2 || inventory.countOf(entry.input2) >= entry.input2Count);
      button.textContent = enough ? 'Обменять' : 'Не хватает';
      button.disabled = !enough || entry.disabled;
      button.onclick = () => handlers.onTrade(entry.id);
      row.append(details, button);
      list.appendChild(row);
    }
    $('villager-trade-close').onclick = handlers.onClose;
    this.showScreen('villagerTrade');
    this.setHudVisible(false);
  }

  closeVillagerTrade() {
    this.hideAllScreens();
    this.setHudVisible(true);
  }

  // -- Debug --------------------------------------------------------------

  setDebugVisible(visible) {
    this.debug.classList.toggle('hidden', !visible);
  }

  updateDebug(lines) {
    this.debug.textContent = lines.join('\n');
  }
}

/** "mc:oak_planks" -> "Oak Planks" */
export function prettyName(id) {
  return id
    .replace(/^[a-z0-9_]+:/, '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
