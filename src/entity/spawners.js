import { positionalRandom } from '../core/rng.js';

export const SPAWNER_MOB_TYPES = Object.freeze(['zombie', 'skeleton', 'spider', 'silverfish']);

/** Java dungeon spawners use a weighted 50/25/25 zombie/skeleton/spider roll. */
export function spawnerMobType(seed, x, y, z) {
  const rng = positionalRandom(seed, x, y, z, 0x53504157);
  const roll = rng.nextInt(4);
  return roll < 2 ? 'zombie' : roll === 2 ? 'skeleton' : 'spider';
}

/** The player is measured from their feet, not their head. */
export function spawnerPlayerInRange(spawner, player) {
  if (!spawner || !player || player.gamemode === 'spectator') return false;
  const dx = player.x - (spawner.x + 0.5);
  const dy = player.y - spawner.y;
  const dz = player.z - (spawner.z + 0.5);
  return dx * dx + dy * dy + dz * dz < 16 * 16;
}

/** Java's default nearby-entity cap is six matching mobs in a 9x9x9 box. */
export function countSpawnerMobs(mobs, spawner, mobType) {
  return (mobs || []).filter((mob) =>
    mob?.type === mobType &&
    Math.abs(mob.x - (spawner.x + 0.5)) <= 4.5 &&
    Math.abs(mob.y - (spawner.y + 0.5)) <= 4.5 &&
    Math.abs(mob.z - (spawner.z + 0.5)) <= 4.5
  ).length;
}

/** Randomized post-cycle delay: 200..799 game ticks. */
export function nextSpawnerDelay(random = Math.random) {
  const value = Number(random());
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
  return 200 + Math.floor(safe * 600);
}

/** Spawn points are biased toward the cage, as in Java's difference-of-randoms sampling. */
export function spawnerSpawnPosition(spawner, random = Math.random) {
  const sample = () => {
    const value = Number(random());
    return Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0.5;
  };
  const offset = () => Math.round((sample() - sample()) * 4);
  return {
    x: spawner.x + offset(),
    y: spawner.y + Math.floor(Math.max(0, Math.min(0.999999, sample())) * 3) - 1,
    z: spawner.z + offset(),
  };
}
