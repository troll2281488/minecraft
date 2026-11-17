/**
 * Chunk storage: paletted sections with packed bit arrays.
 *
 * A chunk is 16 x 384 x 16 blocks, split into 24 sections of 16^3. Storing one
 * 32-bit state ID per block would cost 24 KB per section and 576 KB per chunk;
 * at render distance 10 that is roughly 250 MB of block data alone, before any
 * mesh exists. The palette encoding below reduces the common cases by one to two
 * orders of magnitude.
 *
 * THREE STORAGE TIERS, chosen automatically per section:
 *
 *   bits = 0   Uniform. The whole section is one state. No index array at all.
 *              This is most of a world -- every section above the surface is
 *              solid air and every section deep underground is solid stone.
 *              Cost: one palette entry.
 *
 *   bits = n   Paletted. n = ceil(log2(paletteLength)), so a section containing
 *              stone, dirt, and grass uses 2 bits per block: 1 KB, versus 16 KB
 *              unpacked.
 *
 *   The tier is re-evaluated on every set() that grows the palette, and grows
 *   only -- a section never shrinks its bit width, because a block being placed
 *   and immediately removed would otherwise repack the whole section twice.
 *
 * BIT PACKING CHOICE
 *
 * Entries never span word boundaries. With 32-bit words and, say, 3 bits per
 * entry, 10 entries fit per word and 2 bits go unused. That wastes up to 3% of
 * an already-small array, and in exchange every read and write is a shift and a
 * mask with no carry handling. Minecraft made the same trade in 1.16 for the
 * same reason. This is part of the on-disk format and is documented in
 * docs/SAVE_FORMAT.md.
 */

import {
  CHUNK_SIZE, SECTION_HEIGHT, SECTION_VOLUME, SECTION_COUNT,
  MIN_Y, MAX_Y, MAX_LIGHT, BIOMES_PER_SECTION,
} from '../core/constants.js';
import { sectionIndex, yToSectionIndex, yToSectionLocal } from '../core/math.js';
import { BLOCKS, AIR } from './block.js';

/** How far generation has progressed. Never regenerate a chunk past stage 0. */
export const GEN_STAGE = Object.freeze({
  EMPTY: 0,
  TERRAIN: 1,
  FEATURES: 2,
  LIT: 3,
  FULL: 4,
});

// ---------------------------------------------------------------------------
// PalettedContainer
// ---------------------------------------------------------------------------

export class PalettedContainer {
  /**
   * @param {number} size number of entries (4096 for blocks, 64 for biomes)
   * @param {*} fill initial value for every entry
   */
  constructor(size, fill) {
    this.size = size;
    this.palette = [fill];
    this.paletteIndex = new Map([[fill, 0]]);
    this.bits = 0;
    this.data = null;          // null while uniform
    this.entriesPerWord = 0;
  }

  /** Minimum bits needed to index `n` palette entries. */
  static bitsFor(n) {
    if (n <= 1) return 0;
    let bits = 1;
    while (1 << bits < n) bits++;
    return bits;
  }

  get isUniform() {
    return this.bits === 0;
  }

  get(index) {
    if (this.bits === 0) return this.palette[0];
    const word = (index / this.entriesPerWord) | 0;
    const slot = index - word * this.entriesPerWord;
    const shift = slot * this.bits;
    const mask = (1 << this.bits) - 1;
    return this.palette[(this.data[word] >>> shift) & mask];
  }

  set(index, value) {
    let id = this.paletteIndex.get(value);
    if (id === undefined) {
      id = this.palette.length;
      this.palette.push(value);
      this.paletteIndex.set(value, id);
      const needed = PalettedContainer.bitsFor(this.palette.length);
      if (needed > this.bits) this._resize(needed);
    }
    if (this.bits === 0) return; // still uniform: nothing to store
    const word = (index / this.entriesPerWord) | 0;
    const slot = index - word * this.entriesPerWord;
    const shift = slot * this.bits;
    const mask = ((1 << this.bits) - 1) << shift;
    this.data[word] = ((this.data[word] & ~mask) | (id << shift)) >>> 0;
  }

  /** Grow to `newBits` per entry, rewriting existing entries. */
  _resize(newBits) {
    const oldBits = this.bits;
    const oldData = this.data;
    const oldPerWord = this.entriesPerWord;

    this.bits = newBits;
    this.entriesPerWord = Math.floor(32 / newBits);
    const wordCount = Math.ceil(this.size / this.entriesPerWord);
    this.data = new Uint32Array(wordCount);

    if (oldBits === 0) {
      // Was uniform: every entry is palette index 0, which is already the zero
      // value of the freshly allocated array. Nothing to copy.
      return;
    }

    const oldMask = (1 << oldBits) - 1;
    for (let i = 0; i < this.size; i++) {
      const oldWord = (i / oldPerWord) | 0;
      const oldShift = (i - oldWord * oldPerWord) * oldBits;
      const id = (oldData[oldWord] >>> oldShift) & oldMask;
      if (id === 0) continue; // target is zero-filled already
      const word = (i / this.entriesPerWord) | 0;
      const shift = (i - word * this.entriesPerWord) * newBits;
      this.data[word] = (this.data[word] | (id << shift)) >>> 0;
    }
  }

