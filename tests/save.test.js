import '../src/world/blocks/index.js'; // registers the catalog as a side effect
import {
  describe, it, assert, assertEqual, assertDeepEqual, assertBytesEqual, assertThrows,
} from './framework.js';
import {
  writeMcw, readMcw, encodeChunk, decodeChunkBinary, materializeChunk,
  encodeChunkIntermediate, NotAnMcwFileError, UnsupportedFormatError,
  ByteWriter, ByteReader,
} from '../src/save/format.js';
import { DATA_VERSION, MIGRATIONS, validateChain, migrate, needsMigration } from '../src/save/migrate.js';
import { importWorld, buildSave } from '../src/save/io.js';
import { Chunk, GEN_STAGE } from '../src/world/chunk.js';
import { BLOCKS, AIR } from '../src/world/block.js';
import { chunkKey } from '../src/core/math.js';
import { SAVE } from '../src/core/constants.js';

const STONE = BLOCKS.get('mc:stone').defaultState;
const DIRT = BLOCKS.get('mc:dirt').defaultState;
const STAIRS = BLOCKS.get('mc:oak_stairs').defaultState.with('facing', 'west');

/** A chunk with enough variety that a serialization bug has somewhere to show. */
function makeTestChunk(cx = 0, cz = 0) {
  const chunk = new Chunk(cx, cz);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = -64; y < -60; y++) chunk.setBlock(x, y, z, STONE);
      chunk.setBlock(x, 64, z, DIRT);
    }
  }
  chunk.setBlock(3, 65, 3, STAIRS);          // multi-property state
  chunk.setBlock(8, 200, 8, STONE);          // a distant, sparse section
  chunk.setBiome(0, 64, 0, 'mc:forest');
  chunk.generatedStage = GEN_STAGE.FULL;
  chunk.section(4, true).blockLight.set(0, 14);
  return chunk;
}

function makeTestSave() {
  const chunks = new Map();
  chunks.set(chunkKey(0, 0), makeTestChunk(0, 0));
  chunks.set(chunkKey(-1, 2), makeTestChunk(-1, 2));

  return buildSave(
    {
      name: 'Test World',
      seed: '12345',
      generatorVersion: 1,
      gamemode: 'survival',
      time: 6000,
      spawn: { x: 0, y: 70, z: 0 },
    },
    {
      'player-uuid-1': {
        pos: { x: 0.5, y: 70, z: 0.5 },
        health: 20,
        food: 18,
        inventory: [{ id: 'mc:stone', count: 42 }],
      },
    },
    { 'mc:overworld': { chunks, entities: [], blockEntities: [] } },
  );
}

// ---------------------------------------------------------------------------

describe('save: migration chain (guarantee 3)', () => {
  it('the committed chain is well-formed', () => {
    validateChain();
  });

  it('DATA_VERSION matches the highest migration', () => {
    // This is the check that makes forgetting a migration a build failure
    // rather than a corrupted world discovered a year later.
    if (MIGRATIONS.length === 0) {
      assertEqual(DATA_VERSION, 1, 'with no migrations, DATA_VERSION must be 1');
    } else {
      assertEqual(DATA_VERSION, MIGRATIONS[MIGRATIONS.length - 1].to);
    }
  });

  it('migrations are contiguous from 2 upward with no gaps', () => {
    MIGRATIONS.forEach((m, i) => {
      assertEqual(m.to, i + 2, `MIGRATIONS[${i}] targets the wrong version`);
      assert(typeof m.apply === 'function', `MIGRATIONS[${i}] has no apply()`);
      assert(!!m.note, `MIGRATIONS[${i}] has no note`);
    });
  });

  it('a current save needs no migration', () => {
    assert(!needsMigration(DATA_VERSION));
  });

  it('migrate() reports what it did rather than working silently', () => {
    const report = migrate({ dataVersion: DATA_VERSION });
    assertEqual(report.from, DATA_VERSION);
    assertEqual(report.to, DATA_VERSION);
    assertEqual(report.applied.length, 0);
    assertEqual(report.tooNew, false);
  });

  it('flags a save from a newer build instead of mangling it', () => {
    const report = migrate({ dataVersion: DATA_VERSION + 5 });
    assert(report.tooNew, 'a newer save was not flagged');
    assertEqual(report.from, DATA_VERSION + 5);
  });
});

