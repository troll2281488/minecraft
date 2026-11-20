/**
 * Phase 1 terrain generation.
 *
 * A deliberately simplified ancestor of what Phase 2 will replace it with. This
 * uses a 2D heightmap with a 3D density field carved through it, which produces
 * good-looking hills, cliffs, and caves. The full 1.12.2 biome placement and structure generation are still pending.
 *
 * WHY THAT ORDER IS SAFE
 *
 * Replacing a generator normally means either regenerating existing worlds
 * (destroying what players built) or living with a permanent seam. Guarantee 5
 * in docs/SAVE_FORMAT.md is what makes this a non-event: every chunk stores the
 * generatorVersion that produced it and is never regenerated. A Phase 1 world
 * keeps its Phase 1 terrain forever; only newly explored chunks use the new
 * generator. This is exactly how Minecraft behaves across its own world
 * generation changes, seams and all.
 *
 * Worker-safe: no DOM, no shared mutable state, deterministic from seed alone.
 */

import { OctaveNoise, PerlinNoise } from './noise.js';
import { Random, positionalRandom, normalizeSeed } from '../../core/rng.js';
import { Chunk, GEN_STAGE } from '../chunk.js';
import { BLOCKS } from '../block.js';
import { CHUNK_SIZE, MIN_Y, MAX_Y, SEA_LEVEL } from '../../core/constants.js';
import { clamp } from '../../core/math.js';
import { buildTree, TREE_MARGIN } from './trees.js';
import { hash01, seedToInt } from './hash.js';
import { ChunkWriter, mineshaftPlan, placeMineshaftPlan, placeDungeonRoom, villagePlan, placeVillagePlan, villageStyleForBiome } from './structures.js';

/** Bumped whenever generation output changes. Stored per world. */
export const GENERATOR_VERSION = 19;


// ---------------------------------------------------------------------------
// Biomes
//
// A small set for Phase 1, selected by temperature and humidity. Enough for the
// world to look varied; the real ~24-biome multi-noise placement is Phase 2.
// ---------------------------------------------------------------------------

export const BIOME = {
  OCEAN:'mc:ocean', DEEP_OCEAN:'mc:deep_ocean', WARM_OCEAN:'mc:warm_ocean',
  LUKEWARM_OCEAN:'mc:lukewarm_ocean', DEEP_LUKEWARM_OCEAN:'mc:deep_lukewarm_ocean',
  COLD_OCEAN:'mc:cold_ocean', DEEP_COLD_OCEAN:'mc:deep_cold_ocean',
  FROZEN_OCEAN:'mc:frozen_ocean', DEEP_FROZEN_OCEAN:'mc:deep_frozen_ocean',
  BEACH:'mc:beach', SNOWY_BEACH:'mc:snowy_beach', STONE_SHORE:'mc:stone_shore',
  RIVER:'mc:river', FROZEN_RIVER:'mc:frozen_river',
  PLAINS:'mc:plains', SUNFLOWER_PLAINS:'mc:sunflower_plains',
  FOREST:'mc:forest', FLOWER_FOREST:'mc:flower_forest',
  BIRCH_FOREST:'mc:birch_forest', TALL_BIRCH_FOREST:'mc:tall_birch_forest',
  DARK_FOREST:'mc:roofed_forest', JUNGLE:'mc:jungle',
  SPARSE_JUNGLE:'mc:sparse_jungle', BAMBOO_JUNGLE:'mc:bamboo_jungle',
  DESERT:'mc:desert', SAVANNA:'mc:savanna', SAVANNA_PLATEAU:'mc:savanna_plateau',
  SHATTERED_SAVANNA:'mc:shattered_savanna', BADLANDS:'mc:mesa',
  WOODED_BADLANDS:'mc:wooded_badlands', ERODED_BADLANDS:'mc:eroded_badlands',
  MOUNTAINS:'mc:mountains', WINDSWEPT_HILLS:'mc:windswept_hills',
  SNOWY_PLAINS:'mc:snowy_plains', ICE_SPIKES:'mc:ice_spikes',
  TAIGA:'mc:taiga', SNOWY_TAIGA:'mc:snowy_taiga',
  GIANT_TREE_TAIGA:'mc:mega_taiga', GIANT_SPRUCE_TAIGA:'mc:giant_spruce_taiga',
  SWAMP:'mc:swampland', MUSHROOM_FIELDS:'mc:mushroom_island',
  DESERT_HILLS:'mc:desert_hills', FOREST_HILLS:'mc:forest_hills', TAIGA_HILLS:'mc:taiga_hills',
  EXTREME_HILLS_EDGE:'mc:extreme_hills_edge', EXTREME_HILLS_PLUS:'mc:extreme_hills_plus',
  JUNGLE_HILLS:'mc:jungle_hills', JUNGLE_EDGE:'mc:jungle_edge', BIRCH_FOREST_HILLS:'mc:birch_forest_hills',
  COLD_TAIGA:'mc:cold_taiga', COLD_TAIGA_HILLS:'mc:cold_taiga_hills',
  MEGA_TAIGA_HILLS:'mc:mega_taiga_hills', MESA_PLATEAU:'mc:mesa_clear_rock', MESA_PLATEAU_F:'mc:mesa_rock',
};

export const BIOME_SURFACE = {
  [BIOME.OCEAN]: { top:'mc:gravel', filler:'mc:dirt', trees:0, grass:0 },
  [BIOME.DEEP_OCEAN]: { top:'mc:gravel', filler:'mc:stone', trees:0, grass:0 },
  [BIOME.WARM_OCEAN]: { top:'mc:sand', filler:'mc:sand', trees:0, grass:0 },
  [BIOME.LUKEWARM_OCEAN]: { top:'mc:sand', filler:'mc:sand', trees:0, grass:0 },
  [BIOME.DEEP_LUKEWARM_OCEAN]: { top:'mc:gravel', filler:'mc:stone', trees:0, grass:0 },
  [BIOME.COLD_OCEAN]: { top:'mc:gravel', filler:'mc:dirt', trees:0, grass:0 },
  [BIOME.DEEP_COLD_OCEAN]: { top:'mc:gravel', filler:'mc:stone', trees:0, grass:0 },
  [BIOME.FROZEN_OCEAN]: { top:'mc:ice', filler:'mc:gravel', trees:0, grass:0 },
  [BIOME.DEEP_FROZEN_OCEAN]: { top:'mc:ice', filler:'mc:stone', trees:0, grass:0 },
  [BIOME.BEACH]: { top:'mc:sand', filler:'mc:sand', trees:0, grass:0 },
  [BIOME.SNOWY_BEACH]: { top:'mc:snow_block', filler:'mc:sand', trees:0, grass:0 },
  [BIOME.STONE_SHORE]: { top:'mc:stone', filler:'mc:stone', trees:0, grass:0 },
  [BIOME.RIVER]: { top:'mc:gravel', filler:'mc:sand', trees:0, grass:0 },
  [BIOME.FROZEN_RIVER]: { top:'mc:ice', filler:'mc:gravel', trees:0, grass:0 },
  [BIOME.PLAINS]: { top:'mc:grass_block', filler:'mc:dirt', trees:0, grass:0.24 },
  [BIOME.SUNFLOWER_PLAINS]: { top:'mc:grass_block', filler:'mc:dirt', trees:0, grass:0.34, flowers:0.24 },
  [BIOME.FOREST]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.052, grass:0.15, species:'oak' },
  [BIOME.FLOWER_FOREST]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.045, grass:0.52, species:'oak', flowers:0.82 },
  [BIOME.BIRCH_FOREST]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.065, grass:0.16, species:'birch' },
  [BIOME.TALL_BIRCH_FOREST]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.075, grass:0.12, species:'birch' },
  [BIOME.DARK_FOREST]: { top:'mc:podzol', filler:'mc:dirt', trees:0.075, grass:0.08, species:'dark_oak' },
  [BIOME.JUNGLE]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.14, grass:0.28, species:'jungle', ferns:0.42 },
  [BIOME.SPARSE_JUNGLE]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.075, grass:0.24, species:'jungle', ferns:0.24 },
  [BIOME.BAMBOO_JUNGLE]: { top:'mc:podzol', filler:'mc:dirt', trees:0.13, grass:0.26, species:'jungle', ferns:0.4 },
  [BIOME.DESERT]: { top:'mc:sand', filler:'mc:sand', trees:0, grass:0, deadBush:0.025 },
  [BIOME.SAVANNA]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.042, grass:0.48, species:'acacia', deadBush:0.006 },
  [BIOME.SAVANNA_PLATEAU]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.034, grass:0.42, species:'acacia', deadBush:0.008 },
  [BIOME.SHATTERED_SAVANNA]: { top:'mc:grass_block', filler:'mc:coarse_dirt', trees:0.022, grass:0.34, species:'acacia', deadBush:0.01 },
  [BIOME.BADLANDS]: { top:'mc:red_sand', filler:'mc:red_sand', trees:0, grass:0, deadBush:0.02 },
  [BIOME.WOODED_BADLANDS]: { top:'mc:red_sand', filler:'mc:red_sand', trees:0.012, grass:0.015, species:'oak', deadBush:0.012 },
  [BIOME.ERODED_BADLANDS]: { top:'mc:red_sand', filler:'mc:red_sand', trees:0, grass:0, deadBush:0.01 },
  [BIOME.MOUNTAINS]: { top:'mc:gravel', filler:'mc:stone', trees:0.004, grass:0.025, species:'oak' },
  [BIOME.WINDSWEPT_HILLS]: { top:'mc:gravel', filler:'mc:stone', trees:0.012, grass:0.04, species:'oak' },
  [BIOME.SNOWY_PLAINS]: { top:'mc:snow_block', filler:'mc:dirt', trees:0.002, grass:0 },
  [BIOME.ICE_SPIKES]: { top:'mc:snow_block', filler:'mc:dirt', trees:0.0035, grass:0, species:'ice_spike' },
  [BIOME.TAIGA]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.05, grass:0.12, species:'spruce' },
  [BIOME.SNOWY_TAIGA]: { top:'mc:snow_block', filler:'mc:dirt', trees:0.045, grass:0, species:'spruce' },
  [BIOME.GIANT_TREE_TAIGA]: { top:'mc:podzol', filler:'mc:dirt', trees:0.04, grass:0.08, ferns:0.25, mix:[['spruce',9],['boulder',1]] },
  [BIOME.GIANT_SPRUCE_TAIGA]: { top:'mc:podzol', filler:'mc:dirt', trees:0.045, grass:0.06, ferns:0.25, mix:[['spruce',9],['boulder',1]] },
  [BIOME.SWAMP]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.035, grass:0.12, species:'oak', ferns:0.06 },
  [BIOME.MUSHROOM_FIELDS]: { top:'mc:mycelium', filler:'mc:dirt', trees:0.002, grass:0.02, mushrooms:0.13 },
  [BIOME.DESERT_HILLS]: { top:'mc:sand', filler:'mc:sand', trees:0, grass:0, deadBush:0.025 },
  [BIOME.FOREST_HILLS]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.06, grass:0.15, species:'oak' },
  [BIOME.TAIGA_HILLS]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.055, grass:0.12, species:'spruce' },
  [BIOME.EXTREME_HILLS_EDGE]: { top:'mc:gravel', filler:'mc:stone', trees:0.006, grass:0.035, species:'oak' },
  [BIOME.EXTREME_HILLS_PLUS]: { top:'mc:gravel', filler:'mc:stone', trees:0.008, grass:0.02, species:'oak' },
  [BIOME.JUNGLE_HILLS]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.078, grass:0.18, species:'jungle', ferns:0.22 },
  [BIOME.JUNGLE_EDGE]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.028, grass:0.16, species:'jungle', ferns:0.08 },
  [BIOME.BIRCH_FOREST_HILLS]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.07, grass:0.14, species:'birch' },
  [BIOME.COLD_TAIGA]: { top:'mc:snow_block', filler:'mc:dirt', trees:0.046, grass:0, species:'spruce' },
  [BIOME.COLD_TAIGA_HILLS]: { top:'mc:snow_block', filler:'mc:dirt', trees:0.052, grass:0, species:'spruce' },
  [BIOME.MEGA_TAIGA_HILLS]: { top:'mc:podzol', filler:'mc:dirt', trees:0.068, grass:0.1, species:'spruce' },
  [BIOME.MESA_PLATEAU]: { top:'mc:red_sand', filler:'mc:red_sand', trees:0, grass:0, deadBush:0.01 },
  [BIOME.MESA_PLATEAU_F]: { top:'mc:red_sand', filler:'mc:red_sand', trees:0.006, grass:0.01, species:'oak', deadBush:0.01 },
};

