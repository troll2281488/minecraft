import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { Chunk } from '../src/world/chunk.js';
import { ChunkWriter, placeStrongholdRoomNetwork } from '../src/world/gen/structures.js';
import { hash01, seedToInt } from '../src/world/gen/hash.js';
import { normalizeSeed } from '../src/core/rng.js';
import { shapeBoxes, collisionBoxes } from '../src/world/shapes.js';

describe('Java 1.19 stronghold library pieces', () => {
  it('registers bookshelves, cobwebs and a non-colliding ladder model', () => {
    for (const id of ['mc:bookshelf', 'mc:cobweb', 'mc:ladder']) {
      assert(BLOCKS.get(id), id + ' should be registered');
    }
    const ladder = BLOCKS.get('mc:ladder').defaultState.with('facing', 'east');
    assert(shapeBoxes(ladder).length >= 9, 'ladder should contain rails and rungs');
    assertEqual(collisionBoxes(ladder).length, 0, 'ladder should not act as a solid cube');
  });

  it('places a connected duplex library with shelves, ladder and two loot chests', () => {
    const site = { x: 8, y: 20, z: 8 };
    const seed = Array.from({ length: 100 }, (_, i) => 'duplex-' + i).find((candidate) =>
      hash01(seedToInt(normalizeSeed(candidate)), site.x, site.y, site.z, 7419) >= 0.22);
    assert(seed, 'test seed should select the large library variant');
    const chunk = new Chunk(-2, 0);
    const writer = new ChunkWriter(chunk, -32, 0);
    const states = Object.fromEntries([...BLOCKS.blocks.keys()].map((id) => [id, BLOCKS.get(id).defaultState]));
    placeStrongholdRoomNetwork(writer, states, site, seed);

    const libraryX = site.x - 32;
    const libraryZ = site.z - 7;
    const blockAt = (x, y, z) => chunk.getBlock(x + 32, y, z).block.id;
    assertEqual(blockAt(libraryX + 2, site.y + 1, libraryZ + 2), 'mc:chest');
    assertEqual(blockAt(libraryX + 2, site.y + 6, libraryZ + 12), 'mc:chest');
    assertEqual(blockAt(libraryX + 2, site.y + 1, libraryZ + 3), 'mc:bookshelf');
    assertEqual(blockAt(libraryX + 1, site.y + 1, libraryZ + 1), 'mc:ladder');
    let webs = 0;
    for (let x = -31; x <= -18; x++) for (let z = 1; z <= 14; z++) {
      for (let y = site.y + 1; y <= site.y + 4; y++) {
        if (blockAt(x, y, z) === 'mc:cobweb') webs++;
      }
    }
    assert(webs > 0, 'seeded library should contain some cobwebs');
  });

  it('chooses the compact one-floor library variant for its deterministic seed', () => {
    const site = { x: 8, y: 20, z: 8 };
    const seed = Array.from({ length: 100 }, (_, i) => 'compact-' + i).find((candidate) =>
      hash01(seedToInt(normalizeSeed(candidate)), site.x, site.y, site.z, 7419) < 0.22);
    assert(seed, 'test seed should select the compact library variant');
    const chunk = new Chunk(-2, 0);
    const writer = new ChunkWriter(chunk, -32, 0);
    const states = Object.fromEntries([...BLOCKS.blocks.keys()].map((id) => [id, BLOCKS.get(id).defaultState]));
    placeStrongholdRoomNetwork(writer, states, site, seed);
    const libraryX = site.x - 28;
    const libraryZ = site.z - 5;
    assertEqual(chunk.getBlock(libraryX + 2 + 32, site.y + 1, libraryZ + 2).block.id, 'mc:chest');
    assert(chunk.getBlock(libraryX + 1 + 32, site.y + 1, libraryZ + 1).block.id !== 'mc:ladder', 'compact variant has no ladder');
  });
});
