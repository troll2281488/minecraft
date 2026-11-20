/**
 * Chunk meshing: turning blocks into triangles.
 *
 * Per-face culling with per-vertex ambient occlusion and smooth lighting. Not
 * greedy meshing -- greedy merging of coplanar faces conflicts with per-vertex
 * AO and light, since merged quads would need to share corner values that
 * differ across the run. Vanilla makes the same trade for the same reason: the
 * lighting is what makes the world readable, and it is worth more than the
 * vertex count.
 *
 * THE SECTION SCRATCH BUFFER
 *
 * This is the single most important thing in this file for performance.
 *
 * The obvious implementation asks the world for a block every time it needs
 * one: six times per block for face culling, then for every vertex of every
 * visible face, three more for occlusion and four for light. That is roughly
 * 200 world lookups per block. Each one walks a closure, a chunk lookup, a
 * section lookup and a paletted-container read -- measured at about 76 ns. On
 * tens of thousands of blocks per chunk that came to ~27 ms per chunk, which
 * made loading visibly gradual.
 *
 * Every one of those reads is inside the 18x18x18 region around a 16^3 section
 * (the section plus one block of border). So the whole region is fetched ONCE
 * into the flat scratch arrays below -- 5832 lookups per section instead of
 * ~250,000 per chunk -- and everything afterwards is a typed-array read with a
 * precomputed integer offset.
 *
 * The scratch arrays are module-level and reused. Allocating them per section
 * would reintroduce exactly the GC pressure this exists to remove.
 *
 * OUTPUT
 *
 * Two packed Uint32Arrays, one for the opaque/cutout pass and one for
 * translucent geometry, at two uint32 per vertex in the format documented in
 * gl.js. Vertices are emitted four per quad in consecutive order so the shared
 * quad index buffer applies without any per-mesh index data.
 */

import { CHUNK_SIZE, MIN_Y, SECTION_COUNT, SECTION_HEIGHT } from '../core/constants.js';
import { FACES } from '../core/math.js';
import { shapeBoxes } from '../world/shapes.js';

// ---------------------------------------------------------------------------
// Face geometry
//
// Vertex order is counter-clockwise viewed from outside the block, so backface
// culling keeps the faces that should be visible. UV indices are assigned per
// vertex rather than derived from position, because the CCW winding puts the
// four corners in a different rotation on each face -- deriving them uniformly
// would leave textures rotated 90 degrees on some sides of every block.
// ---------------------------------------------------------------------------

const FACE_GEOMETRY = [
  // down (-Y)
  { verts: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uv: [0,1,2,3] },
  // up (+Y)
  { verts: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], uv: [0,3,2,1] },
  // north (-Z)
  { verts: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], uv: [3,0,1,2] },
  // south (+Z)
  { verts: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], uv: [3,2,1,0] },
  // west (-X)
  { verts: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], uv: [3,2,1,0] },
  // east (+X)
  { verts: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], uv: [3,0,1,2] },
];

/**
 * For each face and each of its four vertices, the three neighbouring cells
 * that determine ambient occlusion and contribute to smooth lighting.
 *
 * Derived rather than hand-written: for a vertex at cube corner c on a face
 * with normal N, the relevant neighbours are N offset along each tangent axis
 * in the direction that corner sits, plus the diagonal of both. Hand-writing 72
 * offsets is exactly the kind of table that ends up with one entry wrong and a
 * single subtly dark edge somewhere in the world.
 */
const AO_OFFSETS = FACE_GEOMETRY.map((geom, faceIndex) => {
  const face = FACES[faceIndex];
  const n = [face.dx, face.dy, face.dz];
  const tangentAxes = [0, 1, 2].filter((axis) => n[axis] === 0);

  return geom.verts.map((corner) => {
    const [a1, a2] = tangentAxes;
    const s1 = corner[a1] === 1 ? 1 : -1;
    const s2 = corner[a2] === 1 ? 1 : -1;

    const side1 = [...n]; side1[a1] += s1;
    const side2 = [...n]; side2[a2] += s2;
    const diagonal = [...n]; diagonal[a1] += s1; diagonal[a2] += s2;

    return { side1, side2, diagonal };
  });
});

