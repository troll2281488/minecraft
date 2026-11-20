import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Chunk } from '../src/world/chunk.js';
import { TerrainGenerator, findNearestStructure } from '../src/world/gen/terrain.js';

describe('Nether and End dimensions', () => {
  it('generates a separate Nether chunk with bedrock and netherrack', () => {
    const generator = new TerrainGenerator('dimension-test', 'nether');
    const chunk = generator.generate(new Chunk(0, 0));
    assertEqual(chunk.getBlock(0, -64, 0).block.id, 'mc:bedrock');
    assert(['mc:netherrack','mc:stone'].includes(chunk.getBlock(8, 40, 8).block.id));
  });

  it('generates an End island rather than Overworld terrain', () => {
    const generator = new TerrainGenerator('dimension-test', 'end');
    const chunk = generator.generate(new Chunk(0, 0));
    assertEqual(chunk.getBiome(8, 64, 8), 'mc:the_end');
    assert(['mc:end_stone','mc:air'].includes(chunk.getBlock(8, 64, 8).block.id));
  });

  it('locates dimension-specific fortress and End-city candidates deterministically', () => {
    const fortress = findNearestStructure('locate-seed','nether','fortress',0,0,12000);
    const city = findNearestStructure('locate-seed','end','end_city',0,0,12000);
    assert(fortress && Number.isFinite(fortress.x) && Number.isFinite(fortress.z));
    assert(city && Number.isFinite(city.x) && Number.isFinite(city.z));
    assertEqual(
      JSON.stringify(fortress),
      JSON.stringify(findNearestStructure('locate-seed','nether','fortress',0,0,12000)),
    );
  });
});
