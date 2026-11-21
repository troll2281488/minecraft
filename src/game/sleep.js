/** Java-style bed-use rules, extracted for deterministic tests. */
const SLEEP_HOSTILES = new Set([
  'zombie', 'zombie_villager', 'husk', 'drowned', 'skeleton', 'stray',
  'wither_skeleton', 'creeper', 'spider', 'cave_spider', 'phantom',
  'enderman', 'silverfish', 'endermite', 'witch', 'pillager', 'vindicator',
  'evoker', 'vex', 'ravager', 'slime', 'magma_cube', 'blaze', 'ghast',
  'guardian', 'elder_guardian', 'warden', 'wither',
]);

export function hasNearbySleepHostile(mobs, x, y, z) {
  if (!Array.isArray(mobs)) return false;
  return mobs.some((mob) => {
    if (!mob || !SLEEP_HOSTILES.has(mob.type) || mob.health <= 0) return false;
    const dx = mob.x - x, dy = mob.y - y, dz = mob.z - z;
    return dx * dx + dz * dz <= 64 && Math.abs(dy) <= 5;
  });
}

export function canSleepAt(dimension, worldTime, hostileNearby = false) {
  if (dimension !== 'overworld') return { ok: false, reason: 'В этом измерении нельзя спать.' };
  const time = ((Math.floor(worldTime || 0) % 24000) + 24000) % 24000;
  if (time < 12542 || time > 23460) return { ok: false, reason: 'Спать можно только ночью или во время грозы.' };
  if (hostileNearby) return { ok: false, reason: 'Поблизости монстры — сейчас нельзя спать.' };
  return { ok: true, reason: '' };
}
