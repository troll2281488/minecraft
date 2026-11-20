import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { RedstoneDevicesMixin } from '../src/game/redstone_devices.js';

function makeGame(blockId, entities = {}) {
  const blocks = new Map([['0,0,0', BLOCKS.get(blockId).defaultState]]);
  const game = {
    world: {
      getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); return true; },
    },
    player: null,
    entities: { mobs: [], droppedItems: [], ...entities },
    tickCount: 1,
    ...RedstoneDevicesMixin,
  };
  return { game, blocks };
}

describe('redstone pressure plate entity activation', () => {
  it('a mob activates a stone pressure plate', () => {
    const { game, blocks } = makeGame('mc:stone_pressure_plate', {
      mobs: [{ type: 'cow', x: 0.5, y: 0.05, z: 0.5 }],
    });
    game._tickRedstoneDevices();
    assertEqual(blocks.get('0,0,0').get('powered'), true);
  });

  it('a dropped item activates a wooden pressure plate', () => {
    const { game, blocks } = makeGame('mc:oak_pressure_plate', {
      droppedItems: [{ x: 0.5, y: 0.08, z: 0.5 }],
    });
    game._tickRedstoneDevices();
    assertEqual(blocks.get('0,0,0').get('powered'), true);
  });

  it('a dropped item does not activate a stone pressure plate', () => {
    const { game, blocks } = makeGame('mc:stone_pressure_plate', {
      droppedItems: [{ x: 0.5, y: 0.08, z: 0.5 }],
    });
    game._tickRedstoneDevices();
    assertEqual(blocks.get('0,0,0').get('powered'), false);
  });

  it('releases an entity-activated plate after the entity leaves', () => {
    const { game, blocks } = makeGame('mc:oak_pressure_plate', {
      mobs: [{ type: 'cow', x: 0.5, y: 0.05, z: 0.5 }],
    });
    game._tickRedstoneDevices();
    game.entities.mobs.length = 0;
    game.tickCount = 12;
    game._tickRedstoneDevices();
    assertEqual(blocks.get('0,0,0').get('powered'), false);
  });
});