const smooth01 = (v, a, b) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const quant = (v) => 0.5 + 0.5 * Math.tanh(0.8 * v / 0.19);

const COLD_BIOMES = new Set([
  BIOME.SNOWY_PLAINS, BIOME.ICE_SPIKES, BIOME.SNOWY_TAIGA, BIOME.GIANT_SPRUCE_TAIGA,
  BIOME.SNOWY_BEACH, BIOME.FROZEN_OCEAN, BIOME.DEEP_FROZEN_OCEAN, BIOME.FROZEN_RIVER,
]);
const BADLAND_BIOMES = new Set([BIOME.BADLANDS, BIOME.WOODED_BADLANDS, BIOME.ERODED_BADLANDS]);

// ---------------------------------------------------------------------------
// Ore distribution
//
// Minecraft 1.12.2 uses bounded ore distributions in classic 0..127 terrain.
// Most ores are uniform within their height range; lapis is triangular.
// ---------------------------------------------------------------------------

const ORES = [
  { block: 'mc:coal_ore',     veins: 20, size: 17, minY: 0, maxY: 127 },
  { block: 'mc:iron_ore',     veins: 24, size: 10, minY: 0, maxY: 63 },
  { block: 'mc:gold_ore',     veins: 3,  size: 10, minY: 0, maxY: 31 },
  { block: 'mc:redstone_ore', veins: 10, size: 9,  minY: 0, maxY: 15 },
  { block: 'mc:lapis_ore',    veins: 1,  size: 7,  minY: 0, maxY: 31, peak: 16, triangular: true },
  { block: 'mc:diamond_ore',  veins: 3,  size: 9,  minY: 0, maxY: 15 },
];

const DIRT_PATCHES = [
  { block: 'mc:dirt',    veins: 8, size: 22, minY: 0, maxY: 160 },
  { block: 'mc:gravel',  veins: 6, size: 20, minY: 0, maxY: 127 },
  { block: 'mc:granite', veins: 4, size: 24, minY: 0, maxY: 80 },
  { block: 'mc:diorite', veins: 4, size: 24, minY: 0, maxY: 80 },
  { block: 'mc:andesite',veins: 4, size: 24, minY: 0, maxY: 80 },
];

// ---------------------------------------------------------------------------

export class TerrainGenerator {
  constructor(seed, dimension = 'overworld') {
    this.seed = normalizeSeed(seed);
    this.dimension = ['overworld', 'nether', 'end'].includes(dimension) ? dimension : 'overworld';
    const root = new Random(this.seed);

    // Each noise field forks its own stream from a labelled sub-seed. Adding a
    // new noise field later therefore does not shift the values every existing
    // field draws -- which would silently change terrain for the same seed.
    this.continent = new OctaveNoise(root.fork('continent'), 4, 0.5, 2.0);
    this.detail = new OctaveNoise(root.fork('detail'), 4, 0.5, 2.2);
    this.ridge = new OctaveNoise(root.fork('ridge'), 4, 0.5, 2.0);
    this.temperature = new OctaveNoise(root.fork('temperature'), 3, 0.5, 2.0);
    this.humidity = new OctaveNoise(root.fork('humidity'), 3, 0.5, 2.0);
    this.biomeDetail = new OctaveNoise(root.fork('biome_detail'), 2, 0.55, 2.0);
    this.biomeRarity = new OctaveNoise(root.fork('biome_rarity'), 2, 0.5, 2.0);
    this.river = new OctaveNoise(root.fork('river'), 3, 0.5, 2.0);
    this.density = new OctaveNoise(root.fork('density'), 3, 0.5, 2.0);
    this.caveA = new PerlinNoise(root.fork('cave_a'));
    this.caveB = new PerlinNoise(root.fork('cave_b'));
    this.cheese = new OctaveNoise(root.fork('cheese'), 3, 0.5, 2.0);
    // Domain warp and climate fields from the user's worldgen archive.
    this.relief = new OctaveNoise(root.fork('relief'), 3, 0.5, 2.0);
    this.warp = new OctaveNoise(root.fork('warp'), 2, 0.5, 2.0);
    this.mesa = new OctaveNoise(root.fork('mesa'), 2, 0.5, 2.0);
    this.patch = new OctaveNoise(root.fork('patch'), 2, 0.5, 2.0);
    this.ravine = new OctaveNoise(root.fork('ravine'), 2, 0.5, 2.0);
    this.ravineMask = new OctaveNoise(root.fork('ravine_mask'), 2, 0.5, 2.0);

    this.hseed = seedToInt(this.seed);
    this.states = resolveStates();
    this.bands = this.buildTerracottaBands(root.fork('bands'));
  }

  buildTerracottaBands(rng) {
    const S=this.states.byId;
    const palette=['orange','orange','yellow','white','brown','red','light_gray','orange'];
    const out=new Array(MAX_Y).fill(S['mc:orange_terracotta']||S['mc:red_sand']);
    let y=0;
    while(y<MAX_Y){const color=palette[rng.nextInt(palette.length)],thick=1+rng.nextInt(4);
      const state=S[`mc:${color}_terracotta`]||S['mc:orange_terracotta']||S['mc:red_sand'];
      for(let k=0;k<thick&&y<MAX_Y;k++,y++)out[y]=state;
    }
    return out;
  }

  /** Warped, quantile-normalized climate fields shared by terrain and biome selection. */
  _fields(wx, wz) {
    const wxw = wx + this.warp.sample2(wx, wz, 0.004) * 24;
    const wzw = wz + this.warp.sample2(wz + 913, wx - 421, 0.004) * 24;
    const c = this.continent.sample2(wxw, wzw, 0.0021);
    const T = quant(this.temperature.sample2(wxw, wzw, 0.00125));
    const H = quant(this.humidity.sample2(wxw, wzw, 0.00135));
    const R = quant(this.biomeRarity.sample2(wxw, wzw, 0.0017));
    const D = quant(this.biomeDetail.sample2(wxw, wzw, 0.0045));
    const rel = quant(this.relief.sample2(wxw, wzw, 0.0042));
    const rv = this.river.sample2(wxw, wzw, 0.0021);
    const desertness = smooth01(T, 0.7, 0.8) * (1 - smooth01(H, 0.25, 0.4));
    const mesaZ = smooth01(T, 0.8, 0.88) * (1 - smooth01(H, 0.15, 0.3)) * smooth01(R, 0.35, 0.55) * smooth01(c, -0.03, 0.04);
    const mountM = smooth01(rel, 0.72, 0.9) * smooth01(c, -0.02, 0.2);
    const swampZ = smooth01(H, 0.8, 0.88) * smooth01(T, 0.3, 0.4) * (1 - smooth01(T, 0.64, 0.72)) * smooth01(c, -0.06, -0.02) * (1 - mountM);
    return { c, T, H, R, D, rel, rv, desertness, mesaZ, mountM, swampZ };
  }

  _height(f, wx, wz) {
    const detail = this.detail.sample2(wx, wz, 0.014);
    const landMask = smooth01(f.c, -0.105, -0.085);
    const depthT = smooth01(-f.c, 0.1, 0.3);
    const floor = SEA_LEVEL - 4 - depthT * 30 + detail * 2.5;
    let land = SEA_LEVEL + 2.4 + Math.max(0, f.c + 0.085) * 26 + detail * 2;
    const hillM = smooth01(f.rel, 0.5, 0.85) * (1 - f.desertness * 0.7);
    land += hillM * Math.max(0, this.detail.sample2(wx + 200, wz - 300, 0.03) + 0.06) * 45;
    if (f.mountM > 0.001) land += f.mountM * (this.ridge.ridged2(wx, wz, 0.005) * 62 - 14);
    // Ice-spike fields are actual terrain formations, not tiny packed-ice "trees".
    // Keep their footprint restricted to the same cold/rare climate used by _biome().
    const spikeClimate = smooth01(0.17 - f.T, 0.0, 0.12) *
      smooth01(f.R, 0.88, 0.96) * (1 - smooth01(f.rel, 0.48, 0.62)) *
      (1 - smooth01(f.H, 0.48, 0.66));
    if (spikeClimate > 0.01) {
      const peaks = this.ridge.ridged2(wx + 1700, wz - 900, 0.018);
      const spike = smooth01(peaks, 0.58, 0.82);
      land += spikeClimate * spike * 48;
    }
    if (f.mesaZ > 0.001) {
      const m = quant(this.mesa.sample2(wx, wz, 0.007)) * 4;
      const step = Math.floor(m) + smooth01(m - Math.floor(m), 0.82, 1);
      land = land * (1 - f.mesaZ) + (SEA_LEVEL + 5 + step * 7) * f.mesaZ;
    }
    if (f.swampZ > 0.001) land = land * (1 - f.swampZ) + (SEA_LEVEL - 0.6 + detail * 3.4) * f.swampZ;
    let h = floor * (1 - landMask) + land * landMask;
    const t = clamp(1 - Math.abs(f.rv) / 0.05, 0, 1);
    if (t > 0) {
      const blend = t * t * (3 - 2 * t) * landMask * (1 - f.mountM * 0.85);
      h = h * (1 - blend) + (SEA_LEVEL - 1.7) * blend;
    }
    return h;
  }

  _biome(f, height) {
    const { c, T, H, R, D, rel } = f, riverD = Math.abs(f.rv);
    const landish = smooth01(c, -0.105, -0.085) > 0.5, wet = height < SEA_LEVEL;
    if (wet) {
      if (!landish) {
        const deep = height < SEA_LEVEL - 14;
        if (T < 0.14) return deep ? BIOME.DEEP_FROZEN_OCEAN : BIOME.FROZEN_OCEAN;
        if (T < 0.34) return deep ? BIOME.DEEP_COLD_OCEAN : BIOME.COLD_OCEAN;
        if (T > 0.82) return deep ? BIOME.DEEP_LUKEWARM_OCEAN : BIOME.WARM_OCEAN;
        if (T > 0.64) return deep ? BIOME.DEEP_LUKEWARM_OCEAN : BIOME.LUKEWARM_OCEAN;
        return deep ? BIOME.DEEP_OCEAN : BIOME.OCEAN;
      }
      if (f.swampZ > 0.5) return BIOME.SWAMP;
      return T < 0.14 ? BIOME.FROZEN_RIVER : BIOME.RIVER;
    }
    if (c < -0.03 && height < SEA_LEVEL + 3) return T < 0.14 ? BIOME.SNOWY_BEACH : (rel > 0.72 ? BIOME.STONE_SHORE : BIOME.BEACH);
    if (riverD < 0.012 && height < SEA_LEVEL + 1) return T < 0.14 ? BIOME.FROZEN_RIVER : BIOME.RIVER;
    if (height > SEA_LEVEL + 34) return D > 0.55 ? BIOME.WINDSWEPT_HILLS : BIOME.MOUNTAINS;
    if (f.mesaZ > 0.5) return R > 0.85 ? BIOME.ERODED_BADLANDS : (D > 0.7 ? BIOME.WOODED_BADLANDS : BIOME.BADLANDS);
    if (f.swampZ > 0.5) return BIOME.SWAMP;
    if (R > 0.985 && H > 0.5 && c < 0.12) return BIOME.MUSHROOM_FIELDS;
    if (T < 0.17) {
      if (R > 0.9 && rel < 0.55 && H < 0.6) return BIOME.ICE_SPIKES;
      if (H > 0.62) return R > 0.78 ? BIOME.GIANT_SPRUCE_TAIGA : BIOME.SNOWY_TAIGA;
      if (H > 0.45 && D > 0.55) return BIOME.SNOWY_TAIGA;
      return BIOME.SNOWY_PLAINS;
    }
    if (T < 0.36) {
      if (H > 0.55) return R > 0.75 ? BIOME.GIANT_TREE_TAIGA : BIOME.TAIGA;
      if (H > 0.35) return D > 0.5 ? BIOME.TAIGA : BIOME.FOREST;
      return rel > 0.7 ? BIOME.WINDSWEPT_HILLS : BIOME.PLAINS;
    }
    if (T < 0.64) {
      if (H > 0.78) return D > 0.4 ? BIOME.DARK_FOREST : BIOME.TALL_BIRCH_FOREST;
      if (H > 0.45 && R > 0.66) return BIOME.FLOWER_FOREST;
      if (H > 0.6) return D > 0.45 ? BIOME.BIRCH_FOREST : BIOME.FOREST;
      if (H > 0.4) return D > 0.5 ? BIOME.FOREST : BIOME.PLAINS;
      return R > 0.9 ? BIOME.SUNFLOWER_PLAINS : BIOME.PLAINS;
    }
    if (T < 0.8) {
      if (H > 0.75) return D > 0.5 ? BIOME.FOREST : BIOME.BIRCH_FOREST;
      if (H > 0.45) return rel > 0.7 && D > 0.5 ? BIOME.SAVANNA_PLATEAU : BIOME.SAVANNA;
      if (H > 0.28) return R > 0.9 ? BIOME.SHATTERED_SAVANNA : BIOME.SAVANNA;
      return BIOME.DESERT;
    }
    if (H > 0.66) return R > 0.8 ? BIOME.BAMBOO_JUNGLE : (D > 0.6 ? BIOME.SPARSE_JUNGLE : BIOME.JUNGLE);
    return H > 0.4 ? BIOME.SAVANNA : BIOME.DESERT;
  }

