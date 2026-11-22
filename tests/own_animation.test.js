import { describe, it, assert, assertEqual } from './framework.js';
import { humanoidBones, mobLegSwing, deathPose } from '../src/render/own_animation.js';

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
    for (let i = 0; i < 60; i++) bones = humanoidBones(entity, { dt: 1 / 60, walkPhase: Math.PI / 2, onGround: true, speedBlocksPerSecond: 4.3 });
    assert(bones.left_leg.rotation[0] > 0.3, 'left leg should swing forward');
    assert(bones.right_leg.rotation[0] < -0.3, 'right leg should swing back');
    for (let i = 0; i < 240; i++) bones = humanoidBones(entity, { dt: 1 / 60, walkPhase: 0, onGround: true, speedBlocksPerSecond: 0 });
    assert(Math.abs(bones.left_leg.rotation[0]) < 0.05, 'legs settle when standing');
  });
  it('eases rather than snapping on the first frame after a state change', () => {
    const entity = {};
    humanoidBones(entity, { walkPhase: 0, onGround: true, speedBlocksPerSecond: 0, dt: 1 / 60 });
    const next = humanoidBones(entity, { dt: 1 / 60, walkPhase: Math.PI / 2, onGround: true, speedBlocksPerSecond: 4.3 });
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
