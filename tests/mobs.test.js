import { describe, it, assertEqual } from './framework.js';
import { rollMobDrops } from '../src/entity/mobs.js';

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
