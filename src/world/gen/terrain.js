/**
 * Phase 1 terrain generation.
 *
 * A deliberately simplified ancestor of what Phase 2 will replace it with. This
 * uses a 2D heightmap with a 3D density field carved through it, which produces
 * good-looking hills, cliffs, and caves. The full 1.18-style multi-noise biome
 * system -- continentalness, erosion, peaks-and-valleys as independent
 * parameters -- lands in Phase 2.
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
export const GENERATOR_VERSION = 1;

/** Y below which stone becomes deepslate, with a ragged blend above it. */
const DEEPSLATE_TOP = 0;
const DEEPSLATE_BLEND = 8;

// ---------------------------------------------------------------------------
// Biomes
//
// A small set for Phase 1, selected by temperature and humidity. Enough for the
// world to look varied; the real ~24-biome multi-noise placement is Phase 2.
// ---------------------------------------------------------------------------

export const BIOME = {
  OCEAN: 'mc:ocean',
  BEACH: 'mc:beach',
  PLAINS: 'mc:plains',
  FOREST: 'mc:forest',
  DESERT: 'mc:desert',
  MOUNTAINS: 'mc:mountains',
  SNOWY_PLAINS: 'mc:snowy_plains',
  TAIGA: 'mc:taiga',
};

const BIOME_SURFACE = {
  [BIOME.OCEAN]:        { top: 'mc:gravel',      filler: 'mc:dirt',  trees: 0,    grass: 0 },
  [BIOME.BEACH]:        { top: 'mc:sand',        filler: 'mc:sand',  trees: 0,    grass: 0 },
  [BIOME.PLAINS]:       { top: 'mc:grass_block', filler: 'mc:dirt',  trees: 0.004, grass: 0.18, species: 'oak' },
  [BIOME.FOREST]:       { top: 'mc:grass_block', filler: 'mc:dirt',  trees: 0.06, grass: 0.12, species: 'oak' },
  [BIOME.DESERT]:       { top: 'mc:sand',        filler: 'mc:sand',  trees: 0,    grass: 0,    deadBush: 0.01 },
  [BIOME.MOUNTAINS]:    { top: 'mc:stone',       filler: 'mc:stone', trees: 0.002, grass: 0.02 },
  [BIOME.SNOWY_PLAINS]: { top: 'mc:snow_block',  filler: 'mc:dirt',  trees: 0.004, grass: 0 },
  [BIOME.TAIGA]:        { top: 'mc:grass_block', filler: 'mc:dirt',  trees: 0.05, grass: 0.10, species: 'spruce' },
};

// ---------------------------------------------------------------------------
// Ore distribution
//
// Vanilla 1.18 uses triangular distributions peaked at a target depth rather
// than uniform bands -- which is why diamonds get dramatically more common as
// you approach y = -59 instead of being flat below 16.
// ---------------------------------------------------------------------------

const ORES = [
  { block: 'mc:coal_ore',    veins: 20, size: 12, minY: 0,   maxY: 192, peak: 96,  triangular: true },
  { block: 'mc:iron_ore',    veins: 10, size: 8,  minY: -24, maxY: 56,  peak: 16,  triangular: true },
  { block: 'mc:copper_ore',  veins: 8,  size: 10, minY: -16, maxY: 112, peak: 48,  triangular: true },
  { block: 'mc:gold_ore',    veins: 3,  size: 6,  minY: -64, maxY: 32,  peak: -16, triangular: true },
  { block: 'mc:redstone_ore',veins: 6,  size: 7,  minY: -64, maxY: 15,  peak: -32, triangular: false },
  { block: 'mc:lapis_ore',   veins: 2,  size: 6,  minY: -64, maxY: 64,  peak: 0,   triangular: true },
  { block: 'mc:diamond_ore', veins: 2,  size: 5,  minY: -64, maxY: 16,  peak: -59, triangular: true },
];