  heightAt(wx, wz) { return this._height(this._fields(wx, wz), wx, wz); }
  biomeAt(wx, wz, height) {
    const f = this._fields(wx, wz);
    return this._biome(f, height === undefined ? this._height(f, wx, wz) : height);
  }
  column(wx, wz) {
    const f = this._fields(wx, wz), h = Math.floor(this._height(f, wx, wz));
    return { h, biome: this._biome(f, h), fields: f };
  }

  isCave(wx, wy, wz, height = 255, ravineR = -1) {
    if (wy <= MIN_Y + 4 || (height < SEA_LEVEL && wy > height - 5) || wy > 110) return false;
    if (ravineR >= 0 && wy >= 9 && wy <= height) {
      const profile = clamp(1 - Math.pow((wy - 42) / 40, 2), 0, 1);
      if (ravineR < 0.0026 * (0.35 + 2.2 * profile)) return true;
    }
    const a = this.caveA.sample3(wx * 0.014, wy * 0.022, wz * 0.014);
    const b = this.caveB.sample3(wx * 0.014, wy * 0.022, wz * 0.014);
    const cover = height - wy, limit = cover < 5 ? 0.0008 : 0.0034;
    if (a * a + b * b < limit) return true;
    return wy < 56 && cover > 6 && this.cheese.sample3(wx, wy * 1.6, wz, 0.009) > 0.27;
  }

  /** Fill a chunk with terrain, ores, surface material, and features. */
  generate(chunk) {
    if (this.dimension === 'nether') return this.generateNetherChunk(chunk);
    if (this.dimension === 'end') return this.generateEndChunk(chunk);
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const S = this.states;

    // Sample each climate column once. The same fields drive height, biome and ravine placement.
    const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    const biomes = new Array(CHUNK_SIZE * CHUNK_SIZE);
    const ravines = new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(-1);
    for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = baseX + x, wz = baseZ + z, col = this.column(wx, wz);
      const i = z * CHUNK_SIZE + x;
      heights[i] = col.h;
      biomes[i] = col.biome;
      if (col.h >= SEA_LEVEL + 2 && col.h > 36 && col.fields.mountM < 0.6 &&
          this.ravineMask.sample2(wx, wz, 0.0018) > 0.24) {
        ravines[i] = Math.abs(this.ravine.sample2(wx, wz, 0.0035));
      }
    }

    // Biome storage is 4x4x4; fill all vertical samples, not just the surface.
    for (let bz = 0; bz < 4; bz++) for (let bx = 0; bx < 4; bx++) {
      const biome = biomes[(bz * 4 + 2) * CHUNK_SIZE + bx * 4 + 2];
      for (let y = MIN_Y; y < MAX_Y; y += 4) chunk.setBiome(bx * 4, y, bz * 4, biome);
    }

