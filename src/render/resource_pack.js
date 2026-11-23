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
import { parseTextureAnimation } from './texture_animation.js';

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

/**
 * Convert common Java resource-pack layouts to paths relative to assets/minecraft.
 * Accepts a normal pack, a ZIP with an extra enclosing folder, and archives that
 * contain the assets folders directly (as exported by several pack tools).
 */
export function normalizeJavaPackEntryPath(input) {
  const path = String(input || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return null;

  let start = -1;
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'assets' && parts[i + 1] === 'minecraft') {
      start = i + 2;
      break;
    }
  }
  if (start < 0) {
    start = parts.findIndex((part, index) =>
      (part === 'textures' && ['block', 'blocks', 'item', 'items', 'entity'].includes(parts[index + 1])) ||
      (part === 'blockstates' && index + 1 < parts.length) ||
      (part === 'models' && ['block', 'item'].includes(parts[index + 1])));
  }
  if (start < 0 || start >= parts.length) return null;
  const relative = parts.slice(start).join('/');
  return relative
    .replace(/^textures\/blocks\//, 'textures/block/')
    .replace(/^textures\/items\//, 'textures/item/');
}

async function readZipPngEntries(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 22) throw new Error('Файл слишком маленький и не похож на ZIP');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Не найдена ZIP-директория. Проверь, что выбран именно .zip, а не .7z/.rar');
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('Архив повреждён или использует неподдерживаемый ZIP64');
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    const normalizedName = normalizeJavaPackEntryPath(name);
    if (!normalizedName || !/\.(?:png|json|png\.mcmeta)$/i.test(normalizedName)) continue;
    if (!/^(?:textures\/(?:block|item|entity)\/|blockstates\/|models\/(?:block|item)\/)/.test(normalizedName)) continue;
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > bytes.length) continue;
    entries.push({ name: normalizedName, method, dataStart, compressedSize });
  }
  if (!entries.length) {
    throw new Error('В ZIP не найдены assets/minecraft/textures, models или blockstates. Проверь содержимое архива.');
  }
  return { bytes, entries };
}

