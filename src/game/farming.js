/**
 * Persistent Java-style farmland hydration and wheat growth.
 *
 * Moisture is stored in the farmland blockstate, so it survives chunk saves,
 * reloads and multiplayer block-state replication without a side database.
 */
import { positionalRandom } from '../core/rng.js';
import { BLOCKS } from '../world/block.js';

export const WHEAT_CROP_ID = 'mc:wheat';
export const STEM_IDS = Object.freeze(['mc:pumpkin_stem', 'mc:melon_stem']);
export const CROP_IDS = Object.freeze(['mc:wheat', 'mc:carrots', 'mc:potatoes', 'mc:beetroots', ...STEM_IDS]);
export const FARMLAND_ID = 'mc:farmland';
export const FARMLAND_MAX_MOISTURE = 7;
export const FARMLAND_TICK_INTERVAL = 20;
export const WHEAT_GROWTH_INTERVAL = 600;
export const DRY_WHEAT_GROWTH_INTERVAL = 1800;
export const SUGAR_CANE_GROWTH_INTERVAL = 600;\nexport const SWEET_BERRY_GROWTH_INTERVAL = 600;\nexport const SWEET_BERRY_BUSH_ID = 'mc:sweet_berry_bush';
export const SUGAR_CANE_MAX_HEIGHT = 3;
const SUGAR_CANE_SOILS = new Set(['mc:sand', 'mc:dirt', 'mc:grass_block']);

export function nextCropAge(state) {
  if (!CROP_IDS.includes(state?.block?.id)) return null;
  const age = state.get('age');
  return age >= 7 ? null : age + 1;
}

/** Sugar cane needs a valid substrate and an adjacent source-water block. */
export function canPlantSugarCane(world, x, y, z) {
  if (!world?.getBlock || !SUGAR_CANE_SOILS.has(world.getBlock(x, y, z)?.block?.id)) return false;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const water = world.getBlock(x + dx, y + 1, z + dz);
    if (water?.block?.id === 'mc:water' && (water.get?.('level') ?? 0) === 0) return true;
  }
  return false;
}

export function nextSweetBerryBushAge(state) {\n  if (state?.block?.id !== SWEET_BERRY_BUSH_ID) return null;\n  const age = state.get('age');\n  return age >= 3 ? null : age + 1;\n}\n\nexport function sweetBerryHarvest(state, random = Math.random) {\n  if (state?.block?.id !== SWEET_BERRY_BUSH_ID) return null;\n  const age = state.get('age');\n  if (age < 2) return null;\n  const count = age === 3 ? 2 + Math.floor(random() * 2) : 1 + Math.floor(random() * 2);\n  return { count, state: state.with('age', 1) };\n}\n\nexport function nextWheatAge(state) {
  return state?.block?.id === WHEAT_CROP_ID ? nextCropAge(state) : null;
}

const STEM_FRUIT = Object.freeze({
  'mc:pumpkin_stem': 'mc:pumpkin',
  'mc:melon_stem': 'mc:melon',
});
const FRUIT_SOILS = new Set(['mc:farmland', 'mc:dirt', 'mc:grass_block', 'mc:coarse_dirt', 'mc:podzol']);

/** Pick a deterministic adjacent fruit location for a mature stem. */
export function chooseStemFruitTarget(world, x, y, z, seed, tickCount, stemId) {
  const fruitId = STEM_FRUIT[stemId];
  if (!fruitId || !world?.getBlock) return null;
  const rng = positionalRandom(seed ?? 0, x, y, z, 0x5354454d ^ tickCount);
  if (rng.nextInt(3) !== 0) return null;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const offset = rng.nextInt(directions.length);
  for (let i = 0; i < directions.length; i++) {
    const [dx, dz] = directions[(i + offset) % directions.length];
    const fx = x + dx, fz = z + dz;
    if (world.getBlock(fx, y, fz)?.block?.id !== 'mc:air') continue;
    if (!FRUIT_SOILS.has(world.getBlock(fx, y - 1, fz)?.block?.id)) continue;
    const fruit = BLOCKS.get(fruitId)?.defaultState;
    if (fruit) return { x: fx, y, z: fz, state: fruit };
  }
  return null;
}

/**
 * Water hydrates farmland within a four-block horizontal square radius. Source water
 * may be at the farmland's level or one block above it. Flowing water does not
 * hydrate it. The search is deliberately bounded and only runs for dry soil.
 */
export function hasNearbyWaterSource(world, x, y, z) {
  if (!world?.getBlock) return false;
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        const state = world.getBlock(x + dx, y + dy, z + dz);
        if (state?.block?.id !== 'mc:water') continue;
        const level = state.get?.('level');
        if (level === undefined || level === 0) return true;
      }
    }
  }
  return false;
}

