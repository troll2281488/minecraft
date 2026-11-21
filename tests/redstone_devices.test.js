import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { RedstoneDevicesMixin, comparatorContainerOutput, comparatorOutput } from '../src/game/redstone_devices.js';

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

function makeComparatorGame(rearBlock, inventory) {
  const blocks = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const comparator = BLOCKS.get('mc:comparator').defaultState.with('facing', 'east');
  blocks.set(key(0, 0, 0), comparator);
  blocks.set(key(-1, 0, 0), rearBlock);
  const game = {
    world: {
      getBlock(x, y, z) { return blocks.get(key(x, y, z)) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x, y, z, state) { blocks.set(key(x, y, z), state); return true; },
    },
    tickCount: 0,
    _hopperAt: () => inventory,
    _dropperAt: () => inventory,
    ...RedstoneDevicesMixin,
  };
  return { game, blocks };
}

describe('polished blackstone redstone ingredients', () => {
  it('registers blackstone blocks required by polished blackstone controls', () => {
    assertEqual(BLOCKS.get('mc:blackstone')?.id, 'mc:blackstone');
    assertEqual(BLOCKS.get('mc:polished_blackstone')?.id, 'mc:polished_blackstone');
  });
});

describe('comparator inventory signals', () => {
  it('calculates inventory fullness with a minimum signal of one', () => {
    assertEqual(comparatorContainerOutput([], 5), 0);
    assertEqual(comparatorContainerOutput([{ count: 1, maxStackSize: 64 }], 1), 1);
    assertEqual(comparatorContainerOutput([{ count: 64, maxStackSize: 64 }, null, null, null, null], 5), 3);
    assertEqual(comparatorContainerOutput(Array.from({ length: 5 }, () => ({ count: 64, maxStackSize: 64 })), 5), 15);
  });

  it('supports compare and subtract modes with clamped signal levels', () => {
    assertEqual(comparatorOutput(12, 4, 7, false), 12);
    assertEqual(comparatorOutput(6, 4, 7, false), 0);
    assertEqual(comparatorOutput(12, 4, 7, true), 5);
    assertEqual(comparatorOutput(-10, 40, 2, true), 0);
  });

  it('reads five-slot hopper fullness and applies the two-tick comparator delay', () => {
    const { game, blocks } = makeComparatorGame(BLOCKS.get('mc:hopper').defaultState, {
      slots: [{ count: 64, maxStackSize: 64 }, null, null, null, null],
    });
    game._tickComparators(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('power'), 0);
    game.tickCount = 2;
    game._tickComparators(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('power'), 3);
    assertEqual(blocks.get('0,0,0').get('powered'), true);
  });

  it('reads nine-slot dropper fullness', () => {
    const { game, blocks } = makeComparatorGame(BLOCKS.get('mc:dropper').defaultState, {
      slots: [{ count: 64, maxStackSize: 64 }, ...Array(8).fill(null)],
    });
    game._tickComparators(0, 0, 0, true);
    game.tickCount = 2;
    game._tickComparators(0, 0, 0, true);
    assertEqual(blocks.get('0,0,0').get('power'), 2);
  });

  it('reads all nine composter fill levels after the comparator update delay', () => {
    const expected = [0, 1, 3, 5, 7, 9, 11, 13, 15];
    for (let level = 0; level <= 8; level++) {
      const composter = BLOCKS.get('mc:composter').defaultState.with('level', level);
      const { game, blocks } = makeComparatorGame(composter, null);
      game._tickComparators(0, 0, 0, true);
      game.tickCount = 2;
      game._tickComparators(0, 0, 0, true);
      assertEqual(blocks.get('0,0,0').get('power'), expected[level]);
    }
  });
});
