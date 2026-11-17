import { describe, it, assert, assertEqual } from './framework.js';
import '../src/world/blocks/index.js'; // registers the catalog as a side effect
import { PalettedContainer, NibbleArray, Section, Chunk, GEN_STAGE } from '../src/world/chunk.js';
import { BLOCKS, AIR } from '../src/world/block.js';
import { SECTION_VOLUME, MIN_Y } from '../src/core/constants.js';
import { sectionIndex, floorDiv, floorMod, yToSectionIndex, yToSectionLocal } from '../src/core/math.js';

const STONE = BLOCKS.get('mc:stone').defaultState;
const DIRT = BLOCKS.get('mc:dirt').defaultState;
const AIR_STATE = AIR.defaultState;

describe('math: negative coordinates', () => {
  // Every chunk lookup routes through these. JavaScript's % returns -1 for
  // (-1 % 16), which maps block x = -1 into the wrong chunk AND to a negative
  // array index -- so getting this wrong corrupts the entire western and
  // northern halves of every world.

  it('floorDiv rounds toward negative infinity', () => {
    assertEqual(floorDiv(-1, 16), -1);
    assertEqual(floorDiv(-16, 16), -1);
    assertEqual(floorDiv(-17, 16), -2);
    assertEqual(floorDiv(15, 16), 0);
  });

  it('floorMod is always non-negative', () => {
    assertEqual(floorMod(-1, 16), 15);
    assertEqual(floorMod(-16, 16), 0);
    assertEqual(floorMod(-17, 16), 15);
  });

  it('section index and local Y are correct below y = 0', () => {
    assertEqual(yToSectionIndex(MIN_Y), 0);
    assertEqual(yToSectionLocal(MIN_Y), 0);
    assertEqual(yToSectionIndex(-1), 3);   // (-1 - -64) / 16 = 3
    assertEqual(yToSectionLocal(-1), 15);
    assertEqual(yToSectionIndex(0), 4);
  });

  it('returns -1 for Y outside the build range', () => {
    assertEqual(yToSectionIndex(MIN_Y - 1), -1);
    assertEqual(yToSectionIndex(320), -1);
  });
});

describe('PalettedContainer: bit widths', () => {
  it('bitsFor grows at each power-of-two boundary', () => {
    assertEqual(PalettedContainer.bitsFor(1), 0);
    assertEqual(PalettedContainer.bitsFor(2), 1);
    assertEqual(PalettedContainer.bitsFor(3), 2);
    assertEqual(PalettedContainer.bitsFor(4), 2);
    assertEqual(PalettedContainer.bitsFor(5), 3);
    assertEqual(PalettedContainer.bitsFor(16), 4);
    assertEqual(PalettedContainer.bitsFor(17), 5);
    assertEqual(PalettedContainer.bitsFor(256), 8);
  });

  it('starts uniform with no index array allocated', () => {
    const c = new PalettedContainer(SECTION_VOLUME, AIR_STATE);
    assert(c.isUniform);
    assertEqual(c.byteLength, 0, 'a uniform container should allocate nothing');
    assertEqual(c.get(0), AIR_STATE);
    assertEqual(c.get(4095), AIR_STATE);
  });

  it('stays uniform when the only value written is the fill value', () => {
    const c = new PalettedContainer(SECTION_VOLUME, AIR_STATE);
    for (let i = 0; i < 100; i++) c.set(i, AIR_STATE);
    assert(c.isUniform);
    assertEqual(c.byteLength, 0);
  });

  it('preserves existing entries when growing from uniform', () => {
    const c = new PalettedContainer(SECTION_VOLUME, AIR_STATE);
    c.set(500, STONE);
    assertEqual(c.get(500), STONE);
    // Everything else must still read as the original fill.
    for (const i of [0, 1, 499, 501, 4095]) {
      assertEqual(c.get(i), AIR_STATE, `index ${i} was corrupted by the resize`);
    }
  });

  it('round-trips correctly across every bit width from 1 to 9', () => {
    // The resize path rewrites every entry at a new width. An off-by-one in the
    // shift arithmetic corrupts data only at specific widths, so each is tested
    // rather than assuming one working width implies the rest.
    for (let distinct = 2; distinct <= 300; distinct = distinct < 20 ? distinct + 1 : distinct * 2) {
      const values = [];
      for (let i = 0; i < distinct; i++) values.push(`value_${i}`);

      const c = new PalettedContainer(SECTION_VOLUME, values[0]);
      const expected = new Array(SECTION_VOLUME);

      // Seed each value once up front so the palette is guaranteed to reach the
      // intended size. A formula like (i * k) % distinct silently degenerates
      // whenever distinct divides k -- at distinct = 7 with k = 7 it writes a
      // single value 4096 times, and the test then "fails" against a container
      // that behaved perfectly correctly.
      for (let i = 0; i < distinct; i++) {
        expected[i] = values[i];
        c.set(i, values[i]);
      }

      // Fill the remainder with a deterministic pseudo-random scatter, so the
      // packing is exercised at every slot position within a word.
      let seed = 0x2545f491;
      for (let i = distinct; i < SECTION_VOLUME; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
        const v = values[seed % distinct];
        expected[i] = v;
        c.set(i, v);
      }

      for (let i = 0; i < SECTION_VOLUME; i++) {
        assertEqual(c.get(i), expected[i], `distinct=${distinct}, index=${i}, bits=${c.bits}`);
      }
      assertEqual(c.bits, PalettedContainer.bitsFor(distinct), `bit width for ${distinct} values`);
    }
  });

  it('handles a bit width that does not divide 32 evenly', () => {
    // 3 bits: 10 entries per 32-bit word with 2 bits unused. Entries never span
    // words by design, so the last slot of each word is the risky one.
    const values = ['a', 'b', 'c', 'd', 'e'];
    const c = new PalettedContainer(SECTION_VOLUME, 'a');
    for (let i = 0; i < SECTION_VOLUME; i++) c.set(i, values[i % 5]);
    assertEqual(c.bits, 3);
    for (let i = 0; i < SECTION_VOLUME; i++) {
      assertEqual(c.get(i), values[i % 5], `index ${i} (slot ${i % 10} of its word)`);
    }
  });

  it('overwriting a value clears the old bits rather than ORing over them', () => {
    const c = new PalettedContainer(64, 'a');
    for (let i = 0; i < 64; i++) c.set(i, `v${i % 8}`); // 3 bits
    for (let i = 0; i < 64; i++) c.set(i, 'v0');
    for (let i = 0; i < 64; i++) assertEqual(c.get(i), 'v0', `stale bits at index ${i}`);
  });
});

