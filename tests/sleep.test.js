import { describe, it, assertEqual } from './framework.js';
import { canSleepAt, hasNearbySleepHostile } from '../src/game/sleep.js';

describe('Java bed sleep rules', () => {
  it('allows sleeping during the night window in the Overworld', () => {
    assertEqual(canSleepAt('overworld', 14000).ok, true);
    assertEqual(canSleepAt('overworld', 23000).ok, true);
  });

  it('rejects daytime and non-Overworld sleeping', () => {
    assertEqual(canSleepAt('overworld', 6000).ok, false);
    assertEqual(canSleepAt('nether', 18000).ok, false);
  });

  it('blocks sleep when a living hostile mob is within the bed danger radius', () => {
    const mobs = [{ type: 'zombie', x: 3, y: 64, z: 0, health: 20 }];
    assertEqual(hasNearbySleepHostile(mobs, 0, 64, 0), true);
    assertEqual(canSleepAt('overworld', 18000, true).ok, false);
  });

  it('ignores dead, passive and distant mobs', () => {
    const mobs = [
      { type: 'cow', x: 1, y: 64, z: 0, health: 10 },
      { type: 'zombie', x: 10, y: 64, z: 0, health: 0 },
      { type: 'skeleton', x: 9, y: 64, z: 0, health: 20 },
    ];
    assertEqual(hasNearbySleepHostile(mobs, 0, 64, 0), false);
  });
});
