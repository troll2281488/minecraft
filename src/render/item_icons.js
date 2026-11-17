/**
 * Inventory icons.
 *
 * Block items reuse the block's own texture, so a stack of stone looks like
 * stone with no extra art. Everything else -- tools, ingots, gems -- gets a
 * generated 16x16 icon here.
 *
 * Icons are drawn as small pixel maps rather than vector shapes because they sit
 * next to block textures at the same resolution, and a smooth icon beside a
 * 16x16 pixel texture looks conspicuously out of place.
 */

import { TILE_SIZE } from './atlas.js';

const _ = null; // transparent, and short enough to keep the maps readable

/** Tier colours. Tools differ only by the material part of the icon. */
const TIER_COLOR = {
  wooden:    ['#9c7248', '#7d5a38'],
  stone:     ['#9a9a9a', '#7a7a7a'],
  iron:      ['#dcdcdc', '#b0b0b0'],
  golden:    ['#f7d54c', '#c9ab35'],
  diamond:   ['#53e2d4', '#38b3a8'],
  netherite: ['#544c50', '#3b3438'],
};

const HANDLE = ['#6b4b2a', '#54391f'];

/**
 * Tool shapes as coordinate lists. 'M' is the material, 'H' the handle.
 * Written as explicit pixel runs rather than a 16x16 character grid: the grids
 * are unreadable at this size and every edit to one risks a silent
 * off-by-one that shifts the whole icon.
 */
const TOOL_SHAPES = {
  pickaxe: {
    M: [[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],
        [2,3],[3,3],[11,3],[12,3],
        [2,4],[12,4]],
    H: [[7,4],[7,5],[6,6],[6,7],[5,8],[5,9],[4,10],[4,11],[3,12],[3,13]],
  },
  axe: {
    M: [[4,2],[5,2],[6,2],[7,2],
        [3,3],[4,3],[5,3],[6,3],[7,3],[8,3],
        [3,4],[4,4],[5,4],[6,4],[7,4],[8,4],
        [4,5],[5,5],[6,5],[7,5],
        [5,6],[6,6]],
    H: [[6,6],[6,7],[5,8],[5,9],[4,10],[4,11],[3,12],[3,13]],
  },
  hoe: {
    M: [[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3]],
    H: [[7,4],[7,5],[6,6],[6,7],[5,8],[5,9],[4,10],[4,11],[3,12],[3,13]],
  },
  shovel: {
    M: [[6,2],[7,2],[8,2],
        [6,3],[7,3],[8,3],
        [6,4],[7,4],[8,4],
        [7,5]],
    H: [[7,5],[7,6],[6,7],[6,8],[5,9],[5,10],[4,11],[4,12],[3,13]],
  },
  shears: {
    M: [[4,3],[5,2],[6,2],[7,3],[8,4],[9,5],[10,6],[11,7],[12,8],[13,9],[12,10],[11,11],[10,12],[9,13], [3,4],[2,5],[2,6],[3,7],[4,8],[5,9],[6,10],[7,11],[8,12],[9,13]],
    H: [[6,7],[7,8],[8,9]],
  },
  fishing_rod: {
    M: [[12,1],[11,2],[10,3],[9,4],[8,5],[7,6],[6,7]],
    H: [[6,7],[5,8],[4,9],[3,10],[2,11],[2,12],[3,13]],
  },
  sword: {
    M: [[10,2],[11,2],[12,2],
        [9,3],[10,3],[11,3],
        [8,4],[9,4],[10,4],
        [7,5],[8,5],[9,5],
        [6,6],[7,6],[8,6],
        [5,7],[6,7],[7,7],
        [4,8],[5,8],[6,8]],
    H: [[3,9],[4,9],[5,9],[2,10],[3,10],[4,10],[3,11],[4,11],[2,12],[3,12]],
  },
};

