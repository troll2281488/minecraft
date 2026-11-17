/**
 * Small math and coordinate helpers.
 *
 * Deliberately minimal for now. Vectors, frustum culling, and voxel raycasting
 * arrive in Phase 1 alongside the renderer that needs them; writing them before
 * anything calls them would mean guessing at the interface.
 */

import { CHUNK_SIZE, SECTION_HEIGHT, MIN_Y, WORLD_HEIGHT } from './constants.js';

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (t, a, b) => a + t * (b - a);
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Interpolation curve used by Perlin noise; flatter at both ends than smoothstep. */
export const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Floor division and modulo that behave correctly for negative operands.
 *
 * JavaScript's % returns -1 for (-1 % 16), so the naive form maps block x=-1
 * into the wrong chunk and to a negative array index. Every coordinate helper
 * below routes through these for that reason.
 */
export const floorDiv = (a, b) => Math.floor(a / b);
export const floorMod = (a, b) => ((a % b) + b) % b;

// ---------------------------------------------------------------------------
// Chunk / section coordinates
// ---------------------------------------------------------------------------

/**
 * Chunk and section coordinate conversions.
 *
 * These use bit operations rather than Math.floor division. Both divisors are
 * 16, and every one of these is on the mesher's hot path -- it performs
 * hundreds of thousands of lookups per chunk, and Math.floor(a / 16) is
 * substantially slower than a shift. `>> 4` and `& 15` are exact for the same
 * reason floorDiv exists: they round toward negative infinity, which is the
 * behaviour negative coordinates require.
 */
export const blockToChunk = (v) => v >> 4;
export const blockToLocal = (v) => v & 15;

/** Section index 0..23 for a world Y, or -1 if outside the build range. */
export function yToSectionIndex(y) {
  const offset = y - MIN_Y;
  // Unsigned compare catches both bounds at once: a negative offset wraps to a
  // huge value and fails the upper test.
  if (offset >>> 0 >= WORLD_HEIGHT) return -1;
  return offset >> 4;
}

export const yToSectionLocal = (y) => (y - MIN_Y) & 15;
export const sectionIndexToY = (i) => MIN_Y + i * SECTION_HEIGHT;

/** Index into a 16x16x16 section array. Order is YZX, matching vanilla. */
export const sectionIndex = (x, y, z) => (y << 8) | (z << 4) | x;

export function sectionIndexToXYZ(i) {
  return { x: i & 15, z: (i >> 4) & 15, y: (i >> 8) & 15 };
}

/**
 * Pack chunk coordinates into a single number usable as a Map key.
 *
 * Uses a string rather than a bit-packed integer because chunk coordinates can
 * exceed the 26 bits each that would be needed to pack both into a safe
 * integer, and a wrong answer at extreme distance is a far worse trade than a
 * slightly slower key.
 */
export const chunkKey = (cx, cz) => `${cx},${cz}`;

export function parseChunkKey(key) {
  const comma = key.indexOf(',');
  return { cx: parseInt(key.slice(0, comma), 10), cz: parseInt(key.slice(comma + 1), 10) };
}

// ---------------------------------------------------------------------------
// Axis-aligned bounding box
// ---------------------------------------------------------------------------

export class AABB {
  constructor(minX, minY, minZ, maxX, maxY, maxZ) {
    this.minX = minX; this.minY = minY; this.minZ = minZ;
    this.maxX = maxX; this.maxY = maxY; this.maxZ = maxZ;
  }

  static fromCenter(x, y, z, width, height) {
    const h = width / 2;
    return new AABB(x - h, y, z - h, x + h, y + height, z + h);
  }

  static cube() {
    return new AABB(0, 0, 0, 1, 1, 1);
  }

  clone() {
    return new AABB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ);
  }

  offset(dx, dy, dz) {
    return new AABB(
      this.minX + dx, this.minY + dy, this.minZ + dz,
      this.maxX + dx, this.maxY + dy, this.maxZ + dz,
    );
  }

  expand(dx, dy, dz) {
    return new AABB(
      this.minX - dx, this.minY - dy, this.minZ - dz,
      this.maxX + dx, this.maxY + dy, this.maxZ + dz,
    );
  }

  /** Strict overlap. Touching faces do not count, so resting on a block is not a collision. */
  intersects(o) {
    return (
      this.minX < o.maxX && this.maxX > o.minX &&
      this.minY < o.maxY && this.maxY > o.minY &&
      this.minZ < o.maxZ && this.maxZ > o.minZ
    );
  }

  contains(x, y, z) {
    return (
      x >= this.minX && x <= this.maxX &&
      y >= this.minY && y <= this.maxY &&
      z >= this.minZ && z <= this.maxZ
    );
  }
}

// ---------------------------------------------------------------------------
// Faces
// ---------------------------------------------------------------------------

/** Face order is fixed: mesher, lighting, and the save format all index by it. */
export const FACES = Object.freeze([
  { name: 'down',  dx: 0,  dy: -1, dz: 0,  index: 0, opposite: 1 },
  { name: 'up',    dx: 0,  dy: 1,  dz: 0,  index: 1, opposite: 0 },
  { name: 'north', dx: 0,  dy: 0,  dz: -1, index: 2, opposite: 3 },
  { name: 'south', dx: 0,  dy: 0,  dz: 1,  index: 3, opposite: 2 },
  { name: 'west',  dx: -1, dy: 0,  dz: 0,  index: 4, opposite: 5 },
  { name: 'east',  dx: 1,  dy: 0,  dz: 0,  index: 5, opposite: 4 },
]);

export const FACE_BY_NAME = Object.freeze(
  Object.fromEntries(FACES.map((f) => [f.name, f])),
);

/** Horizontal facing from a yaw in degrees, matching vanilla's placement rule. */
export function yawToFacing(yaw) {
  const q = Math.floor(((yaw % 360) + 360) / 90 + 0.5) & 3;
  return ['south', 'west', 'north', 'east'][q];
}
