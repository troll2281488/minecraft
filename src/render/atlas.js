/**
 * Procedurally generated block textures.
 *
 * All original 16x16 pixel art, drawn in code at startup. Minecraft's actual
 * textures are copyrighted and are not used; see README.md.
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
function glassTile(seed) {
  const rng = new Random(seed);
  const tile = newTile();
  const frame = hex(0xd8f0f4);
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

// ---------------------------------------------------------------------------
// The texture table
// ---------------------------------------------------------------------------

const STONE_GREY = hex(0x7d7d7d);
const DEEPSLATE = hex(0x4f4f55);
const DIRT_BROWN = hex(0x8a5f3c);
const GRASS_GREEN = hex(0x7cb342);

const WOOD = {
  oak:    { bark: hex(0x6c5432), inner: hex(0xb08b52), planks: hex(0xb08b52), leaves: hex(0x4f8f38), sapling: hex(0x4f8f38) },
  birch:  { bark: hex(0xd7d3c9), inner: hex(0xd4c9a4), planks: hex(0xd4c9a4), leaves: hex(0x80a755), sapling: hex(0x80a755) },
  spruce: { bark: hex(0x4a3823), inner: hex(0x7b5a33), planks: hex(0x7b5a33), leaves: hex(0x3f6b3a), sapling: hex(0x3f6b3a) },
};

/**
 * Every texture, keyed by the name blocks refer to.
 *
 * Each entry is a thunk so nothing is generated until buildTextures() runs --
 * importing this module should not cost 60 texture generations.
 */
const TEXTURES = {
  stone:              () => grainy(STONE_GREY, 0.2, 'stone', { clumps: 5 }),
  cobblestone:        () => cobble(STONE_GREY, 'cobblestone'),
  granite:            () => grainy(hex(0x9a6a5a), 0.24, 'granite', { clumps: 7 }),
  polished_granite:   () => grainy(hex(0xa2705f), 0.1, 'polished_granite'),
  diorite:            () => grainy(hex(0xcfcfcf), 0.26, 'diorite', { clumps: 7, clumpColor: hex(0x9d9d9d) }),
  polished_diorite:   () => grainy(hex(0xd6d6d6), 0.1, 'polished_diorite'),
  andesite:           () => grainy(hex(0x8a8a8a), 0.22, 'andesite', { clumps: 6 }),
  polished_andesite:  () => grainy(hex(0x929292), 0.1, 'polished_andesite'),
  sandstone:          () => grainy(hex(0xdbd0a0), 0.14, 'sandstone'),
  obsidian:           () => grainy(hex(0x150c24), 0.55, 'obsidian', { clumps: 6, clumpColor: hex(0x2d1a4a) }),
  deepslate:          () => barkSide(DEEPSLATE, 'deepslate'),
  deepslate_top:      () => grainy(DEEPSLATE, 0.18, 'deepslate_top'),
  cobbled_deepslate:  () => cobble(DEEPSLATE, 'cobbled_deepslate'),
  bedrock:            () => grainy(hex(0x565656), 0.55, 'bedrock', { clumps: 10, clumpColor: hex(0x2a2a2a), clumpSize: 3 }),

  dirt:               () => grainy(DIRT_BROWN, 0.26, 'dirt', { clumps: 6 }),
  coarse_dirt:        () => grainy(hex(0x7d5535), 0.34, 'coarse_dirt', { clumps: 10 }),
  grass_block_top:    () => grainy(GRASS_GREEN, 0.22, 'grass_top', { clumps: 5 }),
  grass_block_side:   () => grassSide(DIRT_BROWN, GRASS_GREEN, 'grass_side'),
  podzol_top:         () => grainy(hex(0x6f4f22), 0.24, 'podzol_top', { clumps: 6 }),
  podzol_side:        () => grassSide(DIRT_BROWN, hex(0x6f4f22), 'podzol_side'),
  sand:               () => grainy(hex(0xe0d5a6), 0.12, 'sand'),
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
  copper_ore:         () => oreTile(STONE_GREY, hex(0xd07f4a), 'copper_ore', 5),
  gold_ore:           () => oreTile(STONE_GREY, hex(0xf6d34a), 'gold_ore', 4),
  redstone_ore:       () => oreTile(STONE_GREY, hex(0xd42b2b), 'redstone_ore', 5),
  lapis_ore:          () => oreTile(STONE_GREY, hex(0x2a54c4), 'lapis_ore', 5),
  diamond_ore:        () => oreTile(STONE_GREY, hex(0x4fe4d8), 'diamond_ore', 4),
  emerald_ore:        () => oreTile(STONE_GREY, hex(0x30c94f), 'emerald_ore', 3),

  coal_block:         () => grainy(hex(0x1a1a1a), 0.3, 'coal_block'),
  iron_block:         () => grainy(hex(0xdcdcdc), 0.1, 'iron_block'),
  copper_block:       () => grainy(hex(0xc26a3d), 0.12, 'copper_block'),
  gold_block:         () => grainy(hex(0xf7d54c), 0.1, 'gold_block'),
  diamond_block:      () => grainy(hex(0x53e2d4), 0.12, 'diamond_block'),
  emerald_block:      () => grainy(hex(0x2fc74e), 0.12, 'emerald_block'),
  lapis_block:        () => grainy(hex(0x2b57c9), 0.16, 'lapis_block'),
  redstone_block:     () => grainy(hex(0xc22020), 0.16, 'redstone_block'),

  crafting_table_top:  () => planks(hex(0x9a7442), 'craft_top'),
  crafting_table_side: () => planks(hex(0x8d6a3c), 'craft_side'),

  short_grass:        () => crossPlant('short_grass', (t, r) => grassBlades(t, r, GRASS_GREEN)),
  fern:               () => crossPlant('fern', (t, r) => grassBlades(t, r, hex(0x5f9440))),
  dead_bush:          () => crossPlant('dead_bush', (t, r) => grassBlades(t, r, hex(0x8a6a35))),
  dandelion:          () => crossPlant('dandelion', (t, r) => flower(t, r, hex(0x4f8f38), hex(0xf5d63a), hex(0xfff2a0))),
  poppy:              () => crossPlant('poppy', (t, r) => flower(t, r, hex(0x4f8f38), hex(0xd93b30), hex(0x2a2a2a))),
};

