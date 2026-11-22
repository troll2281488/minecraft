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


/**
 * Procedural animation layer for the hierarchical Java-style mob rigs.
 * It targets the actual bone names in the loaded model, so limbs rotate at
 * their parent joints instead of rotating detached cube centers.
 */
export function buildMobAnimationBones(entity, state = {}, model = null) {
  const rig = rigFor(entity);
  const dt = state.dt ?? advance(rig);
  const type = String(state.mobType ?? entity.type ?? '');
  const phase = Number.isFinite(state.walkPhase) ? state.walkPhase : 0;
  const moving = !!state.walking && !state.riding && !state.inWater;
  const speed = state.sprinting ? 1.15 : 1;
  const idle = rig.t;
  const attack = clamp(Number(state.attackProgress ?? state.attackTime ?? 0), 0, 1);
  const attackWave = attack > 0 ? Math.sin(attack * Math.PI) : 0;
  const hurt = clamp(Number(state.hurtProgress ?? 0), 0, 1);
  const hurtWave = hurt > 0 ? Math.sin(hurt * Math.PI) : 0;
  const bones = {};
  const names = [];

  const visit = (bone, parent = '') => {
    if (!bone || typeof bone !== 'object') return;
    for (const [name, child] of Object.entries(bone.children ?? {})) {
      names.push(name);
      visit(child, name);
    }
  };
  visit(model?.layers?.main?.root);
  if (!names.length) return bones;

  const put = (name, rotation) => {
    if (!rotation.some(Number.isFinite)) return;
    bones[name] = { rotation: rotation.map(value => Number.isFinite(value) ? value : 0) };
  };
  const isZombie = ['zombie','husk','zombie_villager','wither_skeleton','vindicator','zombified_piglin','piglin_brute'].includes(type);
  const isSkeleton = ['skeleton','stray','illusioner','pillager','piglin'].includes(type);
  const isEnderman = type === 'enderman';
  const isSpider = type === 'spider' || type === 'cave_spider';
  const isCreeper = type === 'creeper';
  const isVillager = ['villager','witch','evoker'].includes(type);
  const flying = !!state.airborne || !!state.flying || ['bee','bat','parrot','vex','blaze','ghast','phantom','allay'].includes(type);
  const gait = moving ? Math.cos(phase * (isEnderman ? 0.75 : 1)) * (isEnderman ? 0.72 : 1.02) * speed : 0;
  let legOrdinal = 0;
  let spiderOrdinal = 0;
  let wingOrdinal = 0;

  for (const name of names) {
    const lower = name.toLowerCase();
    const left = /left|_l\b|\bl_/.test(lower);
    const right = /right|_r\b|\br_/.test(lower);
    const rotation = [0, 0, 0];

    if (/head|neck/.test(lower)) {
      rotation[0] = Math.sin(idle * 0.7) * 0.035;
      rotation[1] = Math.sin(idle * 0.85 + (entity.id ?? 0)) * 0.07;
      if (isEnderman && (state.angry || attack > 0)) rotation[0] -= 0.20 + Math.sin(idle * 25) * 0.025;
      if (isVillager && attack > 0) rotation[0] -= 0.18;
      if (isCreeper && state.fuse) rotation[0] -= 0.16 + Math.sin(idle * 38) * 0.035;
      if (attack > 0 && ['wolf','polar_bear','goat','ravager','hoglin','zoglin'].includes(type)) rotation[0] += 0.32 * attackWave;
      if (hurt > 0) rotation[0] -= hurtWave * 0.24;
      put(name, rotation);
      continue;
    }

    if (/body|torso|chest/.test(lower)) {
      if (moving) rotation[0] += Math.sin(phase * 2) * 0.025;
      if (isCreeper && state.fuse) rotation[2] += Math.sin(idle * 38) * 0.055;
      if (isEnderman && (state.angry || attack > 0)) rotation[2] += Math.sin(idle * 30) * 0.025;
      if (hurt > 0) { rotation[0] -= hurtWave * 0.22; rotation[2] += hurtWave * 0.14; }
      put(name, rotation);
      continue;
    }

    if (/wing/.test(lower)) {
      const side = left ? 1 : right ? -1 : (wingOrdinal++ % 2 ? -1 : 1);
      const flapRate = type === 'bee' ? 28 : type === 'chicken' ? 16 : 12;
      const flapAmp = flying || type === 'chicken' ? (type === 'bee' ? 0.62 : 0.48) : 0.07;
      rotation[2] = Math.sin(idle * flapRate) * flapAmp * side;
      put(name, rotation);
      continue;
    }

    if (/tentacle/.test(lower)) {
      const index = spiderOrdinal++;
      rotation[0] = Math.sin(idle * 1.35 + index * 0.72) * 0.22;
      rotation[2] = Math.cos(idle * 1.1 + index * 0.72) * 0.12;
      put(name, rotation);
      continue;
    }

    if (/rod/.test(lower) && type === 'blaze') {
      const index = spiderOrdinal++;
      rotation[1] = idle * 0.9 + index * 1.7;
      rotation[0] = Math.sin(idle * 2.5 + index) * 0.18;
      put(name, rotation);
      continue;
    }

    if (/leg|foot|limb/.test(lower)) {
      const index = legOrdinal++;
      if (isSpider) {
        const side = left ? 1 : right ? -1 : (index % 2 ? -1 : 1);
        const pair = Math.floor(index / 2);
        rotation[1] = moving ? Math.cos(phase + pair * 0.82) * 0.34 * side : Math.sin(idle + pair) * 0.025;
        rotation[2] = moving ? Math.abs(Math.sin(phase + pair * 0.82)) * 0.18 * side : 0;
        if (attack > 0 && pair >= 2) rotation[2] -= attackWave * 0.38 * side;
      } else {
        const side = left ? 1 : right ? -1 : (index % 2 ? -1 : 1);
        const quad = !isZombie && !isSkeleton && !isEnderman && !isVillager && !['warden'].includes(type);
        const phaseOffset = quad && index % 2 >= 0 ? (index % 4 < 2 ? 0 : Math.PI) : 0;
        rotation[0] = moving ? Math.cos(phase + phaseOffset) * (quad ? 0.82 : 1.08) * speed * (side === -1 ? -1 : 1) : 0;
        if (type === 'chicken' && moving) rotation[0] *= 1.12;
      }
      put(name, rotation);
      continue;
    }

    if (/arm|hand|forearm/.test(lower)) {
      if (isZombie) {
        rotation[0] = -1.48 + Math.sin(idle * 2.2 + (left ? 0 : Math.PI)) * 0.045;
        rotation[2] = left ? -0.07 : 0.07;
        if (attack > 0) rotation[0] -= attackWave * 0.82;
      } else if (isSkeleton) {
        if (attack > 0) {
          rotation[0] = -1.48;
          rotation[1] = left ? 0.45 : -0.15;
        } else rotation[0] = moving ? gait * (left ? -0.62 : 0.62) : Math.sin(idle * 1.4) * 0.025;
      } else if (isEnderman && (state.angry || attack > 0)) {
        rotation[0] = -1.12 - attackWave * 0.35;
        rotation[2] = left ? -0.24 : 0.24;
      } else if (isVillager) {
        rotation[0] = -0.72 + (attack > 0 && !left ? -attackWave * 0.42 : 0);
      } else {
        rotation[0] = moving ? gait * (left ? -0.58 : 0.58) : Math.sin(idle * 1.3) * 0.025;
        if (attack > 0 && !left) rotation[0] -= attackWave * 0.8;
      }
      if (hurt > 0) { rotation[0] += hurtWave * 0.18; rotation[2] += hurtWave * (left ? -0.10 : 0.10); }
      put(name, rotation);
      continue;
    }

    // Small ambient motion for named tails, ears, fins and other appendages.
    if (/tail|ear|fin/.test(lower)) {
      rotation[1] = Math.sin(idle * 1.7 + names.indexOf(name)) * (moving ? 0.16 : 0.07);
      put(name, rotation);
    }
  }

  // Creeper fuse is handled on its named body/head bones above; hurt recoil
  // applies to every available articulated bone without moving the whole mob.
  return bones;
}
