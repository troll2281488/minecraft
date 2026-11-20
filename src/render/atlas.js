/**
 * Block texture atlas.
 *
 * Built-in fallback textures are original procedural pixel art. Matching
 * textures from ItsBrian's Java texture repository override them at startup;
 * see README.md for attribution and permission.
 *
 * WHY A TEXTURE ARRAY RATHER THAN AN ATLAS
 *
 * The obvious approach is one big atlas image with tiles packed into a grid.
 * It has a well-known problem: mipmapping averages across tile boundaries, so
 * at distance the edge of a stone block bleeds into whatever was packed beside
 * it, producing coloured fringes. The usual fixes -- padding gutters, clamping
 * UVs inward, capping the mip level -- are all workarounds for a self-inflicted
 * wound.
 *
 * WebGL2 has TEXTURE_2D_ARRAY, where every tile is its own layer with its own
 * mip chain and no neighbours to bleed from. The texture index becomes the array
 * layer directly, so the shader gets simpler too. There is no downside here and
 * the whole thing costs about 200 KB of VRAM.
 *
 * DETERMINISM
 *
 * Every texture is seeded from its own name, so a texture looks identical on
 * every machine and across every run, and adding a new texture cannot change the
 * appearance of an existing one.
 */

import { Random } from '../core/rng.js';
import { RENDER } from '../core/constants.js';

// Re-exported from constants.js rather than defined here. It duplicated
// RENDER.ATLAS_TILE_SIZE, and item_icons.js imported it *from this module* - so a
// render module depended on the texture-art module for a plain number.
export const TILE_SIZE = RENDER.ATLAS_TILE_SIZE;

// ---------------------------------------------------------------------------
// Pixel helpers
// ---------------------------------------------------------------------------

const newTile = () => new Uint8Array(TILE_SIZE * TILE_SIZE * 4);

function setPx(tile, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= TILE_SIZE || y < 0 || y >= TILE_SIZE) return;
  const i = (y * TILE_SIZE + x) * 4;
  tile[i] = r; tile[i + 1] = g; tile[i + 2] = b; tile[i + 3] = a;
}

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/** Multiply a colour toward black (t < 1) or toward white (t > 1). */
function shade(rgb, t) {
  return [
    Math.max(0, Math.min(255, Math.round(rgb[0] * t))),
    Math.max(0, Math.min(255, Math.round(rgb[1] * t))),
    Math.max(0, Math.min(255, Math.round(rgb[2] * t))),
  ];
}

function fillTile(tile, rgb, a = 255) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) setPx(tile, x, y, rgb[0], rgb[1], rgb[2], a);
  }
}

// ---------------------------------------------------------------------------
// Texture generators
// ---------------------------------------------------------------------------

/** Flat colour with per-pixel brightness jitter. The workhorse for stone, dirt, sand. */
function grainy(base, variance, seed, opts = {}) {
  const rng = new Random(seed);
  const tile = newTile();
  const { clumps = 0, clumpColor = null, clumpSize = 2 } = opts;

  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const t = 1 + (rng.nextDouble() - 0.5) * variance;
      const c = shade(base, t);
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }

  // Darker or lighter speckles, which is what separates gravel from sand.
  for (let i = 0; i < clumps; i++) {
    const cx = rng.nextInt(TILE_SIZE);
    const cy = rng.nextInt(TILE_SIZE);
    const size = 1 + rng.nextInt(clumpSize);
    const col = clumpColor ?? shade(base, 0.78);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const t = 1 + (rng.nextDouble() - 0.5) * variance * 0.6;
        const c = shade(col, t);
        setPx(tile, (cx + dx) % TILE_SIZE, (cy + dy) % TILE_SIZE, c[0], c[1], c[2]);
      }
    }
  }
  return tile;
}

/** Irregular rounded stones with dark mortar between them. */
function cobble(base, seed) {
  const rng = new Random(seed);
  const tile = newTile();
  const mortar = shade(base, 0.52);
  fillTile(tile, mortar);

  // A fixed layout of stones, jittered -- a fully random scatter reads as noise
  // rather than masonry.
  const stones = [
    [0, 0, 6, 5], [7, 0, 5, 4], [13, 0, 3, 6],
    [0, 6, 4, 5], [5, 5, 7, 6], [12, 7, 4, 5],
    [0, 12, 7, 4], [8, 12, 4, 4], [13, 13, 3, 3],
  ];

  for (const [sx, sy, sw, sh] of stones) {
    const tone = 0.82 + rng.nextDouble() * 0.36;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        // Nibble the corners so stones look rounded rather than rectangular.
        const corner = (x === 0 || x === sw - 1) && (y === 0 || y === sh - 1);
        if (corner && rng.nextBoolean()) continue;
        const t = tone + (rng.nextDouble() - 0.5) * 0.18;
        const c = shade(base, t);
        setPx(tile, (sx + x) % TILE_SIZE, (sy + y) % TILE_SIZE, c[0], c[1], c[2]);
      }
    }
  }
  return tile;
}

/** Mossy masonry: the same readable stone layout as cobble, with irregular green growth. */
function mossyCobble(seed) {
  const tile = cobble(hex(0x7d7d7d), seed);
  const rng = new Random(seed);
  const moss = hex(0x557b3b);
  const darkMoss = hex(0x36552c);
  for (let patch = 0; patch < 13; patch++) {
    const cx = rng.nextInt(TILE_SIZE), cy = rng.nextInt(TILE_SIZE);
    const width = 1 + rng.nextInt(3), height = 1 + rng.nextInt(3);
    for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
      if (rng.nextDouble() < 0.28) continue;
      const x = (cx + dx) % TILE_SIZE, y = (cy + dy) % TILE_SIZE;
      const i = (y * TILE_SIZE + x) * 4;
      if (tile[i + 3] === 0) continue;
      const shadeFactor = rng.nextDouble() < 0.3 ? darkMoss : moss;
      const blend = 0.68 + rng.nextDouble() * 0.24;
      tile[i] = Math.round(tile[i] * (1 - blend) + shadeFactor[0] * blend);
      tile[i + 1] = Math.round(tile[i + 1] * (1 - blend) + shadeFactor[1] * blend);
      tile[i + 2] = Math.round(tile[i + 2] * (1 - blend) + shadeFactor[2] * blend);
    }
  }
  return tile;
}

