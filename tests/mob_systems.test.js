import { describe, it, assert, assertEqual } from './framework.js';
import {
  MOB_TYPES_112, MOB_AI_PROFILES, chooseMobDetourYaw, shearSheep, rollFishingCatch, calculateArmorDamage, rollMobDrops, shouldBurnInSunlight, canSaddlePig, pigBoostImpulse, MobSystem, nextGoatRamState, canBreedAnimalWith,
} from '../src/entity/mobs.js';
import { createArrow, stepArrow } from '../src/entity/arrows.js';
import { ITEMS } from '../src/world/item.js';

describe('Java undead sunlight rules', () => {
  it('burns zombies, zombie villagers, skeletons and strays in exposed daylight', () => {
    for (const type of ['zombie', 'zombie_villager', 'skeleton', 'stray']) {
      assertEqual(shouldBurnInSunlight(type, 1, true), true);
    }
  });
  it('does not burn husks, wither skeletons, night mobs or mobs under cover', () => {
    for (const type of ['husk', 'wither_skeleton', 'creeper', 'spider']) {
      assertEqual(shouldBurnInSunlight(type, 1, true), false);
    }
    assertEqual(shouldBurnInSunlight('zombie', 0.5, true), false);
    assertEqual(shouldBurnInSunlight('skeleton', 1, false), false);
  });
});

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
      'ghast', 'guardian', 'elder_guardian', 'wither', 'warden',
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
    const lootingPig = rollMobDrops('pig', () => 0.99, 3);
    assertEqual(lootingPig[0].count, 6);
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

describe('Java pig riding', () => {
  it('requires an unsaddled pig and calculates forward carrot boost', () => {
    assertEqual(canSaddlePig({ type: 'pig', saddled: false }), true);
    assertEqual(canSaddlePig({ type: 'pig', saddled: true }), false);
    assertEqual(canSaddlePig({ type: 'cow' }), false);
    const impulse = pigBoostImpulse(0, 0.22);
    assertEqual(Math.abs(impulse.x) < 1e-9, true);
    assertEqual(impulse.z, 0.22);
  });

  it('persists a pig saddle through mob save data', () => {
    const source = new MobSystem({});
    source.mobs.push({ id: 1, type: 'pig', x: 1, y: 64, z: 1, yaw: 0, targetYaw: 0, health: 10, saddled: true });
    const saved = source.toJSON();
    assertEqual(saved[0].saddled, true);
    const restored = new MobSystem({});
    restored.loadFrom(saved);
    assertEqual(restored.mobs[0].type, 'pig');
    assertEqual(restored.mobs[0].saddled, true);
  });
});

describe('Java mountain goats', () => {
  it('registers goats and allows wheat breeding', () => {
    assert(MOB_TYPES_112.includes('goat'));
    assertEqual(canBreedAnimalWith('goat', 'mc:wheat'), true);
    assertEqual(canBreedAnimalWith('goat', 'mc:carrot'), false);
    assertEqual(ITEMS.get('mc:goat_horn')?.stackSize, 1);
  });

  it('winds up for thirty ticks, charges, then enters cooldown', () => {
    let state = { type: 'goat', ramCooldown: 0, ramWindup: 0, ramTicks: 0 };
    let next = nextGoatRamState(state, 6);
    assertEqual(next.start, true);
    assertEqual(next.windup, 30);
    state = { ...state, ...next };
    for (let i = 0; i < 29; i++) {
      next = nextGoatRamState(state, 6);
      state = { ...state, ...next };
    }
    assertEqual(state.ramWindup, 1);
    next = nextGoatRamState(state, 6);
    state = { ...state, ...next };
    assertEqual(state.ramWindup, 0);
    assertEqual(state.ramTicks, 12);
    next = nextGoatRamState(state, 6);
    assertEqual(next.active, 11);
    assertEqual(next.start, false);
    state = { ...state, ...next, ramTicks: 1 };
    next = nextGoatRamState(state, 6);
    assertEqual(next.active, 0);
    assertEqual(next.cooldown, 600);
  });

  it('does not start a ram outside the charge distance or during cooldown', () => {
    assertEqual(nextGoatRamState({ type: 'goat', ramCooldown: 0 }, 10).start, false);
    assertEqual(nextGoatRamState({ type: 'goat', ramCooldown: 20 }, 6).start, false);
  });

  it('persists bounded ram and horn-drop state', () => {
    const source = new MobSystem({});
    source.mobs.push({
      id: 1, type: 'goat', x: 1, y: 64, z: 1, yaw: 0, targetYaw: 0, health: 10,
      ramCooldown: 120, ramWindup: 14, ramTicks: 6, hornsDropped: 1,
    });
    const saved = source.toJSON();
    const restored = new MobSystem({});
    restored.loadFrom(saved);
    assertEqual(restored.mobs[0].ramCooldown, 120);
    assertEqual(restored.mobs[0].ramWindup, 14);
    assertEqual(restored.mobs[0].ramTicks, 6);
    assertEqual(restored.mobs[0].hornsDropped, 1);
  });
});
