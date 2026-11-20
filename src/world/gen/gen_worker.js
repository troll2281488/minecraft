/**
 * Terrain generation worker.
 *
 * Generation is the expensive half of loading a chunk -- tens of thousands of
 * noise samples per column -- and it needs no knowledge of neighbouring chunks,
 * which makes it the natural thing to move off the main thread.
 *
 * Chunks come back as encoded .mcw chunk bytes rather than a bespoke message
 * format. That reuses encodeChunk/decodeChunkBinary, which are already covered
 * by the save tests, instead of introducing a second serialization path that
 * would need its own tests and could drift from the first.
 */

import '../blocks/index.js'; // register the catalog in this worker's module scope
import { TerrainGenerator } from './terrain.js';
import { computeChunkLight } from '../lighting.js';
import { Chunk } from '../chunk.js';
import { encodeChunk } from '../../save/format.js';

let generator = null;

self.onmessage = (event) => {
  const msg = event.data;

  if (msg.type === 'init') {
    generator = new TerrainGenerator(msg.seed, msg.dimension || 'overworld');
    self.postMessage({ type: 'ready' });
    return;
  }

  if (msg.type === 'generate') {
    if (!generator) {
      self.postMessage({ type: 'error', cx: msg.cx, cz: msg.cz, error: 'worker not initialized' });
      return;
    }
    try {
      const chunk = new Chunk(msg.cx, msg.cz);
      generator.generate(chunk);
      computeChunkLight(chunk);
      const bytes = encodeChunk(chunk);
      // Transferred, not copied -- the worker has no further use for it.
      self.postMessage({ type: 'chunk', cx: msg.cx, cz: msg.cz, bytes }, [bytes.buffer]);
    } catch (err) {
      self.postMessage({
        type: 'error', cx: msg.cx, cz: msg.cz,
        error: `${err.name}: ${err.message}`,
      });
    }
  }
};