/** Horizontal planks with grain lines and seams. */
function planks(base, seed) {
  const rng = new Random(seed);
  const tile = newTile();
  const rows = [0, 4, 9, 13];

  for (let y = 0; y < TILE_SIZE; y++) {
    const isSeam = rows.includes(y);
    const rowTone = 0.9 + ((y / 4) | 0) * 0.045;
    for (let x = 0; x < TILE_SIZE; x++) {
      let t = rowTone + (rng.nextDouble() - 0.5) * 0.1;
      if (isSeam) t *= 0.72;
      // Occasional darker grain streaks.
      if (!isSeam && rng.nextDouble() < 0.1) t *= 0.88;
      const c = shade(base, t);
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }
  // Vertical butt-joints between boards.
  for (const [y0, y1, jx] of [[0, 3, 11], [5, 8, 5], [10, 12, 13], [14, 15, 7]]) {
    for (let y = y0; y <= y1; y++) {
      const c = shade(base, 0.62);
      setPx(tile, jx, y, c[0], c[1], c[2]);
    }
  }
  return tile;
}

/** Vertical bark striations. */
function barkSide(base, seed) {
  const rng = new Random(seed);
  const tile = newTile();
  for (let x = 0; x < TILE_SIZE; x++) {
    const columnTone = 0.82 + rng.nextDouble() * 0.36;
    for (let y = 0; y < TILE_SIZE; y++) {
      const t = columnTone + (rng.nextDouble() - 0.5) * 0.14;
      const c = shade(base, t);
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }
  // Birch bark is white with short, irregular charcoal-grey horizontal marks.
  if (seed === 'birch_log') {
    for (let mark = 0; mark < 13; mark++) {
      const x = 1 + rng.nextInt(TILE_SIZE - 3);
      const y = rng.nextInt(TILE_SIZE);
      const width = 1 + rng.nextInt(3);
      const ink = shade(hex(0x45433f), 0.8 + rng.nextDouble() * 0.35);
      for (let dx = 0; dx < width && x + dx < TILE_SIZE; dx++) {
        setPx(tile, x + dx, y, ink[0], ink[1], ink[2]);
      }
    }
  }
  return tile;
}

/** Concentric growth rings for a cut log. */
function logTop(bark, inner, seed) {
  const rng = new Random(seed);
  const tile = newTile();
  const cx = 7.5, cy = 7.5;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const d = Math.hypot(x - cx, y - cy);
      let base = d > 6.6 ? bark : inner;
      // Rings: alternating bands of slightly different tone.
      const ring = Math.sin(d * 2.1) * 0.5 + 0.5;
      const t = 0.88 + ring * 0.22 + (rng.nextDouble() - 0.5) * 0.08;
      const c = shade(base, t);
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }
  return tile;
}

/** Stone with embedded mineral blobs. */
function oreTile(stoneBase, gem, seed, blobCount = 5) {
  const rng = new Random(seed);
  const tile = grainy(stoneBase, 0.22, seed);

  for (let i = 0; i < blobCount; i++) {
    const cx = 2 + rng.nextInt(TILE_SIZE - 4);
    const cy = 2 + rng.nextInt(TILE_SIZE - 4);
    const size = 2 + rng.nextInt(2);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (rng.nextDouble() < 0.2) continue; // ragged edges
        const t = 0.85 + rng.nextDouble() * 0.4;
        const c = shade(gem, t);
        setPx(tile, cx + dx, cy + dy, c[0], c[1], c[2]);
        // A highlight pixel gives the mineral a faceted look.
        if (dx === 0 && dy === 0) {
          const h = shade(gem, 1.35);
          setPx(tile, cx, cy, h[0], h[1], h[2]);
        }
      }
    }
  }
  return tile;
}

/** Dense foliage with holes punched through, so canopies read as leaves. */
function leaves(base, seed) {
  const rng = new Random(seed);
  const tile = newTile();
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (rng.nextDouble() < 0.14) continue; // transparent gap
      const t = 0.72 + rng.nextDouble() * 0.55;
      const c = shade(base, t);
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }
  return tile;
}

/** Upright blades or petals on a transparent background. */
function crossPlant(seed, draw) {
  const tile = newTile();
  draw(tile, new Random(seed));
  return tile;
}

