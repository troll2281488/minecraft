import { describe, it, assert, assertEqual } from './framework.js';
import { sampleVanillaEntityAnimation } from '../src/render/entity_animation_runtime.js';

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
    assertEqual(pose.bones.left_leg.rotation[0], 0.5);
  });

  it('selects the vanilla flight clip for airborne mobs', () => {
    const pose = sampleVanillaEntityAnimation(animation, { airborne: true }, 0.5);
    assertEqual(pose.name, 'fly');
    assertEqual(pose.bones.left_wing.rotation[2], -0.5);
  });

  it('returns null when no source animation exists', () => {
    assertEqual(sampleVanillaEntityAnimation(null, { walking: true }, 0), null);
  });
});
