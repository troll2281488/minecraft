import { describe, it, assertEqual } from './framework.js';
import { planCauldronInteraction } from '../src/game/cauldron.js';

describe('Java water cauldron interactions', () => {
  it('fills an empty or partially filled cauldron from a water bucket', () => {
    assertEqual(planCauldronInteraction('mc:water_bucket', 0).nextLevel, 3);
    assertEqual(planCauldronInteraction('mc:water_bucket', 2).resultItem, 'mc:bucket');
  });
  it('returns a water bucket only from a full cauldron', () => {
    assertEqual(planCauldronInteraction('mc:bucket', 3).resultItem, 'mc:water_bucket');
    assertEqual(planCauldronInteraction('mc:bucket', 2), null);
  });
  it('fills bottles one water level at a time', () => {
    const result = planCauldronInteraction('mc:glass_bottle', 2);
    assertEqual(result.nextLevel, 1);
    assertEqual(result.resultItem, 'mc:water_bottle');
  });
  it('accepts water bottles and caps storage at three levels', () => {
    assertEqual(planCauldronInteraction('mc:water_bottle', 1).nextLevel, 2);
    assertEqual(planCauldronInteraction('mc:water_bottle', 3), null);
  });
  it('rejects invalid levels and unrelated items without changing state', () => {
    assertEqual(planCauldronInteraction('mc:lava_bucket', 0), null);
    assertEqual(planCauldronInteraction('mc:glass_bottle', 0), null);
    assertEqual(planCauldronInteraction('mc:bucket', 4), null);
    assertEqual(planCauldronInteraction('mc:bucket', -1), null);
  });
});
