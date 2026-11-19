import { describe, it, assert, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { TerrainGenerator, mineshaftCandidateForCell, dungeonCandidateForCell } from '../src/world/gen/terrain.js';
import { Chunk } from '../src/world/chunk.js';

describe('Overworld underground structures and deterministic placement', () => {
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