function grassBlades(tile, rng, base) {
  for (let x = 0; x < TILE_SIZE; x++) {
    if (rng.nextDouble() < 0.25) continue;
    const height = 5 + rng.nextInt(8);
    const tone = 0.75 + rng.nextDouble() * 0.5;
    for (let y = TILE_SIZE - 1; y > TILE_SIZE - 1 - height; y--) {
      const c = shade(base, tone * (0.75 + (TILE_SIZE - y) / TILE_SIZE * 0.45));
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }
}

function flower(tile, rng, stem, petal, center) {
  for (let y = 6; y < TILE_SIZE; y++) {
    const c = shade(stem, 0.85 + rng.nextDouble() * 0.3);
    setPx(tile, 7, y, c[0], c[1], c[2]);
    if (y > 9 && rng.nextDouble() < 0.4) {
      const l = shade(stem, 1.1);
      setPx(tile, y % 2 === 0 ? 6 : 8, y, l[0], l[1], l[2]);
    }
  }
  const petals = [[6, 3], [7, 2], [8, 3], [5, 4], [9, 4], [6, 5], [7, 5], [8, 5], [7, 4]];
  for (const [px_, py] of petals) {
    const c = shade(petal, 0.88 + rng.nextDouble() * 0.28);
    setPx(tile, px_, py, c[0], c[1], c[2]);
  }
  setPx(tile, 7, 4, center[0], center[1], center[2]);
}

/** Grass block side: dirt with an overhanging green crown. */
function grassSide(dirtBase, grassBase, seed) {
  const rng = new Random(seed);
  const tile = grainy(dirtBase, 0.24, seed, { clumps: 6 });
  for (let x = 0; x < TILE_SIZE; x++) {
    const depth = 2 + rng.nextInt(3);
    for (let y = 0; y < depth; y++) {
      const c = shade(grassBase, 0.82 + rng.nextDouble() * 0.4);
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }
  return tile;
}

/** Mostly transparent with a visible border, as glass reads in game. */
function glassTile(seed, tint = hex(0xd8f0f4)) {
  const rng = new Random(seed);
  const tile = newTile();
  const frame = tint;
  for (let i = 0; i < TILE_SIZE; i++) {
    setPx(tile, i, 0, frame[0], frame[1], frame[2], 210);
    setPx(tile, i, TILE_SIZE - 1, frame[0], frame[1], frame[2], 210);
    setPx(tile, 0, i, frame[0], frame[1], frame[2], 210);
    setPx(tile, TILE_SIZE - 1, i, frame[0], frame[1], frame[2], 210);
  }
  // A couple of highlight streaks so the pane is not invisible head-on.
  for (let i = 3; i < 7; i++) setPx(tile, i, i, 255, 255, 255, 120);
  for (let i = 9; i < 12; i++) setPx(tile, i, i - 5, 255, 255, 255, 90);
  void rng;
  return tile;
}

function waterTile(seed) {
  const rng = new Random(seed);
  const tile = newTile();
  const base = hex(0x3a67d8);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const wave = Math.sin((x + y * 0.6) * 0.9) * 0.06;
      const t = 1 + wave + (rng.nextDouble() - 0.5) * 0.08;
      const c = shade(base, t);
      setPx(tile, x, y, c[0], c[1], c[2], 178);
    }
  }
  return tile;
}

function torchTile(seed) {
  const rng = new Random(seed);
  const tile = newTile();
  const wood = hex(0x6b4b2a);
  const flame = hex(0xffcc44);
  for (let y = 8; y < TILE_SIZE; y++) {
    for (let x = 7; x <= 8; x++) {
      const c = shade(wood, 0.85 + rng.nextDouble() * 0.3);
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }
  for (const [fx, fy] of [[7, 6], [8, 6], [7, 7], [8, 7], [7, 5], [8, 5]]) {
    const c = shade(flame, 0.85 + rng.nextDouble() * 0.35);
    setPx(tile, fx, fy, c[0], c[1], c[2]);
  }
  setPx(tile, 7, 4, 255, 240, 190);
  return tile;
}

function chestSideTile(seed) {
  const tile = planks(hex(0x9a6a32), seed);
  const dark = hex(0x4b321a), iron = hex(0xceb45c);
  for (let x = 0; x < TILE_SIZE; x++) {
    for (const y of [0, 1, 14, 15]) {
      const c = shade(dark, 0.9 + ((x + y) % 3) * 0.08);
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }
  for (let y = 6; y <= 9; y++) for (let x = 7; x <= 8; x++) {
    setPx(tile, x, y, iron[0], iron[1], iron[2]);
  }
  return tile;
}

function chestTopTile(seed) {
  const tile = planks(hex(0xa4763b), seed);
  const edge = hex(0x4b321a), latch = hex(0xd8bd63);
  for (let i = 0; i < TILE_SIZE; i++) {
    for (const p of [[i, 0], [i, 15], [0, i], [15, i]]) {
      setPx(tile, p[0], p[1], edge[0], edge[1], edge[2]);
    }
  }
  for (let y = 6; y <= 9; y++) for (let x = 7; x <= 8; x++) {
    setPx(tile, x, y, latch[0], latch[1], latch[2]);
  }
  return tile;
}

function furnaceSideTile(seed) {
  return grainy(hex(0x777777), 0.18, seed, { clumps: 7, clumpColor: hex(0x555555) });
}

function furnaceFrontTile(seed) {
  const tile = furnaceSideTile(seed);
  const opening = hex(0x252525), ember = hex(0xd65a1f), glow = hex(0xf3a33a);
  for (let y = 4; y <= 12; y++) for (let x = 3; x <= 12; x++) {
    setPx(tile, x, y, opening[0], opening[1], opening[2]);
  }
  for (const [x, y] of [[6, 10], [7, 9], [8, 10], [9, 8], [10, 10]]) {
    setPx(tile, x, y, ember[0], ember[1], ember[2]);
  }
  setPx(tile, 8, 8, glow[0], glow[1], glow[2]);
  return tile;
}

// ---------------------------------------------------------------------------
// The texture table
// ---------------------------------------------------------------------------

const STONE_GREY = hex(0x7d7d7d);
const DIRT_BROWN = hex(0x8a5f3c);
const GRASS_GREEN = hex(0x7cb342);

const WOOD = {
  oak:    { bark: hex(0x6c5432), inner: hex(0xb08b52), planks: hex(0xb08b52), leaves: hex(0x4f8f38), sapling: hex(0x4f8f38) },
  birch:  { bark: hex(0xd7d3c9), inner: hex(0xd4c9a4), planks: hex(0xd4c9a4), leaves: hex(0x80a755), sapling: hex(0x80a755) },
  spruce: { bark: hex(0x4a3823), inner: hex(0x7b5a33), planks: hex(0x7b5a33), leaves: hex(0x3f6b3a), sapling: hex(0x3f6b3a) },
  jungle: { bark: hex(0x60452c), inner: hex(0xa98255), planks: hex(0xa98255), leaves: hex(0x4b8a38), sapling: hex(0x4b8a38) },
  acacia: { bark: hex(0x59433a), inner: hex(0xb66b43), planks: hex(0xb66b43), leaves: hex(0x7b8b42), sapling: hex(0x7b8b42) },
  dark_oak: { bark: hex(0x30251b), inner: hex(0x49331f), planks: hex(0x49331f), leaves: hex(0x3e6530), sapling: hex(0x3e6530) },
};

function buttonTile(base, seed) {
  const tile = planks(base, seed), edge = shade(base, 0.5), center = shade(base, 0.82);
  for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) {
    const c = (x === 4 || x === 11 || y === 4 || y === 11) ? edge : center;
    setPx(tile, x, y, c[0], c[1], c[2]);
  }
  return tile;
}

function pressurePlateTile(base, seed) {
  const tile = planks(base, seed), edge = shade(base, 0.55);
  for (let i = 1; i < TILE_SIZE - 1; i++) {
    for (const [x, y] of [[i, 1], [i, 14], [1, i], [14, i]]) setPx(tile, x, y, edge[0], edge[1], edge[2]);
  }
  return tile;
}

/** Simple procedural door fallback; the community Java 1.19 tiles override it. */
function doorPanelTile(base, seed, upper) {
  const tile = planks(base, seed);
  const frame = shade(base, 0.48), inset = shade(base, 0.72), handle = hex(0x6b542c);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (const x of [1, 2, 13, 14]) setPx(tile, x, y, frame[0], frame[1], frame[2]);
  }
  for (let x = 3; x <= 12; x++) {
    for (const y of [upper ? 1 : 2, upper ? 13 : 14]) setPx(tile, x, y, inset[0], inset[1], inset[2]);
  }
  if (!upper) for (let y = 7; y <= 9; y++) setPx(tile, 11, y, handle[0], handle[1], handle[2]);
  return tile;
}

