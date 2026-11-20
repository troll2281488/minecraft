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
// Panes (iron bars)
// ---------------------------------------------------------------------------

// A thin central mullion with four arms. The five boxes share faces but never
// extend beyond the block boundary, so the same profile is used for rendering
// and collision without treating the bars as a full opaque cube.
const PANE_BOXES = Object.freeze([
  Object.freeze([0.4375, 0, 0.4375, 0.5625, 1, 0.5625]),
  Object.freeze([0.4375, 0, 0, 0.5625, 1, 0.4375]),
  Object.freeze([0.4375, 0, 0.5625, 0.5625, 1, 1]),
  Object.freeze([0, 0, 0.4375, 0.4375, 1, 0.5625]),
  Object.freeze([0.5625, 0, 0.4375, 1, 1, 0.5625]),
]);

// ---------------------------------------------------------------------------
// Ladders (wall-mounted rails and rungs)
// ---------------------------------------------------------------------------

const LADDER_CACHE = new Map();
function ladderBoxes(state) {
  const facing = state.get('facing') || 'north';
  if (LADDER_CACHE.has(facing)) return LADDER_CACHE.get(facing);
  const boxes = [];
  const horizontal = facing === 'north' || facing === 'south';
  const plane = facing === 'north' ? [0, 0.125] : facing === 'south' ? [0.875, 1]
    : facing === 'west' ? [0, 0.125] : [0.875, 1];
  if (horizontal) {
    boxes.push([0.08, 0, plane[0], 0.2, 1, plane[1]], [0.8, 0, plane[0], 0.92, 1, plane[1]]);
    for (let i = 1; i <= 7; i++) { const y = i / 8; boxes.push([0.08, y, plane[0], 0.92, y + 0.055, plane[1]]); }
  } else {
    boxes.push([plane[0], 0, 0.08, plane[1], 1, 0.2], [plane[0], 0, 0.8, plane[1], 1, 0.92]);
    for (let i = 1; i <= 7; i++) { const z = i / 8; boxes.push([plane[0], 0, z, plane[1], 1, z + 0.055]); }
  }
  const frozen = Object.freeze(boxes.map((box) => Object.freeze(box)));
  LADDER_CACHE.set(facing, frozen);
  return frozen;
}

// ---------------------------------------------------------------------------
// Doors (two block-high panels; each half uses the same local 1/16-thick box)
// ---------------------------------------------------------------------------

const DOOR_THICKNESS = 0.1875;
function doorBoxes(state) {
  const facing = state.get('facing') || 'north';
  const open = state.get('open') === true;
  const hinge = state.get('hinge') || 'left';
  let box;
  if (!open) {
    // Closed panel sits on the edge opposite the direction it faces.
    if (facing === 'north') box = [0, 0, 1 - DOOR_THICKNESS, 1, 1, 1];
    else if (facing === 'south') box = [0, 0, 0, 1, 1, DOOR_THICKNESS];
    else if (facing === 'east') box = [0, 0, 0, DOOR_THICKNESS, 1, 1];
    else box = [1 - DOOR_THICKNESS, 0, 0, 1, 1, 1];
  } else if (facing === 'north' || facing === 'south') {
    const west = (facing === 'north') === (hinge === 'left');
    box = west
      ? [0, 0, 0, DOOR_THICKNESS, 1, 1]
      : [1 - DOOR_THICKNESS, 0, 0, 1, 1, 1];
  } else {
    const north = (facing === 'east') === (hinge === 'left');
    box = north
      ? [0, 0, 0, 1, 1, DOOR_THICKNESS]
      : [0, 0, 1 - DOOR_THICKNESS, 1, 1, 1];
  }
  return [box];
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
    case 'pane': return PANE_BOXES;
    case 'ladder': return ladderBoxes(state);
    case 'door': return doorBoxes(state);
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
  return shape === 'slab' || shape === 'stair' || shape === 'pane' || shape === 'ladder' || shape === 'door';
}

/** The shapes the mesher must render with the box emitter rather than as a cube. */
export const BOX_SHAPES = Object.freeze(new Set(['slab', 'stair', 'pane', 'ladder', 'door']));
