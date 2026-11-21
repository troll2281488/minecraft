/**
 * Persistent Java-style farmland hydration and wheat growth.
 *
 * Moisture is stored in the farmland blockstate, so it survives chunk saves,
 * reloads and multiplayer block-state replication without a side database.
 */
export const WHEAT_CROP_ID = 'mc:wheat';
export const FARMLAND_ID = 'mc:farmland';
export const FARMLAND_MAX_MOISTURE = 7;
export const FARMLAND_TICK_INTERVAL = 20;
export const WHEAT_GROWTH_INTERVAL = 600;
export const DRY_WHEAT_GROWTH_INTERVAL = 1800;

export function nextWheatAge(state) {
  if (state?.block?.id !== WHEAT_CROP_ID) return null;
  const age = state.get('age');
  return age >= 7 ? null : age + 1;
}

/**
 * Water hydrates farmland within a four-block horizontal radius. Source water
 * may be at the farmland's level or one block above it. Flowing water does not
 * hydrate it. The search is deliberately bounded and only runs for dry soil.
 */
export function hasNearbyWaterSource(world, x, y, z) {
  if (!world?.getBlock) return false;
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        if (dx * dx + dz * dz > 16) continue;
        const state = world.getBlock(x + dx, y + dy, z + dz);
        if (state?.block?.id !== 'mc:water') continue;
        const level = state.get?.('level');
        if (level === undefined || level === 0) return true;
      }
    }
  }
  return false;
}

function inSimulationArea(x, y, z, px, py, pz, horizontal = 8) {
  return Math.abs(x - px) <= horizontal && Math.abs(z - pz) <= horizontal &&
    y >= py - 3 && y <= py + 4;
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
          const nextAge = nextWheatAge(crop);
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
  return changed;
}

/** Backwards-compatible helper retained for callers/tests from earlier phases. */
export function growNearbyWheat(world, player, tickCount) {
  return tickFarming(world, player, tickCount).filter((change) => change.state?.block?.id === WHEAT_CROP_ID);
}
