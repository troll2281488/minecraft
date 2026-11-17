/**
 * Block shapes as lists of boxes.
 *
 * A slab is one half-height box; a stair is a slab plus a quarter box; a fence
 * post is a thin column. Rather than special-casing each of these in both the
 * renderer and the collision code -- and inevitably letting the two drift apart,
 * so a stair you can see is not the stair you bump into -- every non-cube shape
 * is expressed once here as a list of axis-aligned boxes in 0..1 local space.
 *
 * The mesher draws those boxes; the player collides with those boxes. One source
 * of truth, so what you see is always what you hit. This is exactly how
 * Minecraft models these blocks internally.
 *
 * Boxes are plain `[x0, y0, z0, x1, y1, z1]` arrays to stay allocation-light --
 * collision queries them constantly. The lists themselves are frozen and cached
 * per shape so a slab does not rebuild its box on every lookup.
 */

const FULL = Object.freeze([0, 0, 0, 1, 1, 1]);
const FULL_LIST = Object.freeze([FULL]);
const EMPTY_LIST = Object.freeze([]);

// ---------------------------------------------------------------------------
// Slabs
// ---------------------------------------------------------------------------

const SLAB_BOTTOM = Object.freeze([Object.freeze([0, 0, 0, 1, 0.5, 1])]);
const SLAB_TOP = Object.freeze([Object.freeze([0, 0.5, 0, 1, 1, 1])]);

function slabBoxes(state) {
  switch (state.get('type')) {
    case 'top': return SLAB_TOP;
    case 'double': return FULL_LIST;
    default: return SLAB_BOTTOM;
  }
}

// ---------------------------------------------------------------------------
// Stairs (straight)
// ---------------------------------------------------------------------------

// The tall part sits on the `facing` side; placement points that away from the
// player, so you step up in the direction you are looking. Corner auto-shaping
// (inner/outer, from neighbouring stairs) is a later refinement -- until then
// every stair renders and collides as a straight one, which is a valid stair,
// just non-connecting at corners.
const STAIR_STEP_BOTTOM = {
  north: [0, 0.5, 0, 1, 1, 0.5],
  south: [0, 0.5, 0.5, 1, 1, 1],
  east: [0.5, 0.5, 0, 1, 1, 1],
  west: [0, 0.5, 0, 0.5, 1, 1],
};
const STAIR_STEP_TOP = {
  north: [0, 0, 0, 1, 0.5, 0.5],
  south: [0, 0, 0.5, 1, 0.5, 1],
  east: [0.5, 0, 0, 1, 0.5, 1],
  west: [0, 0, 0, 0.5, 0.5, 1],
};

const STAIR_CACHE = new Map();

function stairBoxes(state) {
  const facing = state.get('facing');
  const half = state.get('half');
  const key = `${facing}:${half}`;
  let boxes = STAIR_CACHE.get(key);
  if (!boxes) {
    const base = half === 'top' ? SLAB_TOP[0] : SLAB_BOTTOM[0];
    const step = half === 'top' ? STAIR_STEP_TOP[facing] : STAIR_STEP_BOTTOM[facing];
    boxes = Object.freeze([base, Object.freeze([...step])]);
    STAIR_CACHE.set(key, boxes);
  }
  return boxes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The boxes that make up a block's visible/physical shape, in 0..1 local space.
 * Used by the mesher for geometry.
 */
export function shapeBoxes(state) {
  switch (state.block.renderShape) {
    case 'slab': return slabBoxes(state);
    case 'stair': return stairBoxes(state);
    default: return FULL_LIST;
  }
}

/**
 * The boxes the player collides with. A non-solid block (air, plants, water)
 * has none; everything else uses its shape, defaulting to a full cube.
 */
export function collisionBoxes(state) {
  if (!state.block.solid) return EMPTY_LIST;
  return shapeBoxes(state);
}

/** True if this block is anything other than a plain full cube. */
export function isNonCube(state) {
  const shape = state.block.renderShape;
  return shape === 'slab' || shape === 'stair';
}

/** The shapes the mesher must render with the box emitter rather than as a cube. */
export const BOX_SHAPES = Object.freeze(new Set(['slab', 'stair']));
