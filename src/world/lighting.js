/**
 * Light propagation.
 *
 * Two independent 0-15 channels, exactly as in Minecraft:
 *
 *   SKY LIGHT   starts at 15 in any column open to the sky and falls off as it
 *               spreads sideways under overhangs. Crucially it does NOT decay
 *               going straight down through open air -- a shaft to the surface
 *               stays fully lit all the way down, which is why a 1x1 hole lights
 *               a deep room.
 *
 *   BLOCK LIGHT radiates from emitters (torches at 14) and decays by one per
 *               block in every direction including downward.
 *
 * The renderer takes max(skyLight * daylight, blockLight), so a torch-lit cave
 * stays lit at midnight while the surface goes dark.
 *
 * SCOPE FOR PHASE 1
 *
 * Light is computed per chunk, treating anything outside as fully lit sky above
 * the heightmap and dark below it. That is exact for the common case and
 * slightly wrong at chunk borders next to a tall overhang in the neighbour --
 * a subtle seam in a cave wall, not a visible error in normal play. The
 * incremental cross-chunk engine is Phase 3, where block updates need to
 * re-light neighbours anyway.
 */

import {
  CHUNK_SIZE, SECTION_COUNT, SECTION_HEIGHT, MIN_Y, MAX_Y, MAX_LIGHT,
} from '../core/constants.js';
import { sectionIndex, yToSectionIndex, yToSectionLocal } from '../core/math.js';
import { AIR } from './block.js';

/** Dynamic emission for stateful redstone light sources. */
export function blockEmissionForState(state) {
  const id = state?.block?.id;
  if (id === 'mc:redstone_torch') return state.get('lit') === false ? 0 : 7;
  if (id === 'mc:redstone_lamp') return state.get('lit') ? 15 : 0;
  return state?.block?.lightEmission || 0;
}

// Build ceiling comes from constants.js (MAX_Y). It used to be re-derived here,
// and in five other places, from MIN_Y + SECTION_COUNT * SECTION_HEIGHT.

/**
 * A queue of packed (x, y, z, level) entries.
 *
 * Flat typed arrays rather than an array of objects: flood fill visits hundreds
 * of thousands of cells per chunk, and allocating an object per visit is the
 * difference between a few milliseconds and a visible stall.
 */
class LightQueue {
  constructor(capacity = 1 << 16) {
    this.x = new Int32Array(capacity);
    this.y = new Int32Array(capacity);
    this.z = new Int32Array(capacity);
    this.level = new Uint8Array(capacity);
    this.head = 0;
    this.tail = 0;
    this.capacity = capacity;
  }

  push(x, y, z, level) {
    if (this.tail === this.capacity) this._grow();
    this.x[this.tail] = x;
    this.y[this.tail] = y;
    this.z[this.tail] = z;
    this.level[this.tail] = level;
    this.tail++;
  }

  _grow() {
    const capacity = this.capacity * 2;
    const nx = new Int32Array(capacity); nx.set(this.x);
    const ny = new Int32Array(capacity); ny.set(this.y);
    const nz = new Int32Array(capacity); nz.set(this.z);
    const nl = new Uint8Array(capacity); nl.set(this.level);
    this.x = nx; this.y = ny; this.z = nz; this.level = nl;
    this.capacity = capacity;
  }

  get isEmpty() {
    return this.head >= this.tail;
  }

  reset() {
    this.head = 0;
    this.tail = 0;
  }
}

const NEIGHBORS = [
  [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0],
];

/** Light a chunk from scratch. Called after generation and after bulk edits. */
export function computeChunkLight(chunk) {
  clearLight(chunk);
  computeSkyLight(chunk);
  computeBlockLight(chunk);
}

function clearLight(chunk) {
  for (const section of chunk.sections) {
    if (!section) continue;
    section.skyLight.fill(0);
    section.blockLight.fill(0);
  }
}

function opacityAt(chunk, x, y, z) {
  if (y < MIN_Y || y >= MAX_Y) return 0;
  const state = chunk.getBlock(x, y, z);
  const block = state.block;
  if (block === AIR) return 0;
  // Leaves and water dim light without blocking it entirely, which is what
  // makes a forest floor dappled rather than pitch black.
  return Math.max(1, block.opacity ?? (block.opaqueCube ? 15 : 1));
}

