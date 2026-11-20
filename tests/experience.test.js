import { describe, it, assertEqual } from './framework.js';
import { PlayerExperience, experienceToNextLevel } from '../src/entity/experience.js';
import { Player } from '../src/entity/player.js';

describe('Java-style player experience', () => {
  it('uses the vanilla level cost curve', () => {
    assertEqual(experienceToNextLevel(0), 7);
    assertEqual(experienceToNextLevel(15), 37);
    assertEqual(experienceToNextLevel(16), 42);
    assertEqual(experienceToNextLevel(31), 117);
    assertEqual(experienceToNextLevel(32), 130);
  });

  it('accumulates points and crosses multiple levels', () => {
    const xp = new PlayerExperience();
    xp.add(7);
    assertEqual(xp.level, 1);
    assertEqual(xp.progress, 0);
    xp.add(10);
    assertEqual(xp.level, 2);
    assertEqual(xp.progress, 1);
    assertEqual(xp.total, 17);
  });

  it('keeps progress fractional and rejects invalid awards', () => {
    const xp = new PlayerExperience();
    assertEqual(xp.add(-1), 0);
    assertEqual(xp.add(NaN), 0);
    assertEqual(xp.add(2.5), 2.5);
    assertEqual(xp.progress, 2.5 / 7);
  });

  it('saves and safely restores level, progress, and total points', () => {
    const xp = new PlayerExperience();
    xp.add(28);
    const restored = new PlayerExperience().loadFrom(xp.toJSON());
    assertEqual(restored.level, xp.level);
    assertEqual(restored.progress, xp.progress);
    assertEqual(restored.total, xp.total);
    restored.loadFrom({ level: -10, progress: 99, total: -1 });
    assertEqual(restored.level, 0);
    assertEqual(restored.progress, 0.999999);
    assertEqual(restored.total, 0);
  });

  it('persists player experience through the normal player save object', () => {
    const player = new Player();
    player.addExperience(40);
    const loaded = new Player().loadFrom(player.toJSON());
    assertEqual(loaded.experience.level, player.experience.level);
    assertEqual(loaded.experience.progress, player.experience.progress);
    assertEqual(loaded.experience.total, 40);
  });
});
