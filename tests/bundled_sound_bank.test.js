import { describe, it, assertEqual } from './framework.js';
import { classifyBundledSound } from '../src/audio/bundled_sound_bank.js';

describe('bundled sound classification', () => {
  it('routes bundled footsteps to the footstep event', () => {
    assertEqual(classifyBundledSound('footstep00.ogg', 'kenney-footsteps'), 'step:generic');
    assertEqual(classifyBundledSound('footstep_grass_001.ogg', 'kenney-footsteps'), 'step:grass');
  });
  it('classifies generic and material impact samples', () => {
    assertEqual(classifyBundledSound('impactMining_002.ogg', 'kenney-impact'), 'impact:generic');
    assertEqual(classifyBundledSound('impactMetal_heavy_001.ogg', 'kenney-impact'), 'impact:metal');
  });
  it('ignores unrelated files', () => {
    assertEqual(classifyBundledSound('readme.txt', 'kenney-impact'), null);
  });
});