function setSky(chunk, x, y, z, level) {
  const si = yToSectionIndex(y);
  if (si === -1) return;
  const section = chunk.section(si, true);
  section.skyLight.set(sectionIndex(x, yToSectionLocal(y), z), level);
}

function getSky(chunk, x, y, z) {
  const si = yToSectionIndex(y);
  if (si === -1) return y >= MAX_Y ? MAX_LIGHT : 0;
  const section = chunk.sections[si];
  if (!section) return 0;
  return section.skyLight.get(sectionIndex(x, yToSectionLocal(y), z));
}

function setBlockLight(chunk, x, y, z, level) {
  const si = yToSectionIndex(y);
  if (si === -1) return;
  const section = chunk.section(si, true);
  section.blockLight.set(sectionIndex(x, yToSectionLocal(y), z), level);
}

function getBlockLight(chunk, x, y, z) {
  const si = yToSectionIndex(y);
  if (si === -1) return 0;
  const section = chunk.sections[si];
  if (!section) return 0;
  return section.blockLight.get(sectionIndex(x, yToSectionLocal(y), z));
}

// ---------------------------------------------------------------------------
// Sky light
// ---------------------------------------------------------------------------

function computeSkyLight(chunk) {
  const queue = new LightQueue();

  // Straight down from the sky at full strength, with no falloff until
  // something blocks it. This vertical no-decay rule is what makes a narrow
  // shaft light a room far below.
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      let level = MAX_LIGHT;
      for (let y = MAX_Y - 1; y >= MIN_Y; y--) {
        const opacity = opacityAt(chunk, x, y, z);
        if (opacity >= MAX_LIGHT) {
          level = 0;
        } else if (opacity > 0) {
          level = Math.max(0, level - opacity);
        }
        if (level <= 0) break;
        setSky(chunk, x, y, z, level);
        // Only cells that can still illuminate a neighbour need to seed the
        // horizontal spread.
        if (level > 1) queue.push(x, y, z, level);
      }
    }
  }

  spread(chunk, queue, getSky, setSky);
}

// ---------------------------------------------------------------------------
// Block light
// ---------------------------------------------------------------------------

function computeBlockLight(chunk) {
  const queue = new LightQueue();

  for (let si = 0; si < SECTION_COUNT; si++) {
    const section = chunk.sections[si];
    if (!section || section.isEmpty) continue;
    const y0 = MIN_Y + si * SECTION_HEIGHT;

    for (let y = y0; y < y0 + SECTION_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const state = chunk.getBlock(x, y, z);
          const emission = blockEmissionForState(state);
          if (emission > 0) {
            setBlockLight(chunk, x, y, z, emission);
            queue.push(x, y, z, emission);
          }
        }
      }
    }
  }

  spread(chunk, queue, getBlockLight, setBlockLight);
}

// ---------------------------------------------------------------------------
// Shared flood fill
// ---------------------------------------------------------------------------

/**
 * Breadth-first spread. Each step costs one light level plus the target's
 * opacity, and a cell is only re-queued when the new value beats what is
 * already there -- which is what makes this terminate rather than oscillate
 * between two cells lighting each other forever.
 */
function spread(chunk, queue, get, set) {
  while (!queue.isEmpty) {
    const i = queue.head++;
    const x = queue.x[i];
    const y = queue.y[i];
    const z = queue.z[i];
    const level = queue.level[i];
    if (level <= 1) continue;

    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      // Chunk-local only; see the scope note at the top of this file.
      if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE) continue;
      if (ny < MIN_Y || ny >= MAX_Y) continue;

      const opacity = opacityAt(chunk, nx, ny, nz);
      if (opacity >= MAX_LIGHT) continue;

      const next = level - Math.max(1, opacity);
      if (next <= 0) continue;
      if (get(chunk, nx, ny, nz) >= next) continue;

      set(chunk, nx, ny, nz, next);
      queue.push(nx, ny, nz, next);
    }
  }
}

/**
 * Re-light a single block change and its surroundings.
 *
 * Phase 1 relights the whole chunk, which takes a few milliseconds -- fine for
 * one block placed by hand, far too slow for anything bulk. The incremental
 * add/remove queues that make this proportional to the affected volume are
 * Phase 3.
 */
export function relightAround(chunk) {
  computeChunkLight(chunk);
}
