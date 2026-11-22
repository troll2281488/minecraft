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
export const SUGAR_CANE_GROWTH_INTERVAL = 600;
export const SWEET_BERRY_GROWTH_INTERVAL = 600;
export const SWEET_BERRY_BUSH_ID = 'mc:sweet_berry_bush';
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

export function nextSweetBerryBushAge(state) {
  if (state?.block?.id !== SWEET_BERRY_BUSH_ID) return null;
  const age = state.get('age');
  return age >= 3 ? null : age + 1;
}

export function sweetBerryHarvest(state, random = Math.random) {
  if (state?.block?.id !== SWEET_BERRY_BUSH_ID) return null;
  const age = state.get('age');
  if (age < 2) return null;
  const count = age === 3 ? 2 + Math.floor(random() * 2) : 1 + Math.floor(random() * 2);
  return { count, state: state.with('age', 1) };
}

export function nextWheatAge(state) {
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

  // Collect farmland once. Dense fields use a shared summed-area map so
  // neighbouring farms do not each rescan the same 9x9x2 water region.
  if (tickCount % FARMLAND_TICK_INTERVAL === 0) {
    const farms = [];
    for (let x = px - 8; x <= px + 8; x++) {
      for (let z = pz - 8; z <= pz + 8; z++) {
        for (let y = py - 3; y <= py + 4; y++) {
          const state = world.getBlock(x, y, z);
          if (state?.block?.id === FARMLAND_ID) farms.push({ x, y, z, state });
        }
      }
    }

    let waterAt = null;
    if (farms.length >= 24) {
      const minX = px - 12, minZ = pz - 12, side = 25, stride = 26;
      const planes = new Map();
      for (let y = py - 3; y <= py + 5; y++) {
        const prefix = new Uint16Array(stride * stride);
        for (let z = 0; z < side; z++) {
          let rowCount = 0;
          for (let x = 0; x < side; x++) {
            const block = world.getBlock(minX + x, y, minZ + z);
            if (block?.block?.id === 'mc:water' &&
                (block.get?.('level') === undefined || block.get('level') === 0)) rowCount++;
            prefix[(z + 1) * stride + x + 1] = prefix[z * stride + x + 1] + rowCount;
          }
        }
        planes.set(y, prefix);
      }
      const contains = (plane, x, z) => {
        if (!plane) return false;
        const x0 = x - 4 - minX, x1 = x + 4 - minX;
        const z0 = z - 4 - minZ, z1 = z + 4 - minZ;
        return plane[(z1 + 1) * stride + x1 + 1]
          - plane[z0 * stride + x1 + 1]
          - plane[(z1 + 1) * stride + x0]
          + plane[z0 * stride + x0] > 0;
      };
      waterAt = (x, y, z) => contains(planes.get(y), x, z) || contains(planes.get(y + 1), x, z);
    }

    for (const { x, y, z, state } of farms) {
      const moisture = state.get('moisture') ?? 0;
      const hydrated = waterAt ? waterAt(x, y, z) : hasNearbyWaterSource(world, x, y, z);
      const nextMoisture = hydrated
        ? Math.min(FARMLAND_MAX_MOISTURE, moisture === FARMLAND_MAX_MOISTURE ? moisture : FARMLAND_MAX_MOISTURE)
        : Math.max(0, moisture - (moisture > 0 ? 1 : 0));
      if (nextMoisture !== moisture) write(x, y, z, state.with('moisture', nextMoisture));
    }
  }

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
          if (changedKeys.has(soilKey)) {
            const currentSoil = world.getBlock(x, y - 1, z);
            if ((currentSoil.get('moisture') ?? 0) === 0 && tickCount % DRY_WHEAT_GROWTH_INTERVAL !== 0) continue;
          }
          write(x, y, z, crop.with('age', nextAge));
        }
      }
    }
  }

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

  if (tickCount % SWEET_BERRY_GROWTH_INTERVAL === 0) {
    const soils = new Set(['mc:grass_block', 'mc:dirt', 'mc:coarse_dirt', 'mc:podzol']);
    for (let x = px - 8; x <= px + 8; x++) {
      for (let z = pz - 8; z <= pz + 8; z++) {
        for (let y = py - 3; y <= py + 4; y++) {
          const bush = world.getBlock(x, y, z);
          const nextAge = nextSweetBerryBushAge(bush);
          if (nextAge === null || !soils.has(world.getBlock(x, y - 1, z)?.block?.id)) continue;
          write(x, y, z, bush.with('age', nextAge));
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
