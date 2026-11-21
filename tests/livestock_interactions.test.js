import { describe, it, assertEqual } from './framework.js';
import { shearMooshroom } from '../src/entity/mobs.js';
import '../src/world/blocks/index.js';
import { ITEMS } from '../src/world/item.js';

describe('Java livestock utility interactions', () => {
  it('turns a mooshroom into a cow and drops five red mushrooms', () => {
    const mob = { type: 'mooshroom', sheared: false };
    const drops = shearMooshroom(mob);
    assertEqual(mob.type, 'cow');
    assertEqual(mob.sheared, true);
    assertEqual(drops.length, 5);
    assertEqual(drops[0].id, 'mc:red_mushroom');
  });

  it('does not shear a normal cow or unrelated mob', () => {
    assertEqual(shearMooshroom({ type: 'cow' }).length, 0);
    assertEqual(shearMooshroom({ type: 'pig' }).length, 0);
  });

  it('registers milk buckets as non-stackable filled buckets', () => {
    assertEqual(ITEMS.get('mc:milk_bucket')?.stackSize, 1);
  });
});