function trapdoorPanelTile(base, seed) {
  const tile = planks(base, seed);
  const frame = shade(base, 0.48), inset = shade(base, 0.72);
  for (let i = 0; i < TILE_SIZE; i++) {
    for (const p of [[i, 0], [i, 1], [i, 14], [i, 15], [0, i], [1, i], [14, i], [15, i]]) {
      setPx(tile, p[0], p[1], frame[0], frame[1], frame[2]);
    }
  }
  for (let i = 3; i <= 12; i++) {
    for (const p of [[i, 4], [i, 11], [4, i], [11, i]]) setPx(tile, p[0], p[1], inset[0], inset[1], inset[2]);
  }
  return tile;
}

function ironDoorPanelTile(upper) {
  const tile = grainy(hex(0x999999), 0.18, upper ? 'iron_door_top' : 'iron_door_bottom');
  const dark = hex(0x555555), light = hex(0xc9c9c9);
  for (let y = 1; y < 15; y++) for (const x of [2, 6, 9, 13]) {
    const c = (x === 2 || x === 13) ? dark : light;
    setPx(tile, x, y, c[0], c[1], c[2]);
  }
  for (let x = 2; x < 14; x++) for (const y of [1, 7, 8, 14]) setPx(tile, x, y, dark[0], dark[1], dark[2]);
  return tile;
}

/**
 * Every texture, keyed by the name blocks refer to.
 *
 * Each entry is a thunk so nothing is generated until buildTextures() runs --
 * importing this module should not cost 60 texture generations.
 */