const DIRT_PATCHES = [
  { block: 'mc:dirt',    veins: 8, size: 22, minY: 0, maxY: 160 },
  { block: 'mc:gravel',  veins: 6, size: 20, minY: -32, maxY: 160 },
  { block: 'mc:granite', veins: 4, size: 24, minY: -48, maxY: 80 },
  { block: 'mc:diorite', veins: 4, size: 24, minY: -48, maxY: 80 },
  { block: 'mc:andesite',veins: 4, size: 24, minY: -48, maxY: 80 },
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

    return height;
  }

  biomeAt(wx, wz, height) {
    if (height < SEA_LEVEL - 2) return BIOME.OCEAN;
    if (height <= SEA_LEVEL + 1) return BIOME.BEACH;
    if (height > SEA_LEVEL + 52) return BIOME.MOUNTAINS;

    const temp = this.temperature.sample2(wx, wz, 0.0012);
    const humid = this.humidity.sample2(wx, wz, 0.0014);

    if (temp < -0.35) return humid > 0 ? BIOME.TAIGA : BIOME.SNOWY_PLAINS;
    if (temp > 0.42 && humid < -0.1) return BIOME.DESERT;
    if (humid > 0.12) return BIOME.FOREST;
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

    chunk.rebuildHeightmap();
    chunk.generatedStage = GEN_STAGE.FEATURES;
    // dataVersion is deliberately left alone: encodeChunk stamps the current
    // DATA_VERSION on write, and a freshly generated chunk has no older version
    // to record. Assigning undefined here was meaningless and misleading.
    return chunk;
  }

  /** Stone or deepslate, with a ragged transition rather than a flat line. */
  stoneFor(wx, wy, wz) {
    if (wy > DEEPSLATE_TOP) return this.states.stone;
    if (wy < DEEPSLATE_TOP - DEEPSLATE_BLEND) return this.states.deepslate;
    const r = positionalRandom(this.seed, wx, wy, wz, 11);
    const t = (DEEPSLATE_TOP - wy) / DEEPSLATE_BLEND;
    return r.nextDouble() < t ? this.states.deepslate : this.states.stone;
  }

  placePatches(chunk, baseX, baseZ) {
    for (const patch of DIRT_PATCHES) {
      this.scatterVeins(chunk, baseX, baseZ, patch, 31, false);
    }
  }

  placeOres(chunk, baseX, baseZ) {
    for (const ore of ORES) {
      this.scatterVeins(chunk, baseX, baseZ, ore, 53, true);
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
            if (deepslateVariants && existing.block.id === 'mc:deepslate') {
              target = spec.block.replace('mc:', 'mc:deepslate_');
            }
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
          if (chunk.getBlock(x, y, z).block.id === 'mc:grass_block' ||
              chunk.getBlock(x, y, z).block.id === 'mc:sand') {
            top = y;
            break;
          }
        }
        if (top < 0) continue;
        const groundId = chunk.getBlock(x, top, z).block.id;

        if (surface.trees > 0 && groundId === 'mc:grass_block' && rng.nextDouble() < surface.trees) {
          // Keep trunks away from the chunk edge: this generator writes only
          // into its own chunk, so a canopy crossing the border would be
          // clipped. Cross-chunk feature placement arrives in Phase 2.
          if (x >= 2 && x <= 13 && z >= 2 && z <= 13) {
            this.placeTree(chunk, x, top + 1, z, surface.species ?? 'oak', rng);
            continue;
          }
        }

        if (surface.grass > 0 && groundId === 'mc:grass_block' && rng.nextDouble() < surface.grass) {
          const plant = rng.nextDouble() < 0.12
            ? (rng.nextBoolean() ? S.byId['mc:poppy'] : S.byId['mc:dandelion'])
            : S.byId['mc:short_grass'];
          if (plant) chunk.setBlock(x, top + 1, z, plant);
        } else if (surface.deadBush && groundId === 'mc:sand' && rng.nextDouble() < surface.deadBush) {
          chunk.setBlock(x, top + 1, z, S.byId['mc:dead_bush']);
        }
      }
    }
  }

  placeTree(chunk, x, y, z, species, rng) {
    const S = this.states;
    const log = S.byId[`mc:${species}_log`];
    const leaves = S.byId[`mc:${species}_leaves`];
    if (!log || !leaves) return;

    const isConifer = species === 'spruce';
    const height = isConifer ? 6 + rng.nextInt(3) : 4 + rng.nextInt(3);

    for (let i = 0; i < height; i++) {
      if (y + i < MAX_Y) chunk.setBlock(x, y + i, z, log);
    }

    if (isConifer) {
      // Tapered layers, widest at the bottom.
      let radius = 2;
      for (let layer = 0; layer < 4; layer++) {
        const ly = y + height - 1 - layer * 2;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
            if (dx === 0 && dz === 0 && ly < y + height) continue;
            this.setLeaf(chunk, x + dx, ly, z + dz, leaves);
          }
        }
        radius = radius === 2 ? 1 : 2;
      }
      this.setLeaf(chunk, x, y + height, z, leaves);
    } else {
      // Two wide layers below the top, then a small cap.
      for (let dy = -2; dy <= 0; dy++) {
        const ly = y + height - 1 + dy;
        const radius = dy === 0 ? 1 : 2;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (dx === 0 && dz === 0 && dy < 0) continue;
            // Trim the corners so the canopy is rounded, not a cube.
            if (radius === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && rng.nextBoolean()) continue;
            this.setLeaf(chunk, x + dx, ly, z + dz, leaves);
          }
        }
      }
      this.setLeaf(chunk, x, y + height, z, leaves);
    }
  }

  setLeaf(chunk, x, y, z, leaves) {
    if (x < 0 || x > 15 || z < 0 || z > 15 || y >= MAX_Y) return;
    if (chunk.getBlock(x, y, z).block.id !== 'mc:air') return;
    chunk.setBlock(x, y, z, leaves);
  }
}

/**
 * Sample Y with a triangular distribution peaked at `peak`.
 *
 * Averaging two uniform draws produces a triangle -- the standard trick, and
 * what makes diamonds cluster near y = -59 rather than spreading evenly.
 */
function triangularY(rng, minY, maxY, peak) {
  const lower = rng.nextIntRange(minY, maxY);
  const upper = rng.nextIntRange(minY, maxY);
  const mid = Math.floor((lower + upper) / 2);
  const center = (minY + maxY) / 2;
  return clamp(Math.round(mid + (peak - center)), minY, maxY);
}

/** Blocks a vein or surface rule may overwrite. Never air, water, or wood. */
const STONE_REPLACEABLE = new Set([
  'mc:stone', 'mc:deepslate', 'mc:granite', 'mc:diorite', 'mc:andesite',
  'mc:dirt', 'mc:grass_block', 'mc:sand', 'mc:gravel', 'mc:coarse_dirt',
  'mc:snow_block', 'mc:podzol',
]);

/** Resolve block ids to states once, so generation never does a map lookup by string in a loop. */
function resolveStates() {
  const byId = {};
  for (const block of BLOCKS.blocks.values()) byId[block.id] = block.defaultState;
  return {
    byId,
    air: byId['mc:air'],
    stone: byId['mc:stone'],
    deepslate: byId['mc:deepslate'],
    bedrock: byId['mc:bedrock'],
    water: byId['mc:water'],
  };
}

/** Convenience for callers that just want a finished chunk. */
export function generateChunk(generator, cx, cz) {
  return generator.generate(new Chunk(cx, cz));
}

export { BIOME_SURFACE };
