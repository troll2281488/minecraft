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
  // Use the classic brown dirt tile for every biome soil alias.
  short_grass: 'grass',
  wheat_crop: 'wheat_stage7',
  water: 'water_still',
  plains_soil: 'dirt',
  forest_floor: 'dirt',
  birch_soil: 'dirt',
  jungle_soil: 'dirt',
  savanna_soil: 'dirt',
  taiga_soil: 'dirt',
  swamp_mud: 'dirt',
  // Mountain gravel uses the same vanilla gravel tile as ordinary gravel.
  alpine_gravel: 'gravel',
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
  titleLogo: 'gui/title/minecraft.png',
  optionsBackground: 'gui/options_background.png',
  asciiFont: 'font/ascii.png',
  europeanFont: 'font/nonlatin_european.png',
});

// Spawn eggs are generated from their mob's two vanilla colors by item_icons.js.
export function shouldFetchExternalBlockTexture(name) {
  // Keep only locally-authored variants local. Vanilla gravel is supplied by ItsBrian.
  return Boolean(name && !name.endsWith('_leaves') && !name.endsWith('_sapling') &&
    !['coarse_dirt', 'podzol_top', 'podzol_side'].includes(name));
}

export function shouldFetchExternalItemTexture(item) {
  return Boolean(item && !item.block && !item.spawnEggMob);
}

