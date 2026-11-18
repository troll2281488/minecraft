import { describe, it, assertEqual } from './framework.js';
import { rollMobDrops } from '../src/entity/mobs.js';
import { ITEMS } from '../src/world/item.js';
import '../src/world/blocks/index.js';

describe('additional survival food sources', () => {
  it('zombies can rarely drop carrots', () => {
    const drops = rollMobDrops('zombie', () => 0);
    assertEqual(drops.find((drop) => drop.id === 'mc:carrot')?.count, 1);
  });
  it('zombies can rarely drop potatoes', () => {
    let calls = 0;
    const drops = rollMobDrops('zombie', () => { calls++; return calls === 3 ? 0.9 : 0; });
    assertEqual(drops.find((drop) => drop.id === 'mc:potato')?.count, 1);
  });
  it('wheat seeds are registered as an obtainable item', () => {
    assertEqual(ITEMS.get('mc:wheat_seeds').id, 'mc:wheat_seeds');
  });
});