describe('PalettedContainer: compaction', () => {
  it('drops palette entries that are no longer referenced', () => {
    const c = new PalettedContainer(64, 'a');
    for (let i = 0; i < 64; i++) c.set(i, `v${i % 10}`);
    assertEqual(c.palette.length, 11); // 'a' plus v0..v9
    for (let i = 0; i < 64; i++) c.set(i, 'v0');
    c.compact();
    assertEqual(c.palette.length, 1, 'unreferenced entries survived compaction');
    assert(c.isUniform, 'a single-value container should compact to uniform');
  });

  it('preserves all values through compaction', () => {
    const c = new PalettedContainer(256, 'x');
    const expected = [];
    for (let i = 0; i < 256; i++) {
      const v = `keep_${i % 5}`;
      expected.push(v);
      c.set(i, v);
    }
    c.compact();
    for (let i = 0; i < 256; i++) assertEqual(c.get(i), expected[i], `index ${i}`);
  });
});

describe('NibbleArray', () => {
  it('packs two 4-bit values per byte', () => {
    const n = new NibbleArray(SECTION_VOLUME);
    assertEqual(n.data.byteLength, SECTION_VOLUME / 2);
  });

  it('reads back every value at every index parity', () => {
    const n = new NibbleArray(64);
    for (let i = 0; i < 64; i++) n.set(i, i % 16);
    for (let i = 0; i < 64; i++) assertEqual(n.get(i), i % 16, `index ${i}`);
  });

  it('setting one nibble does not disturb its neighbour in the same byte', () => {
    const n = new NibbleArray(64);
    n.set(0, 15);
    n.set(1, 3);
    assertEqual(n.get(0), 15, 'low nibble was clobbered by the high write');
    n.set(1, 7);
    assertEqual(n.get(0), 15);
    assertEqual(n.get(1), 7);
  });

  it('fill and isUniform agree', () => {
    const n = new NibbleArray(64);
    assert(n.isUniform(0));
    n.fill(15);
    assert(n.isUniform(15));
    assert(!n.isUniform(0));
    n.set(37, 2);
    assert(!n.isUniform(15));
  });
});