describe('save: byte IO', () => {
  it('round-trips every integer width', () => {
    const w = new ByteWriter(8);
    w.u8(255); w.u16(65535); w.u32(4294967295); w.i16(-32768); w.i32(-2147483648);
    const r = new ByteReader(w.finish());
    assertEqual(r.u8(), 255);
    assertEqual(r.u16(), 65535);
    assertEqual(r.u32(), 4294967295);
    assertEqual(r.i16(), -32768);
    assertEqual(r.i32(), -2147483648);
  });

  it('round-trips non-ASCII strings', () => {
    const w = new ByteWriter();
    w.string('mc:stone');
    w.string('日本語のブロック');
    w.string('');
    const r = new ByteReader(w.finish());
    assertEqual(r.string(), 'mc:stone');
    assertEqual(r.string(), '日本語のブロック');
    assertEqual(r.string(), '');
  });

  it('grows past its initial capacity without corrupting earlier writes', () => {
    const w = new ByteWriter(4);
    for (let i = 0; i < 1000; i++) w.u32(i);
    const r = new ByteReader(w.finish());
    for (let i = 0; i < 1000; i++) assertEqual(r.u32(), i, `value ${i}`);
  });

  it('reports truncation rather than reading past the end', () => {
    const r = new ByteReader(new Uint8Array(2));
    assertThrows(() => r.u32());
  });
});

describe('save: chunk serialization', () => {
  it('round-trips every block in a chunk', () => {
    const original = makeTestChunk();
    const restored = materializeChunk(0, 0, decodeChunkBinary(encodeChunk(original)));

    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (const y of [-64, -63, -61, 64, 65, 200]) {
          assertEqual(
            restored.getBlock(x, y, z).stringId,
            original.getBlock(x, y, z).stringId,
            `block at ${x},${y},${z}`,
          );
        }
      }
    }
  });

  it('preserves multi-property states exactly', () => {
    const original = makeTestChunk();
    const restored = materializeChunk(0, 0, decodeChunkBinary(encodeChunk(original)));
    const state = restored.getBlock(3, 65, 3);
    assertEqual(state.stringId, STAIRS.stringId);
    assertEqual(state.get('facing'), 'west');
  });

  it('preserves the heightmap, generation stage, biomes, and light', () => {
    const original = makeTestChunk();
    const restored = materializeChunk(0, 0, decodeChunkBinary(encodeChunk(original)));
    assertEqual(restored.generatedStage, GEN_STAGE.FULL);
    assertEqual(restored.getHeight(0, 0), original.getHeight(0, 0));
    assertEqual(restored.getBiome(0, 64, 0), 'mc:forest');
    assertEqual(restored.section(4).blockLight.get(0), 14);
  });

  it('restores the non-air count so the mesher does not skip the chunk', () => {
    // A section whose nonAirCount was left at 0 by the bulk load path is treated
    // as empty and never meshed -- the chunk renders as a hole in the world.
    //
    // The invariant is that the restored count AGREES with a fresh recount, not
    // that it is non-zero: a section holding only light and no blocks is
    // legitimately empty, and is retained precisely so its light is not lost.
    const original = makeTestChunk();
    const restored = materializeChunk(0, 0, decodeChunkBinary(encodeChunk(original)));

    let populated = 0;
    for (const section of restored.sections) {
      if (!section) continue;
      const tracked = section.nonAirCount;
      assertEqual(section.recountNonAir(), tracked, `section ${section.index} count mismatch`);
      if (tracked > 0) populated++;
    }
    assert(populated >= 3, `expected several populated sections, found ${populated}`);
  });

  it('keeps an all-air section that still carries light', () => {
    // Guards the compaction rule directly: dropping a blockless section would
    // silently discard a torch's light shining into open space.
    const chunk = new Chunk(0, 0);
    chunk.setBlock(0, 64, 0, STONE);
    chunk.section(4, true).blockLight.set(0, 12); // section 4 has no blocks

    const restored = materializeChunk(0, 0, decodeChunkBinary(encodeChunk(chunk)));
    assert(restored.section(4) !== null, 'a light-bearing section was dropped on save');
    assertEqual(restored.section(4).blockLight.get(0), 12);
  });

  it('still drops a section that is both blockless and unlit', () => {
    const chunk = new Chunk(0, 0);
    chunk.setBlock(0, 64, 0, STONE);
    chunk.setBlock(0, 64, 0, AIR.defaultState); // section 8 now empty and dark
    const restored = materializeChunk(0, 0, decodeChunkBinary(encodeChunk(chunk)));
    assertEqual(restored.sectionCount, 0, 'an empty, unlit section was kept');
  });

  it('encoding is deterministic, so identical worlds produce identical bytes', () => {
    // Without this, comparing saves byte-for-byte would be meaningless and the
    // golden-save regression tests could not detect a real change.
    assertBytesEqual(encodeChunk(makeTestChunk()), encodeChunk(makeTestChunk()));
  });

  it('re-encoding the intermediate form is byte-identical to the original', () => {
    const bytes = encodeChunk(makeTestChunk());
    assertBytesEqual(encodeChunkIntermediate(decodeChunkBinary(bytes)), bytes);
  });
});