// Wood species expand into their four textures each.
for (const [species, c] of Object.entries(WOOD)) {
  TEXTURES[`${species}_log`] = () => barkSide(c.bark, `${species}_log`);
  TEXTURES[`${species}_log_top`] = () => logTop(c.bark, c.inner, `${species}_log_top`);
  TEXTURES[`${species}_planks`] = () => planks(c.planks, `${species}_planks`);
  TEXTURES[`${species}_leaves`] = () => leaves(c.leaves, `${species}_leaves`);
  TEXTURES[`${species}_sapling`] = () =>
    crossPlant(`${species}_sapling`, (t, r) => grassBlades(t, r, c.sapling));
}

// Deepslate ore variants reuse the ore generator over a deepslate base.
for (const oreName of [
  'coal_ore', 'iron_ore', 'copper_ore', 'gold_ore',
  'redstone_ore', 'lapis_ore', 'diamond_ore', 'emerald_ore',
]) {
  const gemColors = {
    coal_ore: 0x1b1b1b, iron_ore: 0xd8a582, copper_ore: 0xd07f4a, gold_ore: 0xf6d34a,
    redstone_ore: 0xd42b2b, lapis_ore: 0x2a54c4, diamond_ore: 0x4fe4d8, emerald_ore: 0x30c94f,
  };
  TEXTURES[`deepslate_${oreName}`] =
    () => oreTile(DEEPSLATE, hex(gemColors[oreName]), `deepslate_${oreName}`, 5);
}

/** The magenta-and-black checker shown for any texture that failed to resolve. */
function missingTexture() {
  const tile = newTile();
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const c = ((x >> 3) ^ (y >> 3)) & 1 ? [0, 0, 0] : [248, 0, 248];
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
  }
  return tile;
}

// ---------------------------------------------------------------------------
// Building the array
// ---------------------------------------------------------------------------

/**
 * Generate every texture and pack them into one Uint8Array laid out as
 * consecutive layers, ready for texImage3D.
 *
 * @returns {{data: Uint8Array, layers: number, index: Map<string, number>, names: string[]}}
 */
export function buildTextures() {
  const names = ['__missing', ...Object.keys(TEXTURES).sort()];
  const layers = names.length;
  const data = new Uint8Array(TILE_SIZE * TILE_SIZE * 4 * layers);
  const index = new Map();

  names.forEach((name, layer) => {
    index.set(name, layer);
    const tile = name === '__missing' ? missingTexture() : TEXTURES[name]();
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
  const unresolved = new Set();

  const layerFor = (name) => {
    if (!name) return missing;
    const layer = textureIndex.get(name);
    if (layer === undefined) {
      unresolved.add(name);
      return missing;
    }
    return layer;
  };

  for (let i = 0; i < states.length; i++) {
    const block = states[i].block;
    const t = block.textures;
    let faces;
    if (t) {
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

    // Logs and deepslate rotate: an axis=x log shows its rings on the east and
    // west faces instead of top and bottom.
    const axis = states[i].values?.axis;
    if (axis === 'x') faces = [faces[2], faces[2], faces[0], faces[0], faces[1], faces[1]];
    else if (axis === 'z') faces = [faces[2], faces[2], faces[1], faces[1], faces[0], faces[0]];

    table.set(faces, i * 6);
  }

  if (unresolved.size > 0) {
    console.warn(
      `[atlas] ${unresolved.size} unresolved texture name(s), showing the missing ` +
      `checker: ${[...unresolved].sort().join(', ')}`,
    );
  }

  return table;
}

export { TEXTURES };
