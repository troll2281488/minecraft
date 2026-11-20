import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { daylightDetectorPower, RedstoneDevicesMixin } from '../src/game/redstone_devices.js';

describe('daylight detector', () => {
  it('has full output during the day and zero output at night', () => {
    assertEqual(daylightDetectorPower(6000), 15);
    assertEqual(daylightDetectorPower(18000), 0);
  });

  it('fades during dusk and rises during dawn', () => {
    assertEqual(daylightDetectorPower(12500), 8);
    assertEqual(daylightDetectorPower(23500), 8);
  });

  it('inverted mode reverses the analogue output', () => {
    assertEqual(daylightDetectorPower(6000, true), 0);
    assertEqual(daylightDetectorPower(18000, true), 15);
  });

  it('wraps time after a full 24,000-tick day', () => {
    assertEqual(daylightDetectorPower(30000), 15);
    assertEqual(daylightDetectorPower(-18000), 0);
  });

  it('updates the block power and emits adjacent power transitions', () => {
    const initial = BLOCKS.get('mc:daylight_detector').defaultState;
    const blocks = new Map([['0,0,0', initial]]);
    const game = {
      world: {
        time: 6000,
        getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
        setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); return true; },
      },
      player: { x: 0, y: 0, z: 0 },
      powerEvents: [],
      _applyAdjacentRedstonePower(x, y, z, powered) { this.powerEvents.push(powered); },
      ...RedstoneDevicesMixin,
    };
    game._tickDaylightDetectors(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('power'), 15);
    assertEqual(game.powerEvents.length, 1);
    game.world.time = 18000;
    game._tickDaylightDetectors(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('power'), 0);
    assertEqual(game.powerEvents.length, 2);
    assertEqual(game.powerEvents[1], false);
  });
});
