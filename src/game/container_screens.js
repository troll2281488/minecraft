/**
 * Chest and furnace screens (Java 1.12.2). A prototype mixin, applied to Game in main.js.
 *
 * The screen is built in code as an overlay, so no index.html markup is needed. Logic
 * lives in game/containers.js. Local contents are saved with the player record; online
 * container snapshots are shared through the room's Firebase state. Breaking a container
 * drops its contents in survival.
 *
 * Clicks: left click takes, swaps or merges with the cursor; right click takes half or
 * puts down one; shift-click moves a stack between the player's inventory and the container.
 */
import { Chest, Furnace, SMELTING, SMELT_TICKS, serializeContainer, deserializeContainer } from './containers.js';
import { ItemStack } from '../world/item.js';
import { positionalRandom } from '../core/rng.js';
import { mineshaftPlan, dungeonDims } from '../world/gen/structures.js';
import { hash01 } from '../world/gen/hash.js';
import { TerrainGenerator, BIOME, dungeonCandidateForCell, villageCandidateForCell, mineshaftCandidateForCell, desertTempleCandidateForCell, jungleTempleCandidateForCell, strongholdCandidateForCell } from '../world/gen/terrain.js';

const OVERLAY_ID = 'container-overlay';

const STYLE = `
#${OVERLAY_ID} { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex;
  align-items:center; justify-content:center; z-index:50; font-family:system-ui,sans-serif; }
#${OVERLAY_ID} .panel { position:relative; isolation:isolate; background:#c6c6c6; border:3px solid #000; padding:12px; color:#222; width:max-content; max-width:calc(100vw - 24px); box-sizing:border-box; box-shadow:0 12px 36px rgba(0,0,0,.5); }
#${OVERLAY_ID} .panel::before { content:none; display:none; background-image:none; }
#${OVERLAY_ID} h3 { margin:0 0 8px; font-size:16px; color:#222; text-shadow:1px 1px rgba(255,255,255,.45); }
#${OVERLAY_ID} .row { display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
#${OVERLAY_ID} .slot-group { display:flex; flex-direction:column; gap:4px; font-size:11px; color:#333; }
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

export function generatedChestKind(seed, x, y, z) {
  if (seed === undefined || seed === null) return null;

  // Dungeon rooms always have the north-west chest; a second diagonal chest
  // is added by the same seeded roll used by placeDungeonRoom. Recognize both
  // exact coordinates so either chest receives its own deterministic loot.
  for (let gx = Math.floor((x - 64) / 80); gx <= Math.floor(x / 80); gx++) {
    for (let gz = Math.floor((z - 64) / 80); gz <= Math.floor(z / 80); gz++) {
      const room = dungeonCandidateForCell(seed, gx, gz);
      if (!room || y !== room.y + 1) continue;
      const firstChest = x === room.x + 1 && z === room.z + 1;
      const roomRng = positionalRandom(seed, room.x, 7301, room.z, 7301);
      const hasSecondChest = roomRng.nextBoolean();
      const { ix, iz } = dungeonDims(room);
      const secondChest = hasSecondChest && x === room.x + ix && z === room.z + iz;
      if (firstChest || secondChest) return 'dungeon';
    }
  }

  // Structure loot is attached only to deterministic generated chest
  // coordinates. Ordinary player-placed chests never receive random contents.
  const generator = new TerrainGenerator(seed);

  // Minecart-free mineshaft corridor chests are placed at the end of selected
  // dead-end branches by the same deterministic planner used by terrain gen.
  for (let gx = Math.floor((x - 192) / 96); gx <= Math.floor((x + 192) / 96); gx++) {
    for (let gz = Math.floor((z - 192) / 96); gz <= Math.floor((z + 192) / 96); gz++) {
      const shaft = mineshaftCandidateForCell(seed, gx, gz);
      if (!shaft) continue;
      const plan = mineshaftPlan(seed, shaft);
      for (const piece of plan.pieces) {
        if (piece.kind !== 'corridor') continue;
        const deadEndChest = piece.deadEnd && piece.chest;
        const bonusChest = !piece.deadEnd && piece.length > 24 &&
          hash01(plan.seedHash, piece.sx, piece.y, piece.sz, 7117) < 0.035;
        if (!deadEndChest && !bonusChest) continue;
        const [dx, dz] = [[1,0],[-1,0],[0,1],[0,-1]][piece.d];
        const along = deadEndChest ? piece.length - 1 : (piece.length >> 1);
        if (x === piece.sx + dx * along &&
            y === piece.y + 1 &&
            z === piece.sz + dz * along) return 'mineshaft';
      }
    }
  }
  for (let gx = Math.floor((x - 140) / 128); gx <= Math.floor(x / 128); gx++) {
    for (let gz = Math.floor((z - 140) / 128); gz <= Math.floor(z / 128); gz++) {
      const village = villageCandidateForCell(seed, gx, gz);
      if (!village) continue;
      const site = generator.validateVillageSite(village.x, village.z);
      if (site && x === village.x + 5 && y === site.y + 1 && z === village.z + 5) return 'village';
    }
  }

  for (let gx = Math.floor((x - 256) / 256); gx <= Math.floor(x / 256); gx++) {
    for (let gz = Math.floor((z - 256) / 256); gz <= Math.floor(z / 256); gz++) {
      const desert = desertTempleCandidateForCell(seed, gx, gz);
      if (desert) {
        const site = generator.validateStructureSite(desert.x, desert.z, 10, [BIOME.DESERT, BIOME.DESERT_HILLS], 4.5);
        if (site && y === site.y + 2 && Math.abs(x - desert.x) === 3 && Math.abs(z - desert.z) === 3) return 'desert_temple';
      }
      const jungle = jungleTempleCandidateForCell(seed, gx, gz);
      if (jungle) {
        const site = generator.validateStructureSite(jungle.x, jungle.z, 7, [BIOME.JUNGLE, BIOME.JUNGLE_HILLS, BIOME.JUNGLE_EDGE, BIOME.BAMBOO_JUNGLE], 4.5);
        if (site && y === site.y + 2 &&
            ((x === jungle.x + 2 && z === jungle.z + 2) || (x === jungle.x + 10 && z === jungle.z + 10))) return 'jungle_temple';
      }
    }
  }

  for (let gx = Math.floor((x - 512) / 512); gx <= Math.floor(x / 512); gx++) {
    for (let gz = Math.floor((z - 512) / 512); gz <= Math.floor(z / 512); gz++) {
      const stronghold = strongholdCandidateForCell(seed, gx, gz);
      if (stronghold && x === stronghold.x + 2 && y === stronghold.y + 1 && z === stronghold.z + 2) return 'stronghold';
    }
  }
  return null;
}

// Java 1.19 simple_dungeon loot table, represented as three independent pools.
// The book entry remains a plain book until enchantment data is implemented.
export const DUNGEON_LOOT_POOLS = Object.freeze([
  {
    rolls: [1, 3],
    entries: [
      ['mc:saddle', 20, 1, 1],
      ['mc:golden_apple', 15, 1, 1],
      ['mc:enchanted_golden_apple', 2, 1, 1],
      ['mc:music_disc_otherside', 2, 1, 1],
      ['mc:music_disc_13', 15, 1, 1],
      ['mc:music_disc_cat', 15, 1, 1],
      ['mc:name_tag', 20, 1, 1],
      ['mc:golden_horse_armor', 10, 1, 1],
      ['mc:iron_horse_armor', 15, 1, 1],
      ['mc:diamond_horse_armor', 5, 1, 1],
      ['mc:enchanted_book', 10, 1, 1],
    ],
  },
  {
    rolls: [1, 4],
    entries: [
      ['mc:iron_ingot', 10, 1, 4],
      ['mc:gold_ingot', 5, 1, 1],
      ['mc:bread', 20, 1, 1],
      ['mc:wheat', 20, 1, 4],
      ['mc:bucket', 10, 1, 1],
      ['mc:redstone', 15, 1, 4],
      ['mc:coal', 15, 1, 4],
      ['mc:melon_seeds', 10, 2, 4],
      ['mc:pumpkin_seeds', 10, 2, 4],
      ['mc:beetroot_seeds', 10, 2, 4],
    ],
  },
  {
    rolls: 3,
    entries: [
      ['mc:bone', 10, 1, 8],
      ['mc:gunpowder', 10, 1, 8],
      ['mc:rotten_flesh', 10, 1, 8],
      ['mc:string', 10, 1, 8],
    ],
  },
]);

export function chooseWeightedLootEntry(entries, rng) {
  if (!Array.isArray(entries) || entries.length === 0 || !rng?.nextInt) return null;
  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, entry[1] | 0), 0);
  if (totalWeight <= 0) return null;
  let roll = rng.nextInt(totalWeight);
  for (const entry of entries) {
    roll -= Math.max(0, entry[1] | 0);
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

/** Spread generated loot across chest slots with a coordinate-seeded shuffle. */
export function scatterGeneratedChestLoot(seed, x, y, z, chest, kind = 'dungeon') {
  if (!chest || !Array.isArray(chest.slots)) return;
  const stacks = chest.slots.filter((stack) => stack && !stack.isEmpty);
  const slotOrder = Array.from({ length: chest.slots.length }, (_, i) => i);
  const salt = 0x534c4f54 + (kind === 'dungeon' ? 0 : kind === 'village' ? 1 : kind === 'stronghold' ? 2 : kind === 'mineshaft' ? 3 : 4);
  const rng = positionalRandom(seed, x, y, z, salt);
  for (let i = slotOrder.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [slotOrder[i], slotOrder[j]] = [slotOrder[j], slotOrder[i]];
  }
  chest.slots = Array.from({ length: chest.slots.length }, () => ItemStack.EMPTY.clone());
  stacks.forEach((stack, i) => {
    if (i < slotOrder.length) chest.slots[slotOrder[i]] = stack;
  });
}

function fillDungeonChest(seed, x, y, z, chest) {
  const rng = positionalRandom(seed, x, y, z, 3301);
  for (const pool of DUNGEON_LOOT_POOLS) {
    const rolls = Array.isArray(pool.rolls)
      ? pool.rolls[0] + rng.nextInt(pool.rolls[1] - pool.rolls[0] + 1)
      : pool.rolls;
    for (let i = 0; i < rolls; i++) {
      const entry = chooseWeightedLootEntry(pool.entries, rng);
      if (!entry) continue;
      const [id, , minCount, maxCount] = entry;
      const count = minCount + rng.nextInt(maxCount - minCount + 1);
      chest.insert(ItemStack.of(id, count));
    }
  }
}

export function fillGeneratedChest(seed, x, y, z, chest, kind) {
  if (kind === 'dungeon') {
    fillDungeonChest(seed, x, y, z, chest);
    scatterGeneratedChestLoot(seed, x, y, z, chest, kind);
    return;
  }
  const salt = kind === 'dungeon' ? 3301 : kind === 'village' ? 3302 : kind === 'stronghold' ? 3304 : kind === 'mineshaft' ? 3305 : 3303;
  const rng = positionalRandom(seed, x, y, z, salt);
  const villageLoot = [
    ['mc:bread', 2, 5], ['mc:apple', 1, 3], ['mc:wheat_seeds', 2, 6],
    ['mc:stick', 2, 6], ['mc:iron_ingot', 1, 2], ['mc:gold_nugget', 2, 5],
    ['mc:leather', 1, 3], ['mc:coal', 2, 5], ['mc:paper', 1, 4],
    ['mc:saddle', 1, 1], ['mc:iron_horse_armor', 1, 1],
  ];
  const dungeonLoot = [
    ['mc:bread', 1, 4], ['mc:iron_ingot', 1, 4], ['mc:gold_ingot', 1, 3],
    ['mc:coal', 2, 7], ['mc:string', 2, 6], ['mc:bone', 1, 5],
    ['mc:diamond', 1, 2], ['mc:emerald', 1, 2], ['mc:apple', 1, 3], ['mc:paper', 1, 4],
    ['mc:iron_pickaxe', 1, 1], ['mc:gold_nugget', 2, 7],
  ];
  const templeLoot = [
    ['mc:bread', 1, 4], ['mc:apple', 1, 3], ['mc:iron_ingot', 1, 4],
    ['mc:gold_ingot', 1, 4], ['mc:gold_nugget', 3, 9], ['mc:emerald', 1, 3],
    ['mc:diamond', 1, 2], ['mc:coal', 2, 6], ['mc:bone', 1, 4],
    ['mc:string', 2, 5], ['mc:wheat_seeds', 2, 6],
  ];
  const strongholdLoot = [
    ['mc:bread', 1, 4], ['mc:apple', 1, 3], ['mc:iron_ingot', 1, 4],
    ['mc:gold_ingot', 1, 3], ['mc:emerald', 1, 2], ['mc:diamond', 1, 2],
    ['mc:coal', 2, 6], ['mc:lapis_lazuli', 1, 4], ['mc:redstone', 2, 6],
  ];
  const mineshaftLoot = [
    ['mc:iron_ingot', 2, 6], ['mc:gold_ingot', 1, 3], ['mc:gold_nugget', 3, 9],
    ['mc:coal', 4, 12], ['mc:diamond', 1, 2], ['mc:emerald', 1, 2],
    ['mc:lapis_lazuli', 2, 6], ['mc:redstone', 3, 8], ['mc:bread', 1, 4],
    ['mc:apple', 1, 3], ['mc:iron_pickaxe', 1, 1], ['mc:stick', 2, 8],
    ['mc:string', 2, 8], ['mc:bone', 1, 4],
  ];
  const pool = kind === 'village' ? villageLoot
    : kind === 'dungeon' ? dungeonLoot
    : kind === 'stronghold' ? strongholdLoot
    : kind === 'mineshaft' ? mineshaftLoot : templeLoot;
  const rolls = kind === 'village' ? 5 + rng.nextInt(3)
    : kind === 'stronghold' ? 5 + rng.nextInt(3)
    : kind === 'mineshaft' ? 8 + rng.nextInt(5) : 6 + rng.nextInt(4);
  for (let i = 0; i < rolls; i++) {
    const [id, min, max] = pool[rng.nextInt(pool.length)];
    chest.insert(ItemStack.of(id, min + rng.nextInt(max - min + 1)));
  }
  scatterGeneratedChestLoot(seed, x, y, z, chest, kind);
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
    const entry = this._containers.get(key);
    const validChest = entry?.type === 'chest' && entry.data instanceof Chest &&
      Array.isArray(entry.data.slots) && entry.data.slots.length === 27;
    if (!validChest) {
      const chest = new Chest();
      try {
        const seed = this.world?.seed;
        const kind = generatedChestKind(seed, x, y, z);
        if (kind && seed !== undefined && seed !== null) fillGeneratedChest(seed, x, y, z, chest, kind);
      } catch (error) {
        // A loot-table problem must never prevent the chest interface opening.
        console.error('[chest] Could not generate structure loot:', error);
      }
      this._containers.set(key, { type: 'chest', data: chest });
    }
    return this._containers.get(key).data;
  },

  _furnaceAt(x, y, z) {
    this._containers ??= new Map();
    const key = this._containerKey(x, y, z);
    const entry = this._containers.get(key);
    if (entry?.type !== 'furnace' || !(entry.data instanceof Furnace)) {
      this._containers.set(key, { type: 'furnace', data: new Furnace() });
    }
    return this._containers.get(key).data;
  },

  _openChest(x, y, z) {
    const key = this._containerKey(x, y, z);
    this._openContainer({ title: 'Сундук', slots: this._chestAt(x, y, z).slots, kind: 'chest', key });
  },

  _openFurnace(x, y, z) {
    const furnace = this._furnaceAt(x, y, z);
    this._openContainer({ title: 'Печь', furnace, kind: 'furnace', key: this._containerKey(x, y, z), x, y, z });
  },

  /** Advance every furnace that exists in the world. Called from the fixed tick. */
  _tickFurnaces() {
    if (!this._containers) return;
    // One deterministic room host advances online furnaces; otherwise every
    // client would simulate and publish competing copies of the same timers.
    if (this.multiplayer?.roomId && !this.multiplayer.isHost) return;
    for (const [key, { type, data }] of this._containers) {
      if (type !== 'furnace') continue;
      // If a non-host player owns the advisory edit lease, pause host writes
      // until that screen closes so the furnace snapshot cannot overwrite it.
      if (this.multiplayer?.isContainerLockedByOther?.(key)) continue;
      data.tick();
      if (this.multiplayer?.roomId && this.tickCount % 20 === 0) {
        this.multiplayer.pushContainerState(key, type, data);
      }
    }
  },

  _openContainer(spec) {
    ensureStyle();
    this._closeContainer();
    this._activeContainer = spec;
    spec.lockState = this.multiplayer?.roomId ? 'pending' : 'local';
    this.inventoryOpen = true;
    document.exitPointerLock?.();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.dataset.kind = spec.kind;
    document.body.appendChild(overlay);
    this._renderContainer();
    this._containerTimer = setInterval(() => this._renderContainer(), 250);
    if (this.multiplayer?.roomId) {
      const active = spec;
      this.multiplayer.acquireContainerLock?.(spec.key).then((result) => {
        if (this._activeContainer !== active) {
          if (result?.ok && result.token) void this.multiplayer.releaseContainerLock?.(active.key, result.token);
          return;
        }
        if (result?.ok) {
          active.lockState = 'owned';
          active.lockToken = result.token || null;
          if (result.token) this._containerLockTimer = setInterval(async () => {
            const renewed = await this.multiplayer.renewContainerLock?.(active.key, active.lockToken);
            if (!renewed && this._activeContainer === active) {
              active.lockState = 'lost';
              clearInterval(this._containerLockTimer);
              this._renderContainer();
              this.ui?.toast?.('Блокировка контейнера потеряна. Изменения остановлены.', { error: true });
            }
          }, 5000);
        } else {
          active.lockState = result?.offline ? 'offline' : 'busy';
          active.lockOwner = result?.owner || '';
          this.ui?.toast?.(result?.offline ? 'Нет соединения: подключись, чтобы редактировать общий контейнер.' : 'Контейнер уже редактирует другой игрок.', { error: true });
        }
        this._renderContainer();
      }).catch((error) => {
        if (this._activeContainer !== active) return;
        active.lockState = 'offline';
        this._renderContainer();
        console.warn('[container] lock acquisition failed:', error);
      });
    }
    // Handle both mouse buttons on pointer-down so slot transfers are immediate
    // and do not depend on a synthetic click surviving the UI re-render.
    overlay.onpointerdown = (e) => {
      const el = e.target.closest?.('[data-kind][data-index]');
      if (!el) return;
      e.preventDefault();
      this._onContainerClick(el.dataset.kind, Number(el.dataset.index), e.button ?? 0, e.shiftKey);
    };
    overlay.oncontextmenu = (e) => e.preventDefault();
    // E is the inventory key in-game; while a container is open it must close
    // that container instead of trying to close the personal inventory.
  },

  _closeContainer() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
    clearInterval(this._containerTimer);
    clearInterval(this._containerLockTimer);
    const active = this._activeContainer;
    this._containerReleasePromise = active?.lockToken
      ? this.multiplayer?.releaseContainerLock?.(active.key, active.lockToken) || Promise.resolve(false)
      : Promise.resolve(false);
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
      body += `<h3>${spec.title}</h3><div class="row slots-9">`;
      for (let i = 0; i < spec.slots.length; i++) body += this._slotHtml('chest', i, spec.slots[i]);
      body += '</div>';
    } else {
      const f = spec.furnace;
      const pct = f.cookProgress / SMELT_TICKS;
      const burn = f.burnTotal > 0 ? f.burnLeft / f.burnTotal : 0;
      body += `<h3>${spec.title}</h3>`;
      body += `<div class="row furnace-slots"><div class="slot-group"><span>Сырьё</span>${this._slotHtml('furnace-in', 0, f.input)}</div>`;
      body += `<div class="slot-group"><span>Результат</span>${this._slotHtml('furnace-out', 0, f.output)}</div></div>`;
      body += `<div class="bar"><div style="width:${Math.round(pct * 100)}%"></div></div>`;
      body += `<div class="row furnace-slots"><div class="slot-group"><span>Топливо</span>${this._slotHtml('furnace-fuel', 0, f.fuel)}</div>`;
      body += `<span class="hint">Горение: ${Math.round(burn * 100)}%</span></div>`;
    }
    body += '<h3>Инвентарь</h3><div class="row slots-9">';
    // Java order: 27 main-inventory slots, followed by the 9-slot hotbar.
    // Armour and offhand are omitted until this screen has dedicated slots.
    for (let i = 9; i <= 35; i++) body += this._slotHtml('inv', i, inv.slots[i]);
    body += '</div><div class="row slots-9">';
    for (let i = 0; i <= 8; i++) body += this._slotHtml('inv', i, inv.slots[i]);
    body += '</div>';
    if (spec.lockState === 'pending') body += '<div class="hint">Проверка блокировки контейнера…</div>';
    else if (spec.lockState === 'busy') body += '<div class="hint">Контейнер сейчас редактирует другой игрок.</div>';
    else if (spec.lockState === 'offline') body += '<div class="hint">Нет соединения — редактирование общего контейнера отключено.</div>';
    else if (spec.lockState === 'lost') body += '<div class="hint">Блокировка потеряна. Закрой и открой контейнер снова.</div>';
    else if (spec.lockState === 'owned') body += '<div class="hint">Контейнер закреплён за вами на время редактирования.</div>';
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
    if (['pending', 'busy', 'offline', 'lost'].includes(spec.lockState)) return;

    if (kind === 'inv') {
      if (shift && spec.kind === 'chest') {
        const stack = inv.slots[index];
        if (!stack.isEmpty && this._moveToChest(spec, stack)) {
          inv.slots[index] = ItemStack.EMPTY.clone();
        }
      } else if (shift && spec.kind === 'furnace') {
        const stack = inv.slots[index];
        if (!stack.isEmpty && this._moveToFurnace(spec, stack) && stack.count <= 0) {
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
      this._syncActiveContainer();
      return;
    }

    // Container side: resolve the target slot array and index.
    const target = this._containerSlot(spec, kind, index);
    if (!target) return;
    const { get, set } = target;
    if (shift) {
      const outputBefore = target.outputOnly ? target.get().count : 0;
      this._moveContainerSlotToInventory(target);
      if (target.outputOnly) this._claimFurnaceExperience(spec, outputBefore - target.get().count);
      inv.version++;
      this._renderContainer();
      this._syncActiveContainer();
      return;
    }
    const outputBefore = target.outputOnly ? target.get().count : 0;
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
    if (target.outputOnly) this._claimFurnaceExperience(spec, outputBefore - target.get().count);
    inv.version++;
    this._renderContainer();
    this._syncActiveContainer();
  },

  _claimFurnaceExperience(spec, removedCount) {
    if (removedCount <= 0 || !spec?.furnace) return;
    const points = spec.furnace.claimExperienceForOutput(removedCount);
    if (points <= 0) return;
    const whole = Math.floor(points);
    const awarded = whole + (Math.random() < points - whole ? 1 : 0);
    if (awarded > 0) this.entities?.spawnExperienceOrbs(awarded, (spec.x ?? 0) + 0.5, (spec.y ?? 64) + 0.5, (spec.z ?? 0) + 0.5);
  },

  _syncActiveContainer() {
    const spec = this._activeContainer;
    if (!spec?.key || !['local', 'owned'].includes(spec.lockState)) return;
    const entry = this._containers?.get(spec.key);
    if (entry) this.multiplayer?.pushContainerState(spec.key, entry.type, entry.data);
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

  /** Shift-transfer as much as possible from a container slot into player storage. */
  _moveContainerSlotToInventory(target) {
    const stack = target.get();
    if (stack.isEmpty) return false;
    const copy = stack.clone();
    const remainder = this.inventory.add(copy);
    const moved = stack.count - remainder;
    if (moved <= 0) return false;
    stack.count = remainder;
    target.set(remainder > 0 ? stack : ItemStack.EMPTY.clone());
    return true;
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

  /** Move a stack to the furnace input or fuel slot; preserve any remainder. */
  _moveToFurnace(spec, stack) {
    const furnace = spec.furnace;
    const key = SMELTING.has(stack.item.id) ? 'input' :
      stack.item.fuelTicks > 0 ? 'fuel' : null;
    if (!key) return false;
    const current = furnace[key];
    const capacity = current.isEmpty ? stack.maxStackSize :
      current.canStackWith(stack) ? current.maxStackSize - current.count : 0;
    const moved = Math.min(stack.count, Math.max(0, capacity));
    if (moved <= 0) return false;
    if (current.isEmpty) furnace[key] = ItemStack.of(stack.item.id, moved, stack.damage, stack.data);
    else current.count += moved;
    stack.count -= moved;
    return true;
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
