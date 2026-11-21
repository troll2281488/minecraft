/**
 * The world: chunk lifecycle, block access, and the meshing view.
 *
 * Chunks move through a small pipeline, and the point of keeping it explicit is
 * that every stage is bounded per frame. A voxel game that loads chunks
 * synchronously stutters constantly; one that loads them without a budget
 * stutters in bigger, less frequent chunks. Neither is acceptable.
 *
 *   requested -> generating (in a worker) -> loaded -> meshed
 *
 * Generation runs in a worker pool. Meshing runs on the main thread under a
 * millisecond budget, because correct meshing needs the eight neighbouring
 * chunks and shipping those to a worker means either ~250 KB of copying per
 * chunk or moving storage into SharedArrayBuffer. That refactor is worth doing,
 * but not before there is a playable game to measure it against.
 */

import {
  CHUNK_SIZE, MIN_Y, MAX_Y, SECTION_COUNT, SECTION_HEIGHT, WORKER, MAX_LIGHT,
} from '../core/constants.js';
import { chunkKey, parseChunkKey, blockToChunk, blockToLocal,
         yToSectionIndex, yToSectionLocal, sectionIndex } from '../core/math.js';
import { BLOCKS, AIR } from './block.js';
import { Chunk, GEN_STAGE } from './chunk.js';
import { computeChunkLight } from './lighting.js';
import { decodeChunkBinary } from '../save/format.js';
import { materializeChunk } from '../save/format.js';
import { refreshWallConnectionsInChunk } from '../game/wall_updates.js';

// Build ceiling comes from constants.js (MAX_Y). It used to be re-derived here,
// and in five other places, from MIN_Y + SECTION_COUNT * SECTION_HEIGHT.

// Only the mesher reads the block's opaqueCube flag for a neighbour sample.
const MISSING_CHUNK_STATE = Object.freeze({
  runtimeId: 0,
  block: Object.freeze({ opaqueCube: true }),
});

export class World {
  /**
   * @param {object} options
   * @param {string|number|bigint} options.seed
   * @param {Uint16Array} options.textureTable  6 texture layers per blockstate
   */
  constructor({ seed, textureTable, dimension = 'overworld' }) {
    this.seed = seed;
    this.dimension = dimension;
    this.textureTable = textureTable;

    /** @type {Map<string, Chunk>} */
    this.chunks = new Map();
    /** @type {Set<string>} chunks requested from a worker but not yet returned */
    this.pending = new Set();
    /** @type {Set<string>} chunks whose geometry is stale */
    this.dirtyMeshes = new Set();

    this.time = 0;              // ticks since world creation
    this.generatedCount = 0;

    this._workers = [];
    this._nextWorker = 0;
    this._onChunkLoaded = null;

    this._startWorkers();
  }

  // -- Workers ------------------------------------------------------------

  _startWorkers() {
    const count = WORKER.poolSize();
    for (let i = 0; i < count; i++) {
      const worker = new Worker(
        new URL('./gen/gen_worker.js', import.meta.url),
        { type: 'module' },
      );
      worker.onmessage = (e) => this._onWorkerMessage(e.data);
      worker.onerror = (e) => {
        console.error('[world] terrain worker failed:', e.message);
      };
      worker.postMessage({ type: 'init', seed: String(this.seed), dimension: this.dimension });
      this._workers.push(worker);
    }
  }

  _onWorkerMessage(msg) {
    if (msg.type === 'ready') return;

    const key = chunkKey(msg.cx, msg.cz);
    this.pending.delete(key);

    if (msg.type === 'error') {
      console.error(`[world] failed to generate chunk ${key}: ${msg.error}`);
      return;
    }

    const chunk = materializeChunk(msg.cx, msg.cz, decodeChunkBinary(msg.bytes));
    chunk.generatedStage = GEN_STAGE.FULL;
    this.chunks.set(key, chunk);
    refreshWallConnectionsInChunk(this, chunk);
    this.generatedCount++;

    // The new chunk changes what its neighbours' edge faces should show, so
    // their meshes are stale too. Skipping this leaves visible walls between
    // chunks where the shared faces were culled against nothing.
    this.markDirty(msg.cx, msg.cz);
    this.markDirty(msg.cx - 1, msg.cz);
    this.markDirty(msg.cx + 1, msg.cz);
    this.markDirty(msg.cx, msg.cz - 1);
    this.markDirty(msg.cx, msg.cz + 1);

    this._onChunkLoaded?.(chunk);
  }

  dispose() {
    for (const worker of this._workers) worker.terminate();
    this._workers.length = 0;
  }

