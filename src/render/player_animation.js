const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * State poses for the Java-style player rig. Walking uses the source keyframes
 * when available; these poses cover states absent from that source file.
 */
export function buildPlayerStateAnimation({
  walkPhase = 0, swimming = false, sneaking = false, attacking = false,
  attackTime = 0, airborne = false, jumping = false, sprinting = false,
} = {}) {
  const phase = Number.isFinite(walkPhase) ? walkPhase : 0;
  const bones = {};
  const put = (name, rotation) => { bones[name] = { rotation }; };

  if (swimming) {
    const stroke = phase * 1.65;
    put('body', [1.22, 0, 0]);
    put('head', [-0.18, 0, 0]);
    put('left_arm', [Math.sin(stroke) * 0.82 - 0.28, 0, -0.08]);
    put('right_arm', [Math.sin(stroke + Math.PI) * 0.82 - 0.28, 0, 0.08]);
    put('left_leg', [Math.sin(stroke + Math.PI) * 0.48, 0, 0]);
    put('right_leg', [Math.sin(stroke) * 0.48, 0, 0]);
    return bones;
  }

  if (sneaking) {
    put('body', [0.48, 0, 0]);
    put('head', [-0.06, 0, 0]);
    put('left_arm', [0.16 + Math.sin(phase) * 0.22, 0, -0.04]);
    put('right_arm', [0.16 - Math.sin(phase) * 0.22, 0, 0.04]);
    put('left_leg', [Math.sin(phase) * 0.38, 0, 0]);
    put('right_leg', [-Math.sin(phase) * 0.38, 0, 0]);
    return bones;
  }

  if (attacking) {
    const progress = clamp((8 - Number(attackTime || 0)) / 8, 0, 1);
    const swing = -1.42 * Math.sin(progress * Math.PI);
    put('right_arm', [swing, 0, -0.04]);
    return bones;
  }

  if (airborne) {
    put('left_arm', [jumping ? -0.62 : -0.28, 0, -0.10]);
    put('right_arm', [jumping ? -0.62 : -0.28, 0, 0.10]);
    put('left_leg', [jumping ? 0.34 : 0.16, 0, 0]);
    put('right_leg', [jumping ? 0.34 : 0.16, 0, 0]);
    return bones;
  }

  if (sprinting) put('body', [0.12, 0, 0]);
  return Object.keys(bones).length ? bones : null;
}
