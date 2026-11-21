import { describe, it, assertEqual } from './framework.js';
import { weatherAt, precipitationRoll, nextRainCauldronLevel, shouldRainExtinguishCampfire } from '../src/game/weather.js';

describe('Seeded Overworld weather', () => {
  it('is deterministic within a weather period', () => {
    assertEqual(weatherAt('seed-a', 12000), weatherAt('seed-a', 12001));
    assertEqual(weatherAt('seed-a', 12000), weatherAt('seed-a', 17999));
  });

  it('uses deterministic coordinate-specific precipitation rolls', () => {
    assertEqual(precipitationRoll('world', 1, 64, 2, 40), precipitationRoll('world', 1, 64, 2, 40));
    assertEqual(precipitationRoll('world', 1, 64, 2, 40) === precipitationRoll('world', 2, 64, 2, 40), false);
  });

  it('fills cauldrons one level at a time and never exceeds three', () => {
    assertEqual(nextRainCauldronLevel(0, 'rain', 0), 1);
    assertEqual(nextRainCauldronLevel(2, 'thunder', 0), 3);
    assertEqual(nextRainCauldronLevel(3, 'rain', 0), 3);
    assertEqual(nextRainCauldronLevel(1, 'clear', 0), 1);
    assertEqual(nextRainCauldronLevel(1, 'rain', 0.5), 1);
  });

  it('lets rain extinguish only lit campfires', () => {
    assertEqual(shouldRainExtinguishCampfire('rain', true, 0), true);
    assertEqual(shouldRainExtinguishCampfire('thunder', true, 0.049), true);
    assertEqual(shouldRainExtinguishCampfire('clear', true, 0), false);
    assertEqual(shouldRainExtinguishCampfire('rain', false, 0), false);
    assertEqual(shouldRainExtinguishCampfire('rain', true, 0.05), false);
  });
});
