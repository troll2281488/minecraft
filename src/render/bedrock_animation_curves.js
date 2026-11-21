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


/**
 * Humanoid motion curves adapted from Ambient's player.animation and
 * player.swim_crawl animation sets. Values are radians for the WebGL cuboid rig.
 */
/**
 * Minecraft-style third-person humanoid gait. The phase is advanced by the
 * simulation, while each state selects its own gait rather than sharing one
 * generic walk curve.
 */
export function bedrockHumanoidPose(pose = {}, walkPhase = 0) {
  const moving = !!pose.walking;
  const phase = (Number(walkPhase) || 0) * (pose.sprinting ? 1.42 : 1);
  const rad = degrees => degrees * Math.PI / 180;
  let leftArm = 0, rightArm = 0, leftLeg = 0, rightLeg = 0;
  if (pose.attack) {
    const t = clamp01((8 - (pose.attackTime ?? 0)) / 8);
    const attack = Math.sin(Math.pow(t, 0.85) * Math.PI) * rad(68.7549);
    rightArm = -attack;
    leftArm = rad(4) * Math.sin(t * Math.PI);
  } else if (pose.riding) {
    leftArm = rightArm = rad(-36);
    leftLeg = rightLeg = rad(-72);
  } else if (pose.swimming) {
    const swim = phase * 1.7;
    leftArm = Math.sin(swim) * 0.82 - 0.25;
    rightArm = Math.sin(swim + Math.PI) * 0.82 - 0.25;
    leftLeg = Math.cos(swim + Math.PI) * rad(17.1887);
    rightLeg = Math.cos(swim) * rad(17.1887);
  } else if (pose.inWater) {
    // Quiet floating pose while the player is submerged but not swimming.
    leftArm = rightArm = rad(-12);
    leftLeg = rightLeg = rad(8);
  } else if (pose.airborne) {
    const jump = pose.jumping ? 1 : 0;
    leftArm = rightArm = jump ? rad(-34) : rad(-12);
    leftLeg = jump ? rad(24) : rad(10);
    rightLeg = jump ? rad(-18) : rad(-8);
  } else if (pose.sneaking) {
    leftArm = rightArm = rad(-5.7);
    leftLeg = rightLeg = rad(-28);
  } else if (moving) {
    const stride = Math.cos(phase);
    const armAmplitude = pose.sprinting ? 0.92 : 0.58;
    const legAmplitude = pose.sprinting ? 1.02 : 1.4;
    leftArm = stride * armAmplitude;
    rightArm = -stride * armAmplitude;
    leftLeg = -stride * legAmplitude;
    rightLeg = stride * legAmplitude;
  } else {
    const breath = Math.sin((pose.idle ?? phase) * 1.2) * 0.05;
    leftArm = breath;
    rightArm = -breath;
  }
  return { leftArm, rightArm, leftLeg, rightLeg };
}