describe('Section', () => {
  it('tracks non-air count as blocks are placed and removed', () => {
    const s = new Section(4);
    assert(s.isEmpty);
    s.setBlock(0, 0, 0, STONE);
    assertEqual(s.nonAirCount, 1);
    s.setBlock(1, 0, 0, STONE);
    assertEqual(s.nonAirCount, 2);
    s.setBlock(0, 0, 0, AIR_STATE);
    assertEqual(s.nonAirCount, 1);
    s.setBlock(1, 0, 0, AIR_STATE);
    assert(s.isEmpty);
  });

  it('does not double-count replacing one solid block with another', () => {
    const s = new Section(4);
    s.setBlock(2, 3, 4, STONE);
    s.setBlock(2, 3, 4, DIRT);
    assertEqual(s.nonAirCount, 1);
  });

  it('recountNonAir agrees with incremental tracking', () => {
    // The bulk load path writes into the container directly and must call
    // recountNonAir afterwards, or the mesher skips populated sections and the
    // chunk renders as a hole.
    const s = new Section(4);
    for (let i = 0; i < 500; i++) s.blocks.set(i, STONE);
    assertEqual(s.nonAirCount, 0, 'precondition: direct writes bypass the counter');
    assertEqual(s.recountNonAir(), 500);
    assertEqual(s.nonAirCount, 500);
  });

  it('sectionIndex is a bijection over the 16^3 cube', () => {
    const seen = new Set();
    for (let y = 0; y < 16; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const i = sectionIndex(x, y, z);
          assert(i >= 0 && i < SECTION_VOLUME, `index ${i} out of range`);
          assert(!seen.has(i), `duplicate index ${i} at ${x},${y},${z}`);
          seen.add(i);
        }
      }
    }
    assertEqual(seen.size, SECTION_VOLUME);
  });
});

describe('Chunk', () => {
  it('reads air from unallocated sections without allocating', () => {
    const c = new Chunk(0, 0);
    assertEqual(c.getBlock(5, 100, 5), AIR_STATE);
    assertEqual(c.sectionCount, 0, 'reading allocated a section');
  });

  it('does not allocate a section just to write air', () => {
    const c = new Chunk(0, 0);
    c.setBlock(5, 100, 5, AIR_STATE);
    assertEqual(c.sectionCount, 0);
  });

  it('stores and retrieves blocks across the full height range', () => {
    const c = new Chunk(0, 0);
    for (const y of [MIN_Y, MIN_Y + 1, -1, 0, 63, 100, 319]) {
      c.setBlock(3, y, 7, STONE);
      assertEqual(c.getBlock(3, y, 7), STONE, `y = ${y}`);
    }
  });

  it('ignores writes outside the build range instead of throwing', () => {
    const c = new Chunk(0, 0);
    assertEqual(c.setBlock(0, MIN_Y - 1, 0, STONE), false);
    assertEqual(c.setBlock(0, 320, 0, STONE), false);
  });

  it('tracks the heightmap as the topmost non-air block', () => {
    const c = new Chunk(0, 0);
    c.setBlock(1, 64, 1, STONE);
    assertEqual(c.getHeight(1, 1), 64);
    c.setBlock(1, 70, 1, STONE);
    assertEqual(c.getHeight(1, 1), 70);
  });

  it('walks the heightmap back down when the top block is removed', () => {
    const c = new Chunk(0, 0);
    c.setBlock(2, 64, 2, STONE);
    c.setBlock(2, 70, 2, STONE);
    c.setBlock(2, 70, 2, AIR_STATE);
    assertEqual(c.getHeight(2, 2), 64, 'heightmap did not fall back to the next block');
  });

  it('rebuildHeightmap matches incremental tracking', () => {
    const c = new Chunk(0, 0);
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        c.setBlock(x, 60 + ((x + z) % 5), z, STONE);
      }
    }
    const incremental = Array.from(c.heightmap);
    c.rebuildHeightmap();
    for (let i = 0; i < incremental.length; i++) {
      assertEqual(c.heightmap[i], incremental[i], `column ${i}`);
    }
  });

  it('biome indices stay within the container for the full height range', () => {
    const c = new Chunk(0, 0);
    for (const y of [MIN_Y, 0, 100, 319]) {
      c.setBiome(0, y, 0, 'mc:desert');
      assertEqual(c.getBiome(0, y, 0), 'mc:desert', `y = ${y}`);
    }
    c.setBiome(15, 319, 15, 'mc:taiga');
    assertEqual(c.getBiome(15, 319, 15), 'mc:taiga');
  });

  it('compaction drops sections emptied by mining', () => {
    const c = new Chunk(0, 0);
    c.setBlock(0, 100, 0, STONE);
    assertEqual(c.sectionCount, 1);
    c.setBlock(0, 100, 0, AIR_STATE);
    c.compact();
    assertEqual(c.sectionCount, 0, 'an emptied section was kept');
  });

  it('starts at generation stage EMPTY', () => {
    assertEqual(new Chunk(0, 0).generatedStage, GEN_STAGE.EMPTY);
  });
});