const TEXTURES = {
  stone:              () => grainy(STONE_GREY, 0.2, 'stone', { clumps: 5 }),
  cobblestone:        () => cobble(STONE_GREY, 'cobblestone'),
  mossy_cobblestone:  () => mossyCobble('mossy_cobblestone'),
  granite:            () => grainy(hex(0x9a6a5a), 0.24, 'granite', { clumps: 7 }),
  polished_granite:   () => grainy(hex(0xa2705f), 0.1, 'polished_granite'),
  stone_bricks:       () => grainy(hex(0x777777), 0.20, 'stone_bricks', { clumps: 5 }),
  diorite:            () => grainy(hex(0xcfcfcf), 0.26, 'diorite', { clumps: 7, clumpColor: hex(0x9d9d9d) }),
  polished_diorite:   () => grainy(hex(0xd6d6d6), 0.1, 'polished_diorite'),
  andesite:           () => grainy(hex(0x8a8a8a), 0.22, 'andesite', { clumps: 6 }),
  polished_andesite:  () => grainy(hex(0x929292), 0.1, 'polished_andesite'),
  sandstone:          () => grainy(hex(0xdbd0a0), 0.14, 'sandstone'),
  obsidian:           () => grainy(hex(0x150c24), 0.55, 'obsidian', { clumps: 6, clumpColor: hex(0x2d1a4a) }),
  netherrack:         () => grainy(hex(0x713b35), 0.38, 'netherrack', { clumps: 11, clumpColor: hex(0x4c2828), clumpSize: 3 }),
  nether_bricks:      () => grainy(hex(0x321b20), 0.18, 'nether_bricks', { clumps: 7, clumpColor: hex(0x4c292c) }),
  soul_sand:          () => grainy(hex(0x55402e), 0.35, 'soul_sand', { clumps: 9, clumpColor: hex(0x33251d) }),
  nether_gold_ore:    () => oreTile(hex(0x713b35), hex(0xf2c43c), 'nether_gold_ore', 7),
  bed:                () => grainy(hex(0xb94b43), 0.12, 'bed', { clumps: 5, clumpColor: hex(0x8b302d) }),
  bedrock:            () => grainy(hex(0x565656), 0.55, 'bedrock', { clumps: 10, clumpColor: hex(0x2a2a2a), clumpSize: 3 }),

  dirt:               () => grainy(DIRT_BROWN, 0.26, 'dirt', { clumps: 6 }),
  coarse_dirt:        () => grainy(hex(0x7d5535), 0.34, 'coarse_dirt', { clumps: 10 }),
  plains_soil:          () => TEXTURES.dirt(),
  forest_floor:         () => TEXTURES.dirt(),
  birch_soil:           () => TEXTURES.dirt(),
  jungle_soil:          () => TEXTURES.dirt(),
  savanna_soil:         () => TEXTURES.dirt(),
  taiga_soil:           () => TEXTURES.dirt(),
  swamp_mud:            () => TEXTURES.dirt(),
  alpine_gravel:        () => TEXTURES.gravel(),
  grass_block_top:    () => grainy(GRASS_GREEN, 0.22, 'grass_top', { clumps: 5 }),
  grass_block_side:   () => grassSide(DIRT_BROWN, GRASS_GREEN, 'grass_side'),
  podzol_top:         () => grainy(hex(0x6f4f22), 0.24, 'podzol_top', { clumps: 6 }),
  podzol_side:        () => grassSide(DIRT_BROWN, hex(0x6f4f22), 'podzol_side'),
  mycelium_top:       () => grainy(hex(0x755b82), 0.18, 'mycelium_top', { clumps: 7 }),
  mycelium_side:      () => grassSide(DIRT_BROWN, hex(0x755b82), 'mycelium_side'),
  sand:               () => grainy(hex(0xe0d5a6), 0.12, 'sand'),
  red_sand:           () => grainy(hex(0xb86b43), 0.16, 'red_sand', { clumps: 7, clumpColor: hex(0x985236) }),
  red_sandstone:      () => grainy(hex(0xb86b43), 0.12, 'red_sandstone', { clumps: 8, clumpColor: hex(0x985236) }),
  gravel:             () => grainy(hex(0x8d8a86), 0.32, 'gravel', { clumps: 12, clumpSize: 3 }),
  clay:               () => grainy(hex(0xa4a8b4), 0.14, 'clay'),
  snow:               () => grainy(hex(0xf4f8f8), 0.07, 'snow'),
  ice:                () => grainy(hex(0x92b8f0), 0.12, 'ice'),
  glass:              () => glassTile('glass'),
  white_wool:         () => grainy(hex(0xe8e5df), 0.08, 'white_wool', { clumps: 8, clumpColor: hex(0xd4d0c8) }),
  water:              () => waterTile('water'),
  torch:              () => torchTile('torch'),
  farmland:           () => grainy(hex(0x765638), 0.12, 'farmland', { clumps: 18, clumpColor: hex(0x4d3828) }),
  wheat_crop:         () => crossPlant('wheat_crop', (t, r) => {
    grassBlades(t, r, hex(0x91a83a));
    for (let y = 3; y < 15; y += 3) {
      const x = 5 + ((y * 7) % 7);
      setPx(t, x, y, 214, 189, 72);
      setPx(t, x + 1, y - 1, 225, 203, 97);
    }
  }),

  coal_ore:           () => oreTile(STONE_GREY, hex(0x1b1b1b), 'coal_ore', 6),
  iron_ore:           () => oreTile(STONE_GREY, hex(0xd8a582), 'iron_ore', 5),
  gold_ore:           () => oreTile(STONE_GREY, hex(0xf6d34a), 'gold_ore', 4),
  redstone_ore:       () => oreTile(STONE_GREY, hex(0xd42b2b), 'redstone_ore', 5),
  lapis_ore:          () => oreTile(STONE_GREY, hex(0x2a54c4), 'lapis_ore', 5),
  diamond_ore:        () => oreTile(STONE_GREY, hex(0x4fe4d8), 'diamond_ore', 4),
  emerald_ore:        () => oreTile(STONE_GREY, hex(0x30c94f), 'emerald_ore', 3),

  coal_block:         () => grainy(hex(0x1a1a1a), 0.3, 'coal_block'),
  iron_block:         () => grainy(hex(0xdcdcdc), 0.1, 'iron_block'),
  gold_block:         () => grainy(hex(0xf7d54c), 0.1, 'gold_block'),
  diamond_block:      () => grainy(hex(0x53e2d4), 0.12, 'diamond_block'),
  emerald_block:      () => grainy(hex(0x2fc74e), 0.12, 'emerald_block'),
  lapis_block:        () => grainy(hex(0x2b57c9), 0.16, 'lapis_block'),
  redstone_block:     () => grainy(hex(0xc22020), 0.16, 'redstone_block'),

  crafting_table_top:  () => planks(hex(0x9a7442), 'craft_top'),
  crafting_table_side: () => planks(hex(0x8d6a3c), 'craft_side'),
  chest_top:           () => chestTopTile('chest_top'),
  chest_side:          () => chestSideTile('chest_side'),
  furnace_top:         () => furnaceSideTile('furnace_top'),
  furnace_side:        () => furnaceSideTile('furnace_side'),
  furnace_front:       () => furnaceFrontTile('furnace_front'),
  mob_spawner:         () => {
    const tile = grainy(hex(0x343434), 0.2, 'mob_spawner', { clumps: 5 });
    const iron = hex(0x999999), dark = hex(0x242424), ember = hex(0x9b633b);
    // Pixel-art cage bars with a small warm core; the block remains decorative
    // until the spawner simulation is implemented.
    for (let p = 2; p < 14; p += 3) {
      for (let y = 1; y < 15; y++) setPx(tile, p, y, iron[0], iron[1], iron[2]);
      for (let x = 1; x < 15; x++) setPx(tile, x, p, iron[0], iron[1], iron[2]);
    }
    for (let y = 5; y <= 10; y++) for (let x = 5; x <= 10; x++) {
      setPx(tile, x, y, dark[0], dark[1], dark[2]);
    }
    for (const [x, y] of [[7, 6], [8, 6], [6, 8], [9, 8], [8, 9]]) {
      setPx(tile, x, y, ember[0], ember[1], ember[2]);
    }
    return tile;
  },

  short_grass:        () => crossPlant('short_grass', (t, r) => grassBlades(t, r, GRASS_GREEN)),
  fern:               () => crossPlant('fern', (t, r) => grassBlades(t, r, hex(0x5f9440))),
  dead_bush:          () => crossPlant('dead_bush', (t, r) => grassBlades(t, r, hex(0x8a6a35))),
  red_mushroom:       () => crossPlant('red_mushroom', (t) => { for (let y=3;y<13;y++) for (let x=4;x<12;x++) if ((x-8)**2+(y-7)**2<19) setPx(t,x,y,190,48,42); setPx(t,8,12,224,210,184); }),
  brown_mushroom:     () => crossPlant('brown_mushroom', (t) => { for (let y=4;y<12;y++) for (let x=4;x<12;x++) if ((x-8)**2+(y-7)**2<20) setPx(t,x,y,126,83,54); setPx(t,8,12,224,210,184); }),
  bamboo:             () => crossPlant('bamboo', (t) => { for (let y=1;y<15;y++) { setPx(t,7,y,75,139,48); setPx(t,8,y,105,170,61); } for (let x=5;x<11;x++) setPx(t,x,5,54,105,39); for (let x=5;x<11;x++) setPx(t,x,11,54,105,39); }),
  vine:               () => crossPlant('vine', (t) => { for (let y=0;y<16;y++) for (let x=4;x<12;x++) if ((x+y)%4!==0) setPx(t,x,y,58,105,45); }),
  dandelion:          () => crossPlant('dandelion', (t, r) => flower(t, r, hex(0x4f8f38), hex(0xf5d63a), hex(0xfff2a0))),
  poppy:              () => crossPlant('poppy', (t, r) => flower(t, r, hex(0x4f8f38), hex(0xd93b30), hex(0x2a2a2a))),
};