const TINT_KIND = { none: 0, grass: 1, foliage: 2, water: 3, leaves: 4 };

// ---------------------------------------------------------------------------
// Section scratch
// ---------------------------------------------------------------------------

const SPAN = CHUNK_SIZE + 2;              // 18: the section plus a 1-block border
const STRIDE_Z = SPAN;                    // 18
const STRIDE_Y = SPAN * SPAN;             // 324
const SCRATCH_SIZE = SPAN * SPAN * SPAN;  // 5832

const S_STATE = new Array(SCRATCH_SIZE);
const S_OPAQUE = new Uint8Array(SCRATCH_SIZE);
const S_SKY = new Uint8Array(SCRATCH_SIZE);
const S_BLOCK = new Uint8Array(SCRATCH_SIZE);

/** Scratch index for a coordinate in -1..16 on each axis. */
const scratchIndex = (x, y, z) => (y + 1) * STRIDE_Y + (z + 1) * STRIDE_Z + (x + 1);

/** Offset from a centre cell to a neighbour, as a flat scratch delta. */
const delta = (dx, dy, dz) => dy * STRIDE_Y + dz * STRIDE_Z + dx;

const FACE_DELTA = FACES.map((f) => delta(f.dx, f.dy, f.dz));

const AO_DELTA = FACE_GEOMETRY.map((geom, f) => {
  const facing = FACE_DELTA[f];
  return geom.verts.map((_, v) => {
    const o = AO_OFFSETS[f][v];
    return {
      facing,
      side1: delta(o.side1[0], o.side1[1], o.side1[2]),
      side2: delta(o.side2[0], o.side2[1], o.side2[2]),
      diagonal: delta(o.diagonal[0], o.diagonal[1], o.diagonal[2]),
    };
  });
});

// Per-vertex results, written in place rather than returned as objects.
const CORNER_AO = new Uint8Array(4);
const CORNER_SKY = new Uint8Array(4);
const CORNER_BLOCK = new Uint8Array(4);

/**
 * Load the 18^3 region around one section into scratch.
 *
 * Iteration order matches the scratch layout exactly (y outer, then z, then x),
 * so the destination index is a running counter rather than a multiply per cell.
 */