    // --- Stone shell, caves, ravines, water and sea ice -------------------
    for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = baseX + x, wz = baseZ + z, i = z * CHUNK_SIZE + x;
      const height = heights[i], frozen = COLD_BIOMES.has(biomes[i]) && height < SEA_LEVEL;
      for (let y = MIN_Y; y <= Math.max(height, SEA_LEVEL); y++) {
        if (y === MIN_Y) { chunk.setBlock(x, y, z, S.bedrock); continue; }
        if (y < MIN_Y + 5) {
          const r = positionalRandom(this.seed, wx, y, wz, 7);
          if (r.nextInt(5) >= y - MIN_Y) { chunk.setBlock(x, y, z, S.bedrock); continue; }
        }
        if (y <= height) {
          if (!this.isCave(wx, y, wz, height, ravines[i])) chunk.setBlock(x, y, z, this.stoneFor(wx, y, wz));
        } else if (y <= SEA_LEVEL) {
          chunk.setBlock(x, y, z, frozen && y === SEA_LEVEL ? (S.byId['mc:ice'] || S.water) : S.water);
        }
      }
    }

    chunk.generatedStage = GEN_STAGE.TERRAIN;

    this.placePatches(chunk, baseX, baseZ);
    this.placeOres(chunk, baseX, baseZ);
    this.placeEmeralds(chunk, baseX, baseZ, biomes);
    this.applySurface(chunk, baseX, baseZ, heights, biomes);
    this.placeFeatures(chunk, baseX, baseZ, heights, biomes);
    this.placeTrees(chunk, baseX, baseZ);
    this.placeCaveLakes(chunk, baseX, baseZ);
    this.placeFossils(chunk, baseX, baseZ);
    this.placeVillages(chunk, baseX, baseZ);
    this.placeSurfaceStructures(chunk, baseX, baseZ);
    this.placeRuinedPortal(chunk, baseX, baseZ);
    this.placeUndergroundStructures(chunk, baseX, baseZ, heights);

    chunk.rebuildHeightmap();
    chunk.generatedStage = GEN_STAGE.FEATURES;
    // dataVersion is deliberately left alone: encodeChunk stamps the current
    // DATA_VERSION on write, and a freshly generated chunk has no older version
    // to record. Assigning undefined here was meaningless and misleading.
    return chunk;
  }


  /** A deterministic damaged portal ruin near the default spawn area. */
  placeRuinedPortal(chunk, baseX, baseZ) {
    const cellX = Math.floor(baseX / 512), cellZ = Math.floor(baseZ / 512);
    const rng = positionalRandom(this.seed, cellX, 8801, cellZ, 8801);
    if (rng.nextInt(12) !== 0) return;
    const x0 = cellX * 512 + 32 + rng.nextInt(448), z0 = cellZ * 512 + 32 + rng.nextInt(448);
    const lx=x0-baseX, lz=z0-baseZ;
    if(lx>15||lx+3<0||lz>15||lz<0) return;
    const S=this.states.byId, obsidian=S['mc:obsidian'], crying=S['mc:crying_obsidian']||obsidian;
    const chest=S['mc:chest'], netherrack=S['mc:netherrack']||S['mc:stone'];
    if(!obsidian) return;
    const y=Math.max(4,Math.min(110,Math.floor(this._height(this._fields(x0+1,z0),x0+1,z0))));
    const put=(wx,wy,wz,state)=>{const cx=wx-baseX,cz=wz-baseZ;if(state&&cx>=0&&cx<16&&cz>=0&&cz<16&&wy>=MIN_Y&&wy<MAX_Y)chunk.setBlock(cx,wy,cz,state);};
    for(let dx=0;dx<4;dx++) {
      put(x0+dx,y,z0,obsidian);
      if(dx===0||dx===3) for(let dy=1;dy<=4;dy++) put(x0+dx,y+dy,z0,obsidian);
      else if(dx===1) put(x0+dx,y+4,z0,obsidian);
    }
    put(x0+3,y+4,z0,crying);
    put(x0-1,y,z0+1,netherrack);
    put(x0+4,y,z0-1,netherrack);
    put(x0+4,y+1,z0+1,chest);
  }

  /** Floating netherrack islands over a deep lava sea, with a clear red-sky ceiling. */
  generateNetherChunk(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;
    const S = this.states.byId;
    const netherrack = S['mc:netherrack'] || S['mc:stone'];
    const bedrock = S['mc:bedrock'], lava = S['mc:lava'] || netherrack;
    const soul = S['mc:soul_sand'] || netherrack, glowstone = S['mc:glowstone'] || netherrack;
    const gold = S['mc:nether_gold_ore'];
    for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = baseX + x, wz = baseZ + z;
      const islandNoise = this.continent.sample2(wx + 713, wz - 291, 0.014);
      const detail = this.detail.sample2(wx, wz, 0.026);
      const central = Math.hypot(wx, wz) < 62;
      const island = central || islandNoise > 0.12;
      const top = 48 + Math.floor(detail * 18) + Math.floor(this.ridge.sample2(wx, wz, 0.035) * 7);
      const thickness = 7 + Math.floor(Math.abs(this.detail.sample2(wx - 40, wz + 80, 0.045)) * 8);
      const bottom = top - thickness;
      const cave = this.caveA.sample3(wx * 0.025, 1.4, wz * 0.025);
      for (let y = MIN_Y; y < MAX_Y; y++) {
        let state = null;
        if (y <= MIN_Y + 1) state = bedrock;
        else if (y >= 1 && y <= 31) state = lava;
        else if (island && y >= bottom && y <= top) {
          const hollow = y < top - 2 && cave > 0.42 && this.caveB.sample3(wx * 0.045, y * 0.045, wz * 0.045) > 0.1;
          if (!hollow) {
            state = netherrack;
            if (gold && y > bottom + 1 && y < top - 1 &&
                hash01(this.hseed, wx, y, wz, 0x6e7a1) > 0.992) state = gold;
            if (y === bottom && ((wx * 31 + wz * 17) & 63) === 0) state = soul;
            if (y === top && ((wx * 13 + wz * 7) & 127) === 0) state = glowstone;
          }
        }
        if (state) chunk.setBlock(x, y, z, state);
      }
      chunk.setBiome(x, 64, z, 'mc:nether_wastes');
    }
    this.placeNetherFortress(chunk, baseX, baseZ);
    chunk.rebuildHeightmap();
    chunk.generatedStage = GEN_STAGE.FEATURES;
    return chunk;
  }

  placeNetherFortress(chunk, baseX, baseZ) {
    const S = this.states.byId, brick = S['mc:nether_bricks'] || S['mc:netherrack'];
    const fence = S['mc:nether_brick_fence'] || brick, air = S['mc:air'];
    const minX = Math.floor((baseX - 48) / 384), maxX = Math.floor((baseX + CHUNK_SIZE + 48) / 384);
    const minZ = Math.floor((baseZ - 48) / 384), maxZ = Math.floor((baseZ + CHUNK_SIZE + 48) / 384);
    for (let gz = minZ; gz <= maxZ; gz++) for (let gx = minX; gx <= maxX; gx++) {
      const rng = positionalRandom(this.seed, gx, 4101, gz, 4101);
      if ((gx !== 0 || gz !== 0) && rng.nextInt(12) !== 0) continue;
      const x = gx === 0 && gz === 0 ? 36 : gx * 384 + 64 + rng.nextInt(256);
      const z = gx === 0 && gz === 0 ? 36 : gz * 384 + 64 + rng.nextInt(256);
      const y = gx === 0 && gz === 0 ? 52 : 48 + rng.nextInt(20);
      const put = (wx, wy, wz, state) => {
        const lx = wx - baseX, lz = wz - baseZ;
        if (state && lx >= 0 && lx < 16 && lz >= 0 && lz < 16 && wy >= MIN_Y && wy < MAX_Y)
          chunk.setBlock(lx, wy, lz, state);
      };
      // A long covered bridge joins three large chambers. Each chamber has
      // walkable floor, walls, doorways, and room for loot and blaze spawners.
      for (let i = 0; i < 42; i++) for (let dz = -2; dz <= 2; dz++) {
        put(x + i, y, z + dz, brick);
        put(x + i, y + 5, z + dz, brick);
        for (let dy = 1; dy < 5; dy++) {
          if (Math.abs(dz) === 2) put(x + i, y + dy, z + dz, brick);
          else put(x + i, y + dy, z + dz, air);
        }
      }
      for (const offset of [7, 20, 33]) {
        for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
          put(x + offset + dx, y, z + dz, brick);
          put(x + offset + dx, y + 6, z + dz, brick);
          if (Math.abs(dx) === 5 || Math.abs(dz) === 5)
            for (let dy = 1; dy <= 5; dy++) put(x + offset + dx, y + dy, z + dz, brick);
          else for (let dy = 1; dy <= 5; dy++) put(x + offset + dx, y + dy, z + dz, air);
        }
      }
      for (let i = 0; i < 42; i += 4) put(x + i, y + 6, z - 3, fence);
      if (gx === 0 && gz === 0) {
        put(x + 10, y + 1, z, S['mc:chest']);
        put(x + 24, y + 1, z - 2, S['mc:chest']);
        put(x + 33, y + 1, z + 2, S['mc:chest']);
      }
    }
  }

  /** The End is a void dimension with a central island and outer island clusters. */
  generateEndChunk(chunk) {
    const baseX=chunk.cx*CHUNK_SIZE, baseZ=chunk.cz*CHUNK_SIZE;
    const S=this.states.byId, endStone=S['mc:end_stone']||S['mc:stone'], obsidian=S['mc:obsidian'];
    const bedrock=S['mc:bedrock'];
    for(let z=0;z<16;z++) for(let x=0;x<16;x++) {
      const wx=baseX+x,wz=baseZ+z,dist=Math.hypot(wx,wz);
      let radius=dist<120?92:dist>700?34:0;
      if(radius && dist>120) radius=34+Math.floor(this.detail.sample2(wx,wz,0.012)*18);
      const edge=this.density.sample2(wx,wz,0.025);
      const island=radius>0 && dist<120 ? (dist<radius+edge*18) : radius>0 && edge>0.15;
      if(island) {
        const top=64+Math.floor(this.detail.sample2(wx,wz,0.018)*8);
        for(let y=MIN_Y;y<=top;y++) {
          if(y<top-4 || edge>0.05) chunk.setBlock(x,y,z,endStone);
        }
        chunk.setBlock(x,top,z,endStone);
        if(wx===0&&wz===0&&obsidian) chunk.setBlock(x,top+1,z,obsidian);
      }
      chunk.setBiome(x,64,z,'mc:the_end');
    }
    this.placeEndCity(chunk,baseX,baseZ);
    chunk.rebuildHeightmap();
    chunk.generatedStage=GEN_STAGE.FEATURES;
    return chunk;
  }

  placeEndCity(chunk,baseX,baseZ) {
    const S=this.states.byId, endStone=S['mc:end_stone']||S['mc:stone'];
    const purpur=S['mc:purpur_block']||endStone, pillar=S['mc:purpur_pillar']||purpur;
    const minX=Math.floor((baseX-40)/512),maxX=Math.floor((baseX+56)/512);
    const minZ=Math.floor((baseZ-40)/512),maxZ=Math.floor((baseZ+56)/512);
    for(let gz=minZ;gz<=maxZ;gz++) for(let gx=minX;gx<=maxX;gx++) {
      const rng=positionalRandom(this.seed,gx,4201,gz,4201);
      if(rng.nextInt(5)!==0) continue;
      const x=gx*512+80+rng.nextInt(352),z=gz*512+80+rng.nextInt(352),y=68;
      const put=(wx,wy,wz,state)=>{const lx=wx-baseX,lz=wz-baseZ;if(lx>=0&&lx<16&&lz>=0&&lz<16&&wy>=MIN_Y&&wy<MAX_Y)chunk.setBlock(lx,wy,lz,state);};
      for(let level=0;level<4;level++) {
        const width=Math.max(5,13-level*2), height=5+level*2, ox=level*2;
        for(let dx=0;dx<width;dx++) for(let dz=0;dz<width;dz++) {
          put(x+ox+dx,y+level*height,z+dz,purpur);
          if(dx===0||dx===width-1||dz===0||dz===width-1)
            for(let dy=1;dy<height;dy++) put(x+ox+dx,y+level*height+dy,z+dz,purpur);
        }
        for(let dx=2;dx<width-2;dx++) for(let dz=2;dz<width-2;dz++) put(x+ox+dx,y+level*height+height-1,z+dz,pillar);
      }
      for(let dy=1;dy<28;dy++) put(x+6,y+dy,z+6,pillar);
    }
  }

  /** The 1.12.2 Overworld has stone throughout its underground layers. */
  stoneFor(wx, wy, wz) {
    return this.states.stone;
  }

  placePatches(chunk, baseX, baseZ) {
    for (const patch of DIRT_PATCHES) {
      this.scatterVeins(chunk, baseX, baseZ, patch, 31, false);
    }
  }

  placeOres(chunk, baseX, baseZ) {
    for (const ore of ORES) {
      this.scatterVeins(chunk, baseX, baseZ, ore, 53, false);
    }
  }

  /**
   * Place blobs of a block, replacing only stone-family blocks so a vein never
   * punches through into open air or replaces a cave wall with floating ore.
   */
  scatterVeins(chunk, baseX, baseZ, spec, salt, deepslateVariants) {
    const rng = positionalRandom(this.seed, chunk.cx, salt, chunk.cz, salt);
    const S = this.states;
    // Keep every ore vein well below the actual surface profile so it cannot
    // show through on plains or steep mountain faces.
    const oreSurface = spec.block.endsWith('_ore') ? new Int16Array(CHUNK_SIZE * CHUNK_SIZE) : null;
    if (oreSurface) for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
      const wx = baseX + x, wz = baseZ + z;
      oreSurface[z * CHUNK_SIZE + x] = Math.floor(this._height(this._fields(wx, wz), wx, wz));
    }

    for (let v = 0; v < spec.veins; v++) {
      const ox = rng.nextInt(CHUNK_SIZE);
      const oz = rng.nextInt(CHUNK_SIZE);
      const oy = spec.triangular
        ? triangularY(rng, spec.minY, spec.maxY, spec.peak)
        : rng.nextIntRange(spec.minY, spec.maxY);

      const count = 3 + rng.nextInt(spec.size);
      let x = ox, y = oy, z = oz;

      for (let i = 0; i < count; i++) {
        if (y > MIN_Y && y < MAX_Y && x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
          const existing = chunk.getBlock(x, y, z);
          const belowSurface = !oreSurface || y < oreSurface[z * CHUNK_SIZE + x] - 8;
          if (belowSurface && (spec.block.endsWith('_ore') ? STONE_ORE_REPLACEABLE : STONE_REPLACEABLE).has(existing.block.id)) {
            let target = spec.block;
            const state = S.byId[target];
            if (state) chunk.setBlock(x, y, z, state);
          }
        }
        // Random walk, so veins are irregular blobs rather than spheres.
        x += rng.nextInt(3) - 1;
        y += rng.nextInt(3) - 1;
        z += rng.nextInt(3) - 1;
      }
    }
  }

  /** Emeralds are rare and restricted to mountain biomes. */
  placeEmeralds(chunk, baseX, baseZ, biomes) {
    if(![BIOME.MOUNTAINS,BIOME.WINDSWEPT_HILLS].includes(biomes[8*CHUNK_SIZE+8])) return;
    const state=this.states.byId['mc:emerald_ore']; if(!state) return;
    const rng=positionalRandom(this.seed,chunk.cx,9200,chunk.cz,9200);
    const n=3+rng.nextInt(6);
    for(let i=0;i<n;i++){
      const x=rng.nextInt(CHUNK_SIZE),z=rng.nextInt(CHUNK_SIZE),y=4+rng.nextInt(29);
      if(['mc:stone','mc:granite','mc:diorite','mc:andesite'].includes(chunk.getBlock(x,y,z).block.id)) chunk.setBlock(x,y,z,state);
    }
  }

  /** Replace the topmost stone with the biome's surface and filler material. */
  applySurface(chunk, baseX, baseZ, heights, biomes) {
    const S = this.states;

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const i = z * CHUNK_SIZE + x;
        const biome = biomes[i];
        const surface = BIOME_SURFACE[biome];

        // Find the actual top solid block, which caves may have moved.
        let top = -1;
        for (let y = Math.min(MAX_Y - 1, heights[i] + 4); y >= MIN_Y; y--) {
          if (chunk.getBlock(x, y, z).block.id !== 'mc:air' &&
              chunk.getBlock(x, y, z).block.id !== 'mc:water') {
            top = y;
            break;
          }
        }
        if (top < 0) continue;

        const submerged = top < SEA_LEVEL;
        const junglePodzol = [BIOME.JUNGLE, BIOME.JUNGLE_HILLS, BIOME.BAMBOO_JUNGLE].includes(biome) && this.patch.sample2(baseX + x, baseZ + z, 0.09) > 0.18;
        const topId = submerged && biome !== BIOME.OCEAN ? 'mc:sand' : junglePodzol ? 'mc:podzol' : surface.top;

        const topState = S.byId[topId];
        const badlands = biome === BIOME.BADLANDS || biome === BIOME.WOODED_BADLANDS || biome === BIOME.ERODED_BADLANDS;
        if (badlands && !submerged) {
          if (S.byId['mc:red_sand'] && STONE_REPLACEABLE.has(chunk.getBlock(x,top,z).block.id)) chunk.setBlock(x,top,z,S.byId['mc:red_sand']);
          for(let y=top-1;y>=Math.max(MIN_Y+1,SEA_LEVEL-6);y--){
            if(!STONE_REPLACEABLE.has(chunk.getBlock(x,y,z).block.id)) break;
            if(this.bands[y]) chunk.setBlock(x,y,z,this.bands[y]);
          }
          continue;
        }
        if (topState && STONE_REPLACEABLE.has(chunk.getBlock(x, top, z).block.id)) {
          chunk.setBlock(x, top, z, topState);
        }

        const fillerState = S.byId[surface.filler];
        for (let d = 1; d <= 3; d++) {
          const y = top - d;
          if (y <= MIN_Y) break;
          if (!STONE_REPLACEABLE.has(chunk.getBlock(x, y, z).block.id)) break;
          if (fillerState) chunk.setBlock(x, y, z, fillerState);
        }
      }
    }
  }

  /** Biome-aware surface block used by cross-chunk tree placement. */
  surfaceTop(biome, height, wx, wz) {
    const rule = BIOME_SURFACE[biome];
    if (!rule || height < SEA_LEVEL) return null;
    if (biome === BIOME.MOUNTAINS || biome === BIOME.WINDSWEPT_HILLS) {
      if (height >= 108) return 'mc:snow_block';
      if (height >= 90) return this.patch.sample2(wx, wz, 0.06) > 0.2 ? 'mc:gravel' : 'mc:stone';
    }
    return rule.top;
  }

  /** Deterministic tree origin, evaluated from world coordinates rather than chunk-local RNG. */
  treeAt(wx, wz) {
    const u = hash01(this.hseed, wx, 0, wz, 31337);
    if (u > 0.1) return null;
    const col = this.column(wx, wz);
    if (col.h < SEA_LEVEL) return null;
    const rule = BIOME_SURFACE[col.biome];
    if (!rule || !rule.trees || u >= rule.trees) return null;
    const ground = this.surfaceTop(col.biome, col.h, wx, wz);
    if (!ground || !['mc:grass_block','mc:podzol','mc:coarse_dirt','mc:snow_block','mc:dirt','mc:red_sand','mc:mycelium','mc:plains_soil','mc:forest_floor','mc:birch_soil','mc:jungle_soil','mc:savanna_soil','mc:taiga_soil','mc:swamp_mud','mc:alpine_gravel'].includes(ground)) return null;
    if (this.isCave(wx, col.h, wz, col.h + 6)) return null;
    for (let dz=-2; dz<=2; dz++) for (let dx=-2; dx<=2; dx++) {
      if (!dx && !dz) continue;
      const nu=hash01(this.hseed,wx+dx,0,wz+dz,31337);
      if (nu<u && nu<rule.trees) return null;
    }
    const rng=positionalRandom(this.seed,wx,777,wz,777);
    let species=rule.species || 'oak';
    if (rule.mix) {
      let total=0; for (const [,weight] of rule.mix) total+=weight;
      let roll=rng.nextInt(total);
      for (const [name,weight] of rule.mix) { roll-=weight; if (roll<0) { species=name; break; } }
    }
    const shape=buildTree(species,rng);
    shape.species=species; shape.y=col.h+1;
    return shape;
  }

  /** Write tree pieces crossing chunk edges identically in every generation order. */
  placeTrees(chunk, baseX, baseZ) {
    const S=this.states.byId;
    const passable=(id)=>id==='mc:air'||id==='mc:short_grass'||id==='mc:fern'||id==='mc:dandelion'||
      id==='mc:poppy'||id==='mc:dead_bush'||id==='mc:red_mushroom'||id==='mc:brown_mushroom'||id==='mc:vine';
    const margin=TREE_MARGIN+1;
    for(let wz=baseZ-margin;wz<baseZ+CHUNK_SIZE+margin;wz++) for(let wx=baseX-margin;wx<baseX+CHUNK_SIZE+margin;wx++) {
      const tree=this.treeAt(wx,wz); if(!tree) continue;
      const log=tree.material ? S[tree.material] : S[`mc:${tree.species}_log`], leaves=S[`mc:${tree.species}_leaves`];
      if(!log) continue;
      for(const [dx,dy,dz] of tree.leaves) {
        const x=wx+dx-baseX,z=wz+dz-baseZ;
        if(x<0||x>=CHUNK_SIZE||z<0||z>=CHUNK_SIZE||!leaves) continue;
        const id=chunk.getBlock(x,tree.y+dy,z).block.id;
        if(passable(id)) chunk.setBlock(x,tree.y+dy,z,leaves);
      }
      for(const [dx,dy,dz] of tree.logs) {
        const x=wx+dx-baseX,z=wz+dz-baseZ;
        if(x<0||x>=CHUNK_SIZE||z<0||z>=CHUNK_SIZE) continue;
        const id=chunk.getBlock(x,tree.y+dy,z).block.id;
        if(passable(id)||/_leaves$/.test(id)) chunk.setBlock(x,tree.y+dy,z,log);
      }
      const vine=S['mc:vine'];
      if(vine) for(const [dx,dy,dz] of tree.vines ?? []) {
        const x=wx+dx-baseX,z=wz+dz-baseZ;
        if(x<0||x>=CHUNK_SIZE||z<0||z>=CHUNK_SIZE) continue;
        const id=chunk.getBlock(x,tree.y+dy,z).block.id;
        if(passable(id)) chunk.setBlock(x,tree.y+dy,z,vine);
      }
    }
  }

  /** Trees, grass, and bushes. */
  placeFeatures(chunk, baseX, baseZ, heights, biomes) {
    const S = this.states;
    const rng = positionalRandom(this.seed, chunk.cx, 101, chunk.cz, 101);

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const i = z * CHUNK_SIZE + x;
        const surface = BIOME_SURFACE[biomes[i]];

        let top = -1;
        for (let y = Math.min(MAX_Y - 2, heights[i] + 4); y >= SEA_LEVEL; y--) {
          const state = chunk.getBlock(x, y, z);
          if (state.block.solid && state.block.id !== 'mc:water') {
            top = y;
            break;
          }
        }
        if (top < 0) continue;
        const groundId = chunk.getBlock(x, top, z).block.id;

        if (biomes[i] === BIOME.MUSHROOM_FIELDS && groundId === 'mc:mycelium' && rng.nextDouble() < (surface.mushrooms ?? 0)) {
          const mushroom = rng.nextBoolean() ? S.byId['mc:red_mushroom'] : S.byId['mc:brown_mushroom'];
          if (mushroom) chunk.setBlock(x, top + 1, z, mushroom);
        } else if (biomes[i] === BIOME.BAMBOO_JUNGLE && groundId === 'mc:podzol' && rng.nextDouble() < 0.075) {
          if (S.byId['mc:bamboo']) chunk.setBlock(x, top + 1, z, S.byId['mc:bamboo']);
        } else if (surface.grass > 0 && ['mc:grass_block','mc:plains_soil','mc:forest_floor','mc:birch_soil','mc:jungle_soil','mc:savanna_soil','mc:taiga_soil','mc:swamp_mud'].includes(groundId) && rng.nextDouble() < surface.grass) {
          const flowerChance = surface.flowers ?? 0.12;
          const plant = rng.nextDouble() < flowerChance
            ? (rng.nextBoolean() ? S.byId['mc:poppy'] : S.byId['mc:dandelion'])
            : S.byId['mc:short_grass'];
          if (plant) chunk.setBlock(x, top + 1, z, plant);
        } else if (surface.ferns && ['mc:grass_block','mc:plains_soil','mc:forest_floor','mc:birch_soil','mc:jungle_soil','mc:savanna_soil','mc:taiga_soil','mc:swamp_mud'].includes(groundId) && rng.nextDouble() < surface.ferns) {
          if (S.byId['mc:fern']) chunk.setBlock(x, top + 1, z, S.byId['mc:fern']);
        } else if (surface.deadBush && (groundId === 'mc:sand' || groundId === 'mc:red_sand') && rng.nextDouble() < surface.deadBush) {
          if (S.byId['mc:dead_bush']) chunk.setBlock(x, top + 1, z, S.byId['mc:dead_bush']);
        }
      }
    }
  }

  /** Surface structures are world-grid anchored and clipped to this chunk. */
  placeSurfaceStructures(chunk, baseX, baseZ) {
    const min256X = Math.floor((baseX - 32) / 256);
    const max256X = Math.floor((baseX + CHUNK_SIZE + 32) / 256);
    const min256Z = Math.floor((baseZ - 32) / 256);
    const max256Z = Math.floor((baseZ + CHUNK_SIZE + 32) / 256);
    for (let gz = min256Z; gz <= max256Z; gz++) {
      for (let gx = min256X; gx <= max256X; gx++) {
        const desert = desertTempleCandidateForCell(this.seed, gx, gz);
        if (desert) {
          const site = this.validateStructureSite(desert.x, desert.z, 10, [BIOME.DESERT, BIOME.DESERT_HILLS], 4.5);
          if (site) this.placeDesertTemple(chunk, baseX, baseZ, desert, site.y);
        }
        const jungle = jungleTempleCandidateForCell(this.seed, gx, gz);
        if (jungle) {
          const site = this.validateStructureSite(jungle.x, jungle.z, 7, [BIOME.JUNGLE, BIOME.JUNGLE_HILLS, BIOME.JUNGLE_EDGE, BIOME.BAMBOO_JUNGLE], 4.5);
          if (site) this.placeJungleTemple(chunk, baseX, baseZ, jungle, site.y);
        }
        const swamp = swampHutCandidateForCell(this.seed, gx, gz);
        if (swamp) {
          const site = this.validateStructureSite(swamp.x, swamp.z, 5, [BIOME.SWAMP], 5.5);
          if (site) this.placeSwampHut(chunk, baseX, baseZ, swamp, site.y);
        }
        const igloo = iglooCandidateForCell(this.seed, gx, gz);
        if (igloo) {
          const site = this.validateStructureSite(igloo.x, igloo.z, 4, [BIOME.SNOWY_PLAINS, BIOME.SNOWY_TAIGA, BIOME.COLD_TAIGA, BIOME.COLD_TAIGA_HILLS, BIOME.ICE_SPIKES], 3.5);
          if (site) this.placeIgloo(chunk, baseX, baseZ, igloo, site.y);
        }
      }
    }

    const min512X = Math.floor((baseX - 32) / 512);
    const max512X = Math.floor((baseX + CHUNK_SIZE + 32) / 512);
    const min512Z = Math.floor((baseZ - 32) / 512);
    const max512Z = Math.floor((baseZ + CHUNK_SIZE + 32) / 512);
    for (let gz = min512Z; gz <= max512Z; gz++) {
      for (let gx = min512X; gx <= max512X; gx++) {
        const mansion = mansionCandidateForCell(this.seed, gx, gz);
        if (mansion) {
          const site = this.validateStructureSite(mansion.x, mansion.z, 14, [BIOME.DARK_FOREST], 6);
          if (site && site.y < 105) this.placeWoodlandMansion(chunk, baseX, baseZ, mansion, site.y);
        }
        const monument = oceanMonumentCandidateForCell(this.seed, gx, gz);
        if (monument) {
          const biome = this.biomeAt(monument.x, monument.z, this.heightAt(monument.x, monument.z));
          if ([BIOME.DEEP_OCEAN, BIOME.DEEP_COLD_OCEAN, BIOME.DEEP_FROZEN_OCEAN, BIOME.DEEP_LUKEWARM_OCEAN].includes(biome)) {
            this.placeOceanMonument(chunk, baseX, baseZ, monument);
          }
        }
      }
    }
  }

  validateStructureSite(x, z, radius, allowedBiomes, maxSlope) {
    let min = Infinity, max = -Infinity;
    for (const dz of [-radius, 0, radius]) {
      for (const dx of [-radius, 0, radius]) {
        const wx = x + dx, wz = z + dz;
        const height = this.heightAt(wx, wz);
        if (!allowedBiomes.includes(this.biomeAt(wx, wz, height))) return null;
        min = Math.min(min, height);
        max = Math.max(max, height);
      }
    }
    if (min < SEA_LEVEL + 1 || max - min > maxSlope) return null;
    return { y: Math.floor((min + max) / 2) };
  }

  placeDesertTemple(chunk, baseX, baseZ, site, groundY) {
    const S = this.states.byId, sandstone = S['mc:sandstone'], air = S['mc:air'];
    if (!sandstone || !air) return;
    const put = (x, y, z, state) => this.setVillageBlock(chunk, baseX, baseZ, x, y, z, state);
    // Four stepped sandstone tiers with a hollow central chamber.
    for (let layer = 0; layer < 9; layer++) {
      const radius = 10 - layer;
      const y = groundY + 1 + layer;
      for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) === radius || Math.abs(dz) === radius) put(site.x + dx, y, site.z + dz, sandstone);
      }
    }
    for (let y = groundY + 1; y <= groundY + 8; y++) {
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) put(site.x + dx, y, site.z + dz, air);
    }
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) put(site.x + dx, groundY + 1, site.z + dz, sandstone);
    const chests = S['mc:chest'];
    if (chests) for (const [dx, dz] of [[-3,-3],[-3,3],[3,-3],[3,3]]) put(site.x + dx, groundY + 2, site.z + dz, chests);
    for (const dx of [-2, 2]) for (const dz of [-2, 2]) put(site.x + dx, groundY + 2, site.z + dz, sandstone);
  }

  placeJungleTemple(chunk, baseX, baseZ, site, groundY) {
    const S = this.states.byId, air = S['mc:air'];
    const stone = S['mc:mossy_cobblestone'] || S['mc:cobblestone'];
    const brick = S['mc:stone_bricks'] || S['mc:cobblestone'];
    if (!air || !stone || !brick) return;
    const put = (x, y, z, state) => this.setVillageBlock(chunk, baseX, baseZ, x, y, z, state);
    for (let dz = 0; dz < 13; dz++) for (let dx = 0; dx < 13; dx++) {
      put(site.x + dx, groundY + 1, site.z + dz, stone);
      for (let dy = 2; dy <= 7; dy++) {
        const edge = dx === 0 || dx === 12 || dz === 0 || dz === 12;
        if (edge) put(site.x + dx, groundY + dy, site.z + dz, ((dx + dz + dy) % 3 === 0) ? stone : brick);
      }
    }
    for (let dy = 2; dy <= 7; dy++) for (let dx = 1; dx < 12; dx++) for (let dz = 1; dz < 12; dz++) put(site.x + dx, groundY + dy, site.z + dz, air);
    for (let dx = 2; dx < 11; dx++) for (let dz = 2; dz < 11; dz++) put(site.x + dx, groundY + 8, site.z + dz, stone);
    for (let dy = 2; dy <= 5; dy++) put(site.x + 6, groundY + dy, site.z, air);
    const chest = S['mc:chest'];
    if (chest) {
      put(site.x + 2, groundY + 2, site.z + 2, chest);
      put(site.x + 10, groundY + 2, site.z + 10, chest);
    }
    if (S['mc:torch']) {
      put(site.x + 3, groundY + 3, site.z + 3, S['mc:torch']);
      put(site.x + 9, groundY + 3, site.z + 9, S['mc:torch']);
    }
  }

  placeSwampHut(chunk, baseX, baseZ, site, groundY) {
    const S = this.states.byId, air = S['mc:air'];
    const plank = S['mc:oak_planks'], log = S['mc:oak_log'];
    if (!air || !plank || !log) return;
    const put = (x, y, z, state) => this.setVillageBlock(chunk, baseX, baseZ, x, y, z, state);
    for (const [dx, dz] of [[0,0],[6,0],[0,8],[6,8]]) {
      for (let y = groundY - 1; y <= groundY + 3; y++) put(site.x + dx, y, site.z + dz, log);
    }
    for (let dz = 0; dz <= 8; dz++) for (let dx = 0; dx <= 6; dx++) {
      put(site.x + dx, groundY + 3, site.z + dz, plank);
      const edge = dx === 0 || dx === 6 || dz === 0 || dz === 8;
      if (edge) for (let dy = 4; dy <= 6; dy++) put(site.x + dx, groundY + dy, site.z + dz, plank);
    }
    for (let dy = 4; dy <= 5; dy++) put(site.x + 3, groundY + dy, site.z, air);
    for (let dz = 1; dz < 8; dz++) for (let dx = 1; dx < 6; dx++) {
      put(site.x + dx, groundY + 4, site.z + dz, air);
      put(site.x + dx, groundY + 5, site.z + dz, air);
    }
    for (let dz = -1; dz <= 9; dz++) for (let dx = -1; dx <= 7; dx++) {
      const radius = Math.min(dx + 1, 7 - dx);
      const roofY = groundY + 7 + Math.min(3, Math.max(0, radius));
      put(site.x + dx, roofY, site.z + dz, plank);
    }
    if (S['mc:cauldron']) put(site.x + 2, groundY + 4, site.z + 2, S['mc:cauldron']);
    if (S['mc:crafting_table']) put(site.x + 4, groundY + 4, site.z + 5, S['mc:crafting_table']);
  }

  placeIgloo(chunk, baseX, baseZ, site, groundY) {
    const S = this.states.byId, snow = S['mc:snow_block'], air = S['mc:air'];
    if (!snow || !air) return;
    const put = (x, y, z, state) => this.setVillageBlock(chunk, baseX, baseZ, x, y, z, state);
    for (let layer = 0; layer < 5; layer++) {
      const radius = 4 - Math.floor(layer * 0.75);
      const y = groundY + 1 + layer;
      for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dz * dz <= radius * radius + 2) put(site.x + dx, y, site.z + dz, snow);
      }
    }
    for (let dy = 2; dy <= 4; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) put(site.x + dx, groundY + dy, site.z + dz, air);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) put(site.x + dx, groundY + 1, site.z + dz, snow);
    for (let dy = 2; dy <= 3; dy++) put(site.x, groundY + dy, site.z - 4, air);
    if (S['mc:torch']) put(site.x + 2, groundY + 2, site.z + 2, S['mc:torch']);
  }

  placeWoodlandMansion(chunk, baseX, baseZ, site, groundY) {
    const S = this.states.byId, air = S['mc:air'];
    const plank = S['mc:dark_oak_planks'] || S['mc:oak_planks'];
    const log = S['mc:dark_oak_log'] || S['mc:oak_log'];
    const stone = S['mc:cobblestone'];
    const glass = S['mc:glass'];
    if (!air || !plank || !log || !stone) return;
    const put = (x, y, z, state) => this.setVillageBlock(chunk, baseX, baseZ, x, y, z, state);
    const size = 27;
    for (let dx = 0; dx < size; dx++) for (let dz = 0; dz < size; dz++) put(site.x + dx, groundY, site.z + dz, stone);
    for (let floor = 0; floor < 3; floor++) {
      const baseY = groundY + 1 + floor * 5;
      for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) {
        put(site.x + dx, baseY, site.z + dz, plank);
        const edge = dx === 0 || dx === size - 1 || dz === 0 || dz === size - 1;
        if (edge) {
          for (let dy = 1; dy <= 4; dy++) {
            const window = glass && dy === 2 && (dx % 6 === 3 || dz % 6 === 3);
            put(site.x + dx, baseY + dy, site.z + dz, window ? glass : plank);
          }
        }
      }
      for (let y = baseY + 1; y <= baseY + 4; y++) {
        for (let dx = 1; dx < size - 1; dx++) for (let dz = 1; dz < size - 1; dz++) {
          if (dx % 8 === 0 || dz % 8 === 0) put(site.x + dx, y, site.z + dz, plank);
          else put(site.x + dx, y, site.z + dz, air);
        }
      }
      for (const [dx, dz] of [[0,0],[size-1,0],[0,size-1],[size-1,size-1]]) {
        for (let dy = 0; dy <= 5; dy++) put(site.x + dx, baseY + dy, site.z + dz, log);
      }
    }
    const roofY = groundY + 16;
    for (let dz = -1; dz <= size; dz++) for (let dx = -1; dx <= size; dx++) {
      if (dx < 2 || dx > size - 3 || dz < 2 || dz > size - 3) put(site.x + dx, roofY, site.z + dz, plank);
    }
  }

  placeOceanMonument(chunk, baseX, baseZ, site) {
    const S = this.states.byId;
    const prismarine = S['mc:prismarine'], bricks = S['mc:prismarine_bricks'] || prismarine;
    const dark = S['mc:dark_prismarine'] || prismarine;
    if (!prismarine) return;
    const put = (x, y, z, state) => this.setVillageBlock(chunk, baseX, baseZ, x, y, z, state);
    const floorY = Number.isFinite(site.y) ? site.y : Math.max(MIN_Y + 5, Math.floor(this.heightAt(site.x, site.z)) + 1);
    const roofY = floorY + 11;
    if (roofY > SEA_LEVEL + 4) return;
    for (let dy = floorY; dy <= roofY; dy++) {
      const radius = dy === floorY || dy === roofY ? 12 : 10;
      for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        const edge = Math.abs(dx) === radius || Math.abs(dz) === radius;
        if (edge || dy === floorY || dy === roofY) put(site.x + dx, dy, site.z + dz, dy === roofY ? dark : bricks);
      }
    }
    for (const [dx, dz] of [[-8,-8],[-8,8],[8,-8],[8,8]]) {
      for (let dy = floorY; dy <= roofY + 8; dy++) {
        const radius = dy > roofY + 4 ? 1 : 2;
        for (let ox = -radius; ox <= radius; ox++) for (let oz = -radius; oz <= radius; oz++) {
          if (Math.abs(ox) === radius || Math.abs(oz) === radius) put(site.x + dx + ox, dy, site.z + dz + oz, prismarine);
        }
      }
    }
    if (S['mc:sea_lantern']) put(site.x, floorY + 8, site.z, S['mc:sea_lantern']);
  }

  /**
   * Village candidates are anchored to a coarse world grid, not to chunks.
   * Every chunk independently evaluates nearby candidates and writes only its
   * own 16x16 slice. This makes houses/farms continuous across chunk borders
   * regardless of worker completion order.
   */
  placeVillages(chunk, baseX, baseZ) {
    const w = new ChunkWriter(chunk, baseX, baseZ), S = this.states.byId;
    const minX = Math.floor((baseX - 48) / 128), maxX = Math.floor((baseX + CHUNK_SIZE + 48) / 128);
    const minZ = Math.floor((baseZ - 48) / 128), maxZ = Math.floor((baseZ + CHUNK_SIZE + 48) / 128);
    for (let gz = minZ; gz <= maxZ; gz++) for (let gx = minX; gx <= maxX; gx++) {
      const candidate = villageCandidateForCell(this.seed, gx, gz);
      if (!candidate) continue;
      const site = this.validateVillageSite(candidate.x, candidate.z);
      if (!site) continue;
      const style = villageStyleForBiome(site.biome) || 'plains';
      const plan = villagePlan(this.seed, candidate.x, candidate.z, site.y, style);
      placeVillagePlan(w, S, plan);
    }
  }

  /**
   * Underground features use world-grid anchors and write only their own
   * chunk slice. Adjacent workers therefore produce identical structures
   * regardless of generation order.
   */
  /** Deterministic flooded cave chambers, clipped to the owning chunk. */
  placeCaveLakes(chunk, baseX, baseZ) {
    const minX = Math.floor((baseX - 16) / 112);
    const maxX = Math.floor((baseX + CHUNK_SIZE + 16) / 112);
    const minZ = Math.floor((baseZ - 16) / 112);
    const maxZ = Math.floor((baseZ + CHUNK_SIZE + 16) / 112);
    for (let gz = minZ; gz <= maxZ; gz++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const lake = caveLakeCandidateForCell(this.seed, gx, gz);
        if (lake) this.placeCaveLake(chunk, baseX, baseZ, lake);
      }
    }
  }

  placeCaveLake(chunk, baseX, baseZ, lake) {
    const S = this.states.byId;
    const air = S['mc:air'], water = S['mc:water'];
    const stone = S['mc:stone'], gravel = S['mc:gravel'];
    if (!air || !water || !stone) return;
    const put = (wx, y, wz, state) => {
      const x = wx - baseX, z = wz - baseZ;
      if (!state || x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y <= MIN_Y || y >= MAX_Y) return;
      chunk.setBlock(x, y, z, state);
    };
    const radiusX = lake.radius;
    const radiusZ = lake.radius - 1;
    // Elliptical vaulted chamber with a shallow, level pool in its lowest part.
    for (let dx = -radiusX; dx <= radiusX; dx++) {
      for (let dz = -radiusZ; dz <= radiusZ; dz++) {
        const radial = (dx * dx) / (radiusX * radiusX) + (dz * dz) / (radiusZ * radiusZ);
        if (radial > 1.12) continue;
        const ceiling = lake.y + 3 + Math.floor((1 - Math.min(1, radial)) * 2);
        for (let y = lake.y - 1; y <= ceiling; y++) {
          const wx = lake.x + dx, wz = lake.z + dz;
          const localX = wx - baseX, localZ = wz - baseZ;
          if (localX < 0 || localX >= CHUNK_SIZE || localZ < 0 || localZ >= CHUNK_SIZE) continue;
          const existing = chunk.getBlock(localX, y, localZ).block.id;
          if (y === lake.y - 1) {
            if (STONE_REPLACEABLE.has(existing)) put(wx, y, wz, gravel || stone);
          } else if (STONE_REPLACEABLE.has(existing) || existing === 'mc:water') {
            put(wx, y, wz, y <= lake.y ? water : air);
          }
        }
      }
    }
    // A few uneven stone shoulders make the pool blend into the cave floor.
    for (let dx = -radiusX - 1; dx <= radiusX + 1; dx++) {
      for (const dz of [-radiusZ - 1, radiusZ + 1]) {
        const wx = lake.x + dx, wz = lake.z + dz;
        const x = wx - baseX, z = wz - baseZ;
        if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
        if (chunk.getBlock(x, lake.y - 1, z).block.id === 'mc:air') put(wx, lake.y - 1, wz, stone);
      }
    }
  }

  /** Rare fossil chambers, anchored to a world grid and clipped per chunk. */
  placeFossils(chunk, baseX, baseZ) {
    const minX = Math.floor((baseX - 12) / 144);
    const maxX = Math.floor((baseX + CHUNK_SIZE + 12) / 144);
    const minZ = Math.floor((baseZ - 12) / 144);
    const maxZ = Math.floor((baseZ + CHUNK_SIZE + 12) / 144);
    for (let gz = minZ; gz <= maxZ; gz++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const fossil = fossilCandidateForCell(this.seed, gx, gz);
        if (fossil) this.placeFossil(chunk, baseX, baseZ, fossil);
      }
    }
  }

  placeFossil(chunk, baseX, baseZ, fossil) {
    const S = this.states.byId;
    const air = S['mc:air'], bone = S['mc:bone_block'];
    if (!air || !bone) return;
    const put = (wx, y, wz, state) => {
      const x = wx - baseX, z = wz - baseZ;
      if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < MIN_Y || y >= MAX_Y) return;
      chunk.setBlock(x, y, z, state);
    };
    // Open a compact chamber, then leave a fossilized spine and curved ribs.
    for (let dx = -5; dx <= 5; dx++) for (let dz = -4; dz <= 4; dz++) {
      for (let dy = 1; dy <= 4; dy++) {
        const wx = fossil.x + dx, wz = fossil.z + dz;
        const x = wx - baseX, z = wz - baseZ;
        if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) continue;
        const id = chunk.getBlock(x, fossil.y + dy, z).block.id;
        if (STONE_REPLACEABLE.has(id)) put(wx, fossil.y + dy, wz, air);
      }
    }
    // Vertebrae, paired ribs, and a compact skull-like end cluster.
    for (let dx = -3; dx <= 3; dx++) put(fossil.x + dx, fossil.y + 1, fossil.z, bone);
    for (const dx of [-2, 0, 2]) {
      for (let dz = -3; dz <= 3; dz++) {
        const archY = fossil.y + 2 + Math.round((1 - Math.abs(dz) / 3) * 2);
        put(fossil.x + dx, archY, fossil.z + dz, bone);
      }
    }
    put(fossil.x + 4, fossil.y + 1, fossil.z, bone);
    put(fossil.x + 5, fossil.y + 1, fossil.z, bone);
    put(fossil.x + 4, fossil.y + 2, fossil.z - 1, bone);
    put(fossil.x + 4, fossil.y + 2, fossil.z + 1, bone);
  }

  placeUndergroundStructures(chunk, baseX, baseZ, heights) {
    const w = new ChunkWriter(chunk, baseX, baseZ), S = this.states.byId;
    const minX = Math.floor((baseX - 64) / 96), maxX = Math.floor((baseX + CHUNK_SIZE + 64) / 96);
    const minZ = Math.floor((baseZ - 64) / 96), maxZ = Math.floor((baseZ + CHUNK_SIZE + 64) / 96);
    for (let gz = minZ; gz <= maxZ; gz++) for (let gx = minX; gx <= maxX; gx++) {
      const shaft = mineshaftCandidateForCell(this.seed, gx, gz);
      if (shaft) placeMineshaftPlan(w, S, mineshaftPlan(this.seed, shaft), heights);
    }
    const dMinX = Math.floor((baseX - 20) / 80), dMaxX = Math.floor((baseX + CHUNK_SIZE + 20) / 80);
    const dMinZ = Math.floor((baseZ - 20) / 80), dMaxZ = Math.floor((baseZ + CHUNK_SIZE + 20) / 80);
    for (let gz = dMinZ; gz <= dMaxZ; gz++) for (let gx = dMinX; gx <= dMaxX; gx++) {
      const room = dungeonCandidateForCell(this.seed, gx, gz);
      if (room) placeDungeonRoom(w, S, room, this.seed, heights);
    }
    // Keep the newer stronghold system from main intact.
    const strongholdMinX = Math.floor((baseX - 32) / 512), strongholdMaxX = Math.floor((baseX + CHUNK_SIZE + 32) / 512);
    const strongholdMinZ = Math.floor((baseZ - 32) / 512), strongholdMaxZ = Math.floor((baseZ + CHUNK_SIZE + 32) / 512);
    for (let gz = strongholdMinZ; gz <= strongholdMaxZ; gz++) for (let gx = strongholdMinX; gx <= strongholdMaxX; gx++) {
      const stronghold = strongholdCandidateForCell(this.seed, gx, gz);
      if (stronghold) this.placeStronghold(chunk, baseX, baseZ, stronghold);
    }
  }

  placeStronghold(chunk, baseX, baseZ, site) {
    const S = this.states.byId, air = S['mc:air'];
    const brick = S['mc:stone_bricks'] || S['mc:cobblestone'];
    const mossy = S['mc:mossy_stone_bricks'] || S['mc:mossy_cobblestone'] || brick;
    if (!air || !brick) return;
    const put = (x, y, z, state) => this.setVillageBlock(chunk, baseX, baseZ, x, y, z, state);
    const y0 = site.y, x0 = site.x, z0 = site.z;
    // Main entry hall and two connected rooms.
    for (let room = 0; room < 3; room++) {
      const ox = room === 1 ? -12 : room === 2 ? 15 : 0;
      const oz = room === 0 ? 0 : 2;
      const width = room === 0 ? 15 : 9, depth = room === 0 ? 13 : 11;
      for (let dx = 0; dx < width; dx++) for (let dz = 0; dz < depth; dz++) {
        put(x0 + ox + dx, y0, z0 + oz + dz, brick);
        put(x0 + ox + dx, y0 + 5, z0 + oz + dz, brick);
        for (let dy = 1; dy < 5; dy++) {
          const edge = dx === 0 || dx === width - 1 || dz === 0 || dz === depth - 1;
          put(x0 + ox + dx, y0 + dy, z0 + oz + dz, edge ? ((dx + dz + dy) % 4 === 0 ? mossy : brick) : air);
        }
      }
    }
    // Portal chamber with a recessed lava well and the classic 3x3 frame ring.
    const px = x0 + 18, pz = z0 + 5;
    const frame = S['mc:end_portal_frame'];
    const lava = S['mc:lava'];
    for (let dx = 0; dx < 11; dx++) for (let dz = 0; dz < 11; dz++) {
      put(px + dx, y0, pz + dz, brick);
      if (dx === 0 || dx === 10 || dz === 0 || dz === 10) {
        for (let dy = 1; dy <= 5; dy++) put(px + dx, y0 + dy, pz + dz, brick);
      }
    }
    if (lava) for (let dx = 3; dx <= 7; dx++) for (let dz = 3; dz <= 7; dz++) put(px + dx, y0, pz + dz, lava);
    if (frame) {
      for (let i = 0; i < 3; i++) {
        put(px + 4 + i, y0 + 1, pz + 2, frame);
        put(px + 4 + i, y0 + 1, pz + 8, frame);
        put(px + 2, y0 + 1, pz + 4 + i, frame);
        put(px + 8, y0 + 1, pz + 4 + i, frame);
      }
    }
    if (S['mc:bookshelf']) {
      for (let dx = 1; dx < 8; dx++) {
        put(x0 - 11 + dx, y0 + 1, z0 + 4, S['mc:bookshelf']);
        put(x0 - 11 + dx, y0 + 2, z0 + 4, S['mc:bookshelf']);
      }
    }
    if (S['mc:chest']) put(x0 + 2, y0 + 1, z0 + 2, S['mc:chest']);
  }

  placeMineshaft(chunk, baseX, baseZ, site) {
    const S = this.states.byId;
    const air = S['mc:air'], plank = S['mc:oak_planks'], log = S['mc:oak_log'];
    if (!air || !plank || !log) return;
    const put = (wx, y, wz, state) => {
      const x = wx - baseX, z = wz - baseZ;
      if (!state || x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < MIN_Y || y >= MAX_Y) return;
      chunk.setBlock(x, y, z, state);
    };
    // A gently winding, supported corridor with occasional side alcoves.
    for (let step = 0; step < 30; step++) {
      const drift = Math.round(Math.sin(step * 0.31 + site.phase) * 2);
      const wx = site.x + (site.axis === 0 ? step : drift);
      const wz = site.z + (site.axis === 0 ? drift : step);
      const floor = site.y + Math.round(Math.sin(step * 0.19) * 1.5);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          put(wx + dx, floor, wz + dz, plank);
          for (let dy = 1; dy <= 3; dy++) put(wx + dx, floor + dy, wz + dz, air);
        }
      }
      if (step % 4 === 0) {
        for (let dy = 1; dy <= 3; dy++) {
          put(wx - 1, floor + dy, wz - 1, log);
          put(wx + 1, floor + dy, wz + 1, log);
        }
        for (let dx = -1; dx <= 1; dx++) put(wx + dx, floor + 4, wz, plank);
      }
      if (step % 7 === 3 && S['mc:torch']) put(wx, floor + 2, wz, S['mc:torch']);
    }
  }

  placeDungeon(chunk, baseX, baseZ, room) {
    const S = this.states.byId;
    const air = S['mc:air'], cobble = S['mc:cobblestone'];
    const mossy = S['mc:mossy_cobblestone'] || cobble;
    if (!air || !cobble) return;
    const put = (wx, y, wz, state) => {
      const x = wx - baseX, z = wz - baseZ;
      if (!state || x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < MIN_Y || y >= MAX_Y) return;
      chunk.setBlock(x, y, z, state);
    };
    for (let dx = 0; dx < 7; dx++) for (let dz = 0; dz < 7; dz++) {
      for (let dy = 0; dy < 5; dy++) {
        const edge = dx === 0 || dx === 6 || dz === 0 || dz === 6 || dy === 0 || dy === 4;
        if (!edge) continue;
        const weathered = ((dx * 13 + dz * 7 + dy * 3 + room.variant) % 5) < 2;
        put(room.x + dx, room.y + dy, room.z + dz, weathered ? mossy : cobble);
      }
    }
    // Clear the interior after constructing the shell.
    for (let dx = 1; dx < 6; dx++) for (let dz = 1; dz < 6; dz++)
      for (let dy = 1; dy < 4; dy++) put(room.x + dx, room.y + dy, room.z + dz, air);
    if (S['mc:chest']) put(room.x + 1, room.y + 1, room.z + 1, S['mc:chest']);
    if (S['mc:torch']) {
      put(room.x + 3, room.y + 3, room.z + 1, S['mc:torch']);
      put(room.x + 3, room.y + 3, room.z + 5, S['mc:torch']);
    }
  }

  validateVillageSite(x, z) {
    // Classic villages belong in plains, deserts, savannas, taigas and
    // snowy plains; forests are not treated as generic village terrain.
    const allowed = new Set([
      BIOME.PLAINS, BIOME.SUNFLOWER_PLAINS, BIOME.DESERT, BIOME.DESERT_HILLS,
      BIOME.SAVANNA, BIOME.SAVANNA_PLATEAU, BIOME.TAIGA, BIOME.TAIGA_HILLS,
      BIOME.COLD_TAIGA, BIOME.COLD_TAIGA_HILLS, BIOME.SNOWY_PLAINS,
    ]);
    const offsetsX = [0, 7, 14, 21, 27];
    const offsetsZ = [0, 7, 14, 21, 27];
    let min = Infinity, max = -Infinity;
    for (const dz of offsetsZ) {
      for (const dx of offsetsX) {
        const wx = x + dx, wz = z + dz;
        const height = this.heightAt(wx, wz);
        const biome = this.biomeAt(wx, wz, height);
        if (!allowed.has(biome)) return null;
        min = Math.min(min, height);
        max = Math.max(max, height);
      }
    }
    if (min < SEA_LEVEL + 2 || max - min > 4.5) return null;
    return { y: Math.floor((min + max) / 2), biome: this.biomeAt(x + 14, z + 14, this.heightAt(x + 14, z + 14)) };
  }

  setVillageBlock(chunk, baseX, baseZ, wx, y, wz, state) {
    if (!state || y < MIN_Y || y >= MAX_Y) return;
    const x = wx - baseX, z = wz - baseZ;
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    chunk.setBlock(x, y, z, state);
  }

  placeVillageHouse(chunk, baseX, baseZ, x, z, groundY, biome = BIOME.PLAINS, variant = 0) {
    const S = this.states.byId;
    const desert = biome === BIOME.DESERT || biome === BIOME.DESERT_HILLS;
    const wood = desert ? 'oak'
      : biome === BIOME.SAVANNA || biome === BIOME.SAVANNA_PLATEAU ? 'acacia'
      : [BIOME.TAIGA, BIOME.TAIGA_HILLS, BIOME.COLD_TAIGA, BIOME.COLD_TAIGA_HILLS, BIOME.SNOWY_PLAINS].includes(biome) ? 'spruce' : 'oak';
    const planks = S[desert ? 'mc:sandstone' : `mc:${wood}_planks`];
    const log = S[`mc:${wood}_log`] || S['mc:oak_log'];
    const roof = S[desert ? 'mc:sandstone' : `mc:${wood}_planks`];
    const glass = S['mc:glass'];
    if (!planks || !log || !roof) return;

    const put = (wx, y, wz, state) => this.setVillageBlock(chunk, baseX, baseZ, wx, y, wz, state);
    // Solid floor, timber corner posts and three-block walls, with a real door opening.
    for (let dz = 0; dz < 7; dz++) {
      for (let dx = 0; dx < 7; dx++) {
        put(x + dx, groundY + 1, z + dz, planks);
        const edge = dx === 0 || dx === 6 || dz === 0 || dz === 6;
        if (!edge) continue;
        for (let dy = 2; dy <= 4; dy++) {
          const corner = (dx === 0 || dx === 6) && (dz === 0 || dz === 6);
          put(x + dx, groundY + dy, z + dz, corner ? log : planks);
        }
      }
    }
    for (const dy of [2, 3]) put(x + 3, groundY + dy, z, S['mc:air']);
    if (glass) {
      for (const [wx, wz] of [[x + 1, z], [x + 5, z], [x, z + 3], [x + 6, z + 3], [x + 3, z + 6]]) {
        put(wx, groundY + 3, wz, glass);
      }
    }

    // A stepped gable roof replaces the old flat plank lid.
    for (let dz = -1; dz <= 7; dz++) {
      for (let dx = -1; dx <= 7; dx++) {
        const rise = dx < 0 || dx > 6 ? 0 : Math.min(dx, 6 - dx);
        put(x + dx, groundY + 5 + rise, z + dz, roof);
      }
    }

    // Interiors vary slightly so every house is not a duplicated empty shell.
    put(x + 2, groundY + 2, z + 3, S['mc:furnace']);
    put(x + 4, groundY + 2, z + 3, variant === 2 ? S['mc:chest'] : S['mc:crafting_table']);
    put(x + 3, groundY + 4, z + 2, S['mc:torch']);
    if (variant === 1 || variant === 3) {
      put(x + 2, groundY + 2, z + 5, S['mc:crafting_table']);
    }
  }

  placeVillageFarm(chunk, baseX, baseZ, x, z, groundY) {
    const S = this.states.byId;
    const farmland = S['mc:farmland'];
    const water = S['mc:water'];
    const wheat = S['mc:wheat'];
    if (!farmland || !water || !wheat) return;
    for (let dz = 0; dz < 7; dz++) {
      for (let dx = 0; dx < 7; dx++) {
        const wx = x + dx, wz = z + dz;
        if (dx === 3 || dz === 3) {
          this.setVillageBlock(chunk, baseX, baseZ, wx, groundY + 1, wz, water);
        } else {
          this.setVillageBlock(chunk, baseX, baseZ, wx, groundY + 1, wz, farmland);
          this.setVillageBlock(chunk, baseX, baseZ, wx, groundY + 2, wz, wheat);
        }
      }
    }
  }

  placeTree(chunk, x, y, z, species, rng) {
    const S = this.states.byId;
    const shape = buildTree(species, rng);
    const material = S[shape.material || `mc:${species}_log`];
    const leaves = S[`mc:${species}_leaves`];
    if (!material) return;

    for (const [dx, dy, dz] of shape.logs) {
      const px = x + dx, py = y + dy, pz = z + dz;
      if (px >= 0 && px < CHUNK_SIZE && pz >= 0 && pz < CHUNK_SIZE && py >= MIN_Y && py < MAX_Y) {
        chunk.setBlock(px, py, pz, material);
      }
    }
    if (leaves) {
      for (const [dx, dy, dz] of shape.leaves) {
        this.setLeaf(chunk, x + dx, y + dy, z + dz, leaves);
      }
    }
  }

  setLeaf(chunk, x, y, z, leaves) {
    if (x < 0 || x > 15 || z < 0 || z > 15 || y >= MAX_Y) return;
    if (chunk.getBlock(x, y, z).block.id !== 'mc:air') return;
    chunk.setBlock(x, y, z, leaves);
  }
}


