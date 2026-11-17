import { describe, it, assertEqual } from './framework.js';
import { rollMobDrops } from '../src/entity/mobs.js';
import '../src/world/blocks/index.js';
import { ITEMS } from '../src/world/item.js';

describe('cow and chicken drops', () => {
  it('cows drop raw beef', () => {
    const drops = rollMobDrops('cow', () => 0);
    assertEqual(drops[0].id, 'mc:raw_beef');
    assertEqual(drops[0].count, 1);
  });
  it('cows can drop leather', () => {
    const drops = rollMobDrops('cow', () => 0);
    assertEqual(drops[1].id, 'mc:leather');
    assertEqual(drops[1].count, 1);
  });
  it('chickens drop raw chicken and feathers', () => {
    const drops = rollMobDrops('chicken', () => 0);
    assertEqual(drops[0].id, 'mc:raw_chicken');
    assertEqual(drops[1].id, 'mc:feather');
    assertEqual(drops[1].count, 0);
  });
  it('feathers are registered survival materials', () => {
    assertEqual(ITEMS.get('mc:feather').id, 'mc:feather');
  });
});
