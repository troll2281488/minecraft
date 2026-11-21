/**
 * Seeded Overworld weather and precipitation effects.
 * Weather derives from world seed + saved world time, so clients agree
 * without a continuously replicated weather timer.
 */
const WEATHER_PERIOD = 6000;

function hash32(value) {
  const input = String(value);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function weatherAt(seed, time) {
  const tick = Number.isFinite(time) ? Math.max(0, Math.floor(time)) : 0;
  const period = Math.floor(tick / WEATHER_PERIOD);
  const roll = hash32(String(seed ?? 0) + ':weather:' + period) / 0x100000000;
  if (roll < 0.62) return 'clear';
  if (roll < 0.94) return 'rain';
  return 'thunder';
}

export function precipitationRoll(seed, x, y, z, time, salt = 'rain') {
  const key = [seed ?? 0, x, y, z, time, salt].join(':');
  return hash32(key) / 0x100000000;
}

/** Stable per-position thunder roll; callers evaluate only nearby loaded blocks. */
export function shouldLightningRodStrike(seed, x, y, z, time, weather) {
  return weather === 'thunder' &&
    precipitationRoll(seed, x, y, z, time, 'lightning-rod') < 0.0004;
}

export function nextRainCauldronLevel(level, weather, roll) {
  const current = Number.isInteger(level) ? Math.max(0, Math.min(3, level)) : 0;
  if (!['rain', 'thunder'].includes(weather) || current >= 3 ||
      !Number.isFinite(roll) || roll >= 0.001) return current;
  return current + 1;
}

export function shouldRainExtinguishCampfire(weather, lit, roll) {
  return ['rain', 'thunder'].includes(weather) && lit === true &&
    Number.isFinite(roll) && roll < 0.05;
}

/** Apply precipitation to exposed campfires and cauldrons near the active player. */
export function tickWeatherBlocks(world, player, weather, time) {
  if (!world || !player || !['rain', 'thunder'].includes(weather) ||
      typeof world.getHeight !== 'function' || typeof world.getBlock !== 'function') return [];
  const changes = [];
  const centerX = Math.floor(player.x);
  const centerZ = Math.floor(player.z);
  const seed = world.seed ?? 0;

  // Inspect only already-loaded chunks in a small local area; never generate terrain.
  for (let z = centerZ - 6; z <= centerZ + 6; z++) {
    for (let x = centerX - 6; x <= centerX + 6; x++) {
      if (world.hasChunk && !world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) continue;
      const surfaceY = world.getHeight(x, z);
      if (!Number.isFinite(surfaceY)) continue;
      for (let y = Math.max(-64, surfaceY - 3); y <= surfaceY + 1; y++) {
        const state = world.getBlock(x, y, z);
        const id = state?.block?.id;
        if (id !== 'mc:campfire' && id !== 'mc:cauldron' && id !== 'mc:lightning_rod') continue;

        let exposed = true;
        for (let aboveY = y + 1; aboveY <= surfaceY + 1; aboveY++) {
          const above = world.getBlock(x, aboveY, z)?.block;
          if (above?.solid || above?.opaqueCube) { exposed = false; break; }
        }
        if (!exposed) continue;

        let next = state;
        if (id === 'mc:campfire' && shouldRainExtinguishCampfire(
          weather, state.get?.('lit') !== false,
          precipitationRoll(seed, x, y, z, time, 'campfire'),
        )) {
          next = state.with('lit', false);
        } else if (id === 'mc:cauldron') {
          const oldLevel = state.get?.('level') ?? 0;
          const level = nextRainCauldronLevel(
            oldLevel, weather, precipitationRoll(seed, x, y, z, time, 'cauldron'),
          );
          if (level !== oldLevel) next = state.with('level', level);
        }
        if (next !== state && world.setBlock(x, y, z, next)) {
          changes.push({ x, y, z, state: next });
        }
      }
    }
  }
  return changes;
}
