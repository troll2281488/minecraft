import { describe, it, assertEqual } from './framework.js';
import { sampleVanillaEntityAnimation, blendEntityAnimationBones } from '../src/render/entity_animation_runtime.js';

describe('Vanilla entity animation runtime', () => {
  const animation = {
    animations: {
      walk_cycle: {
        length: 1, loop: true,
        bones: {
          left_leg: { rotation: [
            { time: 0, value: [0, 0, 0], interpolation: 'linear' },
            { time: 0.5, value: [1, 0, 0], interpolation: 'catmullrom' },
            { time: 1, value: [0, 0, 0], interpolation: 'linear' },
          ] },
        },
      },
      fly: {
        length: 2, loop: true,
        bones: { left_wing: { rotation: [{ time: 0, value: [0, 0, -0.5] }] } },
      },
    },
  };

  it('selects the vanilla walk clip and samples its bone keyframes', () => {
    const pose = sampleVanillaEntityAnimation(animation, { walking: true, cyclePhase: 0.25 }, 0);
    assertEqual(pose.name, 'walk_cycle');
    assertEqual(pose.bones.left_leg.rotation[0], 0.5625);
  });

  it('selects the vanilla flight clip for airborne mobs', () => {
    const pose = sampleVanillaEntityAnimation(animation, { airborne: true }, 0.5);
    assertEqual(pose.name, 'fly');
    assertEqual(pose.bones.left_wing.rotation[2], -0.5);
  });

  it('does not play a walk cycle while the mob is standing still', () => {
    const pose = sampleVanillaEntityAnimation(animation, { walking: false }, 0.25);
    assertEqual(pose, null);
  });

  it('prioritizes attack clips over walking clips', () => {
    const clips = {
      animations: {
        walk_cycle: { length: 1, loop: true, bones: { leg: { rotation: [{ time: 0, value: [1, 0, 0] }] } } },
        attack: { length: 1, loop: false, bones: { arm: { rotation: [{ time: 0, value: [-1, 0, 0] }] } } },
      },
    };
    const pose = sampleVanillaEntityAnimation(clips, { walking: true, attacking: true }, 0.1);
    assertEqual(pose.name, 'attack');
  });

  it('uses swim clips when a mob is in water', () => {
    const clips = {
      animations: {
        walk_cycle: { length: 1, loop: true, bones: {} },
        swim: { length: 1, loop: true, bones: { fin: { rotation: [{ time: 0, value: [0, 0, 1] }] } } },
      },
    };
    const pose = sampleVanillaEntityAnimation(clips, { inWater: true, walking: true }, 0.1);
    assertEqual(pose.name, 'swim');
  });

  it('uses a source hurt clip when damage animation is available', () => {
    const clips = {
      animations: {
        idle: { length: 1, loop: true, bones: {} },
        hurt: { length: 0.5, loop: false, bones: { body: { rotation: [{ time: 0, value: [0, 0, 0.4] }] } } },
      },
    };
    const pose = sampleVanillaEntityAnimation(clips, { hurt: true }, 0.1);
    assertEqual(pose.name, 'hurt');
  });

  it('smoothly blends between idle and locomotion bone poses', () => {
    const blended = blendEntityAnimationBones(
      { leg: { rotation: [0, 0, 0], position: [0, 0, 0] } },
      { leg: { rotation: [1, 0, 0], position: [0, 2, 0] } },
      0.25,
    );
    assertEqual(blended.leg.rotation[0], 0.25);
    assertEqual(blended.leg.position[1], 0.5);
  });

  it('returns missing animation channels to their neutral pose', () => {
    const blended = blendEntityAnimationBones(
      { wing: { rotation: [1, 0, 0], scale: [2, 2, 2] } },
      null,
      0.5,
    );
    assertEqual(blended.wing.rotation[0], 0.5);
    assertEqual(blended.wing.scale[0], 1.5);
  });

  it('returns null when no source animation exists', () => {
    assertEqual(sampleVanillaEntityAnimation(null, { walking: true }, 0), null);
  });
});
