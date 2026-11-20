import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { RedstoneDevicesMixin } from '../src/game/redstone_devices.js';

function makeGame(blockId, entities = {}, withPlayer = false) {
  const blocks = new Map([['0,0,0', BLOCKS.get(blockId).defaultState]]);
  const player = withPlayer ? {
    x: 0.5, y: 0.05, z: 0.5, flying: false,
    boundingBox: () => ({ minX: 0.2, maxX: 0.8, minY: 0.05, maxY: 1.85, minZ: 0.2, maxZ: 0.8 }),
  } : null;
  const game = {
    world: {
      getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); return true; },
    },
    player, entities: { mobs: [], droppedItems: [], ...entities }, tickCount: 1,
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

  it('releases a mob-activated plate after the ten-tick delay', () => {
    const { game, blocks } = makeGame('mc:oak_pressure_plate', {
      mobs: [{ type: 'cow', x: 0.5, y: 0.05, z: 0.5 }],
    });
    game._tickRedstoneDevices();
    game.entities.mobs.length = 0;
    game.tickCount = 12;
    game._tickRedstoneDevices();
    game.tickCount = 22;
    game._tickRedstoneDevices();
    assertEqual(blocks.get('0,0,0').get('powered'), false);
  });
});

describe('weighted pressure plate signal', () => {
  it('light plate emits one level per entity up to fifteen', () => {
    const mobs = Array.from({ length: 7 }, (_, i) => ({ type: 'cow', x: 0.5, y: 0.05, z: 0.5, id: i }));
    const { game, blocks } = makeGame('mc:light_weighted_pressure_plate', { mobs }, true);
    game._tickWeightedPressurePlates(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('power'), 8);
  });

  it('heavy plate emits one level per ten entities, rounded up', () => {
    const mobs = Array.from({ length: 10 }, (_, i) => ({ type: 'cow', x: 0.5, y: 0.05, z: 0.5, id: i }));
    const { game, blocks } = makeGame('mc:heavy_weighted_pressure_plate', { mobs }, false);
    game._tickWeightedPressurePlates(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('power'), 1);
    game.entities.mobs.push({ type: 'cow', x: 0.5, y: 0.05, z: 0.5 });
    game._tickWeightedPressurePlates(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('power'), 2);
  });

  it('weighted plates include dropped item entities in their count', () => {
    const drops = [{ x: 0.5, y: 0.08, z: 0.5 }, { x: 0.5, y: 0.08, z: 0.5 }];
    const { game, blocks } = makeGame('mc:light_weighted_pressure_plate', { droppedItems: drops }, false);
    game._tickWeightedPressurePlates(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('power'), 2);
  });
});
