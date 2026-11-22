import { describe, it, assert, assertEqual } from './framework.js';
import { humanoidBones, mobLegSwing, deathPose, buildMobAnimationBones } from '../src/render/own_animation.js';

describe('Project-authored humanoid animation', () => {
  it('returns all six bones with three-axis rotations', () => {
    const bones = humanoidBones({}, { walkPhase: 0, onGround: true, speedBlocksPerSecond: 0, dt: 1 / 60 });
    for (const name of ['head', 'body', 'left_arm', 'right_arm', 'left_leg', 'right_leg']) {
      assert(bones[name] && bones[name].rotation.length === 3, 'missing bone ' + name);
    }
  });
  it('swings opposite legs while walking and returns them to rest when stopped', () => {
    const entity = {};
    let bones;
    for (let i = 0; i < 60; i++) bones = humanoidBones(entity, { dt: 1 / 60, walkPhase: 0, onGround: true, speedBlocksPerSecond: 4.3 });
    assert(bones.left_leg.rotation[0] > 0.3, 'left leg should swing forward');
    assert(bones.right_leg.rotation[0] < -0.3, 'right leg should swing back');
    for (let i = 0; i < 240; i++) bones = humanoidBones(entity, { dt: 1 / 60, walkPhase: 0, onGround: true, speedBlocksPerSecond: 0 });
    assert(Math.abs(bones.left_leg.rotation[0]) < 0.05, 'legs settle when standing');
  });
  it('eases rather than snapping on the first frame after a state change', () => {
    const entity = {};
    humanoidBones(entity, { walkPhase: 0, onGround: true, speedBlocksPerSecond: 0, dt: 1 / 60 });
    const next = humanoidBones(entity, { dt: 1 / 60, walkPhase: 0, onGround: true, speedBlocksPerSecond: 4.3 });
    assert(Math.abs(next.left_leg.rotation[0]) < 0.5, 'a single frame must not reach the full walk pose');
  });
  it('raises the right arm during an attack', () => {
    const entity = {};
    let bones;
    for (let i = 0; i < 60; i++) bones = humanoidBones(entity, { dt: 1 / 60, walkPhase: 0, onGround: true, speedBlocksPerSecond: 0, attackTime: 4 });
    assert(bones.right_arm.rotation[0] < -0.5, 'right arm should swing during an attack');
  });
});
describe('Project-authored mob leg gait', () => {
  it('returns nothing for mobs without leg parts', () => {
    assertEqual(mobLegSwing({}, { legStart: -1, legEnd: -1, walking: true, walkPhase: 1 }), null);
  });
  it('moves diagonal legs together, opposite to the other diagonal pair', () => {
    const entity = {};
    let swing;
    for (let i = 0; i < 60; i++) swing = mobLegSwing(entity, { dt: 1 / 60, legStart: 2, legEnd: 5, walking: true, walkPhase: Math.PI / 2 });
    assert(Math.sign(swing[2]) === Math.sign(swing[5]), 'legs 2 and 5 are one diagonal pair');
    assert(Math.sign(swing[3]) === Math.sign(swing[4]), 'legs 3 and 4 are the other pair');
    assert(Math.sign(swing[2]) !== Math.sign(swing[3]), 'the two pairs swing opposite');
  });
  it('stands still when the mob is not walking', () => {
    const entity = {};
    let swing;
    for (let i = 0; i < 240; i++) swing = mobLegSwing(entity, { dt: 1 / 60, legStart: 2, legEnd: 5, walking: false, walkPhase: 3 });
    for (const value of Object.values(swing)) assert(Math.abs(value) < 0.01, 'idle legs stay near rest');
  });
});
describe('Project-authored mob death', () => {
  it('starts upright and ends sunk and shrunk', () => {
    const start = deathPose(20);
    const end = deathPose(0);
    assert(Math.abs(start.sink) < 1e-9 && Math.abs(start.scale - 1) < 1e-9, 'a fresh death is upright');
    assert(Math.abs(end.sink - 0.6) < 1e-9 && Math.abs(end.scale - 0.45) < 1e-9, 'the final pose is sunk and shrunk');
  });
  it('moves monotonically from upright toward the final pose', () => {
    let last = deathPose(20);
    for (let t = 19; t >= 0; t--) {
      const next = deathPose(t);
      assert(next.sink >= last.sink - 1e-9 && next.scale <= last.scale + 1e-9, 'pose should only sink and shrink');
      last = next;
    }
  });
});


describe('Procedural articulated mob animation', () => {
  const modelWith = (...names) => ({ layers: { main: { root: { children: Object.fromEntries(names.map(name => [name, {}])) } } } });
  it('creates zombie arm and leg poses on the actual model bone names', () => {
    const model = modelWith('head','body','leftArm','rightArm','leftLeg','rightLeg');
    const bones = buildMobAnimationBones({}, { dt: 1/60, mobType: 'zombie', walking: true, walkPhase: 1, attackProgress: 0.5 }, model);
    assert(bones.leftArm && bones.rightArm, 'both zombie arms should animate');
    assert(bones.leftArm.rotation[0] < -1.4, 'zombie arms stay outstretched');
    assert(bones.leftLeg && bones.rightLeg, 'both zombie legs should animate');
    assert(bones.leftArm.rotation[0] < 0, 'zombie arm pose points forward');
  });
  it('aims skeleton arms during bow attack and animates spider legs in alternating pairs', () => {
    const skeleton = buildMobAnimationBones({}, { dt: 1/60, mobType: 'skeleton', attackProgress: 0.5 }, modelWith('rightArm','leftArm'));
    assert(skeleton.rightArm && skeleton.leftArm, 'skeleton arms should be present');
    assert(skeleton.rightArm.rotation[0] < -1.4, 'right arm aims during attack');
    const spider = buildMobAnimationBones({}, { dt: 1/60, mobType: 'spider', walking: true, walkPhase: 1 }, modelWith('leg1','leg2','leg3','leg4','leg5','leg6','leg7','leg8'));
    assertEqual(Object.keys(spider).length, 8);
  });
  it('animates wings, creeper fuse and hurt recoil without requiring a source animation clip', () => {
    const bee = buildMobAnimationBones({}, { dt: 1/60, mobType: 'bee', airborne: true }, modelWith('leftWing','rightWing'));
    assert(bee.leftWing && bee.rightWing);
    const creeper = buildMobAnimationBones({}, { dt: 1/60, mobType: 'creeper', fuse: true }, modelWith('body','head'));
    assert(creeper.body.rotation[2] !== 0 || creeper.head.rotation[0] !== 0);
    const hurt = buildMobAnimationBones({}, { dt: 1/60, mobType: 'cow', hurtProgress: 0.5 }, modelWith('body','head','leg1'));
    assert(hurt.body.rotation[0] < 0 && hurt.head.rotation[0] < 0);
  });
});