/** Rounded lumps for ingots, gems, and dusts. */
const BLOB_SHAPES = {
  ingot: [
    [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],
    [3,7],[4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],
    [3,8],[4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],[11,8],[12,8],
    [4,9],[5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9],
  ],
  gem: [
    [6,3],[7,3],[8,3],[9,3],
    [5,4],[6,4],[7,4],[8,4],[9,4],[10,4],
    [4,5],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[11,5],
    [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[11,6],
    [5,7],[6,7],[7,7],[8,7],[9,7],[10,7],
    [5,8],[6,8],[7,8],[8,8],[9,8],[10,8],
    [6,9],[7,9],[8,9],[9,9],
    [7,10],[8,10],
  ],
  chunk: [
    [5,5],[6,5],[7,5],[8,5],[9,5],
    [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],
    [4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],
    [4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],
    [5,9],[6,9],[7,9],[8,9],[9,9],
    [6,10],[7,10],[8,10],
  ],
  dust: [
    [6,6],[8,5],[5,8],[9,8],[7,9],[10,6],[4,6],[7,7],[8,9],[6,10],
  ],
  stick: [
    [10,4],[9,5],[10,5],[8,6],[9,6],[7,7],[8,7],
    [6,8],[7,8],[5,9],[6,9],[4,10],[5,10],[4,11],
  ],
};

const ITEM_ICON_SPEC = {
  'mc:wheat':         { shape: 'chunk', colors: ['#d8bd50', '#a98b32'] },
  'mc:wheat_seeds':   { shape: 'dust', colors: ['#c9b35b', '#8f7938'] },
  'mc:stick':        { shape: 'stick', colors: HANDLE },
  'mc:raw_cod':      { shape: 'chunk', colors: ['#b6c8d0', '#738e9b'] },
  'mc:raw_salmon':   { shape: 'chunk', colors: ['#ed9b78', '#bd6654'] },
  'mc:pufferfish':   { shape: 'chunk', colors: ['#e7cf52', '#b68e36'] },
  'mc:tropical_fish':{ shape: 'chunk', colors: ['#e58d38', '#a84c34'] },
  'mc:string':       { shape: 'stick', colors: ['#eee6d2', '#b9ad95'] },
  'mc:bone':         { shape: 'stick', colors: ['#eee8d8', '#bdb5a2'] },
  'mc:leather':      { shape: 'chunk', colors: ['#9b633b', '#633b27'] },
  'mc:feather':      { shape: 'stick', colors: ['#eee9df', '#bdb6aa'] },
  'mc:coal':         { shape: 'chunk', colors: ['#2c2c2c', '#141414'] },
  'mc:charcoal':     { shape: 'chunk', colors: ['#3a332c', '#1e1a16'] },
  'mc:raw_iron':     { shape: 'chunk', colors: ['#d8a582', '#a97e5f'] },
  'mc:raw_copper':   { shape: 'chunk', colors: ['#d07f4a', '#a05f34'] },
  'mc:raw_gold':     { shape: 'chunk', colors: ['#f6d34a', '#c4a52f'] },
  'mc:iron_ingot':   { shape: 'ingot', colors: ['#e8e8e8', '#b4b4b4'] },
  'mc:copper_ingot': { shape: 'ingot', colors: ['#e08a52', '#ab6438'] },
  'mc:gold_ingot':   { shape: 'ingot', colors: ['#ffe14f', '#cfae2e'] },
  'mc:diamond':      { shape: 'gem',   colors: ['#5ef0e2', '#33b8ab'] },
  'mc:emerald':      { shape: 'gem',   colors: ['#3ce060', '#22a341'] },
  'mc:lapis_lazuli': { shape: 'chunk', colors: ['#3562d8', '#22409a'] },
  'mc:redstone':     { shape: 'dust',  colors: ['#e02020', '#a01414'] },
  'mc:flint':        { shape: 'chunk', colors: ['#4a4a4a', '#2c2c2c'] },
  'mc:clay_ball':    { shape: 'chunk', colors: ['#b0b4c0', '#8a8e99'] },
};

function blankIcon() {
  return new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
}

function parseHex(color) {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function plot(icon, points, color, shadow) {
  const [r, g, b] = parseHex(color);
  const [sr, sg, sb] = parseHex(shadow);
  for (const [x, y] of points) {
    if (x < 0 || x >= TILE_SIZE || y < 0 || y >= TILE_SIZE) continue;
    const i = (y * TILE_SIZE + x) * 4;
    // The bottom-right of each run is shaded, which is what gives a flat pixel
    // shape the suggestion of volume.
    const shaded = (x + y) % 3 === 2;
    icon[i] = shaded ? sr : r;
    icon[i + 1] = shaded ? sg : g;
    icon[i + 2] = shaded ? sb : b;
    icon[i + 3] = 255;
  }
}

/** Generate the icon for one item, or null if it should use its block texture. */
export function generateItemIcon(item) {
  if (item.block) return null; // block items render their block texture instead

  const icon = blankIcon();

  if (item.id === 'mc:fishing_rod') {
    const icon = blankIcon();
    plot(icon, TOOL_SHAPES.fishing_rod.M, '#b7a17b', '#826b4c');
    plot(icon, TOOL_SHAPES.fishing_rod.H, HANDLE[0], HANDLE[1]);
    return icon;
  }
  if (item.tool === 'shears') {
    plot(icon, TOOL_SHAPES.shears.M, '#c9d0d6', '#858e98');
    plot(icon, TOOL_SHAPES.shears.H, '#b7a17b', '#826b4c');
    return icon;
  }
  if (item.tool && TOOL_SHAPES[item.tool]) {
    const prefix = item.id.slice('mc:'.length).split('_')[0];
    const colors = TIER_COLOR[prefix] ?? TIER_COLOR.stone;
    const shape = TOOL_SHAPES[item.tool];
    plot(icon, shape.H, HANDLE[0], HANDLE[1]);
    plot(icon, shape.M, colors[0], colors[1]);
    return icon;
  }

  const spec = ITEM_ICON_SPEC[item.id];
  if (spec) {
    plot(icon, BLOB_SHAPES[spec.shape], spec.colors[0], spec.colors[1]);
    return icon;
  }

  // Unrecognized item: a neutral square, so it is visible and obviously
  // placeholder rather than an invisible slot the player cannot reason about.
  const points = [];
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) points.push([x, y]);
  plot(icon, points, '#b060c0', '#7a3e85');
  return icon;
}

/**
 * Turn raw RGBA pixels into a canvas that can be drawn or used as a CSS
 * background. Scaled up with smoothing disabled to keep the pixels sharp.
 */
export function iconToCanvas(pixels, scale = 2) {
  const source = document.createElement('canvas');
  source.width = TILE_SIZE;
  source.height = TILE_SIZE;
  const sctx = source.getContext('2d');
  const image = sctx.createImageData(TILE_SIZE, TILE_SIZE);
  image.data.set(pixels);
  sctx.putImageData(image, 0, 0);

  if (scale === 1) return source;

  const scaled = document.createElement('canvas');
  scaled.width = TILE_SIZE * scale;
  scaled.height = TILE_SIZE * scale;
  const ctx = scaled.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, scaled.width, scaled.height);
  return scaled;
}

/**
 * Build a data-URL icon for every registered item.
 *
 * Done once at startup and cached: the inventory redraws whenever a slot
 * changes, and regenerating icons on each redraw would be visibly slow with a
 * full inventory open.
 */
export function buildItemIconCache(items, blocks, textureData, textureIndex) {
  const cache = new Map();

  for (const item of items.items.values()) {
    let pixels = generateItemIcon(item);

    if (!pixels) {
      // Block item: lift the block's top-face texture straight out of the
      // generated texture array.
      const block = blocks.get(item.block);
      const name = block?.textures?.top ?? block?.textures?.side ?? block?.texture;
      const layer = textureIndex.get(name) ?? textureIndex.get('__missing');
      const offset = layer * TILE_SIZE * TILE_SIZE * 4;
      pixels = textureData.subarray(offset, offset + TILE_SIZE * TILE_SIZE * 4);
    }

    cache.set(item.id, iconToCanvas(pixels, 2).toDataURL());
  }

  return cache;
}

export { TOOL_SHAPES, BLOB_SHAPES };
