/**
 * Resource packs: user-supplied PNG textures that replace the procedural ones.
 *
 * A pack is a set of 16x16 PNG files named after texture ids (stone.png,
 * grass_block_top.png, ...). Files are normalised to the tile size on import and
 * stored in localStorage as data URLs, so a pack survives reloads and never
 * leaves the browser. Filenames that do not match a known texture are skipped.
 *
 * Packs are applied at boot (buildTextures receives the decoded overrides), so
 * changing the pack reloads the page.
 */

import { TILE_SIZE, TEXTURES } from './atlas.js';

const STORAGE_KEY = 'mc-resource-pack';


const ITSBRIAN_RAW = 'https://raw.githubusercontent.com/ItsBrian/minecraft-textures/main/';

const BLOCK_TEXTURE_ALIASES = Object.freeze({
  // The game uses a few descriptive keys that differ from vanilla asset names.
  short_grass: 'grass',
  wheat_crop: 'wheat_stage7',
  water: 'water_still',
});

const ITEM_TEXTURE_ALIASES = Object.freeze({
  raw_beef: 'beef',
  raw_porkchop: 'porkchop',
  raw_chicken: 'chicken',
  raw_mutton: 'mutton',
  raw_cod: 'cod',
  raw_salmon: 'salmon',
});

const UI_TEXTURES = Object.freeze({
  widgets: 'gui/widgets.png',
  icons: 'gui/icons.png',
  inventory: 'gui/container/inventory.png',
  genericContainer: 'gui/container/generic_54.png',
  furnace: 'gui/container/furnace.png',
  craftingTable: 'gui/container/crafting_table.png',
  titleLogo: 'gui/title/minecraft.png',
  optionsBackground: 'gui/options_background.png',
});

async function fetchImage(path) {
  const response = await fetch(ITSBRIAN_RAW + path, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  return createImageBitmap(await response.blob());
}

function canvasFor(bitmap, width = TILE_SIZE, height = TILE_SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { canvas, ctx };
}

async function mapWithLimit(values, limit, task) {
  const out = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const i = next++;
      try { out[i] = await task(values[i]); } catch { out[i] = null; }
    }
  }));
  return out.filter(Boolean);
}

/** Load every matching block/item texture and the legacy HUD sprites used by this game. */
export async function loadItsBrianTextures(blocks, items) {
  const blockNames = new Set();
  for (const state of blocks.statesById) {
    const t = state.block.textures;
    if (t) {
      for (const name of [t.bottom, t.top, t.north, t.south, t.west, t.east, t.side, t.all]) {
        if (name) blockNames.add(name);
      }
    } else if (state.block.texture) blockNames.add(state.block.texture);
  }

  const blockEntries = await mapWithLimit([...blockNames], 24, async (name) => {
    const sourceName = BLOCK_TEXTURE_ALIASES[name] ?? name;
    // Chest textures live under entity/chest in the source pack, not block/.
    // Keep the procedural chest fallback until the renderer has a chest model/UVs.
    if (name === 'chest_side' || name === 'chest_top') return null;
    const bitmap = await fetchImage('block/' + encodeURIComponent(sourceName) + '.png');
    if (!bitmap) return null;
    const { ctx } = canvasFor(bitmap);
    const pixels = new Uint8Array(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
    bitmap.close();
    return [name, pixels];
  });

  const itemEntries = await mapWithLimit([...items.items.values()].filter((item) => !item.block), 24, async (item) => {
    const name = item.id.slice(item.id.indexOf(':') + 1);
    const sourceName = ITEM_TEXTURE_ALIASES[name] ?? name;
    const bitmap = await fetchImage('item/' + encodeURIComponent(sourceName) + '.png');
    if (!bitmap) return null;
    const { canvas } = canvasFor(bitmap);
    bitmap.close();
    return [item.id, canvas.toDataURL('image/png')];
  });

  const uiEntries = await Promise.all(Object.entries(UI_TEXTURES).map(async ([key, path]) => {
    try {
      const bitmap = await fetchImage(path);
      if (!bitmap) return null;
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      return [key, canvas.toDataURL('image/png')];
    } catch {
      return null;
    }
  }));

  const hud = {};
  try {
    const bitmap = await fetchImage('gui/icons.png');
    if (bitmap) {
      const crop = (key, sx, sy) => {
        const canvas = document.createElement('canvas');
        canvas.width = 9; canvas.height = 9;
        canvas.getContext('2d').drawImage(bitmap, sx, sy, 9, 9, 0, 0, 9, 9);
        hud[key] = canvas.toDataURL('image/png');
      };
      // Legacy Java HUD atlas: empty/full/half heart and food sprites.
      crop('heart_empty', 16, 0); crop('heart_full', 52, 0); crop('heart_half', 61, 0);
      crop('food_empty', 16, 27); crop('food_full', 52, 27); crop('food_half', 61, 27);
      crop('bubble_empty', 16, 18); crop('bubble_full', 25, 18);
      bitmap.close();
    }
  } catch { /* Keep the game's built-in HUD icons if the atlas cannot be read. */ }

  const blockTextures = new Map(blockEntries);
  const itemIcons = new Map(itemEntries);
  const ui = Object.fromEntries(uiEntries.filter(Boolean));
  console.info('[textures] ItsBrian: ' + blockTextures.size + '/' + blockNames.size + ' block textures, ' + itemIcons.size + ' item icons, ' + Object.keys(hud).length + ' HUD sprites, ' + Object.keys(ui).length + ' GUI assets.');
  return { blocks: blockTextures, items: itemIcons, hud, ui };
}

export function loadPackRecord() {
  try {
    const rec = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return rec && rec.textures ? rec : null;
  } catch {
    return null;
  }
}

function savePackRecord(rec) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
}