describe('save: unknown blocks survive a round trip (guarantee 4)', () => {
  const FUTURE = 'mc:sculk_catalyst[bloom=false]';

  it('preserves an unknown block through encode and decode', () => {
    const chunk = new Chunk(0, 0);
    chunk.setBlock(1, 64, 1, BLOCKS.stateFromString(FUTURE));
    const restored = materializeChunk(0, 0, decodeChunkBinary(encodeChunk(chunk)));
    assertEqual(restored.getBlock(1, 64, 1).stringId, FUTURE);
    assert(restored.hasUnknownBlocks, 'the chunk was not flagged as containing unknown blocks');
  });

  it('writes an unknown block back byte-identically', () => {
    // This is the actual promise: open a newer world in an older build, save,
    // and lose nothing. If this test fails, that promise is broken.
    const chunk = new Chunk(0, 0);
    chunk.setBlock(1, 64, 1, BLOCKS.stateFromString(FUTURE));
    chunk.setBlock(2, 64, 1, STONE);

    const first = encodeChunk(chunk);
    const second = encodeChunk(materializeChunk(0, 0, decodeChunkBinary(first)));
    assertBytesEqual(second, first);
  });

  it('keeps unknown blocks alongside known ones in the same section', () => {
    const chunk = new Chunk(0, 0);
    chunk.setBlock(0, 64, 0, STONE);
    chunk.setBlock(1, 64, 0, BLOCKS.stateFromString('mc:unknown_a'));
    chunk.setBlock(2, 64, 0, DIRT);
    chunk.setBlock(3, 64, 0, BLOCKS.stateFromString('mc:unknown_b[x=1]'));

    const restored = materializeChunk(0, 0, decodeChunkBinary(encodeChunk(chunk)));
    assertEqual(restored.getBlock(0, 64, 0).stringId, 'mc:stone');
    assertEqual(restored.getBlock(1, 64, 0).stringId, 'mc:unknown_a');
    assertEqual(restored.getBlock(2, 64, 0).stringId, 'mc:dirt');
    assertEqual(restored.getBlock(3, 64, 0).stringId, 'mc:unknown_b[x=1]');
  });
});

