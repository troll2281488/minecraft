/**
 * Adapted first-person item curves from the user-provided Ambient Bedrock
 * animation pack. Bedrock's degree/16px coordinates are converted to radians
 * and camera-space metres for Donorcraft's compact WebGL hand rig.
 */
const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const rad = degrees => degrees * Math.PI / 180;

export function bedrockItemPose(progress, kind = 'item', charge = 0) {
  const t = clamp01(progress);
  const root = Math.sin(Math.sqrt(t) * Math.PI);
  const returnArc = Math.sin(Math.pow(1 - t, 2.5) * Math.PI);
  const bob = Math.sin(Math.sqrt(t) * Math.PI * 2);
  const thrust = Math.sin(t * Math.PI);
  const common = {
    offset: [-10 * root / 16, (bob * 5.25 + root * 6.25) / 16, 5 * thrust / 16],
    rotation: [rad(-60 * root), rad(-30 * returnArc), rad(-30 * root)],
    scaleY: 1,
  };

  if (kind === 'bow') {
    common.offset = [-10 * root / 16, (bob * 5.25 + root * 6.25) / 16, 5 * thrust / 16];
    common.scaleY = 1 + clamp01(charge) * 0.15;
    if (charge > 0) {
      common.offset = [-5.8 / 16, (2.2 + Math.sin(charge * Math.PI * 4) * Math.max(0, charge - 0.5) * 0.08) / 16, -1.4 / 16];
      common.rotation = [rad(-16.5), rad(10), rad(5)];
    }
  } else if (kind === 'crossbow') {
    common.scaleY = 1 + clamp01(charge) * 0.05;
    if (charge > 0) {
      common.offset = [-12.75 / 16, (-7.5 + Math.sin(charge * Math.PI * 4.5) * 0.04 * charge + charge * 0.1) / 16, 0.5 / 16];
      common.rotation = [rad(-20), rad(-10), rad(7.5)];
    }
  } else if (kind === 'shield') {
    common.offset = [0, (bob * 5.25 + root * 6.25) / 32, 2.5 * thrust / 16];
  } else if (kind === 'trident') {
    common.offset = [0, (bob * 5.25 + root * 6.25) / 16, 5 * thrust / 16];
    if (charge > 0) {
      common.offset = [13.5 / 16, (9.15 + Math.min(9.15, charge * 30)) / 16, 17 / 16];
      common.rotation = [rad(-90), 0, rad(85)];
    }
  }

  return common;
}

export function bedrockChargeProgress(startTick, tickNow, durationTicks = 20) {
  if (!Number.isFinite(startTick)) return 0;
  return clamp01(((Number(tickNow) || 0) - startTick) / Math.max(1, durationTicks));
}