  /**
   * Drop palette entries no longer referenced and shrink the bit width.
   *
   * Not called on every set -- that would repack constantly during terrain
   * generation. It runs once when a chunk is written out, where the cost is
   * paid to make the saved file smaller.
   */
  compact() {
    if (this.bits === 0) return;

    const used = new Set();
    for (let i = 0; i < this.size; i++) used.add(this.get(i));

    if (used.size === this.palette.length) {
      // Nothing unreferenced; the bit width may still be reducible if the
      // palette was pre-grown, but in practice it will not be. Bail cheaply.
      const needed = PalettedContainer.bitsFor(this.palette.length);
      if (needed === this.bits) return;
    }

    const values = [...used];
    const rebuilt = new PalettedContainer(this.size, values[0]);
    for (let i = 0; i < this.size; i++) rebuilt.set(i, this.get(i));

    this.palette = rebuilt.palette;
    this.paletteIndex = rebuilt.paletteIndex;
    this.bits = rebuilt.bits;
    this.data = rebuilt.data;
    this.entriesPerWord = rebuilt.entriesPerWord;
  }

  /** Bytes of index data, excluding the palette. For diagnostics. */
  get byteLength() {
    return this.data ? this.data.byteLength : 0;
  }
}

// ---------------------------------------------------------------------------
// Nibble arrays (light)
// ---------------------------------------------------------------------------

/** 4 bits per entry, 4096 entries in 2048 bytes. Light is always 0..15. */
export class NibbleArray {
  constructor(size = SECTION_VOLUME, fill = 0) {
    this.size = size;
    this.data = new Uint8Array(size >> 1);
    if (fill !== 0) this.fill(fill);
  }

  get(index) {
    const byte = this.data[index >> 1];
    return (index & 1) === 0 ? byte & 0x0f : byte >>> 4;
  }

  set(index, value) {
    const v = value & 0x0f;
    const i = index >> 1;
    if ((index & 1) === 0) {
      this.data[i] = (this.data[i] & 0xf0) | v;
    } else {
      this.data[i] = (this.data[i] & 0x0f) | (v << 4);
    }
  }

  fill(value) {
    const v = value & 0x0f;
    this.data.fill((v << 4) | v);
  }

  /** True when every entry is the same value -- lets uniform light skip storage. */
  isUniform(value) {
    const v = value & 0x0f;
    const packed = (v << 4) | v;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] !== packed) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export class Section {
  /** @param {number} index 0..23 */
  constructor(index) {
    this.index = index;
    this.yOffset = MIN_Y + index * SECTION_HEIGHT;
    this.blocks = new PalettedContainer(SECTION_VOLUME, AIR.defaultState);
    this.skyLight = new NibbleArray(SECTION_VOLUME, 0);
    this.blockLight = new NibbleArray(SECTION_VOLUME, 0);
    /** Count of non-air blocks, so empty sections can be skipped by the mesher. */
    this.nonAirCount = 0;
  }

  getBlock(x, y, z) {
    return this.blocks.get(sectionIndex(x, y, z));
  }

  setBlock(x, y, z, state) {
    const i = sectionIndex(x, y, z);
    const previous = this.blocks.get(i);
    if (previous === state) return false;

    const wasAir = previous.block === AIR;
    const isAir = state.block === AIR;
    if (wasAir && !isAir) this.nonAirCount++;
    else if (!wasAir && isAir) this.nonAirCount--;

    this.blocks.set(i, state);
    return true;
  }

  /**
   * Recount non-air blocks by scanning the whole section.
   *
   * setBlock() maintains nonAirCount incrementally, but bulk paths -- loading a
   * section from a save, or terrain generation writing directly into the
   * container -- bypass it. Those callers must call this afterwards, or the
   * mesher will skip sections it believes are empty and the chunk renders as a
   * hole in the world.
   */
  recountNonAir() {
    let n = 0;
    for (let i = 0; i < SECTION_VOLUME; i++) {
      if (this.blocks.get(i).block !== AIR) n++;
    }
    this.nonAirCount = n;
    return n;
  }

  get isEmpty() {
    return this.nonAirCount === 0;
  }
}

