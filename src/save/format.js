/**
 * The .mcw container format: encoding, decoding, and chunk serialization.
 *
 * Implements the layout specified in docs/SAVE_FORMAT.md. That document is the
 * contract; this file is the implementation of it, and where the two disagree
 * the document wins.
 *
 * THE TWO-STAGE DECODE
 *
 * Loading goes binary -> plain object tree -> live Chunk objects, rather than
 * straight to live objects. The middle stage exists so migrations can operate on
 * raw palette STRINGS before any BlockState is resolved. A migration renaming
 * `mc:grass` to `mc:short_grass` rewrites strings; if decoding resolved states
 * first, it would have to resolve `mc:grass` -- which no longer exists in the
 * registry -- before the migration that fixes it had a chance to run. The
 * intermediate form makes migrations both simpler and correct.
 *
 * WHY GZIP AND NOT RAW DEFLATE
 *
 * Gzip carries a CRC32 of the uncompressed data. Raw deflate is a few bytes
 * smaller and has no checksum. For a file holding a world someone may have spent
 * a hundred hours in, silent bit rot producing plausible-but-wrong blocks is far
 * worse than eighteen bytes of overhead. Corruption should announce itself.
 */

import { SAVE, CHUNK_SIZE, SECTION_VOLUME, MIN_Y } from '../core/constants.js';
import { chunkKey, parseChunkKey } from '../core/math.js';
import { BLOCKS } from '../world/block.js';
import { Chunk, Section, PalettedContainer, NibbleArray, GEN_STAGE } from '../world/chunk.js';
import { DATA_VERSION } from './migrate.js';

const MAGIC = SAVE.MAGIC;
const HEADER_BYTES = 20;
const FLAG_GZIP = 1 << 0;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ---------------------------------------------------------------------------
// Byte IO
// ---------------------------------------------------------------------------

/**
 * Growable little-endian byte writer.
 *
 * Endianness is specified explicitly on every call rather than dumping typed
 * array buffers directly. Every platform this runs on today is little-endian, so
 * the shortcut would work -- and would produce a file format whose correctness
 * depends on an assumption nothing checks and nothing documents.
 */
export class ByteWriter {
  constructor(initialCapacity = 4096) {
    this.buffer = new ArrayBuffer(initialCapacity);
    this.view = new DataView(this.buffer);
    this.bytes = new Uint8Array(this.buffer);
    this.offset = 0;
  }

  _ensure(extra) {
    const needed = this.offset + extra;
    if (needed <= this.buffer.byteLength) return;
    let capacity = this.buffer.byteLength * 2;
    while (capacity < needed) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.bytes.subarray(0, this.offset));
    this.buffer = grown.buffer;
    this.view = new DataView(this.buffer);
    this.bytes = grown;
  }

  u8(v)  { this._ensure(1); this.view.setUint8(this.offset, v); this.offset += 1; }
  u16(v) { this._ensure(2); this.view.setUint16(this.offset, v, true); this.offset += 2; }
  u32(v) { this._ensure(4); this.view.setUint32(this.offset, v, true); this.offset += 4; }
  i16(v) { this._ensure(2); this.view.setInt16(this.offset, v, true); this.offset += 2; }
  i32(v) { this._ensure(4); this.view.setInt32(this.offset, v, true); this.offset += 4; }

  raw(u8array) {
    this._ensure(u8array.length);
    this.bytes.set(u8array, this.offset);
    this.offset += u8array.length;
  }

  /** UTF-8 string with a u16 byte-length prefix. */
  string(str) {
    const encoded = textEncoder.encode(str);
    if (encoded.length > 0xffff) {
      throw new Error(`String too long for u16 length prefix: ${encoded.length} bytes`);
    }
    this.u16(encoded.length);
    this.raw(encoded);
  }

  finish() {
    return this.bytes.slice(0, this.offset);
  }
}

