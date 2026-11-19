import { describe, it, assert, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { TerrainGenerator, BIOME, BIOME_SURFACE, GENERATOR_VERSION } from '../src/world/gen/terrain.js';
import { Chunk } from '../src/world/chunk.js';

describe('Overworld biome expansion', () => {
  it('publishes the expanded classic biome set with complete surface rules', () => {
    const expected = [
      'OCEAN','DEEP_OCEAN','WARM_OCEAN','LUKEWARM_OCEAN','DEEP_LUKEWARM_OCEAN',
      'COLD_OCEAN','DEEP_COLD_OCEAN','FROZEN_OCEAN','DEEP_FROZEN_OCEAN',
      'BEACH','SNOWY_BEACH','STONE_SHORE','RIVER','FROZEN_RIVER',
      'PLAINS','SUNFLOWER_PLAINS','FOREST','FLOWER_FOREST','BIRCH_FOREST',
      'TALL_BIRCH_FOREST','DARK_FOREST','JUNGLE','SPARSE_JUNGLE','BAMBOO_JUNGLE',
      'DESERT','SAVANNA','SAVANNA_PLATEAU','SHATTERED_SAVANNA','BADLANDS',
      'WOODED_BADLANDS','ERODED_BADLANDS','MOUNTAINS','WINDSWEPT_HILLS',
      'SNOWY_PLAINS','ICE_SPIKES','TAIGA','SNOWY_TAIGA','GIANT_TREE_TAIGA',
      'GIANT_SPRUCE_TAIGA','SWAMP','MUSHROOM_FIELDS',
    ];
    for (const key of expected) {
      const id = BIOME[key];
      assert(typeof id === 'string', `missing biome ${key}`);
      assert(BIOME_SURFACE[id], `missing surface rules for ${key}`);
    }
    assertEqual(Object.keys(BIOME_SURFACE).length, expected.length, 'a biome is missing surface rules');
    assert(GENERATOR_VERSION >= 4, 'generator version was not advanced');
  });

  it('keeps climate selection deterministic for a given seed and coordinate', () => {
    const a = new TerrainGenerator('overworld-biome-test');
    const b = new TerrainGenerator('overworld-biome-test');
    for (let x = -512; x <= 512; x += 37) {
      for (let z = -512; z <= 512; z += 41) {
        const h = Math.floor(a.heightAt(x, z));
        assertEqual(a.biomeAt(x, z, h), b.biomeAt(x, z, h), `biome mismatch at ${x},${z}`);
      }
    }
  });

  it('generates a chunk with registered blocks and a populated biome palette', () => {
    const generator = new TerrainGenerator(123456789);
    const chunk = generator.generate(new Chunk(0, 0));
    assert(chunk.sectionCount > 0, 'generated chunk has no terrain');
    assert(chunk.biomes.palette.length > 1, 'generated chunk did not store biome variation');
    assert(chunk.getHeight(8, 8) >= 0, 'surface height was not generated');
  });
});
