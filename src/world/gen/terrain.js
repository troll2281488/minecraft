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

/** Bumped whenever generation output changes. Stored per world. */
export const GENERATOR_VERSION = 9;


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
  [BIOME.JUNGLE]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.072, grass:0.18, species:'jungle', ferns:0.2 },
  [BIOME.SPARSE_JUNGLE]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.035, grass:0.2, species:'jungle', ferns:0.12 },
  [BIOME.BAMBOO_JUNGLE]: { top:'mc:podzol', filler:'mc:dirt', trees:0.08, grass:0.18, species:'jungle', ferns:0.24 },
  [BIOME.DESERT]: { top:'mc:sand', filler:'mc:sand', trees:0, grass:0, deadBush:0.025 },
  [BIOME.SAVANNA]: { top:'mc:coarse_dirt', filler:'mc:dirt', trees:0.032, grass:0.18, species:'acacia' },
  [BIOME.SAVANNA_PLATEAU]: { top:'mc:coarse_dirt', filler:'mc:stone', trees:0.025, grass:0.14, species:'acacia' },
  [BIOME.SHATTERED_SAVANNA]: { top:'mc:stone', filler:'mc:coarse_dirt', trees:0.012, grass:0.08, species:'acacia' },
  [BIOME.BADLANDS]: { top:'mc:red_sand', filler:'mc:red_sand', trees:0, grass:0, deadBush:0.02 },
  [BIOME.WOODED_BADLANDS]: { top:'mc:red_sand', filler:'mc:red_sand', trees:0.012, grass:0.015, species:'oak', deadBush:0.012 },
  [BIOME.ERODED_BADLANDS]: { top:'mc:red_sand', filler:'mc:red_sand', trees:0, grass:0, deadBush:0.01 },
  [BIOME.MOUNTAINS]: { top:'mc:stone', filler:'mc:stone', trees:0.004, grass:0.025, species:'oak' },
  [BIOME.WINDSWEPT_HILLS]: { top:'mc:stone', filler:'mc:stone', trees:0.012, grass:0.04, species:'oak' },
  [BIOME.SNOWY_PLAINS]: { top:'mc:snow_block', filler:'mc:dirt', trees:0.002, grass:0 },
  [BIOME.ICE_SPIKES]: { top:'mc:packed_ice', filler:'mc:snow_block', trees:0, grass:0 },
  [BIOME.TAIGA]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.05, grass:0.12, species:'spruce' },
  [BIOME.SNOWY_TAIGA]: { top:'mc:snow_block', filler:'mc:dirt', trees:0.045, grass:0, species:'spruce' },
  [BIOME.GIANT_TREE_TAIGA]: { top:'mc:podzol', filler:'mc:dirt', trees:0.062, grass:0.12, species:'spruce' },
  [BIOME.GIANT_SPRUCE_TAIGA]: { top:'mc:podzol', filler:'mc:dirt', trees:0.072, grass:0.1, species:'spruce' },
  [BIOME.SWAMP]: { top:'mc:clay', filler:'mc:dirt', trees:0.035, grass:0.12, species:'oak', ferns:0.06 },
  [BIOME.MUSHROOM_FIELDS]: { top:'mc:mycelium', filler:'mc:dirt', trees:0.002, grass:0.02, mushrooms:0.13 },
  [BIOME.DESERT_HILLS]: { top:'mc:sand', filler:'mc:sand', trees:0, grass:0, deadBush:0.025 },
  [BIOME.FOREST_HILLS]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.06, grass:0.15, species:'oak' },
  [BIOME.TAIGA_HILLS]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.055, grass:0.12, species:'spruce' },
  [BIOME.EXTREME_HILLS_EDGE]: { top:'mc:stone', filler:'mc:stone', trees:0.006, grass:0.035, species:'oak' },
  [BIOME.EXTREME_HILLS_PLUS]: { top:'mc:stone', filler:'mc:stone', trees:0.008, grass:0.02, species:'oak' },
  [BIOME.JUNGLE_HILLS]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.078, grass:0.18, species:'jungle', ferns:0.22 },
  [BIOME.JUNGLE_EDGE]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.028, grass:0.16, species:'jungle', ferns:0.08 },
  [BIOME.BIRCH_FOREST_HILLS]: { top:'mc:grass_block', filler:'mc:dirt', trees:0.07, grass:0.14, species:'birch' },
  [BIOME.COLD_TAIGA]: { top:'mc:snow_block', filler:'mc:dirt', trees:0.046, grass:0, species:'spruce' },
  [BIOME.COLD_TAIGA_HILLS]: { top:'mc:snow_block', filler:'mc:dirt', trees:0.052, grass:0, species:'spruce' },
  [BIOME.MEGA_TAIGA_HILLS]: { top:'mc:podzol', filler:'mc:dirt', trees:0.068, grass:0.1, species:'spruce' },
  [BIOME.MESA_PLATEAU]: { top:'mc:red_sand', filler:'mc:red_sand', trees:0, grass:0, deadBush:0.01 },
  [BIOME.MESA_PLATEAU_F]: { top:'mc:red_sand', filler:'mc:red_sand', trees:0.006, grass:0.01, species:'oak', deadBush:0.01 },
};

