import { describe, it, assertEqual } from './framework.js';
import { rollMobDrops, MOB_TYPES_112 } from '../src/entity/mobs.js';

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
    assertEqual(rollMobDrops('zombie', () => 0).length, 0);
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
