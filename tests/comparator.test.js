import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { comparatorOutput, comparatorContainerOutput, RedstoneDevicesMixin } from '../src/game/redstone_devices.js';

describe('redstone comparator', () => {
  it('registers compare/subtract states', () => {
    const state = BLOCKS.get('mc:comparator').defaultState;
    assertEqual(state.get('mode'), 'compare');
    assertEqual(state.with('mode', 'subtract').get('mode'), 'subtract');
    assertEqual(state.with('facing', 'east').get('facing'), 'east');
  });
  it('compares rear input against the strongest side input', () => {
    assertEqual(comparatorOutput(9, 2, 5, false), 9);
    assertEqual(comparatorOutput(4, 6, 2, false), 0);
    assertEqual(comparatorOutput(7, 7, 0, false), 7);
  });
  it('subtracts the strongest side input from the rear input', () => {
    assertEqual(comparatorOutput(9, 2, 5, true), 4);
    assertEqual(comparatorOutput(4, 6, 2, true), 0);
    assertEqual(comparatorOutput(15, 0, 0, true), 15);
  });
  it('clamps analogue inputs to the 0..15 range', () => {
    assertEqual(comparatorOutput(99, -3, 0), 15);
    assertEqual(comparatorOutput(-1, 0, 0), 0);
  });
  it('calculates container fullness signal levels', () => {
    assertEqual(comparatorContainerOutput([], 9), 0);
    assertEqual(comparatorContainerOutput([{count:1,maxStackSize:64}], 9), 1);
    assertEqual(comparatorContainerOutput([{count:64,maxStackSize:64}], 1), 15);
    assertEqual(comparatorContainerOutput([{count:16,maxStackSize:16}], 1), 15);
  });
  it('reads the fullness of a real chest block entity', () => {
    const chestState = BLOCKS.get('mc:chest').defaultState;
    const blocks = new Map([
      ['0,0,0', BLOCKS.get('mc:comparator').defaultState],
      ['0,0,1', chestState],
    ]);
    const slots = Array.from({length:27}, () => ({count:0,maxStackSize:64}));
    slots[0] = {count:64,maxStackSize:64};
    const game = {
      tickCount: 4,
      world: {
        getBlock(x,y,z) { return blocks.get(String(x)+','+y+','+z) || BLOCKS.get('mc:air').defaultState; },
        setBlock(x,y,z,state) { blocks.set(String(x)+','+y+','+z,state); return true; },
      },
      player: {x:0,y:0,z:0},
      _chestAt() { return {slots}; },
      multiplayer: {pushBlockChange(){}},
      ...RedstoneDevicesMixin,
    };
    game._tickComparators(0,0,0,true);
    game.tickCount = 6;
    game._tickComparators(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('power'), 1);
  });
  it('updates comparator output after a two-tick delay', () => {
    const blocks = new Map([
      ['0,0,0', BLOCKS.get('mc:comparator').defaultState],
      ['0,0,1', BLOCKS.get('mc:redstone_block').defaultState],
    ]);
    const game = {
      tickCount: 10,
      world: {
        getBlock(x,y,z) { return blocks.get(String(x)+','+y+','+z) || BLOCKS.get('mc:air').defaultState; },
        setBlock(x,y,z,state) { blocks.set(String(x)+','+y+','+z,state); return true; },
      },
      player: {x:0,y:0,z:0},
      multiplayer: {pushBlockChange(){}},
      ...RedstoneDevicesMixin,
    };
    game._tickComparators(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('power'), 0);
    game.tickCount = 12;
    game._tickComparators(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('power'), 15);
    assertEqual(blocks.get('0,0,0').get('powered'), true);
  });
});