function fillScratch(view, y0) {
  let i = 0;
  for (let y = -1; y <= CHUNK_SIZE; y++) {
    const wy = y0 + y;
    for (let z = -1; z <= CHUNK_SIZE; z++) {
      for (let x = -1; x <= CHUNK_SIZE; x++, i++) {
        const state = view.getState(x, wy, z);
        S_STATE[i] = state;
        S_OPAQUE[i] = state.block.opaqueCube ? 1 : 0;
        const light = view.lightAt(x, wy, z);
        S_SKY[i] = light & 15;
        S_BLOCK[i] = (light >> 4) & 15;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Growable packed vertex buffer
// ---------------------------------------------------------------------------

class VertexBuffer {
  constructor(initialQuads = 2048) {
    this.data = new Uint32Array(initialQuads * 4 * 2);
    this.length = 0; // in uint32 words
  }

  _ensure(words) {
    if (this.length + words <= this.data.length) return;
    let capacity = this.data.length * 2;
    while (capacity < this.length + words) capacity *= 2;
    const grown = new Uint32Array(capacity);
    grown.set(this.data.subarray(0, this.length));
    this.data = grown;
  }

  push(w0, w1) {
    if (this.length + 2 > this.data.length) this._ensure(2);
    this.data[this.length++] = w0;
    this.data[this.length++] = w1;
  }

  get quadCount() {
    return this.length / 8;
  }

  finish() {
    // slice() rather than subarray(): the result is handed to the GPU and the
    // oversized backing buffer should not be kept alive with it.
    return this.data.slice(0, this.length);
  }
}

// ---------------------------------------------------------------------------
// Meshing
// ---------------------------------------------------------------------------

/**
 * Build the geometry for one chunk.
 *
 * @param {object} view  block access spanning the chunk and one block beyond it
 *                       in every direction: getState(lx, ly, lz) with lx/lz in
 *                       -1..16 and ly in world coordinates, and lightAt(...)
 *                       returning packed sky | block<<4.
 */
export function meshChunk(view) {
  const opaque = new VertexBuffer();
  const translucent = new VertexBuffer();

  for (let si = 0; si < SECTION_COUNT; si++) {
    if (!view.sectionHasBlocks(si)) continue;

    const y0 = MIN_Y + si * SECTION_HEIGHT;
    fillScratch(view, y0);

    for (let y = 0; y < SECTION_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        // The x run is contiguous in scratch, so the index just increments.
        let idx = scratchIndex(0, y, z);
        for (let x = 0; x < CHUNK_SIZE; x++, idx++) {
          const state = S_STATE[idx];
          const shape = state.block.renderShape;
          if (shape === 'none') continue;

          const wy = y0 + y;

          if (shape === 'cross') { emitCross(opaque, view, state, x, wy, z, idx); continue; }
          if (shape === 'torch') { emitTorch(opaque, view, state, x, wy, z, idx); continue; }
          if (shape === 'slab' || shape === 'stair') {
            emitBoxes(opaque, view, state, x, wy, z, idx, shapeBoxes(state));
            continue;
          }

          const target = shape === 'translucent' ? translucent : opaque;
          emitCube(target, view, state, x, wy, z, idx);
        }
      }
    }
  }

  return {
    opaque: opaque.finish(),
    translucent: translucent.finish(),
    opaqueQuads: opaque.quadCount,
    translucentQuads: translucent.quadCount,
  };
}

const FLIP_ORDER = [1, 2, 3, 0];
const NORMAL_ORDER = [0, 1, 2, 3];

function emitCube(out, view, state, lx, ly, lz, idx) {
  const block = state.block;
  const tintKind = TINT_KIND[block.tint] ?? 0;
  const tintFaces = block.tintFaces ?? null;

  for (let f = 0; f < 6; f++) {
    const neighbor = S_STATE[idx + FACE_DELTA[f]];
    if (!shouldRenderFace(block, neighbor.block)) continue;

    const geom = FACE_GEOMETRY[f];
    const layer = view.textureLayer(state.runtimeId, f);

    // Only some faces of some blocks take a biome tint -- the top of a grass
    // block is tinted, its sides carry a pre-coloured overlay instead.
    const faceTint = tintFaces && !tintFaces.includes(FACES[f].name) ? 0 : tintKind;

    for (let v = 0; v < 4; v++) sampleCorner(f, v, idx);

    // The classic AO seam: when opposite corners disagree, the default triangle
    // split produces a visible crease along the diagonal. Rotating the vertex
    // order moves the split to the other diagonal, where it is not visible.
    const flip = CORNER_AO[0] + CORNER_AO[2] > CORNER_AO[1] + CORNER_AO[3];
    const order = flip ? FLIP_ORDER : NORMAL_ORDER;

    for (let k = 0; k < 4; k++) {
      const v = order[k];
      const pos = geom.verts[v];
      out.push(
        packPosition(lx + pos[0], ly + pos[1], lz + pos[2]),
        packSurface(layer, f, geom.uv[v], faceTint,
          CORNER_AO[v], CORNER_SKY[v], CORNER_BLOCK[v]),
      );
    }
  }
}

/** Is face `f` of `box` flush with the block boundary (so it can be culled)? */
function isBoundaryFace(box, f) {
  switch (f) {
    case 0: return box[1] === 0; // down: y0
    case 1: return box[4] === 1; // up: y1
    case 2: return box[2] === 0; // north: z0
    case 3: return box[5] === 1; // south: z1
    case 4: return box[0] === 0; // west: x0
    default: return box[3] === 1; // east: x1
  }
}

/**
 * Emit an arbitrary list of boxes -- the renderer half of the box-model shared
 * with collision (see world/shapes.js). Slabs and stairs come through here.
 *
 * Two simplifications versus emitCube, both acceptable for these shapes and
 * noted in docs/PARITY.md:
 *   - Lighting is per-face (sampled from the block's cell, or the open neighbour
 *     for a boundary face) rather than per-vertex smooth lighting with AO. A
 *     half-block does not have room for the AO gradient to read anyway.
 *   - UVs span the full tile, so a texture is scaled to the box face rather than
 *     cropped to it (a slab shows the whole texture at half height, not the
 *     texture's bottom half). Cropping needs real UV coordinates in the vertex
 *     format, which is a later change.
 */
function emitBoxes(out, view, state, lx, ly, lz, idx, boxes) {
  const block = state.block;
  const tintKind = TINT_KIND[block.tint] ?? 0;

  for (let bi = 0; bi < boxes.length; bi++) {
    const box = boxes[bi];
    for (let f = 0; f < 6; f++) {
      const boundary = isBoundaryFace(box, f);
      if (boundary && !shouldRenderFace(block, S_STATE[idx + FACE_DELTA[f]].block)) continue;

      // Light a boundary face from the open neighbour it faces; an interior face
      // from the block's own cell.
      let lightCell = idx;
      if (boundary) {
        const nb = idx + FACE_DELTA[f];
        if (!S_OPAQUE[nb]) lightCell = nb;
      }
      const sky = S_SKY[lightCell];
      const blockLight = S_BLOCK[lightCell];

      const layer = view.textureLayer(state.runtimeId, f);
      const geom = FACE_GEOMETRY[f];
      for (let v = 0; v < 4; v++) {
        const b = geom.verts[v];
        const px = b[0] ? box[3] : box[0];
        const py = b[1] ? box[4] : box[1];
        const pz = b[2] ? box[5] : box[2];
        out.push(
          packPosition(lx + px, ly + py, lz + pz),
          packSurface(layer, f, geom.uv[v], tintKind, 3, sky, blockLight),
        );
      }
    }
  }
}

/**
 * Whether a face between `block` and `neighbor` should be drawn.
 *
 * The non-obvious rule is the last one: two adjacent blocks of the SAME
 * translucent type hide the face between them. Without it, an ocean renders as
 * thousands of stacked blue quads, each blending over the last, and the water
 * turns opaque black-blue while destroying fill rate.
 */
function shouldRenderFace(block, neighbor) {
  if (neighbor.opaqueCube) return false;
  if (block === neighbor && block.renderShape === 'translucent') return false;
  return true;
}

/**
 * Ambient occlusion and averaged light for one vertex, written into the scratch
 * result arrays. Reads only the section scratch -- no world lookups at all.
 */
function sampleCorner(faceIndex, vertexIndex, idx) {
  const d = AO_DELTA[faceIndex][vertexIndex];

  const c1 = idx + d.side1;
  const c2 = idx + d.side2;
  const cd = idx + d.diagonal;
  const cf = idx + d.facing;

  const o1 = S_OPAQUE[c1];
  const o2 = S_OPAQUE[c2];
  const od = S_OPAQUE[cd];

  // If both sides are solid the corner is fully enclosed and the diagonal
  // cannot make it darker -- checking it anyway would produce a value of 1
  // where 0 is correct, and leave a bright pixel in the tightest corners.
  CORNER_AO[vertexIndex] = o1 && o2 ? 0 : 3 - (o1 + o2 + od);

  // Smooth lighting averages the light of the cells touching this vertex,
  // skipping any that are opaque (they hold no meaningful light). Unrolled: an
  // array literal here would allocate on every vertex of every face.
  let sky = 0, blk = 0, n = 0;
  if (!S_OPAQUE[cf]) { sky += S_SKY[cf]; blk += S_BLOCK[cf]; n++; }
  if (!o1)           { sky += S_SKY[c1]; blk += S_BLOCK[c1]; n++; }
  if (!o2)           { sky += S_SKY[c2]; blk += S_BLOCK[c2]; n++; }
  if (!od)           { sky += S_SKY[cd]; blk += S_BLOCK[cd]; n++; }
  if (n === 0) n = 1;

  CORNER_SKY[vertexIndex] = (sky / n + 0.5) | 0;
  CORNER_BLOCK[vertexIndex] = (blk / n + 0.5) | 0;
}

/** Two crossed quads, drawn from both sides. */
function emitCross(out, view, state, lx, ly, lz, idx) {
  const layer = view.textureLayer(state.runtimeId, 1);
  const tint = TINT_KIND[state.block.tint] ?? 0;
  const sky = S_SKY[idx];
  const blockLight = S_BLOCK[idx];
  const K = 0.1464; // (1 - 1/sqrt(2)) / 2 -- inset so the X spans the full cube

  const planes = [
    [[K, K], [1 - K, 1 - K]],
    [[1 - K, K], [K, 1 - K]],
  ];

  for (const [a, b] of planes) {
    // Emitted twice with opposite winding, since a flat plane would otherwise
    // vanish when viewed from behind under backface culling.
    for (let reverse = 0; reverse < 2; reverse++) {
      const p0 = reverse ? b : a;
      const p1 = reverse ? a : b;
      emitQuad(out, layer, tint, sky, blockLight,
        lx + p0[0], ly,     lz + p0[1], 3,
        lx + p1[0], ly,     lz + p1[1], 2,
        lx + p1[0], ly + 1, lz + p1[1], 1,
        lx + p0[0], ly + 1, lz + p0[1], 0);
    }
  }
}

/** A simplified torch: a thin post, drawn as a cross like a plant. */
function emitTorch(out, view, state, lx, ly, lz, idx) {
  const layer = view.textureLayer(state.runtimeId, 1);
  const sky = S_SKY[idx];
  const blockLight = S_BLOCK[idx];

  for (const [ax, az] of [[1, 0], [0, 1]]) {
    for (let reverse = 0; reverse < 2; reverse++) {
      const lo = reverse ? 0.9 : 0.1;
      const hi = reverse ? 0.1 : 0.9;
      const x0 = lx + 0.5 + (lo - 0.5) * ax;
      const z0 = lz + 0.5 + (lo - 0.5) * az;
      const x1 = lx + 0.5 + (hi - 0.5) * ax;
      const z1 = lz + 0.5 + (hi - 0.5) * az;
      emitQuad(out, layer, 0, sky, blockLight,
        x0, ly,     z0, 3,
        x1, ly,     z1, 2,
        x1, ly + 1, z1, 1,
        x0, ly + 1, z0, 0);
    }
  }
}

/** Four vertices at full ambient occlusion, for the non-cube shapes. */
function emitQuad(out, layer, tint, sky, blockLight,
                  x0, y0, z0, uv0, x1, y1, z1, uv1,
                  x2, y2, z2, uv2, x3, y3, z3, uv3) {
  out.push(packPosition(x0, y0, z0), packSurface(layer, 1, uv0, tint, 3, sky, blockLight));
  out.push(packPosition(x1, y1, z1), packSurface(layer, 1, uv1, tint, 3, sky, blockLight));
  out.push(packPosition(x2, y2, z2), packSurface(layer, 1, uv2, tint, 3, sky, blockLight));
  out.push(packPosition(x3, y3, z3), packSurface(layer, 1, uv3, tint, 3, sky, blockLight));
}

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

/**
 * Positions are quantized to 1/16 of a block.
 *
 * Whole-block integers would be enough for cubes, but cross-plants sit at
 * 0.1464 and torches at 0.4, and truncating those to integers collapses every
 * plant in the world into a degenerate zero-area quad. Sixteenths are the
 * natural unit -- it is the texture resolution, so nothing in the game is ever
 * positioned more finely than this.
 */
const PACK_SCALE = 16;

function packPosition(x, y, z) {
  const xq = Math.round(x * PACK_SCALE);
  const yq = Math.round((y - MIN_Y) * PACK_SCALE);
  const zq = Math.round(z * PACK_SCALE);
  return (((xq & 511) | ((yq & 8191) << 9) | ((zq & 511) << 22)) >>> 0);
}

function packSurface(layer, face, uvIndex, tintKind, ao, sky, blockLight) {
  return (
    ((layer & 4095) |
     ((face & 7) << 12) |
     ((uvIndex & 3) << 15) |
     ((tintKind & 3) << 17) |
     ((ao & 3) << 19) |
     ((sky & 15) << 21) |
     ((blockLight & 15) << 25)) >>> 0
  );
}

export { FACE_GEOMETRY, AO_OFFSETS, packPosition, packSurface, PACK_SCALE, scratchIndex };
