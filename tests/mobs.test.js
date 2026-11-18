import { describe, it, assertEqual } from './framework.js';
import { rollMobDrops, MOB_TYPES_112, MobSystem } from '../src/entity/mobs.js';

describe('mob drops', () => {
  it('pigs drop one to three raw porkchops', () => {
    assertEqual(rollMobDrops('pig', () => 0)[0].count, 1);
    assertEqual(rollMobDrops('pig', () => 0.999)[0].count, 3);
    assertEqual(rollMobDrops('pig', () => 0)[0].id, 'mc:raw_porkchop');
  });

  it('sheep drop one or two raw mutton', () => {
    assertEqual(rollMobDrops('sheep', () => 0)[0].id, 'mc:raw_mutton');
    assertEqual(rollMobDrops('sheep', () => 0.999)[0].count, 2);
  });

  it('zombies may drop zero to two rotten flesh', () => {
    assertEqual(rollMobDrops('zombie', () => 0).some((drop) => drop.id === 'mc:rotten_flesh'), false);
    assertEqual(rollMobDrops('zombie', () => 0.999)[0].count, 2);
    assertEqual(rollMobDrops('zombie', () => 0.999)[0].id, 'mc:rotten_flesh');
  });

  it('unknown mob types have no drops', () => {
    assertEqual(rollMobDrops('unknown').length, 0);
  });
});

describe('Minecraft Java 1.12.2 mob catalogue', () => {
  it('includes classic hostile mobs and bosses', () => {
    for (const type of ['creeper', 'enderman', 'skeleton', 'spider', 'wither', 'ender_dragon']) {
      assertEqual(MOB_TYPES_112.includes(type), true);
    }
  });
  it('excludes mobs introduced after 1.12.2', () => {
    assertEqual(MOB_TYPES_112.includes('drowned'), false);
    assertEqual(MOB_TYPES_112.includes('pillager'), false);
  });
  it('has species-specific drops for the new hostile mobs', () => {
    assertEqual(rollMobDrops('creeper', () => 0.999)[0].id, 'mc:gunpowder');
    assertEqual(rollMobDrops('skeleton', () => 0.999)[0].id, 'mc:bone');
    assertEqual(rollMobDrops('spider', () => 0.999)[0].id, 'mc:string');
    assertEqual(rollMobDrops('enderman', () => 0.999)[0].id, 'mc:ender_pearl');
  });
});

describe('mob world persistence', () => {
  it('round-trips living mobs and sheep state', () => {
    const system = new MobSystem({});
    system.loadFrom([{
      id: 7, type: 'sheep', x: 12.5, y: 70, z: -4.5,
      yaw: 1.2, targetYaw: 1.4, health: 6, sheared: true,
      walkPhase: 2.5, fuseTicks: 0,
    }]);
    const saved = system.toJSON();
    assertEqual(saved.length, 1);
    assertEqual(saved[0].id, 7);
    assertEqual(saved[0].sheared, true);
    const restored = new MobSystem({});
    restored.loadFrom(saved);
    assertEqual(restored.mobs[0].type, 'sheep');
    assertEqual(restored.mobs[0].health, 6);
    assertEqual(restored.mobs[0].sheared, true);
    assertEqual(restored.mobs[0].x, 12.5);
    assertEqual(restored.nextId, 8);
  });

  it('ignores invalid entries and caps restored mob count', () => {
    const system = new MobSystem({});
    system.loadFrom([
      { type: 'creeper', x: 0, y: 70, z: 0, yaw: 0, health: 20 },
      { type: 'not_a_mob', x: 0, y: 70, z: 0, yaw: 0, health: 20 },
      { type: 'zombie', x: NaN, y: 70, z: 0, yaw: 0, health: 20 },
    ]);
    assertEqual(system.mobs.length, 1);
    assertEqual(system.mobs[0].type, 'creeper');
  });

  it('clears mob ids when resetting a world', () => {
    const system = new MobSystem({});
    system.loadFrom([{ id: 12, type: 'pig', x: 0, y: 70, z: 0, yaw: 0, health: 10 }]);
    system.reset();
    assertEqual(system.mobs.length, 0);
    assertEqual(system.nextId, 1);
  });
});