// The 1.12.2 dye palette is shared by wool, stained glass, terracotta and
// concrete. These procedural tiles keep every registered color visible.
const DYE_PALETTE = {
  white: 0xe8e5df, orange: 0xd97827, magenta: 0xb34bb7, light_blue: 0x6699d8,
  yellow: 0xe5c83b, lime: 0x7fbd32, pink: 0xd77eaa, gray: 0x474f52,
  light_gray: 0x9a9a91, cyan: 0x2e8b86, purple: 0x7d3fb2, blue: 0x3546a5,
  brown: 0x68452b, green: 0x536b2f, red: 0x9f302b, black: 0x242424,
};
for (const [color, rgb] of Object.entries(DYE_PALETTE)) {
  const tint = hex(rgb);
  if (color !== 'white') TEXTURES[`${color}_wool`] = () => grainy(tint, 0.08, `${color}_wool`);
  TEXTURES[`${color}_terracotta`] = () => grainy(tint, 0.05, `${color}_terracotta`);
  TEXTURES[`${color}_concrete`] = () => grainy(tint, 0.015, `${color}_concrete`);
  TEXTURES[`${color}_concrete_powder`] = () => grainy(tint, 0.09, `${color}_concrete_powder`);
  TEXTURES[`${color}_stained_glass`] = () => glassTile(`${color}_stained_glass`, tint);
}

// Wood species expand into their four textures each.
for (const [species, c] of Object.entries(WOOD)) {
  TEXTURES[`${species}_log`] = () => barkSide(c.bark, `${species}_log`);
  TEXTURES[`${species}_log_top`] = () => logTop(c.bark, c.inner, `${species}_log_top`);
  TEXTURES[`${species}_planks`] = () => planks(c.planks, `${species}_planks`);
  TEXTURES[`${species}_leaves`] = () => leaves(c.leaves, `${species}_leaves`);
  TEXTURES[`${species}_sapling`] = () =>
    crossPlant(`${species}_sapling`, (t, r) => grassBlades(t, r, c.sapling));
  // Offline fallback tiles; Java 1.19 resource-pack images override these.
  TEXTURES[`${species}_door_bottom`] = () => doorPanelTile(c.planks, `${species}_door_bottom`, false);
  TEXTURES[`${species}_door_top`] = () => doorPanelTile(c.planks, `${species}_door_top`, true);
  TEXTURES[`${species}_trapdoor`] = () => trapdoorPanelTile(c.planks, `${species}_trapdoor`);
  TEXTURES[`${species}_button`] = () => buttonTile(c.planks, `${species}_button`);
  TEXTURES[`${species}_pressure_plate`] = () => pressurePlateTile(c.planks, `${species}_pressure_plate`);
}