/** Stable candidate placement for a 128x128 world-generation cell. */
export function villageCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 991, gridZ, 991);
  if (rng.nextInt(2) !== 0) return null;
  return {
    x: gridX * 128 + 16 + rng.nextInt(96),
    z: gridZ * 128 + 16 + rng.nextInt(96),
  };
}

/**
 * Sample Y with a triangular distribution peaked at `peak`.
 *
 * Averaging two uniform draws produces a triangle -- the standard trick, and
 * what makes diamonds cluster near y = -59 rather than spreading evenly.
 */
/** Deterministic world-grid anchors for underground structures. */
export function caveLakeCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 1601, gridZ, 1601);
  if (rng.nextInt(5) !== 0) return null;
  return {
    x: gridX * 112 + 24 + rng.nextInt(64),
    z: gridZ * 112 + 24 + rng.nextInt(64),
    y: 12 + rng.nextInt(28),
    radius: 4 + rng.nextInt(3),
  };
}

export function fossilCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 1901, gridZ, 1901);
  if (rng.nextInt(10) !== 0) return null;
  return { x: gridX * 144 + 20 + rng.nextInt(104), z: gridZ * 144 + 20 + rng.nextInt(104), y: 8 + rng.nextInt(25) };
}

export function mineshaftCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 1701, gridZ, 1701);
  if (rng.nextInt(5) !== 0) return null;
  return { x: gridX * 96 + 20 + rng.nextInt(48), z: gridZ * 96 + 20 + rng.nextInt(48),
    y: 12 + rng.nextInt(25), axis: rng.nextInt(2), phase: rng.nextDouble() * Math.PI * 2 };
}

