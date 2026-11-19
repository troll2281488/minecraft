import { describe, it, assert, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { TerrainGenerator, caveLakeCandidateForCell, fossilCandidateForCell, mineshaftCandidateForCell, dungeonCandidateForCell } from '../src/world/gen/terrain.js';
import { Chunk } from '../src/world/chunk.js';
import { BLOCKS } from '../src/world/block.js';
import { buildTextures, buildBlockTextureTable } from '../src/render/atlas.js';

describe('Overworld underground structures and deterministic placement', () => {
  it('places stable flooded-cave candidates from the world seed', () => {
    const a = caveLakeCandidateForCell('cave-water-world', -2, 3);
    const b = caveLakeCandidateForCell('cave-water-world', -2, 3);
    assertEqual(JSON.stringify(a), JSON.stringify(b));
    let found = 0;
    for (let z = -12; z <= 12; z++) for (let x = -12; x <= 12; x++) {
      if (caveLakeCandidateForCell('cave-water-world', x, z)) found++;
    }
    assert(found > 0, 'cave lake spacing produced no candidates');
  });

  it('carves a flooded chamber using registered block textures', () => {
    const generator = new TerrainGenerator('cave-lake-build-test');
    const chunk = new Chunk(0, 0);
    const stone = BLOCKS.get('mc:stone').defaultState;
    for (let y = 10; y <= 30; y++) {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        chunk.setBlock(x, y, z, stone);
      }
    }
    generator.placeCaveLake(chunk, 0, 0, { x: 8, z: 8, y: 18, radius: 5 });
    assertEqual(chunk.getBlock(8, 18, 8).block.id, 'mc:water');
    assertEqual(chunk.getBlock(8, 22, 8).block.id, 'mc:air');
    assertEqual(chunk.getBlock(8, 17, 8).block.id, 'mc:gravel');
    const atlas = buildTextures();
    const table = buildBlockTextureTable(BLOCKS, atlas.index);
    const missing = atlas.index.get('__missing');
    for (const id of ['mc:water', 'mc:gravel']) {
      const state = BLOCKS.get(id).defaultState;
      for (let face = 0; face < 6; face++) {
        assert(table[state.id * 6 + face] !== missing, id + ' face ' + face + ' uses missing texture');
      }
    }
  });

  it('places stable fossil candidates and builds a textured fossil chamber', () => {
    const a = fossilCandidateForCell('fossil-world', -4, 2);
    const b = fossilCandidateForCell('fossil-world', -4, 2);
    assertEqual(JSON.stringify(a), JSON.stringify(b));
    let found = 0;
    for (let z = -15; z <= 15; z++) for (let x = -15; x <= 15; x++) {
      if (fossilCandidateForCell('fossil-world', x, z)) found++;
    }
    assert(found > 0, 'fossil placement produced no candidates');

    const generator = new TerrainGenerator('fossil-build-test');
    const chunk = new Chunk(0, 0);
    const stone = BLOCKS.get('mc:stone').defaultState;
    for (let y = 8; y <= 24; y++) {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        chunk.setBlock(x, y, z, stone);
      }
    }
    generator.placeFossil(chunk, 0, 0, { x: 8, z: 8, y: 12 });
    assertEqual(chunk.getBlock(8, 13, 8).block.id, 'mc:bone_block');
    assertEqual(chunk.getBlock(8, 15, 8).block.id, 'mc:air');
    const atlas = buildTextures();
    const table = buildBlockTextureTable(BLOCKS, atlas.index);
    const bone = BLOCKS.get('mc:bone_block').defaultState;
    const missing = atlas.index.get('__missing');
    for (let face = 0; face < 6; face++) {
      assert(table[bone.id * 6 + face] !== missing, 'bone block face ' + face + ' uses missing texture');
    }
  });

  it('places stable mineshaft and dungeon candidates from the world seed', () => {
    const a = mineshaftCandidateForCell('deep-world', -3, 7);
    const b = mineshaftCandidateForCell('deep-world', -3, 7);
    assertEqual(JSON.stringify(a), JSON.stringify(b));
    const d1 = dungeonCandidateForCell('deep-world', 4, -2);
    const d2 = dungeonCandidateForCell('deep-world', 4, -2);
    assertEqual(JSON.stringify(d1), JSON.stringify(d2));
    let shafts = 0, rooms = 0;
    for (let z = -12; z <= 12; z++) for (let x = -12; x <= 12; x++) {
      if (mineshaftCandidateForCell('deep-world', x, z)) shafts++;
      if (dungeonCandidateForCell('deep-world', x, z)) rooms++;
    }
    assert(shafts > 0 && rooms > 0, 'structure spacing produced no candidates');
  });

  it('has real texture layers for dungeon masonry and desert sand', () => {
    const atlas = buildTextures();
    const table = buildBlockTextureTable(BLOCKS, atlas.index);
    const missing = atlas.index.get('__missing');
    for (const id of ['mc:mossy_cobblestone', 'mc:red_sand', 'mc:red_sandstone']) {
      const state = BLOCKS.get(id)?.defaultState;
      assert(state, 'missing block registration: ' + id);
      const base = state.id * 6;
      for (let face = 0; face < 6; face++) {
        assert(table[base + face] !== missing, id + ' face ' + face + ' uses missing texture');
      }
    }
    assert(atlas.index.has('mossy_cobblestone'));
    assert(atlas.index.has('red_sand'));
  });

  it('builds a supported timber corridor and a sealed dungeon room', () => {
    const generator = new TerrainGenerator('underground-build-test');
    const chunk = new Chunk(0, 0);
    generator.placeMineshaft(chunk, 0, 0, { x: 4, z: 4, y: 24, axis: 0, phase: 0 });
    generator.placeDungeon(chunk, 0, 0, { x: 2, z: 2, y: 12, variant: 3 });
    assertEqual(chunk.getBlock(2, 13, 2).block.id, 'mc:mossy_cobblestone');
    assertEqual(chunk.getBlock(3, 13, 3).block.id, 'mc:chest');
    assertEqual(chunk.getBlock(5, 24, 4).block.id, 'mc:oak_planks');
    assertEqual(chunk.getBlock(4, 25, 4).block.id, 'mc:air');
  });
});