export function clearPackRecord() {
  localStorage.removeItem(STORAGE_KEY);
}

export function packTextureCount() {
  const rec = loadPackRecord();
  return rec ? Object.keys(rec.textures).length : 0;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

/** Decode stored pack images into RGBA pixel arrays keyed by texture name. */
export async function decodePack(record) {
  const out = new Map();
  if (!record) return out;
  for (const [name, url] of Object.entries(record.textures)) {
    if (!Object.prototype.hasOwnProperty.call(TEXTURES, name)) continue;
    try {
      const img = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
      out.set(name, ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
    } catch {
      // A corrupt entry falls back to the procedural texture rather than breaking boot.
    }
  }
  return out;
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad png')); };
    img.src = url;
  });
}

function normaliseToDataUrl(img) {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
  return canvas.toDataURL('image/png');
}

/**
 * Import PNG files into the pack. Returns { used, skipped, error }.
 * Merges with the existing pack, so several imports build one pack.
 */
export async function importPackFiles(files) {
  const added = {};
  const skipped = [];
  for (const file of Array.from(files)) {
    const base = file.name.replace(/\.png$/i, '');
    if (!Object.prototype.hasOwnProperty.call(TEXTURES, base)) {
      skipped.push(file.name);
      continue;
    }
    try {
      added[base] = normaliseToDataUrl(await fileToImage(file));
    } catch {
      skipped.push(file.name);
    }
  }
  const used = Object.keys(added).length;
  if (!used) return { used, skipped, error: null };
  const existing = loadPackRecord()?.textures || {};
  try {
    savePackRecord({ name: 'pack', textures: { ...existing, ...added } });
  } catch {
    return { used: 0, skipped, error: 'quota' };
  }
  return { used, skipped, error: null };
}

// ---------------------------------------------------------------------------
// Template export: every built-in texture as a 16x16 PNG inside one zip.
// The zip is written by hand (stored, no compression) so no library is needed.
// ------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

export async function downloadTemplate() {
  const files = [];
  for (const name of Object.keys(TEXTURES).sort()) {
    const rgba = TEXTURES[name]();
    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    canvas.getContext('2d').putImageData(
      new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), TILE_SIZE, TILE_SIZE), 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    files.push({ name: `${name}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  const url = URL.createObjectURL(makeZip(files));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'texture_pack_template.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}


/** Apply the downloaded vanilla GUI sheets to CSS without making UI depend on remote requests. */
export function setMinecraftUiTextures(textures) {
  if (!textures) return;
  const root = document.documentElement;
  const variables = {
    widgets: '--mc-gui-widgets',
    icons: '--mc-gui-icons',
    inventory: '--mc-gui-inventory',
    genericContainer: '--mc-gui-generic-container',
    furnace: '--mc-gui-furnace',
    craftingTable: '--mc-gui-crafting-table',
    titleLogo: '--mc-gui-title-logo',
    optionsBackground: '--mc-gui-options-background',
  };
  for (const [key, variable] of Object.entries(variables)) {
    if (textures[key]) root.style.setProperty(variable, 'url("' + textures[key] + '")');
  }
}