  // -- Chunk access -------------------------------------------------------

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz)) ?? null;
  }

  hasChunk(cx, cz) {
    return this.chunks.has(chunkKey(cx, cz));
  }

  /** Insert an already-built chunk, e.g. one loaded from a save. */
  adoptChunk(chunk) {
    this.chunks.set(chunkKey(chunk.cx, chunk.cz), chunk);
    refreshWallConnectionsInChunk(this, chunk);
    this.markDirty(chunk.cx, chunk.cz);
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      this.markDirty(chunk.cx + dx, chunk.cz + dz);
    }
  }

  markDirty(cx, cz) {
    const key = chunkKey(cx, cz);
    if (this.chunks.has(key)) this.dirtyMeshes.add(key);
  }

  /**
   * Request every chunk within `radius` of a centre, nearest first.
   *
   * Nearest-first matters more than it looks: it is the difference between the
   * ground under the player appearing immediately and the player falling
   * through a hole while the horizon loads.
   */
  requestAround(centerX, centerZ, radius, maxRequests = 8) {
    const cx0 = blockToChunk(Math.floor(centerX));
    const cz0 = blockToChunk(Math.floor(centerZ));

    const wanted = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distance = Math.hypot(dx, dz);
        if (distance > radius) continue;
        const cx = cx0 + dx;
        const cz = cz0 + dz;
        const key = chunkKey(cx, cz);
        if (this.chunks.has(key) || this.pending.has(key)) continue;
        wanted.push({ cx, cz, distance });
      }
    }

    wanted.sort((a, b) => a.distance - b.distance);

    let issued = 0;
    for (const { cx, cz } of wanted) {
      if (issued >= maxRequests) break;
      this._requestChunk(cx, cz);
      issued++;
    }
    return issued;
  }

  _requestChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    this.pending.add(key);
    const worker = this._workers[this._nextWorker];
    this._nextWorker = (this._nextWorker + 1) % this._workers.length;
    worker.postMessage({ type: 'generate', cx, cz });
  }

  /** Drop chunks beyond `radius`, returning those that had unsaved changes. */
  unloadBeyond(centerX, centerZ, radius) {
    const cx0 = blockToChunk(Math.floor(centerX));
    const cz0 = blockToChunk(Math.floor(centerZ));
    const evicted = [];

    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - cx0;
      const dz = chunk.cz - cz0;
      if (Math.hypot(dx, dz) <= radius) continue;
      if (chunk.dirty) evicted.push(chunk);
      this.chunks.delete(key);
      this.dirtyMeshes.delete(key);
    }
    return evicted;
  }

  // -- Blocks -------------------------------------------------------------

  /** @returns {import('./block.js').BlockState} air for anything unloaded */
  getBlock(wx, wy, wz) {
    if (wy < MIN_Y || wy >= MAX_Y) return AIR.defaultState;
    const chunk = this.getChunk(blockToChunk(wx), blockToChunk(wz));
    if (!chunk) return AIR.defaultState;
    return chunk.getBlock(blockToLocal(wx), wy, blockToLocal(wz));
  }

  /**
   * Place or remove a block and schedule the consequences.
   * @returns {boolean} whether anything changed
   */
  setBlock(wx, wy, wz, state, { relight = true } = {}) {
    if (wy < MIN_Y || wy >= MAX_Y) return false;
    const cx = blockToChunk(wx);
    const cz = blockToChunk(wz);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;

    const lx = blockToLocal(wx);
    const lz = blockToLocal(wz);
    if (!chunk.setBlock(lx, wy, lz, state)) return false;

    if (relight) computeChunkLight(chunk);
    this.markDirty(cx, cz);

    // A block on a chunk seam changes the neighbour's culling and its lighting.
    if (lx === 0) this.markDirtyAndRelight(cx - 1, cz, relight);
    if (lx === CHUNK_SIZE - 1) this.markDirtyAndRelight(cx + 1, cz, relight);
    if (lz === 0) this.markDirtyAndRelight(cx, cz - 1, relight);
    if (lz === CHUNK_SIZE - 1) this.markDirtyAndRelight(cx, cz + 1, relight);

    return true;
  }

  markDirtyAndRelight(cx, cz, relight) {
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;
    if (relight) computeChunkLight(chunk);
    this.markDirty(cx, cz);
  }

  getLight(wx, wy, wz) {
    if (wy >= MAX_Y) return { sky: MAX_LIGHT, block: 0 };
    if (wy < MIN_Y) return { sky: 0, block: 0 };
    const chunk = this.getChunk(blockToChunk(wx), blockToChunk(wz));
    if (!chunk) return { sky: MAX_LIGHT, block: 0 };

    const si = yToSectionIndex(wy);
    const section = chunk.sections[si];
    if (!section) {
      // No section allocated means empty space: lit if above the surface.
      const height = chunk.getHeight(blockToLocal(wx), blockToLocal(wz));
      return { sky: wy > height ? MAX_LIGHT : 0, block: 0 };
    }
    const i = sectionIndex(blockToLocal(wx), yToSectionLocal(wy), blockToLocal(wz));
    return { sky: section.skyLight.get(i), block: section.blockLight.get(i) };
  }

  /** Highest non-air block in a column, or MIN_Y - 1 if the column is empty. */
  getHeight(wx, wz) {
    const chunk = this.getChunk(blockToChunk(wx), blockToChunk(wz));
    if (!chunk) return MIN_Y - 1;
    return chunk.getHeight(blockToLocal(wx), blockToLocal(wz));
  }

  /** A dry, collision-free surface position in an already generated chunk. */
  findSpawn(wx = 0, wz = 0, maxRadius = 192) {
    const isClear = (x, y, z) => {
      const block = this.getBlock(x, y, z).block;
      return block.id !== 'mc:water' && !block.solid;
    };

    // Search only generated columns. getHeight() returns MIN_Y - 1 for an
    // unloaded chunk; treating that as a candidate used to fall through to
    // the old y=80 fallback, which could land the player in an ocean.
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          const x = wx + dx;
          const z = wz + dz;
          const cx = blockToChunk(x), cz = blockToChunk(z);
          if (!this.hasChunk(cx, cz)) continue;

          let y = this.getHeight(x, z);
          // Ocean columns have water at the heightmap top; skip them quickly
          // rather than scanning the entire water column on every spawn retry.
          const surfaceId = this.getBlock(x, y, z).block.id;
          if (surfaceId === 'mc:water' || surfaceId === 'mc:ice' ||
              surfaceId === 'mc:packed_ice' || surfaceId === 'mc:frosted_ice') continue;
          // Heightmaps can include plants or other non-solid surface blocks.
          while (y >= MIN_Y) {
            const ground = this.getBlock(x, y, z).block;
            if (ground.solid && ground.id !== 'mc:water') {
              if (isClear(x, y + 1, z) && isClear(x, y + 2, z)) {
                return { x: x + 0.5, y: y + 1, z: z + 0.5 };
              }
            }
            y--;
          }
        }
      }
    }
    return null;
  }

  // -- Meshing view -------------------------------------------------------

  /**
   * A block/light accessor for one chunk that reads one block beyond its
   * borders, so faces on a chunk seam are culled against the real neighbour
   * rather than against nothing.
   */
  viewFor(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const world = this;

    return {
      getState(lx, ly, lz) {
        // Inside this chunk is the overwhelmingly common case, so it is checked
        // first and skips the chunk-map lookup entirely.
        if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
          if (ly < MIN_Y || ly >= MAX_Y) return AIR.defaultState;
          return chunk.getBlock(lx, ly, lz);
        }
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const neighborCx = blockToChunk(wx);
        const neighborCz = blockToChunk(wz);
        // An unloaded neighbour is a temporary solid boundary, not air.
        // Treating it as air emits a face on BOTH sides when the adjacent
        // chunk arrives. Those coplanar faces z-fight and look like rapid
        // white flashes until both chunks happen to be remeshed. The opaque
        // sentinel suppresses that temporary seam; arrival of the neighbour
        // dirties both chunks and replaces the boundary with real geometry.
        if (!world.hasChunk(neighborCx, neighborCz)) return MISSING_CHUNK_STATE;
        return world.getBlock(wx, ly, wz);
      },

      /**
       * Light as a packed integer: sky in bits 0..3, block light in bits 4..7.
       *
       * Packed rather than an {sky, block} object because the mesher calls this
       * 27 times per block. Returning an object allocated hundreds of thousands
       * of short-lived objects per chunk, and the resulting GC pressure was the
       * dominant cost of meshing -- larger than the meshing itself.
       */
      lightAt(lx, ly, lz) {
        if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
          if (ly >= MAX_Y) return MAX_LIGHT;
          if (ly < MIN_Y) return 0;
          const si = yToSectionIndex(ly);
          const section = chunk.sections[si];
          if (!section) {
            return ly > chunk.getHeight(lx, lz) ? MAX_LIGHT : 0;
          }
          const i = sectionIndex(lx, yToSectionLocal(ly), lz);
          return section.skyLight.get(i) | (section.blockLight.get(i) << 4);
        }
        const outside = world.getLight(baseX + lx, ly, baseZ + lz);
        return outside.sky | (outside.block << 4);
      },

      sectionHasBlocks(si) {
        const section = chunk.sections[si];
        return !!section && !section.isEmpty;
      },

      textureLayer(runtimeId, face) {
        return world.textureTable[runtimeId * 6 + face];
      },
    };
  }

  get chunkCount() {
    return this.chunks.size;
  }

  get pendingCount() {
    return this.pending.size;
  }
}

export { chunkKey, parseChunkKey };
