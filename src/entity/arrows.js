/**
 * Arrow flight, Java 1.12.2 (approximated).
 *
 * An arrow moves its full velocity each tick, then loses 0.05 blocks/tick of
 * vertical speed to gravity and 1% of speed to drag, as vanilla does for arrows.
 * It hits the first solid block it enters, or the first mob whose centre is within
 * 0.5 blocks of it. It despawns after 1200 ticks, which is the vanilla lifetime.
 *
 * Pure functions: the caller supplies the world lookup and the mob list.
 */

export const ARROW = Object.freeze({
  GRAVITY: 0.05,
  DRAG: 0.99,
  MAX_AGE: 1200,
  MOB_RADIUS: 0.5,
  /** Vanilla full-draw arrow damage, used as the scale for partial draws. */
  FULL_DAMAGE: 9,
  /** Top speed in blocks per tick at full draw (vanilla: 3 blocks per tick). */
  FULL_SPEED: 3,
});

/** Unit forward vector from yaw (degrees, 0 faces +Z) and pitch (degrees, positive looks down). */
export function aimVector(yawDeg, pitchDeg) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  return [
    -Math.sin(yaw) * Math.cos(pitch),
    -Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
}

/**
 * Create an arrow fired from (x, y, z) in direction `dir`, with draw power 0..1.
 */
export function createArrow(x, y, z, dir, power) {
  const speed = ARROW.FULL_SPEED * power;
  return {
    x, y, z,
    vx: dir[0] * speed,
    vy: dir[1] * speed,
    vz: dir[2] * speed,
    damage: Math.max(1, Math.ceil(ARROW.FULL_DAMAGE * power)),
    age: 0,
    done: false,
  };
}

/**
 * Advance one tick. `isSolid(x, y, z)` says whether a block stops the arrow.
 * `mobs` is an array of { x, y, z, health }. Returns { hit: 'block'|'mob'|null, mob? }.
 */
export function stepArrow(arrow, isSolid, mobs = []) {
  if (arrow.done) return { hit: null };
  arrow.age++;
  if (arrow.age > ARROW.MAX_AGE) { arrow.done = true; return { hit: null }; }

  // Move in small steps so a fast arrow cannot skip over a thin block or mob.
  const steps = Math.max(1, Math.ceil(Math.hypot(arrow.vx, arrow.vy, arrow.vz) * 4));
  for (let i = 0; i < steps; i++) {
    arrow.x += arrow.vx / steps;
    arrow.y += arrow.vy / steps;
    arrow.z += arrow.vz / steps;

    for (const mob of mobs) {
      if (mob.health <= 0) continue;
      const dx = mob.x - arrow.x;
      const dy = (mob.y + 0.5) - arrow.y;
      const dz = mob.z - arrow.z;
      if (dx * dx + dy * dy + dz * dz <= ARROW.MOB_RADIUS * ARROW.MOB_RADIUS) {
        arrow.done = true;
        return { hit: 'mob', mob };
      }
    }

    if (isSolid(Math.floor(arrow.x), Math.floor(arrow.y), Math.floor(arrow.z))) {
      arrow.done = true;
      return { hit: 'block' };
    }
  }

  arrow.vy -= ARROW.GRAVITY;
  const drag = ARROW.DRAG;
  arrow.vx *= drag; arrow.vy *= drag; arrow.vz *= drag;
  return { hit: null };
}