TEXTURES.iron_door_bottom = () => ironDoorPanelTile(false);
TEXTURES.iron_door_top = () => ironDoorPanelTile(true);
TEXTURES.iron_trapdoor = () => ironDoorPanelTile(false);
TEXTURES.stone_button = () => buttonTile(hex(0x858585), 'stone_button');
TEXTURES.polished_blackstone_button = () => buttonTile(hex(0x38333a), 'polished_blackstone_button');
TEXTURES.stone_pressure_plate = () => pressurePlateTile(hex(0x858585), 'stone_pressure_plate');
TEXTURES.polished_blackstone_pressure_plate = () => pressurePlateTile(hex(0x38333a), 'polished_blackstone_pressure_plate');
TEXTURES.redstone_torch = () => {
  const tile = torchTile(0x7ed51);
  const red = hex(0xe52a2a), bright = hex(0xff5555);
  for (const [x,y] of [[7,4],[8,4],[6,5],[9,5],[7,6],[8,6]]) {
    const c = (x+y)%2 ? red : bright;
    setPx(tile,x,y,c[0],c[1],c[2]);
  }
  return tile;
};
TEXTURES.repeater = () => {
  const tile = grainy(hex(0x777777), 0.12, 'repeater');
  const red = hex(0xb92727), dark = hex(0x3e3030);
  for (let x=2;x<14;x++) for(let y=6;y<10;y++) {
    const c = (x===3 || x===12) ? red : dark;
    setPx(tile,x,y,c[0],c[1],c[2]);
  }
  for (const x of [4,5,10,11]) for(let y=5;y<11;y++) setPx(tile,x,y,red[0],red[1],red[2]);
  return tile;
};
TEXTURES.light_weighted_pressure_plate = () => pressurePlateTile(hex(0xd8ad35), 'light_weighted_pressure_plate');
TEXTURES.heavy_weighted_pressure_plate = () => pressurePlateTile(hex(0xb8b8b8), 'heavy_weighted_pressure_plate');
TEXTURES.redstone_wire = () => {
  const tile = grainy(hex(0x8f1717), 0.1, 'redstone_wire');
  const red = hex(0xd52c2c), dark = hex(0x701010);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    if ((x + y) % 4 === 0 || (x % 5 === 0 && y % 3 === 0)) {
      const c = (x + y) % 2 ? red : dark;
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }
  return tile;
};
TEXTURES.dropper = () => {
  const tile=grainy(hex(0x777777),0.16,'dropper'), dark=hex(0x252525), rim=hex(0x4a4a4a), iron=hex(0x999999);
  for(let y=2;y<14;y++) for(let x=2;x<14;x++) {
    const hole=x>=5&&x<=10&&y>=5&&y<=10;
    const edge=x===2||x===13||y===2||y===13;
    const c=hole?dark:edge?rim:iron; setPx(tile,x,y,c[0],c[1],c[2]);
  }
  return tile;
};
TEXTURES.observer = () => {
  const tile=grainy(hex(0x777777),0.12,'observer'), stone=hex(0x777777), face=hex(0x454545), eye=hex(0xb32626), pupil=hex(0x241010);
  for(let y=1;y<15;y++) for(let x=1;x<15;x++) { const c=(x<3||x>12||y<3||y>12)?stone:face; setPx(tile,x,y,c[0],c[1],c[2]); }
  for(let y=5;y<11;y++) for(let x=5;x<11;x++) setPx(tile,x,y,eye[0],eye[1],eye[2]);
  for(let y=7;y<9;y++) for(let x=7;x<9;x++) setPx(tile,x,y,pupil[0],pupil[1],pupil[2]);
  return tile;
};
TEXTURES.target = () => {
  const tile=grainy(hex(0xf0f0f0),0.06,'target');
  const red=hex(0xc72b2b), white=hex(0xf4f0e8), dark=hex(0x8f1c1c);
  for(let y=0;y<16;y++) for(let x=0;x<16;x++) {
    const d=Math.hypot(x-7.5,y-7.5);
    const c=d<2?dark:d<4?white:d<6?red:d<7?white:red;
    setPx(tile,x,y,c[0],c[1],c[2]);
  }
  return tile;
};
TEXTURES.hopper = () => {
  const tile = grainy(hex(0x777777), 0.16, 'hopper');
  const dark = hex(0x343434), iron = hex(0xb0b0b0), rim = hex(0x555555);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    const edge = x < 4 || x > 11 || y < 4 || y > 11;
    const throat = x >= 6 && x <= 9 && y >= 6 && y <= 10;
    const c = throat ? dark : edge ? rim : iron;
    setPx(tile, x, y, c[0], c[1], c[2]);
  }
  return tile;
};
TEXTURES.redstone_lamp = () => {
  const tile = grainy(hex(0x8d7856), 0.1, 'redstone_lamp');
  const gold = hex(0xe4b94e), pale = hex(0xffe8a0), dark = hex(0x5d4932);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    const edge = x < 4 || x > 11 || y < 4 || y > 11;
    const c = edge ? dark : ((x + y) % 3 === 0 ? gold : pale);
    setPx(tile, x, y, c[0], c[1], c[2]);
  }
  return tile;
};
TEXTURES.glowstone = () => {
  const tile = grainy(hex(0xb98b45), 0.22, 'glowstone');
  const bright = hex(0xf6d78b), pale = hex(0xffedb0), dark = hex(0x8c5f2d);
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
    const n = (x * 7 + y * 11) % 9;
    const c = n < 2 ? dark : n < 6 ? bright : pale;
    setPx(tile, x, y, c[0], c[1], c[2]);
  }
  return tile;
};
TEXTURES.comparator = () => {
  const tile = grainy(hex(0x777777), 0.1, 'comparator');
  const stone = hex(0x9b9b9b), red = hex(0xb72b2b), dark = hex(0x4b2424), quartz = hex(0xd9c9a8);
  for (let y = 4; y < 12; y++) for (let x = 2; x < 14; x++) {
    const c = (x < 5 || x > 10) ? stone : (y >= 7 && y <= 8 ? red : dark);
    setPx(tile, x, y, c[0], c[1], c[2]);
  }
  for (let y = 6; y < 10; y++) for (let x = 7; x < 9; x++) setPx(tile, x, y, quartz[0], quartz[1], quartz[2]);
  return tile;
};
TEXTURES.note_block = () => {
  const tile = planks(hex(0x8b5a32), 'note_block');
  const dark = hex(0x35251b), top = hex(0xb77a46);
  for(let y=1;y<15;y++) for(let x=1;x<15;x++) {
    const edge=x===1||x===14||y===1||y===14;
    const c=edge?dark:top; setPx(tile,x,y,c[0],c[1],c[2]);
  }
  return tile;
};
TEXTURES.daylight_detector = () => {
  const tile = grainy(hex(0x795b3b), 0.08, 'daylight_detector');
  const quartz = hex(0xd6c6a5), dark = hex(0x4d3827), center = hex(0x9a7952);
  for(let y=2;y<14;y++) for(let x=2;x<14;x++) {
    const dx=x-7.5,dy=y-7.5,dist=dx*dx+dy*dy;
    const c=dist<7?quartz:dist<20?center:dark;
    setPx(tile,x,y,c[0],c[1],c[2]);
  }
  return tile;
};
TEXTURES.lever = () => {
  const tile = grainy(hex(0x777777), 0.12, 'lever');
  const light = hex(0xb0b0b0), dark = hex(0x454545);
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
    const c = (x + y) % 3 === 0 ? dark : light;
    setPx(tile, x, y, c[0], c[1], c[2]);
  }
  return tile;
};

// Piston textures are intentionally authored as pixel art fallbacks. A
// matching Java 1.19 resource-pack tile overrides these at startup.
function redstoneOreTile(lit = false) {
  const tile = grainy(hex(0x777777), 0.2, lit ? 'redstone_ore_lit' : 'redstone_ore', { clumps: 8, clumpColor: hex(0x555555) });
  const rng = new Random(lit ? 'redstone-ore-glow' : 'redstone-ore-dormant');
  const dark = hex(lit ? 0x8f1515 : 0x651515);
  const red = hex(lit ? 0xff4545 : 0xb52222);
  const bright = hex(0xff8b70);
  for (let i = 0; i < 34; i++) {
    const x = 1 + rng.nextInt(14), y = 1 + rng.nextInt(14);
    const c = lit && rng.nextDouble() < 0.22 ? bright : (rng.nextDouble() < 0.55 ? red : dark);
    setPx(tile, x, y, c[0], c[1], c[2]);
    if (lit && x < 15 && rng.nextDouble() < 0.25) setPx(tile, x + 1, y, c[0], c[1], c[2]);
  }
  return tile;
}
TEXTURES.redstone_ore = () => redstoneOreTile(false);
TEXTURES.redstone_ore_lit = () => redstoneOreTile(true);