describe('save: .mcw container', () => {
  it('round-trips a whole world', async () => {
    const save = makeTestSave();
    const bytes = await writeMcw(save);
    const restored = await readMcw(bytes);

    assertEqual(restored.level.name, 'Test World');
    assertEqual(restored.level.seed, '12345');
    assertEqual(restored.dataVersion, DATA_VERSION);
    assertEqual(Object.keys(restored.dimensions).length, 1);
    assertEqual(Object.keys(restored.dimensions['mc:overworld'].chunks).length, 2);
  });

  it('preserves player data including inventory', async () => {
    const restored = await readMcw(await writeMcw(makeTestSave()));
    const player = restored.players['player-uuid-1'];
    assertEqual(player.health, 20);
    assertEqual(player.food, 18);
    assertEqual(player.inventory[0].id, 'mc:stone');
    assertEqual(player.inventory[0].count, 42);
  });

  it('preserves negative chunk coordinates', async () => {
    // The chunk key regex has to accept a leading minus on both coordinates.
    // Getting this wrong silently drops three quarters of every world.
    const restored = await readMcw(await writeMcw(makeTestSave()));
    const chunks = restored.dimensions['mc:overworld'].chunks;
    assert(chunkKey(-1, 2) in chunks, `missing chunk -1,2; have ${Object.keys(chunks)}`);
  });

  it('writes the magic signature and format version', async () => {
    const bytes = await writeMcw(makeTestSave());
    assertEqual(new TextDecoder().decode(bytes.subarray(0, 8)), SAVE.MAGIC);
    assertEqual(new DataView(bytes.buffer, bytes.byteOffset).getUint16(8, true), SAVE.FORMAT_VERSION);
  });

  it('compresses -- a mostly-uniform world is far smaller than its raw size', async () => {
    const bytes = await writeMcw(makeTestSave());
    // Two chunks of largely repeated terrain. Uncompressed this would be tens of
    // kilobytes; if it is not dramatically smaller, compression silently failed.
    assert(bytes.length < 8000, `save was ${bytes.length} bytes, expected well under 8000`);
  });

  it('survives a full write / read / write cycle unchanged', async () => {
    const first = await writeMcw(makeTestSave());
    const second = await writeMcw(await readMcw(first));
    assertBytesEqual(second, first);
  });
});

describe('buildSave: live chunks and pre-encoded chunks agree', () => {
  // The running world hands buildSave live Chunk objects; the export path reads
  // already-encoded bytes back out of storage and has nothing to encode. Both
  // must produce the same save, or an exported world differs from a saved one.

  function levelAndPlayers() {
    return [{ name: 'W', seed: '1', generatorVersion: 1, time: 0 }, {}];
  }

  it('produces byte-identical files from either chunk form', async () => {
    const live = new Map([[chunkKey(0, 0), makeTestChunk(0, 0)]]);
    const encoded = { [chunkKey(0, 0)]: encodeChunk(makeTestChunk(0, 0)) };

    const [level, players] = levelAndPlayers();
    const fromLive = buildSave(level, players,
      { 'mc:overworld': { chunks: live, entities: [], blockEntities: [] } });
    const fromEncoded = buildSave(level, players,
      { 'mc:overworld': { encodedChunks: encoded } });

    assertBytesEqual(await writeMcw(fromEncoded), await writeMcw(fromLive));
  });

  it('stamps the envelope on the pre-encoded path too', () => {
    const [level, players] = levelAndPlayers();
    const save = buildSave(level, players,
      { 'mc:overworld': { encodedChunks: { [chunkKey(0, 0)]: encodeChunk(makeTestChunk()) } } });

    assertEqual(save.dataVersion, DATA_VERSION);
    assertEqual(save.level.lastPlayedWith, DATA_VERSION);
    assertDeepEqual(save.dimensions['mc:overworld'].entities, []);
    assertDeepEqual(save.dimensions['mc:overworld'].blockEntities, []);
  });

  it('a dimension with neither chunk form yields no chunks rather than throwing', () => {
    const [level, players] = levelAndPlayers();
    const save = buildSave(level, players, { 'mc:overworld': {} });
    assertDeepEqual(save.dimensions['mc:overworld'].chunks, {});
  });
});

