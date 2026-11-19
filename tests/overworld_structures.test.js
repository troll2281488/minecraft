import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Chunk } from '../src/world/chunk.js';
import {
  TerrainGenerator,
  desertTempleCandidateForCell,
  jungleTempleCandidateForCell,
  swampHutCandidateForCell,
  iglooCandidateForCell,
  mansionCandidateForCell,
  oceanMonumentCandidateForCell,
  strongholdCandidateForCell,
} from '../src/world/gen/terrain.js';

describe('Classic overworld structure generation', () => {
  it('anchors every added structure candidate deterministically', () => {
    const candidates = [
      desertTempleCandidateForCell, jungleTempleCandidateForCell,
      swampHutCandidateForCell, iglooCandidateForCell,
      mansionCandidateForCell, oceanMonumentCandidateForCell,
      strongholdCandidateForCell,
    ];
    for (const candidate of candidates) {
      assertEqual(
        JSON.stringify(candidate('structure-seed', -4, 9)),
        JSON.stringify(candidate('structure-seed', -4, 9)),
      );
    }
  });

  it('builds the recognizable sandstone desert pyramid shell and treasure room', () => {
    const generator = new TerrainGenerator('temple-test');
    const chunk = new Chunk(0, 0);
    generator.placeDesertTemple(chunk, 0, 0, { x: 8, z: 8 }, 64);
    assertEqual(chunk.getBlock(8, 65, 8).block.id, 'mc:sandstone');
    assertEqual(chunk.getBlock(11, 66, 11).block.id, 'mc:chest');
  });

  it('builds a mossy jungle temple with interior loot', () => {
    const generator = new TerrainGenerator('jungle-temple-test');
    const chunk = new Chunk(0, 0);
    generator.placeJungleTemple(chunk, 0, 0, { x: 1, z: 1 }, 64);
    assert(['mc:mossy_cobblestone', 'mc:cobblestone'].includes(chunk.getBlock(1, 65, 1).block.id));
    assertEqual(chunk.getBlock(3, 66, 3).block.id, 'mc:chest');
  });

  it('builds a raised swamp hut, a snow igloo and a multi-floor mansion', () => {
    const generator = new TerrainGenerator('surface-structures-test');
    const hut = new Chunk(0, 0);
    generator.placeSwampHut(hut, 0, 0, { x: 4, z: 4 }, 64);
    assertEqual(hut.getBlock(4, 67, 4).block.id, 'mc:oak_planks');

    const igloo = new Chunk(0, 0);
    generator.placeIgloo(igloo, 0, 0, { x: 8, z: 8 }, 64);
    assertEqual(igloo.getBlock(8, 65, 8).block.id, 'mc:snow_block');

    const mansion = new Chunk(0, 0);
    generator.placeWoodlandMansion(mansion, 0, 0, { x: 8, z: 8 }, 64);
    assert(['mc:dark_oak_planks', 'mc:oak_planks'].includes(mansion.getBlock(9, 65, 9).block.id));
    assert(['mc:dark_oak_planks', 'mc:oak_planks'].includes(mansion.getBlock(9, 70, 9).block.id));
  });

  it('builds a prismarine monument and underground stronghold rooms', () => {
    const generator = new TerrainGenerator('deep-structure-test');
    const monument = new Chunk(0, 0);
    generator.placeOceanMonument(monument, 0, 0, { x: 8, z: 8, y: 54 });
    assertEqual(monument.getBlock(8, 54, 8).block.id, 'mc:prismarine_bricks');

    const stronghold = new Chunk(0, 0);
    generator.placeStronghold(stronghold, 0, 0, { x: 8, z: 8, y: 20 });
    assert(['mc:stone_bricks', 'mc:cobblestone'].includes(stronghold.getBlock(8, 20, 8).block.id));
  });
});
