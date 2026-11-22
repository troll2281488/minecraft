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

function ease(rig, name, target, dt) {
  const current = rig.bones[name] ?? [0, 0, 0];
  const next = [
    damp(current[0], target[0], 16, dt),
    damp(current[1], target[1], 16, dt),
    damp(current[2], target[2], 16, dt),
  ];
  rig.bones[name] = next;
  return { rotation: next };
}

/** Six-bone player rig: walk, idle breathing, swim, jump, sneak and attack. */
export function humanoidBones(entity, state) {
  const rig = rigFor(entity);
  const dt = state.dt ?? advance(rig);
  const target = {
    head: [0, 0, 0], body: [0, 0, 0],
    left_arm: [0, 0, -0.03], right_arm: [0, 0, 0.03],
    left_leg: [0, 0, 0], right_leg: [0, 0, 0],
  };
  const breath = Math.sin(rig.t * 2.1);
  const phase = Number.isFinite(state.walkPhase) ? state.walkPhase : 0;
  const speed = clamp((state.speedBlocksPerSecond ?? 0) / 4.3, 0, 1.4);
  const grounded = !!state.onGround && !state.airborne;

  if (state.inWater) {
    const stroke = phase * 1.4;
    target.body[0] = 0.9;
    target.head[0] = -0.15;
    target.left_arm[0] = Math.sin(stroke) * 1.1 - 0.35;
    target.right_arm[0] = Math.sin(stroke + Math.PI) * 1.1 - 0.35;
    target.left_leg[0] = Math.sin(stroke + Math.PI) * 0.45;
    target.right_leg[0] = Math.sin(stroke) * 0.45;
  } else if (state.airborne) {
    const lift = state.jumping ? -0.75 : -0.25;
    target.left_arm[0] = lift;
    target.right_arm[0] = lift;
    target.left_arm[2] = -0.2;
    target.right_arm[2] = 0.2;
    target.left_leg[0] = state.jumping ? 0.35 : 0.15;
    target.right_leg[0] = state.jumping ? 0.5 : 0.25;
  } else if (grounded && speed > 0.02) {
    const amp = (state.sprinting ? 0.95 : 0.7) * Math.min(1, speed);
    const swing = Math.sin(phase) * amp;
    target.left_leg[0] = swing;
    target.right_leg[0] = -swing;
    target.left_arm[0] = -swing * 0.8;
    target.right_arm[0] = swing * 0.8;
    target.body[1] = Math.sin(phase) * 0.05;
  } else {
    target.left_arm[0] = breath * 0.03;
    target.right_arm[0] = -breath * 0.03;
    target.head[1] = Math.sin(rig.t * 0.6) * 0.04;
  }

  if (state.sneaking && grounded) {
    target.body[0] = 0.35;
    target.head[0] = 0.12;
    target.left_leg[0] = Math.sin(phase) * 0.25;
    target.right_leg[0] = -Math.sin(phase) * 0.25;
  }
  if ((state.attackTime ?? 0) > 0) {
    const progress = clamp((8 - state.attackTime) / 8, 0, 1);
    target.right_arm[0] = -1.4 * Math.sin(progress * Math.PI);
    target.right_arm[2] = -0.05;
  }

  const bones = {};
  for (const name of Object.keys(target)) bones[name] = ease(rig, name, target[name], dt);
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