TEXTURES.piston_side = () => {
  const tile = grainy(hex(0x777777), 0.12, 'piston_side');
  const stone = hex(0x777777), wood = hex(0x9b6a3b), dark = hex(0x4b3423), iron = hex(0xb8b8b8);
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
    let c = stone;
    if (x >= 4 && x <= 11 && y >= 4 && y <= 11) c = wood;
    if ((x === 3 || x === 12 || y === 3 || y === 12)) c = dark;
    if (x >= 6 && x <= 9 && (y === 2 || y === 13)) c = iron;
    setPx(tile, x, y, c[0], c[1], c[2]);
  }
  return tile;
};
TEXTURES.piston_top = () => {
  const tile = planks(hex(0xa47743), 'piston_top');
  const rim = hex(0x5b3d24), center = hex(0x9a6939);
  for (let i = 0; i < 16; i++) {
    for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) setPx(tile, x, y, rim[0], rim[1], rim[2]);
  }
  for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) setPx(tile, x, y, center[0], center[1], center[2]);
  return tile;
};
TEXTURES.sticky_piston_top = () => {
  const tile = TEXTURES.piston_top();
  const green = hex(0x75a83b), dark = hex(0x426b24), light = hex(0x9bc95a);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) {
    const c = (x === 4 || x === 11 || y === 4 || y === 11) ? dark
      : ((x + y) % 3 === 0 ? light : green);
    setPx(tile, x, y, c[0], c[1], c[2]);
  }
  return tile;
};
TEXTURES.piston_bottom = () => grainy(hex(0x777777), 0.12, 'piston_bottom');

/** Visible checkerboard fallback for a missing texture key. */
function missingTexture() {
  const out = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const i = (y * TILE_SIZE + x) * 4;
      const bright = ((x >> 2) + (y >> 2)) % 2 === 0;
      out[i] = bright ? 255 : 32;
      out[i + 1] = 0;
      out[i + 2] = bright ? 255 : 32;
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Generate every texture and pack them into one Uint8Array laid out as
 * consecutive layers, ready for texImage3D.
 *
 * @returns {{data: Uint8Array, layers: number, index: Map<string, number>, names: string[]}}
 */
export function buildTextures(overrides = null) {
  const names = ['__missing', ...new Set([...Object.keys(TEXTURES), ...(overrides ? [...overrides.keys()] : [])])].sort((a, b) => a === '__missing' ? -1 : b === '__missing' ? 1 : a.localeCompare(b));
  const layers = names.length;
  const data = new Uint8Array(TILE_SIZE * TILE_SIZE * 4 * layers);
  const index = new Map();

  names.forEach((name, layer) => {
    index.set(name, layer);
    const tile = name === '__missing' ? missingTexture() : (overrides?.get(name) ?? (TEXTURES[name] ? TEXTURES[name]() : missingTexture()));
    data.set(tile, layer * TILE_SIZE * TILE_SIZE * 4);
  });

  return { data, layers, index, names };
}

/**
 * Map every registered block's faces to texture layer indices.
 *
 * Returns a flat Uint16Array of 6 layers per blockstate, indexed by runtime ID,
 * so the mesher resolves a face texture with one array read and no branching.
 * An unresolved name falls back to the missing-texture checker rather than
 * throwing, because one typo should not prevent the world from rendering.
 *
 * Face order matches FACES in core/math.js: down, up, north, south, west, east.
 */
export function buildBlockTextureTable(blocks, textureIndex) {
  const states = blocks.statesById;
  const table = new Uint16Array(states.length * 6);
  const missing = textureIndex.get('__missing');
  // Never render the magenta diagnostic checker in normal gameplay. A typo or
  // an unavailable pack tile falls back to a neutral stone texture instead.
  const safeFallback = textureIndex.get('stone') ?? missing;
  const unresolved = new Set();

  const layerFor = (name) => {
    if (!name) return safeFallback;
    const layer = textureIndex.get(name);
    if (layer === undefined) {
      unresolved.add(name);
      return safeFallback;
    }
    return layer;
  };

  for (let i = 0; i < states.length; i++) {
    const block = states[i].block;
    const t = block.textures;
    let faces;
    if (block.doorTextures) {
      const texture = layerFor(block.doorTextures[states[i].values?.half] ?? block.texture);
      faces = [texture, texture, texture, texture, texture, texture];
    } else if (t) {
      faces = [
        layerFor(t.bottom ?? t.side ?? t.all),
        layerFor(t.top ?? t.side ?? t.all),
        layerFor(t.north ?? t.side ?? t.all),
        layerFor(t.south ?? t.side ?? t.all),
        layerFor(t.west ?? t.side ?? t.all),
        layerFor(t.east ?? t.side ?? t.all),
      ];
    } else {
      const single = layerFor(block.texture);
      faces = [single, single, single, single, single, single];
    }

    // Logs rotate: an axis=x log shows its rings on the east and
    // west faces instead of top and bottom.
    const axis = states[i].values?.axis;
    if (axis === 'x') faces = [faces[2], faces[2], faces[0], faces[0], faces[1], faces[1]];
    else if (axis === 'z') faces = [faces[2], faces[2], faces[1], faces[1], faces[0], faces[0]];

    table.set(faces, i * 6);
  }

  if (unresolved.size > 0) {
    console.warn(
      `[atlas] ${unresolved.size} unresolved texture name(s), using stone fallback: ` +
      `${[...unresolved].sort().join(', ')}`,
    );
  }

  return table;
}

export { TEXTURES };