// ---------------------------------------------------------------------------
// Chunk
// ---------------------------------------------------------------------------

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    /** @type {(Section|null)[]} allocated lazily -- most sections stay null */
    this.sections = new Array(SECTION_COUNT).fill(null);
    this.biomes = new PalettedContainer(BIOMES_PER_SECTION * SECTION_COUNT, 'mc:plains');
    /** Highest non-air block per column, for lighting and spawn checks. */
    this.heightmap = new Int16Array(CHUNK_SIZE * CHUNK_SIZE).fill(MIN_Y - 1);
    this.generatedStage = GEN_STAGE.EMPTY;
    /**
     * The DATA_VERSION this chunk's contents were last written with. Per-chunk
     * rather than per-world so a large save can migrate lazily, one chunk at a
     * time as each loads, instead of rewriting gigabytes on open.
     */
    this.dataVersion = 0;
    this.dirty = false;
    /** Set when loaded from a save containing states this build cannot resolve. */
    this.hasUnknownBlocks = false;
  }

  /** Allocate a section on first write. Reading a null section yields air. */
  section(index, create = false) {
    if (index < 0 || index >= SECTION_COUNT) return null;
    let s = this.sections[index];
    if (!s && create) {
      s = new Section(index);
      this.sections[index] = s;
    }
    return s;
  }

  /** @param {number} x 0..15 @param {number} y world Y @param {number} z 0..15 */
  getBlock(x, y, z) {
    const si = yToSectionIndex(y);
    if (si === -1) return AIR.defaultState;
    const s = this.sections[si];
    if (!s) return AIR.defaultState;
    return s.getBlock(x, yToSectionLocal(y), z);
  }

  setBlock(x, y, z, state) {
    const si = yToSectionIndex(y);
    if (si === -1) return false;

    // Do not allocate a section just to write air into it.
    if (!this.sections[si] && state.block === AIR) return false;

    const s = this.section(si, true);
    const changed = s.setBlock(x, yToSectionLocal(y), z, state);
    if (changed) {
      this.dirty = true;
      this._updateHeightmap(x, y, z, state);
    }
    return changed;
  }

  _updateHeightmap(x, y, z, state) {
    const i = z * CHUNK_SIZE + x;
    const current = this.heightmap[i];
    if (state.block !== AIR) {
      if (y > current) this.heightmap[i] = y;
    } else if (y === current) {
      // The top block was removed; walk down for the next non-air block.
      let ny = y - 1;
      while (ny >= MIN_Y && this.getBlock(x, ny, z).block === AIR) ny--;
      this.heightmap[i] = ny;
    }
  }

  getHeight(x, z) {
    return this.heightmap[z * CHUNK_SIZE + x];
  }

  /** Recompute the heightmap from scratch, after bulk generation. */
  rebuildHeightmap() {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        let y = MAX_Y - 1;   // MAX_Y is the exclusive ceiling; was re-derived here
        while (y >= MIN_Y && this.getBlock(x, y, z).block === AIR) y--;
        this.heightmap[z * CHUNK_SIZE + x] = y;
      }
    }
  }

  getBiome(x, y, z) {
    return this.biomes.get(this._biomeIndex(x, y, z));
  }

  setBiome(x, y, z, biomeId) {
    this.biomes.set(this._biomeIndex(x, y, z), biomeId);
    this.dirty = true;
  }

  /** Biomes are stored at 4x4x4 resolution, so coordinates are divided by 4. */
  _biomeIndex(x, y, z) {
    const by = Math.max(0, Math.min(SECTION_COUNT * 4 - 1, ((y - MIN_Y) >> 2)));
    return (by << 4) | ((z >> 2) << 2) | (x >> 2);
  }

  /** Prepare for writing: drop unreferenced palette entries across all sections. */
  compact() {
    for (const s of this.sections) {
      if (!s) continue;
      // A section emptied by mining is dropped rather than stored as 4096 air
      // entries -- but ONLY if it also carries no light. An all-air section can
      // still hold meaningful light values (a torch shining into open space, or
      // full sky light above the surface), and dropping the section would
      // discard them silently. Storage is not worth losing data over.
      if (s.isEmpty && s.skyLight.isUniform(0) && s.blockLight.isUniform(0)) {
        this.sections[s.index] = null;
        continue;
      }
      s.blocks.compact();
    }
    this.biomes.compact();
  }

  get sectionCount() {
    return this.sections.reduce((n, s) => n + (s ? 1 : 0), 0);
  }

  /** Approximate in-memory footprint, for the F3 screen. */
  get byteLength() {
    let bytes = this.heightmap.byteLength + this.biomes.byteLength;
    for (const s of this.sections) {
      if (!s) continue;
      bytes += s.blocks.byteLength + s.skyLight.data.byteLength + s.blockLight.data.byteLength;
    }
    return bytes;
  }
}

// Re-exported so save code can reach the registry without a second import.
export { BLOCKS, MAX_LIGHT };