describe('save: rejecting bad input', () => {
  it('rejects a file that is not a .mcw', async () => {
    const notASave = new TextEncoder().encode('this is a text file, not a world save at all');
    await assertThrows(() => readMcw(notASave), 'NotAnMcwFileError');
  });

  it('rejects a file too short to hold a header', async () => {
    await assertThrows(() => readMcw(new Uint8Array(4)), 'NotAnMcwFileError');
  });

  it('rejects a container format version it does not understand', async () => {
    const bytes = await writeMcw(makeTestSave());
    new DataView(bytes.buffer, bytes.byteOffset).setUint16(8, SAVE.FORMAT_VERSION + 1, true);
    await assertThrows(() => readMcw(bytes), 'UnsupportedFormatError');
  });

  it('detects corruption instead of loading plausible-but-wrong blocks', async () => {
    // This is why the payload is gzip rather than raw deflate: gzip carries a
    // CRC32, so a flipped bit announces itself rather than quietly turning
    // someone's build into garbage.
    const bytes = await writeMcw(makeTestSave());
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    await assertThrows(() => readMcw(bytes));
  });

  it('detects a truncated file', async () => {
    const bytes = await writeMcw(makeTestSave());
    await assertThrows(() => readMcw(bytes.subarray(0, bytes.length - 40)));
  });
});

describe('save: import pipeline', () => {
  it('imports a world and materializes its chunks', async () => {
    const result = await importWorld(await writeMcw(makeTestSave()));
    assertEqual(result.fromVersion, DATA_VERSION);
    assertEqual(result.toVersion, DATA_VERSION);
    assertEqual(result.migrationsApplied.length, 0);
    assertEqual(result.tooNew, false);

    const live = result.save.dimensions['mc:overworld'].liveChunks;
    assertEqual(live.size, 2);
    assertEqual(live.get(chunkKey(0, 0)).getBlock(3, 65, 3).stringId, STAIRS.stringId);
  });

  it('produces a summary that states what happened', async () => {
    const result = await importWorld(await writeMcw(makeTestSave()));
    assert(result.summary.includes('Test World'), 'summary omits the world name');
    assert(result.summary.includes('2 chunks'), `summary omits chunk count: ${result.summary}`);
  });

  it('takes no backup when nothing needs migrating', async () => {
    const result = await importWorld(await writeMcw(makeTestSave()));
    assertEqual(result.backup, null);
  });

  it('opens a save from a newer build and reports it', async () => {
    const bytes = await writeMcw(makeTestSave());
    // Forge a header claiming a future data version.
    new DataView(bytes.buffer, bytes.byteOffset).setUint32(10, DATA_VERSION + 3, true);
    const result = await importWorld(bytes);
    assert(result.tooNew, 'a newer save was not flagged');
    assert(result.summary.includes('NEWER'), 'the summary does not warn about the version');
    assertEqual(result.save.dimensions['mc:overworld'].liveChunks.size, 2,
      'a newer save should still open, not fail');
  });

  it('counts chunks containing unknown blocks', async () => {
    const chunks = new Map();
    const chunk = makeTestChunk();
    chunk.setBlock(5, 65, 5, BLOCKS.stateFromString('mc:from_the_future'));
    chunks.set(chunkKey(0, 0), chunk);
    const save = buildSave({ name: 'Future' }, {},
      { 'mc:overworld': { chunks, entities: [], blockEntities: [] } });

    const result = await importWorld(await writeMcw(save));
    assertEqual(result.unknownBlockCount, 1);
    assert(result.summary.includes('unknown to this build'));
  });
});