export function resolveJavaBlockFaces(models, blockstates) {
  const facesByBlock = {};
  const resolveModel = (id, seen = new Set()) => {
    const key = String(id || '').replace(/^minecraft:/, '').replace(/^block\//, '');
    if (!key || seen.has(key)) return null;
    seen.add(key);
    const model = models.get(key);
    if (!model) return null;
    const parent = resolveModel(model.parent, seen);
    return {
      textures: { ...(parent?.textures || {}), ...(model.textures || {}) },
      elements: model.elements?.length ? model.elements : (parent?.elements || []),
    };
  };
  const addModelFaces = (result, modelId) => {
    const compiled = resolveModel(modelId);
    if (!compiled) return;
    for (const direction of ['down', 'up', 'north', 'south', 'west', 'east']) {
      let texture = null;
      for (const element of compiled.elements) {
        const candidate = element.faces?.[direction]?.texture;
        if (candidate) { texture = candidate; break; }
      }
      if (!texture) texture = (direction === 'up' || direction === 'down')
        ? (compiled.textures.end || compiled.textures.all || compiled.textures.particle)
        : (compiled.textures.side || compiled.textures.all || compiled.textures.particle);
      let guard = 0;
      while (texture?.startsWith('#') && guard++ < 16) {
        texture = compiled.textures[texture.slice(1)] || null;
      }
      if (texture && !result[direction]) {
        result[direction] = texture
          .replace(/^minecraft:block\//, '')
          .replace(/^block\//, '')
          .split('/')
          .pop();
      }
    }
  };

  for (const [blockName, state] of blockstates) {
    const result = {};
    const variants = state.variants;
    if (variants) {
      const keys = Object.keys(variants);
      const chosen = variants[''] ?? variants[keys[0]];
      const choices = Array.isArray(chosen) ? chosen : [chosen];
      for (const choice of choices) if (choice?.model) addModelFaces(result, choice.model);
    }
    for (const part of state.multipart || []) {
      const apply = Array.isArray(part.apply) ? part.apply : [part.apply];
      for (const choice of apply) if (choice?.model) addModelFaces(result, choice.model);
    }
    if (Object.keys(result).length) facesByBlock['mc:' + blockName] = result;
  }
  return facesByBlock;
}

export function resolveJavaItemTextureKeys(models) {
  const resolved = {};
  const resolve = (id, seen = new Set()) => {
    const key = String(id || '').replace(/^minecraft:/, '').replace(/^item\//, '');
    if (!key || seen.has(key)) return null;
    seen.add(key);
    const model = models.get(key);
    if (!model) return null;
    const parent = resolve(model.parent, seen);
    return { ...(parent || {}), ...(model.textures || {}) };
  };
  for (const [name] of models) {
    const textures = resolve(name);
    const layers = [];
    for (let index = 0; index <= 4; index++) {
      const layer = textures?.['layer' + index];
      if (!layer) continue;
      const key = String(layer).replace(/^minecraft:(?:item|block)\//, '').replace(/^(?:item|block)\//, '').split('/').pop();
      if (/^[a-z0-9_]+$/i.test(key)) layers.push(key);
    }
    // Preserve the historical string shape for single-layer models; multi-layer
    // generated items keep their ordered overlays so the decoder can composite them.
    if (layers.length === 1) resolved[name] = layers[0];
    else if (layers.length > 1) resolved[name] = layers;
    else {
      const particle = textures?.particle;
      if (!particle) continue;
      const key = String(particle).replace(/^minecraft:(?:item|block)\//, '').replace(/^(?:item|block)\//, '').split('/').pop();
      if (/^[a-z0-9_]+$/i.test(key)) resolved[name] = key;
    }
  }
  return resolved;
}

export function javaEntityTextureKey(path) {
  const normalized = String(path || '').replaceAll('\\', '/').replace(/^assets\/minecraft\//, '').replace(/^textures\/entity\//, '');
  if (!normalized.toLowerCase().endsWith('.png')) return null;
  const basename = normalized.split('/').pop().replace(/\.png$/i, '');
  return /^[a-z0-9_]+$/i.test(basename) ? basename.toLowerCase() : null;
}

export async function importJavaResourcePackZip(file) {
  if (!file || !/\.zip$/i.test(file.name)) throw new Error('Выбери ZIP-архив ресурспака');
  const { bytes, entries } = await readZipPngEntries(file);
  const existing = loadPackRecord() || { name: 'Java resource pack', textures: {}, items: {} };
  const textures = { ...(existing.textures || {}) };
  const items = { ...(existing.items || {}) };
  const entities = { ...(existing.entities || {}) };
  const animations = { ...(existing.animations || {}) };
  const itemModelTextures = { ...(existing.itemModelTextures || {}) };
  const metadataByPath = new Map();
  let usedBlocks = 0, usedItems = 0, usedEntities = 0, skipped = 0;
  let modelFiles = 0, blockstateFiles = 0;

  for (const entry of entries) {
    if (!entry.name.endsWith('.png.mcmeta')) continue;
    try {
      const raw = await unzipEntry(bytes, entry.method, entry.dataStart, entry.compressedSize);
      metadataByPath.set(entry.name.slice(0, -'.mcmeta'.length),
        JSON.parse(new TextDecoder().decode(raw)));
    } catch { skipped++; }
  }

  const modelJson = new Map();
  const blockstateJson = new Map();
  const itemModelJson = new Map();
  for (const entry of entries) {
    if (entry.name.endsWith('.png.mcmeta')) continue;
    if (entry.name.endsWith('.json')) {
      try {
        const raw = await unzipEntry(bytes, entry.method, entry.dataStart, entry.compressedSize);
        const parsed = JSON.parse(new TextDecoder().decode(raw));
        if (entry.name.startsWith('models/block/')) {
          modelJson.set(entry.name.slice('models/block/'.length, -5), parsed);
          modelFiles++;
        } else if (entry.name.startsWith('models/item/')) {
          itemModelJson.set(entry.name.slice('models/item/'.length, -5), parsed);
          modelFiles++;
        } else if (entry.name.startsWith('blockstates/')) {
          blockstateJson.set(entry.name.slice('blockstates/'.length, -5), parsed);
          blockstateFiles++;
        }
      } catch { skipped++; }
      continue;
    }

    const category = entry.name.startsWith('textures/block/') ? 'block'
      : entry.name.startsWith('textures/item/') ? 'item'
      : entry.name.startsWith('textures/entity/') ? 'entity' : null;
    if (!category) continue;

    const base = entry.name.split('/').pop().replace(/\.png$/i, '');
    try {
      const raw = await unzipEntry(bytes, entry.method, entry.dataStart, entry.compressedSize);
      const bitmap = await createImageBitmap(new Blob([raw], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      const animation = category === 'block'
        ? parseTextureAnimation(metadataByPath.get(entry.name), bitmap.width, bitmap.height)
        : null;

      if (category === 'entity') {
        // Entity skins use model-specific UV layouts (commonly 64x64 or 64x32).
        // Preserve native dimensions; shrinking them to 16x16 destroys the UV map.
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        context.drawImage(bitmap, 0, 0);
      } else {
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        // Animated block textures are vertical or horizontal sprite sheets.
        // The first frame supplies the static fallback while metadata drives animation.
        const frameWidth = animation?.width ?? Math.min(bitmap.width, bitmap.height, TILE_SIZE);
        const frameHeight = animation?.height ?? Math.min(bitmap.width, bitmap.height, TILE_SIZE);
        context.drawImage(bitmap, 0, 0, frameWidth, frameHeight, 0, 0, TILE_SIZE, TILE_SIZE);
      }

      if (animation) {
        const frameUrls = [];
        for (const frame of animation.frames) {
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = TILE_SIZE;
          frameCanvas.height = TILE_SIZE;
          const frameContext = frameCanvas.getContext('2d');
          frameContext.imageSmoothingEnabled = false;
          const sx = (frame.index % animation.columns) * animation.width;
          const sy = Math.floor(frame.index / animation.columns) * animation.height;
          frameContext.drawImage(bitmap, sx, sy, animation.width, animation.height, 0, 0, TILE_SIZE, TILE_SIZE);
          frameUrls.push(frameCanvas.toDataURL('image/png'));
        }
        animations[base] = {
          frames: frameUrls,
          times: animation.frames.map((frame) => frame.time),
        };
      }

      bitmap.close();
      const url = canvas.toDataURL('image/png');
      if (category === 'block') {
        textures[base] = url;
        usedBlocks++;
      } else if (category === 'item') {
        items[base] = url;
        usedItems++;
      } else {
        const key = javaEntityTextureKey(entry.name);
        if (key) {
          entities[key] = url;
          usedEntities++;
        } else {
          skipped++;
        }
      }
    } catch {
      skipped++;
    }
  }

  if (!usedBlocks && !usedItems && !usedEntities && !modelFiles && !blockstateFiles) {
    throw new Error('Не найдено совместимых текстур, моделей или blockstates');
  }
  const importedFaces = resolveJavaBlockFaces(modelJson, blockstateJson);
  Object.assign(itemModelTextures, resolveJavaItemTextureKeys(itemModelJson));
  const blockFaces = { ...(existing.blockFaces || {}), ...importedFaces };
  try {
    savePackRecord({
      name: file.name, textures, items, entities, animations, blockFaces, itemModelTextures,
      modelFiles, blockstateFiles,
    });
  } catch {
    throw new Error('Не хватило места в хранилище браузера для ресурспака');
  }
  return {
    blocks: usedBlocks, items: usedItems, entities: usedEntities, skipped,
    modelFiles, blockstateFiles, mappedBlocks: Object.keys(importedFaces).length,
  };
}

export async function decodePackAnimations(record) {
  const out = new Map();
  for (const [name, entry] of Object.entries(record?.animations || {})) {
    if (!Array.isArray(entry?.frames) || !entry.frames.length) continue;
    const frames = [];
    for (const url of entry.frames) {
      try {
        const bitmap = await createImageBitmap(await (await fetch(url)).blob());
        const canvas = document.createElement('canvas');
        canvas.width = TILE_SIZE; canvas.height = TILE_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
        bitmap.close();
        frames.push(new Uint8Array(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data));
      } catch { /* An incomplete animation falls back to its static first frame. */ }
    }
    if (frames.length) out.set(name, {
      frames,
      times: Array.isArray(entry.times) ? entry.times.slice(0, frames.length) : frames.map(() => 1),
    });
  }
  return out;
}

export async function decodePackItemTextures(record) {
  const out = new Map();
  const decoded = new Map();
  const load = async (name, url) => {
    if (decoded.has(name)) return decoded.get(name);
    try {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE; canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
      bitmap.close();
      const dataUrl = canvas.toDataURL('image/png');
      decoded.set(name, dataUrl);
      return dataUrl;
    } catch { return null; }
  };
  for (const [name, url] of Object.entries(record?.items || {})) {
    const dataUrl = await load(name, url);
    if (dataUrl) out.set('mc:' + name, dataUrl);
  }
  for (const [itemName, textureSpec] of Object.entries(record?.itemModelTextures || {})) {
    const textureNames = Array.isArray(textureSpec) ? textureSpec : [textureSpec];
    const layers = [];
    for (const textureName of textureNames) {
      if (typeof textureName !== 'string') continue;
      const url = record?.items?.[textureName] || record?.textures?.[textureName];
      if (!url) continue;
      const dataUrl = await load(textureName, url);
      if (dataUrl) layers.push(dataUrl);
    }
    if (!layers.length) continue;
    if (layers.length === 1) {
      out.set('mc:' + itemName, layers[0]);
      continue;
    }
    // Java generated item models draw layer0 first, then transparent overlays.
    // Composite at native 16x16 nearest-neighbour resolution to preserve pixel art.
    try {
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.imageSmoothingEnabled = false;
      for (const layerUrl of layers) {
        const bitmap = await createImageBitmap(await (await fetch(layerUrl)).blob());
        context.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
        bitmap.close();
      }
      out.set('mc:' + itemName, canvas.toDataURL('image/png'));
    } catch { /* Keep the standalone imported item texture as fallback. */ }
  }
  return out;
}

/** Decode imported Java entity skins without changing their native UV dimensions. */
export async function decodePackEntityTextures(record) {
  const out = new Map();
  for (const [name, url] of Object.entries(record?.entities || {})) {
    try {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = false;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      out.set(name, canvas.toDataURL('image/png'));
    } catch { /* Keep the built-in entity skin. */ }
  }
  return out;
}
