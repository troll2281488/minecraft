import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { RedstoneDevicesMixin } from '../src/game/redstone_devices.js';

describe('redstone wire signal network', () => {
  it('repeater delays a rising signal according to its selected setting', () => {
    const blocks = new Map();
    const key = (x,y,z) => `${x},${y},${z}`;
    const air = BLOCKS.get('mc:air').defaultState;
    const lever = BLOCKS.get('mc:lever').defaultState.with('powered', true);
    const repeater = BLOCKS.get('mc:repeater').defaultState.with('facing', 'east');
    blocks.set(key(0,0,0), lever);
    blocks.set(key(1,0,0), repeater);
    const world = {
      getBlock(x,y,z) { return blocks.get(key(x,y,z)) || air; },
      setBlock(x,y,z,state) { blocks.set(key(x,y,z), state); return true; },
    };
    const game = { world, tickCount: 0, multiplayer: null };
    RedstoneDevicesMixin._tickRepeaters.call(game, 1, 0, 0, true);
    assertEqual(world.getBlock(1,0,0).get('powered'), false);
    game.tickCount = 3;
    RedstoneDevicesMixin._tickRepeaters.call(game, 1, 0, 0, true);
    assertEqual(world.getBlock(1,0,0).get('powered'), false);
    game.tickCount = 4;
    RedstoneDevicesMixin._tickRepeaters.call(game, 1, 0, 0, true);
    assertEqual(world.getBlock(1,0,0).get('powered'), true);
  });

  it('carries a lever signal with one strength lost per wire', () => {
    const blocks = new Map();
    const key = (x,y,z) => `${x},${y},${z}`;
    const air = BLOCKS.get('mc:air').defaultState;
    const lever = BLOCKS.get('mc:lever').defaultState.with('powered', true);
    const wire = BLOCKS.get('mc:redstone_wire').defaultState;
    blocks.set(key(0,0,0), lever);
    blocks.set(key(1,0,0), wire);
    blocks.set(key(2,0,0), wire);
    blocks.set(key(3,0,0), wire);
    const world = {
      getBlock(x,y,z) { return blocks.get(key(x,y,z)) || air; },
      setBlock(x,y,z,state) { blocks.set(key(x,y,z), state); return true; },
    };
    const game = { world, multiplayer: null };
    RedstoneDevicesMixin._tickRedstoneWireNetwork.call(game, 2, 0, 0, true);
    assertEqual(world.getBlock(1,0,0).get('power'), 15);
    assertEqual(world.getBlock(2,0,0).get('power'), 14);
    assertEqual(world.getBlock(3,0,0).get('power'), 13);
    blocks.set(key(0,0,0), lever.with('powered', false));
    RedstoneDevicesMixin._tickRedstoneWireNetwork.call(game, 2, 0, 0, true);
    assertEqual(world.getBlock(1,0,0).get('power'), 0);
    assertEqual(world.getBlock(2,0,0).get('power'), 0);
    assertEqual(world.getBlock(3,0,0).get('power'), 0);
  });
});
