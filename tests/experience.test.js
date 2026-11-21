import { describe, it, assertEqual } from './framework.js';
import { PlayerExperience, experienceToNextLevel, splitExperienceIntoOrbs, experienceForMob, experienceForBlock, mergeExperienceOrbState, isExperienceOrbHazard, experienceForFishing, experienceForBreeding, experienceForVillagerTrade, experienceDroppedOnDeath, experienceForSpawner } from '../src/entity/experience.js';
import { Player } from '../src/entity/player.js';
import { InputMixin } from '../src/game/input.js';

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

describe('experience commands', () => {
  function makeCommandGame() {
    const messages = [];
    const playedSounds = [];
    const player = new Player();
    return {
      player,
      messages,
      playedSounds,
      sounds: { play: (name) => playedSounds.push(name) },
      worldMeta: { cheatsEnabled: true, playerName: 'Tester' },
      multiplayer: { roomId: null, addChat: (message) => messages.push(message) },
      ui: { toast: (message) => messages.push(message) },
      _run(raw) {
        InputMixin._runCommand.call(this, raw);
      },
    };
  }

  it('adds points and reports a level-up cue when crossing a level', () => {
    const game = makeCommandGame();
    game._run('/xp add 7');
    assertEqual(game.player.experience.level, 1);
    assertEqual(game.player.experience.total, 7);
    assertEqual(game.playedSounds[0], 'levelup');
  });

  it('queries points and rejects invalid XP amounts', () => {
    const game = makeCommandGame();
    game._run('/xp query points');
    assertEqual(game.messages.some((message) => message.includes('0')), true);
    game._run('/xp add -5');
    assertEqual(game.player.experience.total, 0);
    assertEqual(game.messages.some((message) => message.includes('Использование')), true);
  });
});


describe('Java-style mining experience and orb entity rules', () => {
  it('uses the documented random XP ranges for ores', () => {
    assertEqual(experienceForBlock('mc:coal_ore', () => 0), 0);
    assertEqual(experienceForBlock('mc:coal_ore', () => 0.999), 2);
    assertEqual(experienceForBlock('mc:lapis_ore', () => 0), 2);
    assertEqual(experienceForBlock('mc:redstone_ore', () => 0.999), 5);
    assertEqual(experienceForBlock('mc:diamond_ore', () => 0.999), 7);
    assertEqual(experienceForBlock('mc:nether_quartz_ore', () => 0), 2);
    assertEqual(experienceForBlock('mc:nether_gold_ore', () => 0), 0);
    assertEqual(experienceForBlock('mc:nether_gold_ore', () => 0.999), 1);
    assertEqual(experienceForBlock('mc:stone'), 0);
  });

  it('merges only equal-value orbs and preserves separate pickup count', () => {
    const primary = { value: 3, count: 1, age: 200 };
    assertEqual(mergeExperienceOrbState(primary, { value: 3, count: 2, age: 20 }), true);
    assertEqual(primary.value, 3);
    assertEqual(primary.count, 3);
    assertEqual(primary.age, 20);
    assertEqual(mergeExperienceOrbState(primary, { value: 7, count: 1, age: 0 }), false);
  });

  it('recognizes fire, soul fire, lava and cactus as orb hazards', () => {
    assertEqual(isExperienceOrbHazard('mc:fire'), true);
    assertEqual(isExperienceOrbHazard('mc:soul_fire'), true);
    assertEqual(isExperienceOrbHazard('mc:lava'), true);
    assertEqual(isExperienceOrbHazard('mc:cactus'), true);
    assertEqual(isExperienceOrbHazard('mc:stone'), false);
  });
});


describe('Java-style XP from non-combat activities', () => {
  it('rolls fishing XP from 1 through 6 points', () => {
    assertEqual(experienceForFishing(() => 0), 1);
    assertEqual(experienceForFishing(() => 0.999), 6);
  });

  it('rolls animal breeding XP from 1 through 7 points', () => {
    assertEqual(experienceForBreeding(() => 0), 1);
    assertEqual(experienceForBreeding(() => 0.999), 7);
  });

  it('rolls villager trade XP from 3 through 6 points', () => {
    assertEqual(experienceForVillagerTrade(() => 0), 3);
    assertEqual(experienceForVillagerTrade(() => 0.999), 6);
  });
});


describe('Java-style player death experience', () => {
  it('drops seven times the current level, capped at 100 XP', () => {
    assertEqual(experienceDroppedOnDeath(0), 0);
    assertEqual(experienceDroppedOnDeath(1), 7);
    assertEqual(experienceDroppedOnDeath(7), 49);
    assertEqual(experienceDroppedOnDeath(14), 98);
    assertEqual(experienceDroppedOnDeath(15), 100);
    assertEqual(experienceDroppedOnDeath(100), 100);
  });

  it('normalizes invalid and fractional levels safely', () => {
    assertEqual(experienceDroppedOnDeath(-4), 0);
    assertEqual(experienceDroppedOnDeath(3.9), 21);
    assertEqual(experienceDroppedOnDeath(NaN), 0);
  });
});


describe('Java 1.19 monster-spawner experience', () => {
  it('uses two independent 0..14 rolls for a total of 15..43 XP', () => {
    let calls = 0;
    assertEqual(experienceForSpawner(() => { calls++; return 0; }), 15);
    assertEqual(calls, 2);
    assertEqual(experienceForSpawner(() => 0.5), 29);
    assertEqual(experienceForSpawner(() => 0.999999), 43);
  });

  it('handles invalid random values without leaving the vanilla range', () => {
    assertEqual(experienceForSpawner(() => NaN), 15);
    assertEqual(experienceForSpawner(() => -1), 15);
    assertEqual(experienceForSpawner(() => 2), 43);
  });
});
