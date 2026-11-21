/**
 * Area damage for crossbow firework rockets.
 * Kept deterministic and allocation-light so the caller can apply the result
 * without adding network traffic or a separate per-entity update loop.
 */
export const FIREWORK_BLAST = Object.freeze({ RADIUS: 4.5, MAX_DAMAGE: 9, KNOCKBACK: 0.72 });

export function fireworkBlastImpacts(mobs, center, options = {}) {
  if (!Array.isArray(mobs) || !center ||
      ![center.x, center.y, center.z].every(Number.isFinite)) return [];
  const radius = Number.isFinite(options.radius)
    ? Math.max(0, Math.min(8, options.radius)) : FIREWORK_BLAST.RADIUS;
  const maxDamage = Number.isFinite(options.maxDamage)
    ? Math.max(0, Math.min(40, options.maxDamage)) : FIREWORK_BLAST.MAX_DAMAGE;
  if (radius <= 0 || maxDamage <= 0) return [];

  const impacts = [];
  const radiusSq = radius * radius;
  for (const mob of mobs) {
    if (!mob || !(mob.health > 0) ||
        ![mob.x, mob.y, mob.z].every(Number.isFinite)) continue;
    const dx = mob.x - center.x;
    const dy = (mob.y + 0.5) - center.y;
    const dz = mob.z - center.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq >= radiusSq) continue;
    const distance = Math.sqrt(distanceSq);
    const falloff = 1 - distance / radius;
    const damage = Math.max(1, Math.ceil(maxDamage * falloff));
    const horizontal = Math.hypot(dx, dz);
    const impulse = FIREWORK_BLAST.KNOCKBACK * falloff;
    impacts.push({
      mob,
      damage,
      knockbackX: horizontal > 0.0001 ? dx / horizontal * impulse : 0,
      knockbackY: 0.16 * falloff,
      knockbackZ: horizontal > 0.0001 ? dz / horizontal * impulse : 0,
    });
  }
  return impacts;
}

/** Nearby mob impacts for a creeper blast; the source creeper is excluded. */
export function creeperBlastImpacts(mobs, creeper, charged = false) {
  if (!creeper) return [];
  const targets = Array.isArray(mobs) ? mobs.filter((mob) => mob !== creeper) : [];
  const radius = charged ? 8 : 4;
  return fireworkBlastImpacts(targets, { x: creeper.x, y: creeper.y, z: creeper.z }, {
    radius,
    maxDamage: radius * 3,
  });
}
