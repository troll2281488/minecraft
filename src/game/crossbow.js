/** Java 1.19 crossbow charge, multishot and piercing rules. */
export const CROSSBOW = Object.freeze({ LOAD_TICKS: 25, BASE_DAMAGE: 9, SPEED: 3.15, MULTISHOT_ANGLES: Object.freeze([-10, 0, 10]) });

export function beginCrossbowLoad(stack, tick) {
  if (stack?.item?.id !== 'mc:crossbow' || !Number.isInteger(tick) || tick < 0) return null;
  if (stack.data?.charged === true || Number.isInteger(stack.data?.loadingSince)) return null;
  return { ...stack.data, loadingSince: tick, charged: false };
}

export function crossbowLoadProgress(data, tick) {
  if (!Number.isInteger(data?.loadingSince) || !Number.isFinite(tick)) return 0;
  return Math.max(0, Math.min(1, (tick - data.loadingSince) / CROSSBOW.LOAD_TICKS));
}

export function finishCrossbowLoad(data, tick, ammoId = 'mc:arrow') {
  if (!['mc:arrow', 'mc:firework_rocket'].includes(ammoId)) return null;
  if (crossbowLoadProgress(data, tick) < 1) return null;
  return { ...(data || {}), loadingSince: null, charged: true, chargedProjectile: ammoId };
}

export function crossbowShotPlan(data, multishotLevel = 0, piercingLevel = 0) {
  if (data?.charged !== true || !['mc:arrow', 'mc:firework_rocket'].includes(data.chargedProjectile)) return null;
  const count = data.chargedProjectile === 'mc:firework_rocket' ? 1 : (multishotLevel > 0 ? 3 : 1);
  const angles = count === 3 ? CROSSBOW.MULTISHOT_ANGLES : [0];
  return angles.map((yawOffsetDeg) => Object.freeze({
    ammoId: data.chargedProjectile,
    yawOffsetDeg,
    damage: data.chargedProjectile === 'mc:arrow' ? CROSSBOW.BASE_DAMAGE : 0,
    piercingLevel: Math.max(0, Math.min(4, Math.floor(piercingLevel || 0))),
  }));
}

export function consumeCrossbowCharge(data) {
  if (data?.charged !== true) return null;
  const next = { ...(data || {}), charged: false, chargedProjectile: null, loadingSince: null };
  return next;
}

export function canPierceAdditionalTarget(projectile, alreadyHit = 0) {
  const level = Math.max(0, Math.min(4, Math.floor(projectile?.piercingLevel || 0)));
  return Number.isInteger(alreadyHit) && alreadyHit >= 0 && alreadyHit <= level;
}
