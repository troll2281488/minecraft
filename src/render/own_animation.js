/**
 * Project-authored animation for the player and procedural mobs.
 * Curves are project-authored and eased frame-rate independently.
 */
const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt)));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nowSeconds = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;

function rigFor(entity) {
  if (!entity.ownRig) entity.ownRig = { t: 0, last: null, bones: {}, amp: 0 };
  return entity.ownRig;
}

function advance(rig) {
  const now = nowSeconds();
  const dt = rig.last === null ? 0 : clamp(now - rig.last, 0, 0.1);
  rig.last = now;
  rig.t += dt;
  return dt;
}

function ease(rig, name, target, dt, rate = 22) {
  const current = rig.bones[name] ?? [0, 0, 0];
  const next = [
    damp(current[0], target[0], rate, dt),
    damp(current[1], target[1], rate, dt),
    damp(current[2], target[2], rate, dt),
  ];
  rig.bones[name] = next;
  return { rotation: next };
}

/** Six-bone player rig: walk, idle breathing, swim, jump, sneak and attack. */
export function humanoidBones(entity, state) {
  const rig = rigFor(entity);
  const dt = state.dt ?? advance(rig);
  const target = {
    head: [0, 0, 0],
    body: [0, 0, 0],
    left_arm: [0, 0, -0.02],
    right_arm: [0, 0, 0.02],
    left_leg: [0, 0, 0],
    right_leg: [0, 0, 0],
  };

  // Follow the camera pitch, while keeping the neck movement smooth.
  const pitchRad = clamp(((state.pitch ?? 0) * Math.PI) / 180, -1.35, 1.35);
  target.head[0] = pitchRad;

  // Idle breathing: tiny alternating arm motion, never a rigid T-pose.
  const idleX = Math.sin(rig.t * 1.34) * 0.035;
  const idleZ = Math.cos(rig.t * 1.8) * 0.035 + 0.035;
  const phase = Number.isFinite(state.walkPhase) ? state.walkPhase : 0;
  const speed = clamp((state.speedBlocksPerSecond ?? 0) / 4.317, 0, 1.45);
  const grounded = !!state.onGround && !state.airborne;

  if (state.riding) {
    target.left_arm[0] = -0.628;
    target.right_arm[0] = -0.628;
    target.left_leg[0] = -1.256;
    target.right_leg[0] = -1.256;
    target.left_leg[1] = -0.18;
    target.right_leg[1] = 0.18;
  } else if (state.inWater) {
    const stroke = phase * 1.35;
    target.body[0] = 0.85;
    target.head[0] = pitchRad * 0.5 - 0.35;
    target.left_arm[0] = Math.sin(stroke) * 1.15 - 0.45;
    target.right_arm[0] = Math.sin(stroke + Math.PI) * 1.15 - 0.45;
    target.left_arm[2] = -0.18;
    target.right_arm[2] = 0.18;
    target.left_leg[0] = Math.sin(stroke + Math.PI) * 0.52;
    target.right_leg[0] = Math.sin(stroke) * 0.52;
  } else if (state.airborne) {
    const isJumping = !!state.jumping;
    target.left_arm[0] = isJumping ? -0.68 : -0.25 + idleX;
    target.right_arm[0] = isJumping ? -0.68 : -0.25 - idleX;
    target.left_arm[2] = -0.16 - idleZ;
    target.right_arm[2] = 0.16 + idleZ;
    target.left_leg[0] = isJumping ? 0.38 : 0.14;
    target.right_leg[0] = isJumping ? -0.28 : -0.10;
  } else if (grounded && speed > 0.02) {
    const swingAmount = Math.min(1, speed) * (state.sprinting ? 1.18 : 0.88);
    const legSwing = Math.cos(phase) * 1.15 * swingAmount;
    const armSwing = Math.cos(phase) * 0.92 * swingAmount;
    target.left_leg[0] = legSwing;
    target.right_leg[0] = -legSwing;
    target.left_arm[0] = -armSwing + idleX * 0.3;
    target.right_arm[0] = armSwing - idleX * 0.3;
    target.left_arm[2] = -idleZ;
    target.right_arm[2] = idleZ;
    if (state.sprinting) {
      target.body[0] = 0.14;
      target.head[0] = pitchRad - 0.08;
    }
  } else {
    target.left_arm[0] = idleX;
    target.right_arm[0] = -idleX;
    target.left_arm[2] = -idleZ;
    target.right_arm[2] = idleZ;
  }

  // Sneaking bends the torso at the waist pivot; the head counter-tilts.
  if (state.sneaking && grounded && !state.riding) {
    target.body[0] = 0.5;
    target.head[0] = pitchRad - 0.12;
    target.left_arm[0] += 0.4;
    target.right_arm[0] += 0.4;
  }

  if (state.holdingItem && !state.inWater && !state.riding) {
    target.right_arm[0] = target.right_arm[0] * 0.5 - 0.314;
  }

  const attackTime = Number(state.attackTime ?? 0);
  if (attackTime > 0) {
    const swingProgress = clamp((8 - attackTime) / 8, 0, 1);
    const bodyTwist = Math.sin(Math.sqrt(swingProgress) * Math.PI * 2) * 0.2;
    target.body[1] += bodyTwist;
    target.right_arm[1] += bodyTwist;
    target.left_arm[1] += bodyTwist;
    target.left_arm[0] += bodyTwist;
    const f1 = 1 - Math.pow(1 - swingProgress, 3);
    const f2 = Math.sin(f1 * Math.PI);
    const f3 = Math.sin(swingProgress * Math.PI) * -(target.head[0] - 0.7) * 0.75;
    target.right_arm[0] = target.right_arm[0] - (f2 * 1.2 + f3);
    target.right_arm[1] += bodyTwist * 2;
    target.right_arm[2] += Math.sin(swingProgress * Math.PI) * -0.4;
  }

  const bones = {};
  for (const name of Object.keys(target)) {
    const rate = name === 'head' ? 35 : attackTime > 0 && name === 'right_arm' ? 45 : 22;
    bones[name] = ease(rig, name, target[name], dt, rate);
  }
  return bones;
}

/** Smooth diagonal gait for procedural quadruped and legged mobs. */
export function mobLegSwing(entity, state) {
  const { legStart, legEnd } = state;
  if (!Number.isInteger(legStart) || !Number.isInteger(legEnd) || legStart < 0 || legEnd < legStart) return null;
  const rig = rigFor(entity);
  const dt = state.dt ?? advance(rig);
  const walking = !!state.walking && !state.riding && !state.swimming;
  rig.amp = damp(rig.amp, walking ? 1 : 0, 9, dt);
  const rate = state.sprinting ? 1.35 : 1;
  const phase = (Number.isFinite(state.walkPhase) ? state.walkPhase : 0) * rate;
  const out = {};
  for (let index = legStart; index <= legEnd; index++) {
    const k = index - legStart;
    const sign = (k + Math.floor(k / 2)) % 2 === 0 ? 1 : -1;
    out[index] = Math.sin(phase) * 0.5 * rig.amp * sign;
  }
  return out;
}

/** Eased mob death pose: sink and shrink over the death animation. */
export function deathPose(ticksLeft, total = 20) {
  const progress = clamp(1 - (Number(ticksLeft) || 0) / total, 0, 1);
  const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
  return { sink: eased * 0.6, scale: 1 - eased * 0.55 };
}