async function fetchImage(path, signal) {
  const response = await fetch(ITSBRIAN_RAW + path, { signal: signal || AbortSignal.timeout(4000) });
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
export async function loadItsBrianTextures(blocks, items, { signal } = {}) {
  const blockNames = new Set();
  for (const state of blocks.statesById) {
    const t = state.block.textures;
    if (t) {
      for (const name of [t.bottom, t.top, t.north, t.south, t.west, t.east, t.side, t.all]) {
        if (name) blockNames.add(name);
      }
    } else if (state.block.texture) blockNames.add(state.block.texture);
    if (state.block.doorTextures) {
      for (const name of Object.values(state.block.doorTextures)) if (name) blockNames.add(name);
    }
  }

  const blockEntries = await mapWithLimit([...blockNames], 24, async (name) => {
    // Keep foliage and soil textures local. Grass top and side deliberately load
    // from ItsBrian: the shader tints only green pixels, never the brown dirt.
    if (!shouldFetchExternalBlockTexture(name)) return null;
    const sourceName = BLOCK_TEXTURE_ALIASES[name] ?? name;
    if (name === 'chest_side' || name === 'chest_top') {
      // Vanilla stores the chest as a 64x64 model skin rather than a block tile.
      // Rebuild the two 16x16 face tiles from the front/top UV regions.
      const skin = await fetchImage('entity/chest/normal.png', signal);
      if (!skin) return null;
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      if (name === 'chest_top') {
        ctx.drawImage(skin, 14, 0, 14, 14, 0, 0, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.drawImage(skin, 0, 14, 14, 5, 0, 0, TILE_SIZE, 5);
        ctx.drawImage(skin, 0, 33, 14, 10, 0, 5, TILE_SIZE, 11);
      }
      const pixels = new Uint8Array(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
      skin.close();
      return [name, pixels];
    }
    const bitmap = await fetchImage('block/' + encodeURIComponent(sourceName) + '.png', signal);
    if (!bitmap) return null;
    const { ctx } = canvasFor(bitmap);
    const pixels = new Uint8Array(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
    bitmap.close();
    return [name, pixels];
  });

  const itemEntries = await mapWithLimit([...items.items.values()].filter(shouldFetchExternalItemTexture), 12, async (item) => {
    const name = item.id.slice(item.id.indexOf(':') + 1);
    const sourceName = ITEM_TEXTURE_ALIASES[name] ?? name;
    const bitmap = await fetchImage('item/' + encodeURIComponent(sourceName) + '.png', signal);
    if (!bitmap) return null;
    const { canvas } = canvasFor(bitmap);
    bitmap.close();
    return [item.id, canvas.toDataURL('image/png')];
  });

  const uiEntries = await Promise.all(Object.entries(UI_TEXTURES).map(async ([key, path]) => {
    try {
      const bitmap = await fetchImage(path, signal);
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
    const bitmap = await fetchImage('gui/icons.png', signal);
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
  const rec = loadPackRecord();  return rec ? Object.keys(rec.textures).length : 0;
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
    if (!name || typeof url !== 'string') continue;
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
    titleLogo: '--mc-gui-title-logo',
    optionsBackground: '--mc-gui-options-background',
    asciiFont: '--mc-font-ascii-atlas',
    europeanFont: '--mc-font-european-atlas',
  };
  for (const [key, variable] of Object.entries(variables)) {
    if (textures[key]) root.style.setProperty(variable, 'url("' + textures[key] + '")');
  }
}

// Import the block/item PNGs from a vanilla Java resource-pack ZIP.
// Supports ordinary ZIP entries (stored or DEFLATE); ZIP64 is not required for
// normal resource packs. Unrecognised formats are skipped rather than breaking boot.
async function unzipEntry(bytes, method, start, compressedSize) {
  const data = bytes.slice(start, start + compressedSize);
  if (method === 0) return data;
  if (method !== 8 || typeof DecompressionStream === 'undefined') {
    throw new Error('Нужен браузер с поддержкой DEFLATE ZIP');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipPngEntries(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('В ZIP не найдена центральная директория');
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Повреждённая запись ZIP');
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!/\.(?:png|json)$/i.test(name)) continue;
    if (!/^(?:assets\/minecraft\/)?(?:textures\/(?:block|item)\/|blockstates\/|models\/block\/)/.test(name)) continue;
    if (view.getUint32(localOffset, true) !== 0x04034b50) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({ name: name.replace(/^assets\/minecraft\//, ''), method, dataStart, compressedSize });
  }
  return { bytes, entries };
}


function resolveJavaBlockFaces(models, blockstates) {
  const facesByBlock = {};
  const resolveModel = (id, seen = new Set()) => {
    const key = String(id || '').replace(/^minecraft:/, '').replace(/^block\//, '');
    if (!key || seen.has(key)) return null;
    seen.add(key);
    const model = models.get(key);
    if (!model) return null;
    const parent = resolveModel(model.parent, seen);
    const textures = { ...(parent?.textures || {}), ...(model.textures || {}) };
    const elements = model.elements || parent?.elements || [];
    const result = {};
    const directions = ['down', 'up', 'north', 'south', 'west', 'east'];
    for (const direction of directions) {
      let faceTexture = null;
      for (const element of elements) {
        const raw = element.faces?.[direction]?.texture;
        if (raw) { faceTexture = raw; break; }
      }
      if (!faceTexture && directions.includes(direction)) {
        const fallback = direction === 'up' || direction === 'down' ? (textures.end || textures.all) : (textures.side || textures.all);
        faceTexture = fallback || null;
      }
      let guard = 0;
      while (faceTexture?.startsWith('#') && guard++ < 12) faceTexture = textures[faceTexture.slice(1)] || null;
      if (faceTexture) result[direction] = faceTexture.replace(/^minecraft:block\//, '').replace(/^block\//, '').split('/').pop();
    }
    return Object.keys(result).length ? result : null;
  };
  for (const [blockName, state] of blockstates) {
    const variants = state.variants;
    let modelId = null;
    if (variants) {
      const keys = Object.keys(variants);
      const chosen = variants[''] ?? variants[keys[0]];
      const entry = Array.isArray(chosen) ? chosen[0] : chosen;
      modelId = entry?.model;
    } else if (state.multipart?.length) {
      modelId = state.multipart[0]?.apply?.[0]?.model || state.multipart[0]?.apply?.model;
    }
    if (!modelId) continue;
    const faces = resolveModel(modelId);
    if (faces) facesByBlock['mc:' + blockName] = faces;
  }
  return facesByBlock;
}

export async function importJavaResourcePackZip(file) {
  if (!file || !/\.zip$/i.test(file.name)) throw new Error('Выбери ZIP-архив ресурспака');
  const { bytes, entries } = await readZipPngEntries(file);
  const existing = loadPackRecord() || { name: 'Java resource pack', textures: {}, items: {} };
  const textures = { ...(existing.textures || {}) };
  const items = { ...(existing.items || {}) };
  let usedBlocks = 0, usedItems = 0, skipped = 0, modelFiles = 0, blockstateFiles = 0;
  const modelJson = new Map(), blockstateJson = new Map();
  for (const entry of entries) {
    if (entry.name.endsWith('.json')) {
      try {
        const raw = await unzipEntry(bytes, entry.method, entry.dataStart, entry.compressedSize);
        const parsed = JSON.parse(new TextDecoder().decode(raw));
        if (entry.name.startsWith('models/block/')) { modelJson.set(entry.name.slice('models/block/'.length, -5), parsed); modelFiles++; }
        else if (entry.name.startsWith('blockstates/')) { blockstateJson.set(entry.name.slice('blockstates/'.length, -5), parsed); blockstateFiles++; }
      } catch { skipped++; }
      continue;
    }
    const category = entry.name.includes('/block/') ? 'block' : 'item';
    const base = entry.name.split('/').pop().replace(/\.png$/i, '');
    try {
      const raw = await unzipEntry(bytes, entry.method, entry.dataStart, entry.compressedSize);
      const bitmap = await createImageBitmap(new Blob([raw], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE; canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
      bitmap.close();
      const url = canvas.toDataURL('image/png');
      if (category === 'block') { textures[base] = url; usedBlocks++; }
      else { items[base] = url; usedItems++; }
    } catch { skipped++; }
  }
  if (!usedBlocks && !usedItems && !modelFiles && !blockstateFiles) throw new Error('Не найдено совместимых текстур, моделей или blockstates');
  const blockFaces = resolveJavaBlockFaces(modelJson, blockstateJson);
  try {
    savePackRecord({ name: file.name, textures, items, blockFaces, modelFiles, blockstateFiles });
  } catch {
    throw new Error('Не хватило места в хранилище браузера для ресурспака');
  }
  return { blocks: usedBlocks, items: usedItems, skipped, modelFiles, blockstateFiles, mappedBlocks: Object.keys(blockFaces).length };
}

export async function decodePackItemTextures(record) {
  const out = new Map();
  for (const [name, url] of Object.entries(record?.items || {})) {
    try {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE; canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
      bitmap.close();
      out.set('mc:' + name, canvas.toDataURL('image/png'));
    } catch { /* Keep the built-in item icon. */ }
  }
  return out;
}
