/** Java 1.19 trident projectile and movement-enchantment foundations. */
export const TRIDENT = Object.freeze({ SPEED: 2.5, DAMAGE: 8, GRAVITY: 0.05, DRAG: 0.99, MAX_AGE: 1200 });

export function createTridentProjectile(x, y, z, direction, options = {}) {
  if (![x, y, z, ...direction].every(Number.isFinite) || direction.length !== 3) return null;
  const length = Math.hypot(...direction) || 1;
  const speed = TRIDENT.SPEED;
  return {
    x, y, z, vx: direction[0] / length * speed, vy: direction[1] / length * speed,
    vz: direction[2] / length * speed, damage: TRIDENT.DAMAGE,
    loyalty: Math.max(0, Math.min(3, Math.floor(options.loyalty || 0))),
    channeling: options.channeling === true, age: 0, returning: false, done: false,
  };
}

export function stepTrident(trident, isSolid, mobs = []) {
  if (!trident || trident.done || trident.stuck) return { hit: null };
  trident.age++;
  if (trident.age > TRIDENT.MAX_AGE) { trident.done = true; return { hit: null }; }
  const steps = Math.max(1, Math.ceil(Math.hypot(trident.vx, trident.vy, trident.vz) * 4));
  for (let i = 0; i < steps; i++) {
    trident.x += trident.vx / steps; trident.y += trident.vy / steps; trident.z += trident.vz / steps;
    for (const mob of mobs) {
      if (!mob || mob.health <= 0) continue;
      const dx = mob.x - trident.x, dy = mob.y + 0.5 - trident.y, dz = mob.z - trident.z;
      if (dx * dx + dy * dy + dz * dz <= 0.72 ** 2) {
        trident.stuck = true; trident.vx = trident.vy = trident.vz = 0;
        return { hit: 'mob', mob };
      }
    }
    if (isSolid(Math.floor(trident.x), Math.floor(trident.y), Math.floor(trident.z))) {
      trident.stuck = true; trident.vx = trident.vy = trident.vz = 0;
      return { hit: 'block' };
    }
  }
  trident.vy = (trident.vy - TRIDENT.GRAVITY) * TRIDENT.DRAG;
  trident.vx *= TRIDENT.DRAG; trident.vz *= TRIDENT.DRAG;
  return { hit: null };
}

export function tridentReturnVelocity(trident, player, speed = 0.8) {
  if (!trident || trident.loyalty <= 0 || !player || ![trident.x, trident.y, trident.z, player.x, player.y, player.z].every(Number.isFinite)) return null;
  const dx = player.x - trident.x, dy = player.y + 1 - trident.y, dz = player.z - trident.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 0.75) return { caught: true, vx: 0, vy: 0, vz: 0 };
  const velocity = speed * (1 + (trident.loyalty - 1) * 0.15);
  trident.returning = true;
  return { caught: false, vx: dx / distance * velocity, vy: dy / distance * velocity, vz: dz / distance * velocity };
}

export function riptideImpulse(yawDeg, pitchDeg, level, inWaterOrRain) {
  const riptide = Math.max(0, Math.min(3, Math.floor(level || 0)));
  if (!riptide || !inWaterOrRain || !Number.isFinite(yawDeg) || !Number.isFinite(pitchDeg)) return null;
  const yaw = yawDeg * Math.PI / 180, pitch = pitchDeg * Math.PI / 180;
  const strength = 1.5 * riptide;
  return { x: -Math.sin(yaw) * Math.cos(pitch) * strength, y: -Math.sin(pitch) * strength, z: Math.cos(yaw) * Math.cos(pitch) * strength };
}

export function impalingBonusDamage(level, target, inWater) {
  const impaling = Math.max(0, Math.min(5, Math.floor(level || 0)));
  if (!impaling || !target) return 0;
  const aquatic = ['guardian', 'elder_guardian', 'drowned', 'squid', 'glow_squid', 'turtle', 'cod', 'salmon', 'pufferfish', 'tropical_fish'].includes(target.type);
  return (aquatic || inWater) ? impaling * 2.5 : 0;
}

export function canChannelLightning({ thunder, skyVisible, targetExposed }) {
  return thunder === true && skyVisible === true && targetExposed === true;
}