/**
 * Advances local farmland and crop states. Only loaded blocks near the player
 * are touched; each resulting state is returned for the existing multiplayer
 * block-change path. No polling or per-tick network writes are added.
 */
export function tickFarming(world, player, tickCount) {
  if (!world || !player || !Number.isInteger(tickCount) || tickCount < 0) return [];
  const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
  const changed = [];
  const changedKeys = new Set();

  const write = (x, y, z, state) => {
    if (!world.setBlock(x, y, z, state)) return false;
    changed.push({ x, y, z, state });
    changedKeys.add(`${x},${y},${z}`);
    return true;
  };

  // Hydration is evaluated once per second, not every simulation tick.
  if (tickCount % FARMLAND_TICK_INTERVAL === 0) {
    for (let x = px - 8; x <= px + 8; x++) {
      for (let z = pz - 8; z <= pz + 8; z++) {
        for (let y = py - 3; y <= py + 4; y++) {
          const state = world.getBlock(x, y, z);
          if (state?.block?.id !== FARMLAND_ID) continue;
          const moisture = state.get('moisture') ?? 0;
          let nextMoisture = moisture;
          if (moisture < FARMLAND_MAX_MOISTURE && hasNearbyWaterSource(world, x, y, z)) {
            nextMoisture = FARMLAND_MAX_MOISTURE;
          } else if (moisture > 0) {
            nextMoisture = moisture - 1;
          }
          if (nextMoisture !== moisture) write(x, y, z, state.with('moisture', nextMoisture));
        }
      }
    }
  }

  // Hydrated wheat grows on the normal interval; dry farmland supports slower
  // growth, matching the important hydrated-vs-dry survival distinction.
  if (tickCount % WHEAT_GROWTH_INTERVAL === 0) {
    for (let x = px - 8; x <= px + 8; x++) {
      for (let z = pz - 8; z <= pz + 8; z++) {
        for (let y = py - 3; y <= py + 4; y++) {
          const crop = world.getBlock(x, y, z);
          const nextAge = nextCropAge(crop);
          if (nextAge === null) continue;
          const soilKey = `${x},${y - 1},${z}`;
          const soil = world.getBlock(x, y - 1, z);
          if (soil?.block?.id !== FARMLAND_ID) continue;
          const moisture = soil.get('moisture') ?? 0;
          const interval = moisture > 0 ? WHEAT_GROWTH_INTERVAL : DRY_WHEAT_GROWTH_INTERVAL;
          if (tickCount % interval !== 0) continue;
          // A block updated earlier in this same pass is read back from world,
          // so the crop sees the freshly hydrated farmland state.
          if (changedKeys.has(soilKey)) {
            const currentSoil = world.getBlock(x, y - 1, z);
            if ((currentSoil.get('moisture') ?? 0) === 0 && tickCount % DRY_WHEAT_GROWTH_INTERVAL !== 0) continue;
          }
          write(x, y, z, crop.with('age', nextAge));
        }
      }
    }
  }
  // Mature pumpkin/melon stems periodically attempt to place a fruit in
  // one of the four adjacent air blocks, provided that block has suitable soil.
  if (tickCount % WHEAT_GROWTH_INTERVAL === 0) {
    for (let x = px - 8; x <= px + 8; x++) {
      for (let z = pz - 8; z <= pz + 8; z++) {
        for (let y = py - 3; y <= py + 4; y++) {
          const stem = world.getBlock(x, y, z);
          if (!STEM_IDS.includes(stem?.block?.id) || stem.get('age') !== 7 ||
              changedKeys.has(`${x},${y},${z}`)) continue;
          const soil = world.getBlock(x, y - 1, z);
          if (soil?.block?.id !== FARMLAND_ID) continue;
          const moisture = soil.get('moisture') ?? 0;
          const interval = moisture > 0 ? WHEAT_GROWTH_INTERVAL : DRY_WHEAT_GROWTH_INTERVAL;
          if (tickCount % interval !== 0) continue;
          const target = chooseStemFruitTarget(world, x, y, z, world.seed, tickCount, stem.block.id);
          if (target) write(target.x, target.y, target.z, target.state);
        }
      }
    }
  }

  return changed;
}

/** Backwards-compatible helper retained for callers/tests from earlier phases. */
export function growNearbyWheat(world, player, tickCount) {
  return tickFarming(world, player, tickCount).filter((change) => change.state?.block?.id === WHEAT_CROP_ID);
}
