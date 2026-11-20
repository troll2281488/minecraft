import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { shapeBoxes, collisionBoxes } from '../src/world/shapes.js';
import { BlockActionsMixin } from '../src/game/block_actions.js';
import { Player, GAMEMODE } from '../src/entity/player.js';
import { Chunk } from '../src/world/chunk.js';
import { ChunkWriter, placeStrongholdRoomNetwork } from '../src/world/gen/structures.js';
import { hash01, seedToInt } from '../src/world/gen/hash.js';
import { normalizeSeed } from '../src/core/rng.js';

const AIR = BLOCKS.get('mc:air').defaultState;
const STONE = BLOCKS.get('mc:stone').defaultState;

function mockWorld(entries = []) {
  const map = new Map(entries);
  return {
    map,
    getBlock(x, y, z) { return map.get(`${x},${y},${z}`) || AIR; },
    setBlock(x, y, z, state) { map.set(`${x},${y},${z}`, state); return true; },
  };
}

describe('Java stronghold doors and buttons', () => {
  it('registers two-part doors and a wall button with non-cube geometry', () => {
    const oak = BLOCKS.get('mc:oak_door').defaultState;
    const iron = BLOCKS.get('mc:iron_door').defaultState;
    const button = BLOCKS.get('mc:stone_button').defaultState;
    assertEqual(shapeBoxes(oak).length, 1);
    assertEqual(shapeBoxes(iron).length, 1);
    assertEqual(shapeBoxes(button).length, 1);
    assert(collisionBoxes(oak).length > 0, 'door should block movement');
    assertEqual(collisionBoxes(button).length, 0, 'button should not block movement');
  });

  it('toggles both halves of a wooden door together', () => {
    const door = BLOCKS.get('mc:oak_door').defaultState;
    const world = mockWorld([
      ['4,10,7', door.with('half', 'bottom')],
      ['4,11,7', door.with('half', 'top')],
    ]);
    const game = { world, multiplayer: { pushBlockChange() {} }, sounds: { play() {} } };
    BlockActionsMixin._toggleDoorAt.call(game, 4, 11, 7);
    assertEqual(world.getBlock(4, 10, 7).get('open'), true);
    assertEqual(world.getBlock(4, 11, 7).get('open'), true);
    BlockActionsMixin._toggleDoorAt.call(game, 4, 10, 7);
    assertEqual(world.getBlock(4, 10, 7).get('open'), false);
    assertEqual(world.getBlock(4, 11, 7).get('open'), false);
  });

  it('iron door is controlled by a stone button and both door halves stay in sync', () => {
    const door = BLOCKS.get('mc:iron_door').defaultState;
    const button = BLOCKS.get('mc:stone_button').defaultState;
    const world = mockWorld([
      ['1,5,0', button],
      ['2,5,0', door.with('half', 'bottom')],
      ['2,6,0', door.with('half', 'top')],
    ]);
    const game = { world, multiplayer: { pushBlockChange() {} }, sounds: { play() {} } };
    BlockActionsMixin._pressStrongholdButton.call(game, 1, 5, 0);
    assertEqual(world.getBlock(2, 5, 0).get('open'), true);
    assertEqual(world.getBlock(2, 6, 0).get('open'), true);
    assertEqual(world.getBlock(1, 5, 0).get('powered'), true);
    BlockActionsMixin._pressStrongholdButton.call(game, 1, 5, 0);
    assertEqual(world.getBlock(2, 5, 0).get('open'), false);
    assertEqual(world.getBlock(1, 5, 0).get('powered'), false);
  });


  it('generates an oak library door and an iron prison door with its button', () => {
    const site = { x: 8, y: 20, z: 8 };
    const seed = Array.from({ length: 100 }, (_, i) => 'door-seed-' + i).find((candidate) =>
      hash01(seedToInt(normalizeSeed(candidate)), site.x, site.y, site.z, 7419) >= 0.22);
    assert(seed, 'test seed should select the duplex library');
    const states = Object.fromEntries([...BLOCKS.blocks.keys()].map((id) => [id, BLOCKS.get(id).defaultState]));

    const libraryChunk = new Chunk(-1, 0);
    placeStrongholdRoomNetwork(new ChunkWriter(libraryChunk, -16, 0), states, site, seed);
    const libraryDoor = (x, y, z) => libraryChunk.getBlock(x + 16, y, z).block.id;
    assertEqual(libraryDoor(-10, site.y + 1, site.z), 'mc:oak_door');
    assertEqual(libraryDoor(-10, site.y + 2, site.z), 'mc:oak_door');

    const prisonChunk = new Chunk(1, -1);
    placeStrongholdRoomNetwork(new ChunkWriter(prisonChunk, 16, -16), states, site, seed);
    const prisonBlock = (x, y, z) => prisonChunk.getBlock(x - 16, y, z + 16).block.id;
    assertEqual(prisonBlock(23, site.y + 1, -4), 'mc:iron_door');
    assertEqual(prisonBlock(23, site.y + 2, -4), 'mc:iron_door');
    assertEqual(prisonBlock(22, site.y + 1, -4), 'mc:stone_button');
  });

  it('cobwebs strongly reduce player movement speed', () => {
    const web = BLOCKS.get('mc:cobweb').defaultState;
    const makeWorld = (withWeb) => ({
      getBlock(x, y, z) {
        if (y <= 0) return STONE;
        if (withWeb && x === 0 && z === 0 && y === 2) return web;
        return AIR;
      },
    });
    const move = (withWeb) => {
      const player = new Player(0.5, 1, 0.5);
      player.gamemode = GAMEMODE.SURVIVAL;
      player.onGround = true;
      player.input.forward = 1;
      player.tick(makeWorld(withWeb));
      return Math.abs(player.z - 0.5);
    };
    assert(move(true) < move(false) * 0.5, 'web movement should be less than half normal movement');
  });
});