export function desertTempleCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 2501, gridZ, 2501);
  if (rng.nextInt(8) !== 0) return null;
  return { x: gridX * 256 + 32 + rng.nextInt(192), z: gridZ * 256 + 32 + rng.nextInt(192) };
}

export function jungleTempleCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 2601, gridZ, 2601);
  if (rng.nextInt(10) !== 0) return null;
  return { x: gridX * 256 + 32 + rng.nextInt(192), z: gridZ * 256 + 32 + rng.nextInt(192) };
}

export function swampHutCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 2701, gridZ, 2701);
  if (rng.nextInt(10) !== 0) return null;
  return { x: gridX * 256 + 32 + rng.nextInt(192), z: gridZ * 256 + 32 + rng.nextInt(192) };
}

export function iglooCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 2801, gridZ, 2801);
  if (rng.nextInt(12) !== 0) return null;
  return { x: gridX * 256 + 32 + rng.nextInt(192), z: gridZ * 256 + 32 + rng.nextInt(192) };
}

export function mansionCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 2901, gridZ, 2901);
  if (rng.nextInt(18) !== 0) return null;
  return { x: gridX * 512 + 48 + rng.nextInt(416), z: gridZ * 512 + 48 + rng.nextInt(416) };
}

export function oceanMonumentCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 3001, gridZ, 3001);
  if (rng.nextInt(16) !== 0) return null;
  return { x: gridX * 512 + 48 + rng.nextInt(416), z: gridZ * 512 + 48 + rng.nextInt(416) };
}

