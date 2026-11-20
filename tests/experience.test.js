import { describe, it, assertEqual } from './framework.js';
import { PlayerExperience, experienceToNextLevel, splitExperienceIntoOrbs, experienceForMob } from '../src/entity/experience.js';
import { Player } from '../src/entity/player.js';

describe('Java-style player experience', () => {
  it('uses the vanilla level cost curve', () => {
    assertEqual(experienceToNextLevel(0), 7);
    assertEqual(experienceToNextLevel(15), 37);
    assertEqual(experienceToNextLevel(16), 42);
    assertEqual(experienceToNextLevel(30), 112);
    assertEqual(experienceToNextLevel(31), 121);
    assertEqual(experienceToNextLevel(32), 130);
  });

  it('accumulates points and crosses multiple levels', () => {
    const xp = new PlayerExperience();
    xp.add(7);
    assertEqual(xp.level, 1);
    assertEqual(xp.progress, 0);
    xp.add(10);
    assertEqual(xp.level, 2);
    assertEqual(xp.progress, 1 / 11);
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

describe('Java-style experience orb rules', () => {
  it('splits experience into the largest vanilla orb denominations first', () => {
    assertEqual(splitExperienceIntoOrbs(1000).join(','), '617,307,73,3');
    assertEqual(splitExperienceIntoOrbs(0).length, 0);
    assertEqual(splitExperienceIntoOrbs(-8).length, 0);
  });

  it('assigns common mob XP and excludes mobs that do not drop XP', () => {
    assertEqual(experienceForMob('zombie'), 5);
    assertEqual(experienceForMob('blaze'), 10);
    assertEqual(experienceForMob('villager'), 0);
    assertEqual(experienceForMob('bat'), 0);
    assertEqual(experienceForMob('cow', () => 0), 1);
    assertEqual(experienceForMob('cow', () => 0.999), 3);
    assertEqual(experienceForMob('cow', () => 0.5, { baby: true }), 0);
  });
});