export class ByteReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 0;
  }

  _check(n) {
    if (this.offset + n > this.bytes.byteLength) {
      throw new Error(
        `Truncated save data: needed ${n} bytes at offset ${this.offset}, ` +
        `but only ${this.bytes.byteLength - this.offset} remain.`,
      );
    }
  }

  u8()  { this._check(1); const v = this.view.getUint8(this.offset); this.offset += 1; return v; }
  u16() { this._check(2); const v = this.view.getUint16(this.offset, true); this.offset += 2; return v; }
  u32() { this._check(4); const v = this.view.getUint32(this.offset, true); this.offset += 4; return v; }
  i16() { this._check(2); const v = this.view.getInt16(this.offset, true); this.offset += 2; return v; }
  i32() { this._check(4); const v = this.view.getInt32(this.offset, true); this.offset += 4; return v; }

  raw(n) {
    this._check(n);
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  string() {
    const len = this.u16();
    return textDecoder.decode(this.raw(len));
  }

  get remaining() {
    return this.bytes.byteLength - this.offset;
  }
}

// ---------------------------------------------------------------------------
// Compression
// ---------------------------------------------------------------------------

async function gzipCompress(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzipDecompress(bytes) {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (err) {
    // A gzip CRC failure lands here. Say what it means, because "invalid stream"
    // gives the player nothing to act on.
    throw new Error(
      `Save data is corrupt -- the compressed payload failed its integrity check. ` +
      `If a backup exists in saves/backups/, it is likely intact. (${err.message})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Chunk encoding
// ---------------------------------------------------------------------------

const LIGHT_SKY = 1 << 0;
const LIGHT_BLOCK = 1 << 1;

/** Serialize a live Chunk to bytes. Compacts palettes first to shrink output. */
export function encodeChunk(chunk) {
  chunk.compact();

  const w = new ByteWriter(8192);
  w.u32(DATA_VERSION);
  w.u8(chunk.generatedStage);

  const present = chunk.sections.filter(Boolean);
  w.u8(present.length);

  for (const section of present) {
    w.u8(section.index);
    writePalettedContainer(w, section.blocks, (state) => state.stringId);

    // Uniform light is extremely common -- fully dark caves, fully lit sky
    // sections -- so a flag byte avoids storing 2 KB of identical nibbles.
    let flags = 0;
    const skyUniformZero = section.skyLight.isUniform(0);
    const blockUniformZero = section.blockLight.isUniform(0);
    if (!skyUniformZero) flags |= LIGHT_SKY;
    if (!blockUniformZero) flags |= LIGHT_BLOCK;
    w.u8(flags);
    if (flags & LIGHT_SKY) w.raw(section.skyLight.data);
    if (flags & LIGHT_BLOCK) w.raw(section.blockLight.data);
  }

  for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) w.i16(chunk.heightmap[i]);
  writePalettedContainer(w, chunk.biomes, (id) => id);

  return w.finish();
}

/**
 * The paletted-container wire format, in one place.
 *
 * This shape was written out three times -- once here and twice open-coded inside
 * encodeChunkIntermediate, for sections and for biomes. It is a compatibility
 * contract: if one copy drifts from the others, saves silently stop round-tripping.
 *
 * `toStringId` converts a palette entry to its string form. The intermediate form
 * already holds strings and passes nothing.
 */
function writePaletteBlock(w, palette, bits, data, toStringId) {
  w.u16(palette.length);
  for (const value of palette) w.string(toStringId ? toStringId(value) : value);
  w.u8(bits);
  if (bits > 0) {
    w.u32(data.length);
    for (let i = 0; i < data.length; i++) w.u32(data[i]);
  }
}

function writePalettedContainer(w, container, toStringId) {
  writePaletteBlock(w, container.palette, container.bits, container.data, toStringId);
}

/**
 * Unpack bit-packed palette indices into `container`, the mirror of writePaletteBlock.
 *
 * `resolve(id)` maps a palette index to whatever the container stores -- a BlockState
 * for sections, a biome string for biomes -- which is the only thing that differed
 * between the two copies of this loop.
 *
 * Hot-ish: runs once per section per chunk load, so it stays a plain indexed loop.
 */
function unpackInto(container, size, bits, data, resolve, fallback) {
  const entriesPerWord = Math.floor(32 / bits);
  const mask = (1 << bits) - 1;
  for (let i = 0; i < size; i++) {
    const word = (i / entriesPerWord) | 0;
    const shift = (i - word * entriesPerWord) * bits;
    const id = (data[word] >>> shift) & mask;
    container.set(i, resolve(id) ?? fallback);
  }
}

/**
 * Decode chunk bytes to the intermediate object form.
 * Palette entries stay as raw strings so migrations can rewrite them.
 */
export function decodeChunkBinary(bytes) {
  const r = new ByteReader(bytes);
  const dataVersion = r.u32();
  const generatedStage = r.u8();
  const sectionCount = r.u8();

  const sections = [];
  for (let s = 0; s < sectionCount; s++) {
    const index = r.u8();
    const { palette, bits, data } = readPalettedContainer(r);
    const flags = r.u8();
    const skyLight = flags & LIGHT_SKY ? r.raw(SECTION_VOLUME >> 1).slice() : null;
    const blockLight = flags & LIGHT_BLOCK ? r.raw(SECTION_VOLUME >> 1).slice() : null;
    sections.push({ index, palette, bits, data, skyLight, blockLight });
  }

  const heightmap = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let i = 0; i < heightmap.length; i++) heightmap[i] = r.i16();

  const biomes = readPalettedContainer(r);

  return { dataVersion, generatedStage, sections, heightmap, biomes };
}

/**
 * Re-encode a chunk still in its intermediate (decoded, unmaterialized) form.
 *
 * Needed because a load-then-save cycle does not necessarily materialize: a
 * migration that only rewrites palette strings has no reason to pay for
 * building thousands of BlockStates just to throw them away. This also keeps
 * unknown blocks byte-identical on a round trip through a build that cannot
 * represent them -- guarantee 4 -- since their strings are never resolved at all.
 */
export function encodeChunkIntermediate(decoded) {
  const w = new ByteWriter(8192);
  w.u32(DATA_VERSION);
  w.u8(decoded.generatedStage);
  w.u8(decoded.sections.length);

  for (const section of decoded.sections) {
    w.u8(section.index);
    writePaletteBlock(w, section.palette, section.bits, section.data);

    let flags = 0;
    if (section.skyLight) flags |= LIGHT_SKY;
    if (section.blockLight) flags |= LIGHT_BLOCK;
    w.u8(flags);
    if (section.skyLight) w.raw(section.skyLight);
    if (section.blockLight) w.raw(section.blockLight);
  }

  for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) w.i16(decoded.heightmap[i]);

  writePaletteBlock(w, decoded.biomes.palette, decoded.biomes.bits, decoded.biomes.data);

  return w.finish();
}

/**
 * Accept a chunk in any of its three representations and produce bytes.
 * Callers should not have to care which stage a chunk happens to be in.
 */
function chunkToBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof Chunk) return encodeChunk(value);
  if (value && Array.isArray(value.sections)) return encodeChunkIntermediate(value);
  throw new Error(
    'Chunk value must be a live Chunk, a decoded intermediate object, or ' +
    'already-encoded bytes.',
  );
}

function readPalettedContainer(r) {
  const paletteLength = r.u16();
  const palette = new Array(paletteLength);
  for (let i = 0; i < paletteLength; i++) palette[i] = r.string();
  const bits = r.u8();
  let data = null;
  if (bits > 0) {
    const wordCount = r.u32();
    data = new Uint32Array(wordCount);
    for (let i = 0; i < wordCount; i++) data[i] = r.u32();
  }
  return { palette, bits, data };
}

/**
 * Build a live Chunk from the intermediate form, after migrations have run.
 *
 * Palette strings are resolved through BLOCKS.stateFromString, which is where
 * guarantee 4 takes effect: an ID this build does not know becomes a preserved
 * unknown state rather than an error or a silent conversion to air.
 */
export function materializeChunk(cx, cz, decoded) {
  const chunk = new Chunk(cx, cz);
  chunk.dataVersion = decoded.dataVersion;
  chunk.generatedStage = decoded.generatedStage;

  for (const raw of decoded.sections) {
    const section = new Section(raw.index);

    const states = raw.palette.map((str) => {
      const state = BLOCKS.stateFromString(str);
      if (state.isUnknown) chunk.hasUnknownBlocks = true;
      return state;
    });

    if (raw.bits === 0) {
      // Uniform section: one palette entry, no index data.
      section.blocks = new PalettedContainer(SECTION_VOLUME, states[0]);
    } else {
      const container = new PalettedContainer(SECTION_VOLUME, states[0]);
      unpackInto(container, SECTION_VOLUME, raw.bits, raw.data,
                 (id) => states[id], states[0]);
      section.blocks = container;
    }

    if (raw.skyLight) section.skyLight.data.set(raw.skyLight);
    if (raw.blockLight) section.blockLight.data.set(raw.blockLight);

    // The bulk path above bypasses setBlock(), so the non-air count must be
    // rebuilt or the mesher will treat populated sections as empty.
    section.recountNonAir();

    chunk.sections[raw.index] = section;
  }

  chunk.heightmap.set(decoded.heightmap);

  const biomes = decoded.biomes;
  if (biomes.bits === 0) {
    chunk.biomes = new PalettedContainer(chunk.biomes.size, biomes.palette[0]);
  } else {
    const container = new PalettedContainer(chunk.biomes.size, biomes.palette[0]);
    unpackInto(container, container.size, biomes.bits, biomes.data,
               (id) => biomes.palette[id], biomes.palette[0]);
    chunk.biomes = container;
  }

  chunk.dirty = false;
  return chunk;
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

/**
 * Serialize a whole save to a .mcw byte array.
 *
 * @param {object} save intermediate-form save object
 * @returns {Promise<Uint8Array>}
 */
export async function writeMcw(save) {
  /** @type {Array<{n: string, o: number, l: number}>} */
  const index = [];
  const body = new ByteWriter(1 << 16);

  const addEntry = (name, bytes) => {
    index.push({ n: name, o: body.offset, l: bytes.length });
    body.raw(bytes);
  };

  const addJson = (name, value) => addEntry(name, textEncoder.encode(JSON.stringify(value)));

  addJson('level.json', save.level ?? {});

  for (const [uuid, player] of Object.entries(save.players ?? {})) {
    addJson(`players/${uuid}.json`, player);
  }

  for (const [dimId, dim] of Object.entries(save.dimensions ?? {})) {
    // Dimension IDs contain a colon, which is legal inside our entry names but
    // would be awkward if these ever became real filesystem paths. Substituted
    // for a slash, and reversed on read.
    const dimPath = dimId.replace(':', '/');
    // `chunks` may hold live Chunks, decoded intermediates, or raw bytes
    // depending on whether this save came from gameplay or from a file that was
    // just loaded. chunkToBytes normalizes all three.
    const source = dim.chunks ?? dim.encodedChunks ?? {};
    const pairs = source instanceof Map ? source.entries() : Object.entries(source);
    for (const [key, chunk] of pairs) {
      addEntry(`${dimPath}/chunks/${key}.bin`, chunkToBytes(chunk));
    }
    if (dim.entities?.length) addJson(`${dimPath}/entities.json`, dim.entities);
    if (dim.blockEntities?.length) addJson(`${dimPath}/blockEntities.json`, dim.blockEntities);
  }

  // Empty objects are skipped rather than written.
  //
  // This is what makes writing idempotent. readMcw defaults these to {} when
  // absent, so without the emptiness check a load-then-save cycle would append
  // an `advancements.json` entry containing `{}` that the original never had --
  // and the file would differ from itself across a round trip, which would make
  // byte-comparison in the golden-save tests useless.
  const nonEmpty = (o) => o && Object.keys(o).length > 0;
  if (nonEmpty(save.stats)) addJson('stats.json', save.stats);
  if (nonEmpty(save.advancements)) addJson('advancements.json', save.advancements);

  // Index goes last, so entries can stream in without knowing its size upfront.
  const indexOffset = body.offset;
  body.raw(textEncoder.encode(JSON.stringify(index)));

  const compressed = await gzipCompress(body.finish());

  const out = new ByteWriter(HEADER_BYTES + compressed.length);
  out.raw(textEncoder.encode(MAGIC));
  out.u16(SAVE.FORMAT_VERSION);
  out.u32(save.dataVersion ?? DATA_VERSION);
  out.u16(FLAG_GZIP);
  out.u32(indexOffset);
  out.raw(compressed);
  return out.finish();
}

export class NotAnMcwFileError extends Error {
  constructor() {
    super(
      'This is not a .mcw world file. The file does not begin with the expected ' +
      'MCWORLD signature.',
    );
    this.name = 'NotAnMcwFileError';
  }
}

export class UnsupportedFormatError extends Error {
  constructor(found, supported) {
    super(
      `This world uses container format version ${found}, but this build only ` +
      `understands up to ${supported}. The container structure itself changed, ` +
      `not just its contents -- update the game to open this world.`,
    );
    this.name = 'UnsupportedFormatError';
    this.found = found;
  }
}

/**
 * Parse a .mcw byte array to the intermediate save form.
 * Chunks are returned decoded but not materialized, so migrations run first.
 *
 * @returns {Promise<object>}
 */
export async function readMcw(bytes) {
  if (bytes.length < HEADER_BYTES) throw new NotAnMcwFileError();

  const header = new ByteReader(bytes);
  const magic = textDecoder.decode(header.raw(MAGIC.length));
  if (magic !== MAGIC) throw new NotAnMcwFileError();

  const formatVersion = header.u16();
  if (formatVersion > SAVE.FORMAT_VERSION) {
    throw new UnsupportedFormatError(formatVersion, SAVE.FORMAT_VERSION);
  }

  const dataVersion = header.u32();
  const flags = header.u16();
  const indexOffset = header.u32();

  const payloadBytes = bytes.subarray(HEADER_BYTES);
  const payload = flags & FLAG_GZIP ? await gzipDecompress(payloadBytes) : payloadBytes;

  if (indexOffset > payload.length) {
    throw new Error(
      `Save index offset ${indexOffset} is past the end of the ${payload.length}-byte ` +
      `payload. The file is truncated or corrupt.`,
    );
  }

  const index = JSON.parse(textDecoder.decode(payload.subarray(indexOffset)));
  const entry = (name) => {
    const e = index.find((x) => x.n === name);
    return e ? payload.subarray(e.o, e.o + e.l) : null;
  };
  const json = (name) => {
    const raw = entry(name);
    return raw ? JSON.parse(textDecoder.decode(raw)) : null;
  };

  const save = {
    dataVersion,
    formatVersion,
    level: json('level.json') ?? {},
    players: {},
    dimensions: {},
    stats: json('stats.json') ?? {},
    advancements: json('advancements.json') ?? {},
  };

  for (const e of index) {
    if (e.n.startsWith('players/') && e.n.endsWith('.json')) {
      const uuid = e.n.slice('players/'.length, -'.json'.length);
      save.players[uuid] = JSON.parse(textDecoder.decode(payload.subarray(e.o, e.o + e.l)));
      continue;
    }

    const chunkMatch = e.n.match(/^(.+)\/chunks\/(-?\d+),(-?\d+)\.bin$/);
    if (chunkMatch) {
      const dimId = chunkMatch[1].replace('/', ':');
      const cx = parseInt(chunkMatch[2], 10);
      const cz = parseInt(chunkMatch[3], 10);
      const dim = (save.dimensions[dimId] ??= { chunks: {}, entities: [], blockEntities: [] });
      dim.chunks[chunkKey(cx, cz)] = decodeChunkBinary(payload.subarray(e.o, e.o + e.l));
      continue;
    }

    const entMatch = e.n.match(/^(.+)\/(entities|blockEntities)\.json$/);
    if (entMatch) {
      const dimId = entMatch[1].replace('/', ':');
      const dim = (save.dimensions[dimId] ??= { chunks: {}, entities: [], blockEntities: [] });
      dim[entMatch[2]] = JSON.parse(textDecoder.decode(payload.subarray(e.o, e.o + e.l)));
    }
  }

  return save;
}

/**
 * Encode every live chunk in a world into the intermediate form ready for
 * writeMcw. Kept separate so callers can build a save object incrementally.
 */
export function encodeDimension(chunks) {
  const encodedChunks = {};
  for (const [key, chunk] of chunks) {
    encodedChunks[key] = encodeChunk(chunk);
  }
  return encodedChunks;
}

export { GEN_STAGE, parseChunkKey, chunkKey, MIN_Y };