export function strongholdCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 3101, gridZ, 3101);
  if (rng.nextInt(24) !== 0) return null;
  return {
    x: gridX * 512 + 32 + rng.nextInt(448),
    z: gridZ * 512 + 32 + rng.nextInt(448),
    y: 12 + rng.nextInt(22),
  };
}

export function dungeonCandidateForCell(seed, gridX, gridZ) {
  const rng = positionalRandom(seed, gridX, 1801, gridZ, 1801);
  if (rng.nextInt(4) !== 0) return null;
  return { x: gridX * 80 + 20 + rng.nextInt(36), z: gridZ * 80 + 20 + rng.nextInt(36),
    y: 8 + rng.nextInt(32), variant: rng.nextInt(5) };
}

function triangularY(rng, minY, maxY, peak) {
  const lower = rng.nextIntRange(minY, maxY);
  const upper = rng.nextIntRange(minY, maxY);
  const mid = Math.floor((lower + upper) / 2);
  const center = (minY + maxY) / 2;
  return clamp(Math.round(mid + (peak - center)), minY, maxY);
}

/** Blocks a vein or surface rule may overwrite. Never air, water, or wood. */
const STONE_ORE_REPLACEABLE = new Set(['mc:stone', 'mc:granite', 'mc:diorite', 'mc:andesite']);
const STONE_REPLACEABLE = new Set([
  ...STONE_ORE_REPLACEABLE,
  'mc:dirt', 'mc:grass_block', 'mc:sand', 'mc:gravel', 'mc:coarse_dirt',
  'mc:snow_block', 'mc:podzol', 'mc:red_sand', 'mc:plains_soil', 'mc:forest_floor',
  'mc:birch_soil', 'mc:jungle_soil', 'mc:savanna_soil', 'mc:taiga_soil', 'mc:swamp_mud', 'mc:alpine_gravel',
]);