// ---------------------------------------------------------------------------
// Ore distribution
//
// Minecraft 1.12.2 uses bounded ore distributions in classic 0..127 terrain.
// Most ores are uniform within their height range; lapis is triangular.
// ---------------------------------------------------------------------------

const ORES = [
  { block: 'mc:coal_ore',     veins: 20, size: 17, minY: 0, maxY: 127 },
  { block: 'mc:iron_ore',     veins: 20, size: 9,  minY: 0, maxY: 63 },
  { block: 'mc:gold_ore',     veins: 2,  size: 9,  minY: 0, maxY: 31 },
  { block: 'mc:redstone_ore', veins: 8,  size: 8,  minY: 0, maxY: 15 },
  { block: 'mc:lapis_ore',    veins: 1,  size: 7,  minY: 0, maxY: 31, peak: 16, triangular: true },
  { block: 'mc:diamond_ore',  veins: 1,  size: 8,  minY: 0, maxY: 15 },
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
  constructor(seed) {
    this.seed = normalizeSeed(seed);
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
    this.river = new OctaveNoise(root.fork('river'), 2, 0.5, 2.0);
    this.density = new OctaveNoise(root.fork('density'), 3, 0.5, 2.0);
    this.caveA = new PerlinNoise(root.fork('cave_a'));
    this.caveB = new PerlinNoise(root.fork('cave_b'));
    this.cheese = new OctaveNoise(root.fork('cheese'), 3, 0.5, 2.0);

    this.states = resolveStates();
  }

  /** Surface height at a world column, in blocks. */
  heightAt(wx, wz) {
    // Continent noise sets the broad shape: oceans, lowlands, highlands.
    const continent = this.continent.sample2(wx, wz, 0.0018);

    // Ridged noise adds mountain ranges, but only where the continent is high.
    // Multiplying by the continent value is what keeps mountains from erupting
    // out of the ocean floor.
    const mountainMask = clamp((continent - 0.15) * 2.5, 0, 1);
    const ridge = this.ridge.ridged2(wx, wz, 0.0035) * mountainMask;

    const detail = this.detail.sample2(wx, wz, 0.012);

    let height = SEA_LEVEL
      + continent * 42
      + ridge * 58
      + detail * 6;

    // Flatten the sea floor so oceans read as basins rather than noisy sludge.
    if (height < SEA_LEVEL - 4) {
      height = SEA_LEVEL - 4 - (SEA_LEVEL - 4 - height) * 0.55;
    }

    // A low-frequency river field carves connected, gently sloped channels
    // down to the water table. The same field labels the channel biome below.
    const riverDistance = Math.abs(this.river.sample2(wx, wz, 0.0017));
    // Blend river valleys gradually into the surrounding terrain. The former
    // hard height clamp made narrow, steep-sided water trenches that looked
    // like giant artificial canyons.
    const riverT = clamp(1 - riverDistance / 0.07, 0, 1);
    const riverBlend = riverT * riverT * (3 - 2 * riverT);
    height = height * (1 - riverBlend) + (SEA_LEVEL - 1.1) * riverBlend;
    return height;
  }

  biomeAt(wx, wz, height) {
    const riverDistance = Math.abs(this.river.sample2(wx, wz, 0.0017));
    const riverTemp = this.temperature.sample2(wx, wz, 0.0013);
    if (riverDistance < 0.018 && height >= SEA_LEVEL - 2) {
      return riverTemp < -0.48 ? BIOME.FROZEN_RIVER : BIOME.RIVER;
    }
    const temp = this.temperature.sample2(wx, wz, 0.0013);
    const humid = this.humidity.sample2(wx, wz, 0.0017);
    const detail = this.biomeDetail.sample2(wx, wz, 0.0022);
    const rare = this.biomeRarity.sample2(wx, wz, 0.0010);

    if (height < SEA_LEVEL - 2) {
      const deep = height < SEA_LEVEL - 13;
      if (temp < -0.48) return deep ? BIOME.DEEP_FROZEN_OCEAN : BIOME.FROZEN_OCEAN;
      if (temp < -0.12) return deep ? BIOME.DEEP_COLD_OCEAN : BIOME.COLD_OCEAN;
      if (temp > 0.48) return deep ? BIOME.DEEP_LUKEWARM_OCEAN : BIOME.WARM_OCEAN;
      return deep ? BIOME.DEEP_OCEAN : BIOME.LUKEWARM_OCEAN;
    }
    if (height <= SEA_LEVEL + 1) {
      if (temp < -0.48) return BIOME.SNOWY_BEACH;
      return detail > 0.68 ? BIOME.STONE_SHORE : BIOME.BEACH;
    }
    if (height > SEA_LEVEL + 42) return detail > 0.2 ? BIOME.EXTREME_HILLS_PLUS : BIOME.MOUNTAINS;
    if (height > SEA_LEVEL + 30 && detail > 0.48) return BIOME.EXTREME_HILLS_EDGE;

    // Mushroom islands are deliberately scarce, isolated climate pockets.
    if (humid > 0.12 && rare > 0.79 && detail > -0.15) return BIOME.MUSHROOM_FIELDS;

    // Cold climates: snowy plains are common; ice spikes and snowy taiga are
    // uncommon variants, while giant conifer forests remain a rarer subregion.
    if (temp < -0.48) {
      if (rare > 0.72 && detail > 0.2) return BIOME.ICE_SPIKES;
      if (humid > 0.12 && rare < -0.42) return detail > 0.35 ? BIOME.MEGA_TAIGA_HILLS : BIOME.GIANT_SPRUCE_TAIGA;
      if (humid > -0.05) return rare > 0.38 ? BIOME.COLD_TAIGA_HILLS : BIOME.COLD_TAIGA;
      return BIOME.SNOWY_PLAINS;
    }

    // Hot and dry lowlands are primarily savanna. True deserts and
    // badlands are reserved for the driest climate pockets.
    if (temp > 0.12 && humid < 0.2) {
      if (humid < -0.48 && rare > 0.78) return detail > 0.35 ? BIOME.ERODED_BADLANDS : (detail < -0.35 ? BIOME.MESA_PLATEAU : BIOME.BADLANDS);
      if (humid < -0.14 && rare > 0.22) return detail > 0.55 ? BIOME.DESERT_HILLS : BIOME.DESERT;
      return detail > 0.58 && rare > 0.55 ? BIOME.SAVANNA_PLATEAU : BIOME.SAVANNA;
    }

    // Warm, wet climates: jungle remains a distinct large region, with bamboo
    // as a less common sub-biome.
    if (temp > 0.48 && humid > 0.2) {
      if (rare > 0.72) return BIOME.BAMBOO_JUNGLE;
      if (detail > 0.62) return BIOME.JUNGLE_HILLS;
      if (rare < -0.25) return BIOME.JUNGLE_EDGE;
      return detail > 0.42 ? BIOME.SPARSE_JUNGLE : BIOME.JUNGLE;
    }
    if (humid > 0.42 && temp > -0.08 && temp < 0.46) return BIOME.SWAMP;

    // The four intended everyday biomes dominate temperate land:
    // birch forest, flower forest, plains and a smaller share of oak forest.
    if (temp > -0.42 && temp < 0.58) {
      if (humid > 0.08) {
        if (rare < -0.08) return detail > 0.25 ? BIOME.BIRCH_FOREST_HILLS : BIOME.BIRCH_FOREST;
        if (detail > 0.7 && rare < 0.16) return BIOME.FOREST_HILLS;
        return BIOME.FLOWER_FOREST;
      }
      if (rare > 0.72) return BIOME.SUNFLOWER_PLAINS;
      return BIOME.PLAINS;
    }
    if (humid > 0.28 && detail > 0.62) return BIOME.BIRCH_FOREST;
    if (humid > 0.12) return BIOME.FLOWER_FOREST;
    return BIOME.PLAINS;
  }

  /**
   * True where a cave should carve away solid ground.
   *
   * Two systems, as in vanilla: thin winding tunnels from the intersection of
   * two noise fields (each near zero only along a surface; both near zero only
   * along a line), plus large "cheese" cavities from a single low-frequency
   * field.
   */
  isCave(wx, wy, wz) {
    // Fade caves out near the surface so the world is not visibly full of holes.
    if (wy > SEA_LEVEL + 8) return false;

    const a = this.caveA.sample3(wx * 0.014, wy * 0.022, wz * 0.014);
    const b = this.caveB.sample3(wx * 0.014, wy * 0.022, wz * 0.014);
    if (a * a + b * b < 0.0016) return true;

    const cheese = this.cheese.sample3(wx, wy * 1.6, wz, 0.008);
    if (cheese > 0.62) return true;

    return false;
  }

  /** Fill a chunk with terrain, ores, surface material, and features. */
  generate(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const S = this.states;

    // Column heights, computed once and reused by every later stage.
    const heights = new Int32Array(CHUNK_SIZE * CHUNK_SIZE);
    const biomes = new Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        const h = Math.floor(this.heightAt(wx, wz));
        const i = z * CHUNK_SIZE + x;
        heights[i] = h;
        biomes[i] = this.biomeAt(wx, wz, h);
        chunk.setBiome(x, h, z, biomes[i]);
      }
    }

    // --- Stone shell, caves, water ---------------------------------------
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        const height = heights[z * CHUNK_SIZE + x];

        for (let y = MIN_Y; y <= Math.max(height, SEA_LEVEL); y++) {
          if (y === MIN_Y) {
            chunk.setBlock(x, y, z, S.bedrock);
            continue;
          }
          // A ragged bedrock floor rather than a flat slab, as in vanilla.
          if (y < MIN_Y + 5) {
            const r = positionalRandom(this.seed, wx, y, wz, 7);
            if (r.nextInt(5) >= y - MIN_Y) {
              chunk.setBlock(x, y, z, S.bedrock);
              continue;
            }
          }

          if (y <= height) {
            if (this.isCave(wx, y, wz)) {
              // Caves below sea level would otherwise flood the whole system.
              if (y < 8) chunk.setBlock(x, y, z, S.air);
              else chunk.setBlock(x, y, z, S.air);
              continue;
            }
            chunk.setBlock(x, y, z, this.stoneFor(wx, y, wz));
          } else if (y <= SEA_LEVEL) {
            chunk.setBlock(x, y, z, S.water);
          }
        }
      }
    }

    chunk.generatedStage = GEN_STAGE.TERRAIN;

    this.placePatches(chunk, baseX, baseZ);
    this.placeOres(chunk, baseX, baseZ);
    this.applySurface(chunk, baseX, baseZ, heights, biomes);
    this.placeFeatures(chunk, baseX, baseZ, heights, biomes);
    this.placeCaveLakes(chunk, baseX, baseZ);
    this.placeFossils(chunk, baseX, baseZ);
    this.placeVillages(chunk, baseX, baseZ);
    this.placeSurfaceStructures(chunk, baseX, baseZ);
    this.placeUndergroundStructures(chunk, baseX, baseZ);

    chunk.rebuildHeightmap();
    chunk.generatedStage = GEN_STAGE.FEATURES;
    // dataVersion is deliberately left alone: encodeChunk stamps the current
    // DATA_VERSION on write, and a freshly generated chunk has no older version
    // to record. Assigning undefined here was meaningless and misleading.
    return chunk;
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
          if (STONE_REPLACEABLE.has(existing.block.id)) {
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
        const topId = submerged && biome !== BIOME.OCEAN ? 'mc:sand' : surface.top;

        const topState = S.byId[topId];
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

        if (surface.trees > 0 && ['mc:grass_block', 'mc:podzol', 'mc:coarse_dirt', 'mc:snow_block'].includes(groundId) && rng.nextDouble() < surface.trees) {
          // Keep trunks away from the chunk edge: this generator writes only
          // into its own chunk, so a canopy crossing the border would be
          // clipped. Cross-chunk feature placement arrives in Phase 2.
          if (x >= 2 && x <= 13 && z >= 2 && z <= 13) {
            this.placeTree(chunk, x, top + 1, z, surface.species ?? 'oak', rng);
            continue;
          }
        }

        if (biomes[i] === BIOME.MUSHROOM_FIELDS && groundId === 'mc:mycelium' && rng.nextDouble() < (surface.mushrooms ?? 0)) {
          const mushroom = rng.nextBoolean() ? S.byId['mc:red_mushroom'] : S.byId['mc:brown_mushroom'];
          if (mushroom) chunk.setBlock(x, top + 1, z, mushroom);
        } else if (biomes[i] === BIOME.BAMBOO_JUNGLE && groundId === 'mc:podzol' && rng.nextDouble() < 0.075) {
          if (S.byId['mc:bamboo']) chunk.setBlock(x, top + 1, z, S.byId['mc:bamboo']);
        } else if (surface.grass > 0 && groundId === 'mc:grass_block' && rng.nextDouble() < surface.grass) {
          const flowerChance = surface.flowers ?? 0.12;
          const plant = rng.nextDouble() < flowerChance
            ? (rng.nextBoolean() ? S.byId['mc:poppy'] : S.byId['mc:dandelion'])
            : S.byId['mc:short_grass'];
          if (plant) chunk.setBlock(x, top + 1, z, plant);
        } else if (surface.ferns && groundId === 'mc:grass_block' && rng.nextDouble() < surface.ferns) {
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
    for (let floor = 0; floor < 3; floor++) {
      const baseY = groundY + 1 + floor * 5;
      for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) {
        put(site.x + dx, baseY, site.z + dz, floor === 0 ? stone : plank);
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
    const floorY = Math.max(MIN_Y + 5, Math.floor(this.heightAt(site.x, site.z)) + 1);
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
    const minGridX = Math.floor((baseX - 30) / 128);
    const maxGridX = Math.floor((baseX + CHUNK_SIZE + 30) / 128);
    const minGridZ = Math.floor((baseZ - 30) / 128);
    const maxGridZ = Math.floor((baseZ + CHUNK_SIZE + 30) / 128);

    for (let gz = minGridZ; gz <= maxGridZ; gz++) {
      for (let gx = minGridX; gx <= maxGridX; gx++) {
        const candidate = villageCandidateForCell(this.seed, gx, gz);
        if (!candidate) continue;

        const site = this.validateVillageSite(candidate.x, candidate.z);
        if (!site) continue;
        // Four small homes and a farm form a recognizable village cluster,
        // rather than the old two-box outpost. All pieces are clipped per chunk.
        this.placeVillageHouse(chunk, baseX, baseZ, candidate.x, candidate.z, site.y, site.biome, 0);
        this.placeVillageHouse(chunk, baseX, baseZ, candidate.x + 10, candidate.z, site.y, site.biome, 1);
        this.placeVillageHouse(chunk, baseX, baseZ, candidate.x, candidate.z + 10, site.y, site.biome, 2);
        this.placeVillageHouse(chunk, baseX, baseZ, candidate.x + 10, candidate.z + 10, site.y, site.biome, 3);
        this.placeVillageFarm(chunk, baseX, baseZ, candidate.x + 20, candidate.z + 10, site.y);
        const path = this.states.byId['mc:coarse_dirt'];
        // Main lane and two cross-lanes link the doors, farm and village centre.
        for (let dx = 3; dx <= 23; dx++) {
          this.setVillageBlock(chunk, baseX, baseZ, candidate.x + dx, site.y, candidate.z + 8, path);
          this.setVillageBlock(chunk, baseX, baseZ, candidate.x + dx, site.y, candidate.z + 18, path);
        }
        for (let dz = 3; dz <= 18; dz++) {
          this.setVillageBlock(chunk, baseX, baseZ, candidate.x + 8, site.y, candidate.z + dz, path);
          this.setVillageBlock(chunk, baseX, baseZ, candidate.x + 18, site.y, candidate.z + dz, path);
        }
      }
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

  placeUndergroundStructures(chunk, baseX, baseZ) {
    const minX = Math.floor((baseX - 36) / 96);
    const maxX = Math.floor((baseX + CHUNK_SIZE + 36) / 96);
    const minZ = Math.floor((baseZ - 36) / 96);
    const maxZ = Math.floor((baseZ + CHUNK_SIZE + 36) / 96);
    for (let gz = minZ; gz <= maxZ; gz++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const shaft = mineshaftCandidateForCell(this.seed, gx, gz);
        if (shaft) this.placeMineshaft(chunk, baseX, baseZ, shaft);
      }
    }

    const dungeonMinX = Math.floor((baseX - 20) / 80);
    const dungeonMaxX = Math.floor((baseX + CHUNK_SIZE + 20) / 80);
    const dungeonMinZ = Math.floor((baseZ - 20) / 80);
    const dungeonMaxZ = Math.floor((baseZ + CHUNK_SIZE + 20) / 80);
    for (let gz = dungeonMinZ; gz <= dungeonMaxZ; gz++) {
      for (let gx = dungeonMinX; gx <= dungeonMaxX; gx++) {
        const room = dungeonCandidateForCell(this.seed, gx, gz);
        if (room) this.placeDungeon(chunk, baseX, baseZ, room);
      }
    }

    const strongholdMinX = Math.floor((baseX - 32) / 512);
    const strongholdMaxX = Math.floor((baseX + CHUNK_SIZE + 32) / 512);
    const strongholdMinZ = Math.floor((baseZ - 32) / 512);
    const strongholdMaxZ = Math.floor((baseZ + CHUNK_SIZE + 32) / 512);
    for (let gz = strongholdMinZ; gz <= strongholdMaxZ; gz++) {
      for (let gx = strongholdMinX; gx <= strongholdMaxX; gx++) {
        const stronghold = strongholdCandidateForCell(this.seed, gx, gz);
        if (stronghold) this.placeStronghold(chunk, baseX, baseZ, stronghold);
      }
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
      : biome === BIOME.TAIGA || biome === BIOME.SNOWY_PLAINS ? 'spruce' : 'oak';
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
    const S = this.states;
    const log = S.byId[`mc:${species}_log`];
    const leaves = S.byId[`mc:${species}_leaves`];
    if (!log || !leaves) return;

    // Species-specific silhouettes: spruce is conical, birch/oak are rounded,
    // jungle is tall and broad, acacia has an angled crown, and dark oak has a
    // heavy trunk with a dense canopy. All writes stay inside this chunk.
    const isSpruce = species === 'spruce';
    const isJungle = species === 'jungle';
    const isAcacia = species === 'acacia';
    const isBirch = species === 'birch';
    const isDarkOak = species === 'dark_oak';
    const acaciaLean = isAcacia && rng.nextBoolean() ? 1 : -1;
    const height = isSpruce ? 7 + rng.nextInt(3)
      : isJungle ? 9 + rng.nextInt(5)
      : isAcacia ? 6 + rng.nextInt(3)
      : isBirch ? 7 + rng.nextInt(3)
      : isDarkOak ? 7 + rng.nextInt(2)
      : 5 + rng.nextInt(3);

    if (isDarkOak) {
      for (let dy = 0; dy < height; dy++) {
        for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          if (y + dy < MAX_Y) chunk.setBlock(x + ox, y + dy, z + oz, log);
        }
      }
    } else {
      for (let dy = 0; dy < height; dy++) {
        const ox = isAcacia && dy >= Math.floor(height * 0.55) ? acaciaLean : 0;
        if (y + dy < MAX_Y) chunk.setBlock(x + ox, y + dy, z, log);
      }
    }

    if (isSpruce) {
      let radius = 2;
      for (let layer = 0; layer < 5; layer++) {
        const ly = y + height - 1 - layer * 2;
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
          this.setLeaf(chunk, x + dx, ly, z + dz, leaves);
        }
        radius = radius === 2 ? 1 : 2;
      }
      this.setLeaf(chunk, x, y + height, z, leaves);
      return;
    }

    if (isJungle) {
      for (let dy = -2; dy <= 1; dy++) {
        const radius = dy === -2 ? 2 : 3;
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && rng.nextBoolean()) continue;
          this.setLeaf(chunk, x + dx, y + height + dy, z + dz, leaves);
        }
      }
      return;
    }

    if (isAcacia) {
      // Acacia: a visibly leaning upper trunk and a broad, flat umbrella crown.
      const lean = acaciaLean;
      const crownX = x + lean * 2;
      for (let step = 1; step <= 2; step++) {
        const branchY = y + height - 2 + step;
        const branchX = x + lean * step;
        if (branchY < MAX_Y) chunk.setBlock(branchX, branchY, z, log);
      }
      for (let dy = -1; dy <= 1; dy++) {
        const radiusX = dy === 1 ? 2 : 3;
        const radiusZ = dy === 1 ? 2 : 3;
        for (let dx = -radiusX; dx <= radiusX; dx++) for (let dz = -radiusZ; dz <= radiusZ; dz++) {
          if ((dx * dx) / (radiusX * radiusX + 0.01) + (dz * dz) / (radiusZ * radiusZ + 0.01) > 1.15) continue;
          if (Math.abs(dx) === radiusX && Math.abs(dz) === radiusZ && rng.nextBoolean()) continue;
          this.setLeaf(chunk, crownX + dx, y + height + dy, z + dz, leaves);
        }
      }
      return;
    }

    if (isBirch) {
      // Birch crowns are taller and narrower than oak, with a loose oval profile.
      for (let dy = -3; dy <= 1; dy++) {
        const radius = dy === 1 || dy === -3 ? 1 : 2;
        const ly = y + height - 1 + dy;
        for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && rng.nextBoolean()) continue;
          this.setLeaf(chunk, x + dx, ly, z + dz, leaves);
        }
      }
      this.setLeaf(chunk, x, y + height + 1, z, leaves);
      return;
    }

    const radius = isDarkOak ? 3 : 2;
    for (let dy = -2; dy <= 0; dy++) {
      const ly = y + height - 1 + dy;
      const layerRadius = dy === 0 ? radius - 1 : radius;
      for (let dx = -layerRadius; dx <= layerRadius; dx++) for (let dz = -layerRadius; dz <= layerRadius; dz++) {
        if (Math.abs(dx) === layerRadius && Math.abs(dz) === layerRadius && rng.nextBoolean()) continue;
        this.setLeaf(chunk, x + dx, ly, z + dz, leaves);
      }
    }
    this.setLeaf(chunk, x, y + height, z, leaves);
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
const STONE_REPLACEABLE = new Set([
  'mc:stone', 'mc:granite', 'mc:diorite', 'mc:andesite',
  'mc:dirt', 'mc:grass_block', 'mc:sand', 'mc:gravel', 'mc:coarse_dirt',
  'mc:snow_block', 'mc:podzol', 'mc:red_sand',
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

/** Convenience for callers that just want a finished chunk. */
export function generateChunk(generator, cx, cz) {
  return generator.generate(new Chunk(cx, cz));
}

