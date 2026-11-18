/**
 * Bow draw power, Java 1.12.2.
 *
 * Vanilla: f = ticks / 20; power = (f*f + 2f) / 3; clamped to [0, 1].
 * A full draw takes 20 ticks (1 second) and gives power 1. A release before about
 * 3 ticks does not fire. Arrow speed scales with power; arrow damage is not modelled here.
 */
export const FULL_DRAW_TICKS = 20;

export function drawPower(ticksHeld) {
  const f = Math.max(0, Math.min(ticksHeld, FULL_DRAW_TICKS)) / FULL_DRAW_TICKS;
  const p = (f * f + f * 2) / 3;
  return Math.min(1, Math.max(0, p));
}

/** A bow fires only when it has been drawn past a minimal pull. */
export function canFire(ticksHeld) {
  return drawPower(ticksHeld) >= 0.1;
}