/** Resolve block ids to states once, so generation never does a map lookup by string in a loop. */
function resolveStates() {
  const byId = {};
  for (const block of BLOCKS.blocks.values()) byId[block.id] = block.defaultState;
  return {
    byId,
    air: byId['mc:air'],
    stone: byId['mc:stone'],
    bedrock: byId['mc:bedrock'],
    water: byId['mc:water'],
  };
}


/** Find the nearest deterministic structure candidate in the requested dimension. */
export function findNearestStructure(seed, dimension, name, originX=0, originZ=0, maxRadius=16000) {
  const id=String(name||'').toLowerCase().replace(/^minecraft:/,'');
  const dim=dimension||'overworld';
  const definitions={
    village:{step:128,fn:villageCandidateForCell},
    mineshaft:{step:96,fn:mineshaftCandidateForCell},
    dungeon:{step:80,fn:dungeonCandidateForCell},
    stronghold:{step:512,fn:strongholdCandidateForCell},
    desert_temple:{step:256,fn:desertTempleCandidateForCell},
    desert_pyramid:{step:256,fn:desertTempleCandidateForCell},
    jungle_temple:{step:256,fn:jungleTempleCandidateForCell},
    swamp_hut:{step:256,fn:swampHutCandidateForCell},
    igloo:{step:256,fn:iglooCandidateForCell},
    mansion:{step:512,fn:mansionCandidateForCell},
    monument:{step:512,fn:oceanMonumentCandidateForCell},
    fossil:{step:144,fn:fossilCandidateForCell},
  };
  if(dim==='nether' && id==='fortress') {
    const step=384; let best=null;
    const gx0=Math.floor(originX/step),gz0=Math.floor(originZ/step),span=Math.ceil(maxRadius/step)+1;
    for(let gz=gz0-span;gz<=gz0+span;gz++) for(let gx=gx0-span;gx<=gx0+span;gx++) {
      const rng=positionalRandom(seed,gx,4101,gz,4101); if(rng.nextInt(3)!==0) continue;
      const p={x:gx*step+64+rng.nextInt(256),z:gz*step+64+rng.nextInt(256)};
      const d=Math.hypot(p.x-originX,p.z-originZ); if(d<=maxRadius&&(!best||d<best.distance)) best={...p,distance:d};
    }
    return best;
  }
  if(dim==='end' && id==='end_city') {
    const step=512; let best=null;
    const gx0=Math.floor(originX/step),gz0=Math.floor(originZ/step),span=Math.ceil(maxRadius/step)+1;
    for(let gz=gz0-span;gz<=gz0+span;gz++) for(let gx=gx0-span;gx<=gx0+span;gx++) {
      const rng=positionalRandom(seed,gx,4201,gz,4201); if(rng.nextInt(5)!==0) continue;
      const p={x:gx*step+80+rng.nextInt(352),z:gz*step+80+rng.nextInt(352)};
      const d=Math.hypot(p.x-originX,p.z-originZ); if(d<=maxRadius&&(!best||d<best.distance)) best={...p,distance:d};
    }
    return best;
  }
  if(dim!=='overworld') return null;
  const def=definitions[id]; if(!def) return null;
  const gx0=Math.floor(originX/def.step),gz0=Math.floor(originZ/def.step),span=Math.ceil(maxRadius/def.step)+1;
  const generator=new TerrainGenerator(seed,'overworld');
  let best=null;
  for(let gz=gz0-span;gz<=gz0+span;gz++) for(let gx=gx0-span;gx<=gx0+span;gx++) {
    const p=def.fn(seed,gx,gz); if(!p) continue;
    const d=Math.hypot(p.x-originX,p.z-originZ); if(d>maxRadius||best&&d>=best.distance) continue;
    const y=generator.heightAt(p.x,p.z), biome=generator.biomeAt(p.x,p.z,y);
    const valid={
      desert_temple:[BIOME.DESERT,BIOME.DESERT_HILLS],
      desert_pyramid:[BIOME.DESERT,BIOME.DESERT_HILLS],
      jungle_temple:[BIOME.JUNGLE,BIOME.JUNGLE_HILLS,BIOME.JUNGLE_EDGE,BIOME.BAMBOO_JUNGLE],
      swamp_hut:[BIOME.SWAMP],
      igloo:[BIOME.SNOWY_PLAINS,BIOME.SNOWY_TAIGA,BIOME.COLD_TAIGA],
      mansion:[BIOME.DARK_FOREST],
      monument:[BIOME.DEEP_OCEAN,BIOME.DEEP_COLD_OCEAN,BIOME.DEEP_FROZEN_OCEAN,BIOME.DEEP_LUKEWARM_OCEAN],
      village:[BIOME.PLAINS,BIOME.SUNFLOWER_PLAINS,BIOME.DESERT,BIOME.DESERT_HILLS,BIOME.SAVANNA,BIOME.SAVANNA_PLATEAU,BIOME.TAIGA,BIOME.TAIGA_HILLS,BIOME.COLD_TAIGA,BIOME.COLD_TAIGA_HILLS,BIOME.SNOWY_PLAINS],
    }[id];
    if(valid&&!valid.includes(biome)) continue;
    best={x:p.x,y:Number.isFinite(p.y)?p.y:Math.floor(y),z:p.z,distance:d};
  }
  return best;
}

/** Convenience for callers that just want a finished chunk. */
export function generateChunk(generator, cx, cz) {
  return generator.generate(new Chunk(cx, cz));
}

