import { describe, it, assert, assertEqual } from './framework.js';
import '../src/world/blocks/index.js';
import { TerrainGenerator, villageCandidateForCell } from '../src/world/gen/terrain.js';
import { Chunk } from '../src/world/chunk.js';

describe('Overworld villages', () => {
  it('anchors village candidates deterministically to world cells', () => {
    const a = villageCandidateForCell('village-seed', -3, 7);
    const b = villageCandidateForCell('village-seed', -3, 7);
    assertEqual(JSON.stringify(a), JSON.stringify(b));
    if (a) {
      assert(a.x >= -3 * 128 + 16 && a.x < -3 * 128 + 112);
      assert(a.z >= 7 * 128 + 16 && a.z < 7 * 128 + 112);
    }
  });

  it('places a village house when its chunk is generated independently', () => {
    const generator = new TerrainGenerator(24681357);
    let site = null;
    for (let gz = -12; gz <= 12 && !site; gz++) {
      for (let gx = -12; gx <= 12 && !site; gx++) {
        const candidate = villageCandidateForCell(generator.seed, gx, gz);
        if (!candidate) continue;
        const valid = generator.validateVillageSite(candidate.x, candidate.z);
        if (valid) site = { ...candidate, ...valid };
      }
    }
    assert(site, 'test seed did not produce a suitable village site');
    const wx = site.x + 2, wz = site.z + 3;
    const cx = Math.floor(wx / 16), cz = Math.floor(wz / 16);
    const chunk = generator.generate(new Chunk(cx, cz));
    const lx = ((wx % 16) + 16) % 16, lz = ((wz % 16) + 16) % 16;
    assertEqual(chunk.getBlock(lx, site.y + 2, lz).block.id, 'mc:furnace');
  });
});
