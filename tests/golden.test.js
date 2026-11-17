import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { importWorld } from '../src/save/io.js';
import { DATA_VERSION } from '../src/save/migrate.js';

/**
 * Golden-save regression tests.
 *
 * This is the check that makes the project's central promise real: a world
 * written by ANY past version must still open on the current build. Everything
 * else about the save system is design intent -- this is the part that fails
 * the suite when the intent is violated.
 *
 * These files must never be regenerated. Their entire value comes from being
 * untouched artifacts of the version that produced them; re-recording one after
 * a break would "fix" the test by destroying the evidence. If a golden save
 * stops loading, the correct response is to fix the loader or write a
 * migration.
 */

const manifest = await fetch('./tests/saves/manifest.json').then((r) => r.json());

describe('golden saves: every past version still opens', () => {
  if (manifest.saves.length === 0) {
    it('(no golden saves recorded yet)', () => {});
  }

  for (const entry of manifest.saves) {
    it(`${entry.version} loads on the current build`, async () => {
      const response = await fetch(`./tests/saves/${entry.file}`);
      assert(response.ok, `could not fetch ${entry.file} (HTTP ${response.status})`);
      const bytes = new Uint8Array(await response.arrayBuffer());

      // A byte-length mismatch means the file was modified or corrupted in
      // transit -- worth catching separately from a parse failure, because the
      // causes and the fixes are completely different.
      assertEqual(bytes.length, entry.bytes, `${entry.file} size changed on disk`);

      const result = await importWorld(bytes);
      assertEqual(result.fromVersion, entry.dataVersion, 'recorded data version');
      assertEqual(result.toVersion, DATA_VERSION, 'did not migrate to current');
      assert(!result.tooNew, 'a golden save should never be newer than the build');
    });

    it(`${entry.version} preserves its world contents exactly`, async () => {
      const bytes = new Uint8Array(
        await fetch(`./tests/saves/${entry.file}`).then((r) => r.arrayBuffer()),
      );
      const result = await importWorld(bytes);

      assertEqual(result.save.level.name, entry.expect.worldName, 'world name');
      assertEqual(result.save.level.seed, entry.seed, 'seed');

      const dim = result.save.dimensions['mc:overworld'];
      assertEqual(dim.liveChunks.size, entry.expect.chunks, 'chunk count');

      for (const block of entry.expect.blocks ?? []) {
        const chunk = dim.liveChunks.get(`${block.x >> 4},${block.z >> 4}`);
        assert(chunk, `chunk for block at ${block.x},${block.y},${block.z} is missing`);
        // Compares the full blockstate string, so a lost or altered PROPERTY
        // fails here. Comparing bare block ids would silently accept a log
        // whose axis had been reset to its default.
        assertEqual(
          chunk.getBlock(block.x & 15, block.y, block.z & 15).stringId,
          block.state,
          `block at ${block.x},${block.y},${block.z}`,
        );
      }

      if (entry.expect.playerHasDamagedTool) {
        const player = Object.values(result.save.players)[0];
        const tool = (player.inventory ?? []).find(
          (s) => s.id === entry.expect.playerHasDamagedTool,
        );
        assert(tool, `${entry.expect.playerHasDamagedTool} missing from inventory`);
        assert(tool.damage > 0, 'tool durability was not preserved');
      }
    });

    it(`${entry.version} round-trips without data loss`, async () => {
      // Load, re-save, load again: the second load must match the first. This is
      // what catches a change that reads an old save correctly but writes
      // something subtly different back.
      const { serializeWorld } = await import('../src/save/io.js');
      const { encodeChunk } = await import('../src/save/format.js');

      const original = new Uint8Array(
        await fetch(`./tests/saves/${entry.file}`).then((r) => r.arrayBuffer()),
      );
      const first = await importWorld(original);

      const chunks = {};
      for (const [key, chunk] of first.save.dimensions['mc:overworld'].liveChunks) {
        chunks[key] = encodeChunk(chunk);
      }
      const rewritten = await serializeWorld({
        dataVersion: DATA_VERSION,
        level: first.save.level,
        players: first.save.players,
        dimensions: { 'mc:overworld': { chunks, entities: [], blockEntities: [] } },
      });

      const second = await importWorld(rewritten);
      const a = first.save.dimensions['mc:overworld'].liveChunks;
      const b = second.save.dimensions['mc:overworld'].liveChunks;
      assertEqual(b.size, a.size, 'chunk count changed across a round trip');

      for (const [key, chunkA] of a) {
        const chunkB = b.get(key);
        assert(chunkB, `chunk ${key} lost on re-save`);
        for (let y = -64; y < 120; y += 7) {
          for (const [x, z] of [[0, 0], [5, 9], [15, 15], [8, 3]]) {
            assertEqual(
              chunkB.getBlock(x, y, z).stringId,
              chunkA.getBlock(x, y, z).stringId,
              `chunk ${key} block ${x},${y},${z}`,
            );
          }
        }
      }
    });
  }
});
