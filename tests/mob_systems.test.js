import { describe, it, assert, assertEqual } from './framework.js';
import {
  MOB_TYPES_112, MOB_AI_PROFILES, chooseMobDetourYaw, shearSheep, rollFishingCatch, calculateArmorDamage, rollMobDrops,
} from '../src/entity/mobs.js';
import { createArrow, stepArrow } from '../src/entity/arrows.js';

describe('Arrow flight and hit detection', () => {
  it('detects a mob hit instead of letting the arrow pass through', () => {
    const arrow = createArrow(0, 1, 0, [0, 0, 1], 1);
    const mob = { x: 0, y: 0.5, z: 0.7, health: 20 };
    const result = stepArrow(arrow, () => false, [mob]);
    assertEqual(result.hit, 'mob');
    assertEqual(result.mob, mob);
    assertEqual(arrow.done, true);
  });

  it('stops an arrow when it reaches a solid block', () => {
    const arrow = createArrow(0, 1, 0, [0, 0, 1], 1);
    const result = stepArrow(arrow, (x, y, z) => z >= 0.5, []);
    assertEqual(result.hit, 'block');
    assertEqual(arrow.done, true);
  });
});

describe('Mob data and loot', () => {
  it('registers the classic 1.12.2 creature roster without duplicates', () => {
    assert(MOB_TYPES_112.includes('ender_dragon'));
    assert(MOB_TYPES_112.includes('villager'));
    assertEqual(new Set(MOB_TYPES_112).size, MOB_TYPES_112.length);
  });

  it('gives hostile species distinct detection, movement, and attack profiles', () => {
    assertEqual(MOB_AI_PROFILES.zombie.role, 'pursuer');
    assertEqual(MOB_AI_PROFILES.skeleton.role, 'ranged');
    assertEqual(MOB_AI_PROFILES.stray.role, 'chilling-ranged');
    assertEqual(MOB_AI_PROFILES.creeper.role, 'exploder');
    assertEqual(MOB_AI_PROFILES.spider.role, 'ambusher');
    assertEqual(MOB_AI_PROFILES.enderman.role, 'stalker');
    assert(MOB_AI_PROFILES.spider.speedMultiplier > MOB_AI_PROFILES.zombie.speedMultiplier);
    assert(MOB_AI_PROFILES.enderman.damage > MOB_AI_PROFILES.zombie.damage);
    assert(MOB_AI_PROFILES.skeleton.rangedRange > MOB_AI_PROFILES.skeleton.preferredRange);
    assert(Object.isFrozen(MOB_AI_PROFILES));
  });

  it('gives every legacy hostile mob a combat profile', () => {
    for (const type of [
      'zombie', 'husk', 'zombie_villager', 'skeleton', 'stray', 'wither_skeleton',
      'creeper', 'spider', 'cave_spider', 'enderman', 'silverfish', 'endermite',
      'slime', 'magma_cube', 'vex', 'vindicator', 'evoker', 'witch', 'blaze',
      'ghast', 'guardian', 'elder_guardian', 'wither',
    ]) assert(MOB_AI_PROFILES[type], 'missing hostile profile: ' + type);
  });

  it('chooses a safe detour and ignores blocked or malformed path options', () => {
    const current = 0;
    const chosen = chooseMobDetourYaw(current, 0, [
      { yaw: Math.PI / 2, distance: 4, walkable: true },
      { yaw: -Math.PI / 2, distance: 2, walkable: true },
      { yaw: 0, distance: 0, walkable: false },
      { yaw: NaN, distance: 0, walkable: true },
    ]);
    assertEqual(chosen, -Math.PI / 2);
    assertEqual(chooseMobDetourYaw(0, 0, [{ yaw: 1, distance: 1, walkable: false }]), null);
  });

  it('allows a sheep to be sheared only once', () => {
    const sheep = { type: 'sheep', sheared: false };
    const drops = shearSheep(sheep, () => 0);
    assertEqual(drops.length, 1);
    assertEqual(drops[0].id, 'mc:white_wool');
    assertEqual(drops[0].count, 1);
    assertEqual(shearSheep(sheep, () => 0.99).length, 0);
  });

  it('does not shear other creatures', () => {
    assertEqual(shearSheep({ type: 'cow', sheared: false }).length, 0);
  });

  it('keeps fishing catch probability bands deterministic at their boundaries', () => {
    assertEqual(rollFishingCatch(() => 0.10).id, 'mc:raw_cod');
    assertEqual(rollFishingCatch(() => 0.70).id, 'mc:raw_salmon');
    assertEqual(rollFishingCatch(() => 0.87).id, 'mc:pufferfish');
    assertEqual(rollFishingCatch(() => 0.93).id, 'mc:tropical_fish');
    assertEqual(rollFishingCatch(() => 0.97).id, 'mc:bone');
    assertEqual(rollFishingCatch(() => 0.99).id, 'mc:leather');
  });

  it('applies armour reduction and rejects invalid damage', () => {
    assertEqual(calculateArmorDamage(10, 0, 0), 10);
    assertEqual(calculateArmorDamage(10, 20, 0), 4);
    assertEqual(calculateArmorDamage(0, 20, 0), 0);
    assertEqual(calculateArmorDamage(-5, 20, 0), 0);
    assertEqual(calculateArmorDamage(Number.NaN, 20, 0), 0);
  });

  it('uses bounded integer loot counts for passive and hostile mobs', () => {
    const pig = rollMobDrops('pig', () => 0);
    assertEqual(pig[0].id, 'mc:raw_porkchop');
    assertEqual(pig[0].count, 1);
    const skeleton = rollMobDrops('skeleton', () => 0.99);
    assertEqual(skeleton[0].id, 'mc:bone');
    assertEqual(skeleton[0].count, 2);
    assertEqual(rollMobDrops('bat').length, 0);
  });

  it('can produce the rare zombie crop drop', () => {
    let calls = 0;
    const drops = rollMobDrops('zombie', () => {
      calls++;
      return calls === 1 ? 0.5 : 0.01;
    });
    assert(drops.some((drop) => drop.id === 'mc:rotten_flesh'));
    assert(drops.some((drop) => drop.id === 'mc:carrot'));
  });
});
