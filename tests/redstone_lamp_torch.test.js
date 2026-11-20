import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { RedstoneDevicesMixin } from '../src/game/redstone_devices.js';
import { blockEmissionForState } from '../src/world/lighting.js';

function makeWorld(entries) {
  const blocks = new Map(entries);
  const world = {
    getBlock(x, y, z) { return blocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
    setBlock(x, y, z, state) { blocks.set(`${x},${y},${z}`, state); return true; },
  };
  return { blocks, world };
}

describe('redstone lamp and torch parity', () => {
  it('uses state-dependent light emission for lamps and torches', () => {
    assertEqual(blockEmissionForState(BLOCKS.get('mc:redstone_lamp').defaultState), 0);
    assertEqual(blockEmissionForState(BLOCKS.get('mc:redstone_lamp').defaultState.with('lit', true)), 15);
    assertEqual(blockEmissionForState(BLOCKS.get('mc:redstone_torch').defaultState), 7);
    assertEqual(blockEmissionForState(BLOCKS.get('mc:redstone_torch').defaultState.with('lit', false)), 0);
  });
  it('registers a lamp with an initially unlit state', () => {
    const lamp = BLOCKS.get('mc:redstone_lamp').defaultState;
    assertEqual(lamp.get('lit'), false);
    assertEqual(lamp.with('lit', true).get('lit'), true);
  });
  it('turns a lamp on from an adjacent redstone block and off after removal', () => {
    const { blocks, world } = makeWorld([
      ['0,0,0', BLOCKS.get('mc:redstone_lamp').defaultState],
      ['1,0,0', BLOCKS.get('mc:redstone_block').defaultState],
    ]);
    const game = { world, player: { x:0,y:0,z:0 }, multiplayer:{pushBlockChange(){}}, ...RedstoneDevicesMixin };
    game._tickRedstoneLamps(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('lit'), true);
    blocks.set('1,0,0', BLOCKS.get('mc:air').defaultState);
    game._tickRedstoneLamps(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('lit'), false);
  });
  it('turns off a floor torch when its support block is powered', () => {
    const { blocks, world } = makeWorld([
      ['0,1,0', BLOCKS.get('mc:redstone_torch').defaultState],
      ['0,0,0', BLOCKS.get('mc:stone').defaultState],
      ['1,0,0', BLOCKS.get('mc:redstone_block').defaultState],
    ]);
    const game = { world, player: { x:0,y:1,z:0 }, multiplayer:{pushBlockChange(){}}, ...RedstoneDevicesMixin };
    game._tickRedstoneTorches(0,1,0,true);
    assertEqual(blocks.get('0,1,0').get('lit'), false);
  });
  it('restores a torch when the support loses power', () => {
    const { blocks, world } = makeWorld([
      ['0,1,0', BLOCKS.get('mc:redstone_torch').defaultState.with('lit', false)],
      ['0,0,0', BLOCKS.get('mc:stone').defaultState],
    ]);
    const game = { world, player: { x:0,y:1,z:0 }, multiplayer:{pushBlockChange(){}}, ...RedstoneDevicesMixin };
    game._tickRedstoneTorches(0,1,0,true);
    assertEqual(blocks.get('0,1,0').get('lit'), true);
  });
});
