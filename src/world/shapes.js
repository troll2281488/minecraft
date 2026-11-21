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
// Stairs (straight and neighbour-shaped corners)
// ---------------------------------------------------------------------------

// The raised half occupies the half-block in front of the stair's facing.
// Corner shapes are split into quarter-block boxes so the renderer and player
// collision share precisely the same inner/outer profile.
const STAIR_VECTORS = Object.freeze({
  north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
});
const STAIR_LEFT = Object.freeze({ north: 'west', south: 'east', west: 'south', east: 'north' });
const STAIR_RIGHT = Object.freeze({ north: 'east', south: 'west', west: 'north', east: 'south' });
const STAIR_CACHE = new Map();

function stairShapeFromNeighbors(state, getNeighbor) {
  const facing = state.get('facing') || 'north';
  const half = state.get('half') || 'bottom';
  if (!getNeighbor) return state.get('shape') || 'straight';
  const [dx, dz] = STAIR_VECTORS[facing];
  const front = getNeighbor(dx, 0, dz);
  const back = getNeighbor(-dx, 0, -dz);
  const isCompatible = (neighbor) => neighbor?.block?.renderShape === 'stair' &&
    neighbor.get('half') === half &&
    neighbor.get('facing') !== facing &&
    STAIR_VECTORS[neighbor.get('facing')][0] * dx +
      STAIR_VECTORS[neighbor.get('facing')][1] * dz === 0;
  // Java stairs do not form a corner when another stair continues the same
  // run around the side. This avoids a false corner in three-stair junctions.
  const hasSameRunAt = (sideFacing) => {
    const [sx, sz] = STAIR_VECTORS[sideFacing];
    const side = getNeighbor(sx, 0, sz);
    return side?.block?.renderShape === 'stair' &&
      side.get('half') === half && side.get('facing') === facing;
  };
  if (isCompatible(front)) {
    const candidateFacing = front.get('facing');
    const opposite = { north: 'south', south: 'north', west: 'east', east: 'west' };
    if (!hasSameRunAt(opposite[candidateFacing])) {
      return candidateFacing === STAIR_LEFT[facing] ? 'outer_left' : 'outer_right';
    }
  }
  if (isCompatible(back)) {
    const candidateFacing = back.get('facing');
    if (!hasSameRunAt(candidateFacing)) {
      return candidateFacing === STAIR_LEFT[facing] ? 'inner_left' : 'inner_right';
    }
  }
  return 'straight';
}

function stairQuadrant(facing, side) {
  const front = STAIR_VECTORS[facing];
  const lateral = STAIR_VECTORS[side];
  const x0 = front[0] < 0 || lateral[0] < 0 ? 0 : 0.5;
  const x1 = x0 + 0.5;
  const z0 = front[1] < 0 || lateral[1] < 0 ? 0 : 0.5;
  const z1 = z0 + 0.5;
  return [x0, z0, x1, z1];
}

function stairBoxes(state, getNeighbor) {
  const facing = state.get('facing') || 'north';
  const half = state.get('half') || 'bottom';
  const shape = stairShapeFromNeighbors(state, getNeighbor);
  const key = `${facing}:${half}:${shape}`;
  if (STAIR_CACHE.has(key)) return STAIR_CACHE.get(key);
  const y0 = half === 'top' ? 0 : 0.5;
  const y1 = half === 'top' ? 0.5 : 1;
  const base = half === 'top' ? SLAB_TOP[0] : SLAB_BOTTOM[0];
  const boxes = [base];
  const left = stairQuadrant(facing, STAIR_LEFT[facing]);
  const right = stairQuadrant(facing, STAIR_RIGHT[facing]);
  const rearLeft = stairQuadrant(STAIR_VECTORS[facing][0] === 0
    ? (facing === 'north' ? 'south' : 'north')
    : (facing === 'west' ? 'east' : 'west'), STAIR_LEFT[facing]);
  const rearRight = stairQuadrant(STAIR_VECTORS[facing][0] === 0
    ? (facing === 'north' ? 'south' : 'north')
    : (facing === 'west' ? 'east' : 'west'), STAIR_RIGHT[facing]);
  let quadrants;
  if (shape === 'outer_left') quadrants = [left];
  else if (shape === 'outer_right') quadrants = [right];
  else if (shape === 'inner_left') quadrants = [left, right, rearLeft];
  else if (shape === 'inner_right') quadrants = [left, right, rearRight];
  else quadrants = [left, right];
  for (const [x0, z0, x1, z1] of quadrants) {
    boxes.push([x0, y0, z0, x1, y1, z1]);
  }
  const frozen = Object.freeze(boxes.map((box) => Object.freeze(box)));
  STAIR_CACHE.set(key, frozen);
  return frozen;
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
// Trapdoors (horizontal slab when closed, vertical panel when open)
// ---------------------------------------------------------------------------

const TRAPDOOR_THICKNESS = 0.1875;
function trapdoorBoxes(state) {
  if (!state.get('open')) {
    return [state.get('half') === 'top'
      ? [0, 1 - TRAPDOOR_THICKNESS, 0, 1, 1, 1]
      : [0, 0, 0, 1, TRAPDOOR_THICKNESS, 1]];
  }
  switch (state.get('facing')) {
    case 'north': return [[0, 0, 0, 1, 1, TRAPDOOR_THICKNESS]];
    case 'south': return [[0, 0, 1 - TRAPDOOR_THICKNESS, 1, 1, 1]];
    case 'east': return [[1 - TRAPDOOR_THICKNESS, 0, 0, 1, 1, 1]];
    default: return [[0, 0, 0, TRAPDOOR_THICKNESS, 1, 1]];
  }
}

// ---------------------------------------------------------------------------
// Buttons, levers and pressure plates
// ---------------------------------------------------------------------------

function buttonBoxes(state) {
  const face = state.get('face') || 'wall';
  const facing = state.get('facing') || 'north';
  const depth = state.get('powered') ? 0.0625 : 0.125;
  if (face === 'floor') return [[0.375, 0, 0.375, 0.625, depth, 0.625]];
  if (face === 'ceiling') return [[0.375, 1 - depth, 0.375, 0.625, 1, 0.625]];
  switch (facing) {
    case 'north': return [[0.375, 0.375, 0, 0.625, 0.625, depth]];
    case 'south': return [[0.375, 0.375, 1 - depth, 0.625, 0.625, 1]];
    case 'east': return [[1 - depth, 0.375, 0.375, 1, 0.625, 0.625]];
    default: return [[0, 0.375, 0.375, depth, 0.625, 0.625]];
  }
}

function leverBoxes(state) {
  const face = state.get('face') || 'wall';
  const facing = state.get('facing') || 'north';
  if (face === 'floor') return [[0.25, 0, 0.25, 0.75, 0.125, 0.75], [0.4375, 0.125, 0.4375, 0.5625, 0.75, 0.5625]];
  if (face === 'ceiling') return [[0.25, 0.875, 0.25, 0.75, 1, 0.75], [0.4375, 0.25, 0.4375, 0.5625, 0.875, 0.5625]];
  if (facing === 'north') return [[0.25, 0.25, 0, 0.75, 0.75, 0.125], [0.4375, 0.4375, 0.125, 0.5625, 0.5625, 0.75]];
  if (facing === 'south') return [[0.25, 0.25, 0.875, 0.75, 0.75, 1], [0.4375, 0.4375, 0.25, 0.5625, 0.5625, 0.875]];
  if (facing === 'east') return [[0.875, 0.25, 0.25, 1, 0.75, 0.75], [0.25, 0.4375, 0.4375, 0.875, 0.5625, 0.5625]];
  return [[0, 0.25, 0.25, 0.125, 0.75, 0.75], [0.125, 0.4375, 0.4375, 0.75, 0.5625, 0.5625]];
}

function pressurePlateBoxes(state) {
  const h = state.get('powered') ? 0.03125 : 0.0625;
  return [[0, 0, 0, 1, h, 1]];
}

function weightedPressurePlateBoxes(state) {
  const h = state.get('power') > 0 ? 0.03125 : 0.0625;
  return [[0, 0, 0, 1, h, 1]];
}

function redstoneWireBoxes() {
  return [[0, 0, 0, 1, 0.0625, 1]];
}

function pistonHeadBoxes(state) {
  const facing = state.get('facing') || 'north';
  // The narrow rod joins the base to the broad contact plate at the far end.
  switch (facing) {
    case 'south': return [[0.375,0.375,0,0.625,0.625,0.75],[0,0,0.75,1,1,1]];
    case 'east': return [[0,0.375,0.375,0.75,0.625,0.625],[0.75,0,0,1,1,1]];
    case 'west': return [[0.25,0.375,0.375,1,0.625,0.625],[0,0,0,0.25,1,1]];
    case 'up': return [[0.375,0,0.375,0.625,0.75,0.625],[0,0.75,0,1,1,1]];
    case 'down': return [[0.375,0.25,0.375,0.625,1,0.625],[0,0,0,1,0.25,1]];
    default: return [[0.375,0.375,0.25,0.625,0.625,1],[0,0,0,1,1,0.25]];
  }
}

function repeaterBoxes() {
  return [
    [0, 0, 0, 1, 0.125, 1],
    [0.25, 0.125, 0.25, 0.375, 0.25, 0.375],
    [0.625, 0.125, 0.625, 0.75, 0.25, 0.75],
  ];
}


// ---------------------------------------------------------------------------
// Fences and fence gates
// ---------------------------------------------------------------------------

const FENCE_CACHE = new Map();
const FENCE_GATE_CACHE = new Map();

function gateConnectsFrom(direction, gateState) {
  if (gateState.block.renderShape !== 'fence_gate') return false;
  const facing = gateState.get('facing');
  // A gate's fence line runs perpendicular to its horizontal facing.
  return (direction === 'east' || direction === 'west')
    ? (facing === 'north' || facing === 'south')
    : (facing === 'east' || facing === 'west');
}

function fenceConnects(neighbor, direction) {
  if (!neighbor?.block) return false;
  if (neighbor.block.renderShape === 'fence') return true;
  if (gateConnectsFrom(direction, neighbor)) return true;
  return neighbor.block.solid === true && neighbor.block.opaqueCube === true;
}

function fenceBoxes(state, getNeighbor) {
  const connected = {
    north: fenceConnects(getNeighbor?.(0, 0, -1), 'north'),
    south: fenceConnects(getNeighbor?.(0, 0, 1), 'south'),
    west: fenceConnects(getNeighbor?.(-1, 0, 0), 'west'),
    east: fenceConnects(getNeighbor?.(1, 0, 0), 'east'),
  };
  const mask = (connected.north ? 1 : 0) | (connected.south ? 2 : 0) |
    (connected.west ? 4 : 0) | (connected.east ? 8 : 0);
  if (FENCE_CACHE.has(mask)) return FENCE_CACHE.get(mask);
  const boxes = [[0.375, 0, 0.375, 0.625, 1.5, 0.625]];
  const arms = {
    north: [0.375, 0, 0, 0.625, 0, 0.375],
    south: [0.375, 0, 0.625, 0.625, 0, 1],
    west: [0, 0, 0.375, 0.375, 0, 0.625],
    east: [0.625, 0, 0.375, 1, 0, 0.625],
  };
  for (const direction of ['north', 'south', 'west', 'east']) {
    if (!connected[direction]) continue;
    const [x0, , z0, x1, , z1] = arms[direction];
    boxes.push([x0, 0.375, z0, x1, 0.5625, z1]);
    boxes.push([x0, 0.75, z0, x1, 0.9375, z1]);
  }
  const frozen = Object.freeze(boxes.map((box) => Object.freeze(box)));
  FENCE_CACHE.set(mask, frozen);
  return frozen;
}

function fenceGateBoxes(state) {
  const facing = state.get('facing') || 'north';
  const alongX = (facing === 'north' || facing === 'south') !== (state.get('open') === true);
  const key = `${alongX ? 'x' : 'z'}`;
  if (FENCE_GATE_CACHE.has(key)) return FENCE_GATE_CACHE.get(key);
  const boxes = alongX ? [
    [0, 0, 0.375, 0.1875, 1.5, 0.625],
    [0.8125, 0, 0.375, 1, 1.5, 0.625],
    [0.1875, 0.375, 0.375, 0.8125, 0.5625, 0.625],
    [0.1875, 0.75, 0.375, 0.8125, 0.9375, 0.625],
  ] : [
    [0.375, 0, 0, 0.625, 1.5, 0.1875],
    [0.375, 0, 0.8125, 0.625, 1.5, 1],
    [0.375, 0.375, 0.1875, 0.625, 0.5625, 0.8125],
    [0.375, 0.75, 0.1875, 0.625, 0.9375, 0.8125],
  ];
  const frozen = Object.freeze(boxes.map((box) => Object.freeze(box)));
  FENCE_GATE_CACHE.set(key, frozen);
  return frozen;
}

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

const WALL_CACHE = new Map();

function wallConnects(neighbor) {
  if (!neighbor?.block) return false;
  return neighbor.block.renderShape === 'wall' ||
    (neighbor.block.solid === true && neighbor.block.opaqueCube === true);
}

function wallBoxes(state, getNeighbor) {
  const neighbors = {
    north: getNeighbor?.(0, 0, -1),
    south: getNeighbor?.(0, 0, 1),
    west: getNeighbor?.(-1, 0, 0),
    east: getNeighbor?.(1, 0, 0),
  };
  const connected = Object.fromEntries(
    Object.entries(neighbors).map(([direction, neighbor]) => [direction, wallConnects(neighbor)]),
  );
  const mask = (connected.north ? 1 : 0) | (connected.south ? 2 : 0) |
    (connected.west ? 4 : 0) | (connected.east ? 8 : 0);
  // Java walls use a taller side profile when joining another wall. Connections
  // to full opaque cubes use the lower profile.
  const tallMask = Object.entries(neighbors).reduce((value, [direction, neighbor], index) =>
    value | (neighbor?.block?.renderShape === 'wall' ? (1 << index) : 0), 0);
  const straight = (connected.north && connected.south && !connected.west && !connected.east) ||
    (connected.west && connected.east && !connected.north && !connected.south);
  // In a straight run the post is hidden unless a solid block directly caps it.
  const above = getNeighbor?.(0, 1, 0);
  const post = !straight || above?.block?.solid === true;
  const key = mask | (tallMask << 4) | (post ? 256 : 0);
  if (WALL_CACHE.has(key)) return WALL_CACHE.get(key);
  const boxes = [];
  if (post) boxes.push([0.25, 0, 0.25, 0.75, 1.5, 0.75]);
  const arms = {
    north: [0.25, 0, 0, 0.75, 0, 0.25],
    south: [0.25, 0, 0.75, 0.75, 0, 1],
    west: [0, 0, 0.25, 0.25, 0, 0.75],
    east: [0.75, 0, 0.25, 1, 0, 0.75],
  };
  const directions = ['north', 'south', 'west', 'east'];
  for (let i = 0; i < directions.length; i++) {
    const direction = directions[i];
    if (!connected[direction]) continue;
    const [x0, , z0, x1, , z1] = arms[direction];
    boxes.push([x0, 0.25, z0, x1, (tallMask & (1 << i)) ? 0.875 : 0.8125, z1]);
  }
  const frozen = Object.freeze(boxes.map((box) => Object.freeze(box)));
  WALL_CACHE.set(key, frozen);
  return frozen;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The boxes that make up a block's visible/physical shape, in 0..1 local space.
 * Used by the mesher for geometry.
 */
export function shapeBoxes(state, getNeighbor = null) {
  switch (state.block.renderShape) {
    case 'fence': return fenceBoxes(state, getNeighbor);
    case 'wall': return wallBoxes(state, getNeighbor);
    case 'fence_gate': return fenceGateBoxes(state);
    case 'slab': return slabBoxes(state);
    case 'stair': return stairBoxes(state, getNeighbor);
    case 'pane': return PANE_BOXES;
    case 'ladder': return ladderBoxes(state);
    case 'door': return doorBoxes(state);
    case 'trapdoor': return trapdoorBoxes(state);
    case 'button': return buttonBoxes(state);
    case 'lever': return leverBoxes(state);
    case 'pressure_plate': return pressurePlateBoxes(state);
    case 'weighted_pressure_plate': return weightedPressurePlateBoxes(state);
    case 'redstone_wire': return redstoneWireBoxes();
    case 'repeater': return repeaterBoxes();
    case 'piston_head': return pistonHeadBoxes(state);
    default: return FULL_LIST;
  }
}

/**
 * The boxes the player collides with. A non-solid block (air, plants, water)
 * has none; everything else uses its shape, defaulting to a full cube.
 */
export function collisionBoxes(state, getNeighbor = null) {
  if (!state.block.solid) return EMPTY_LIST;
  if (state.block.renderShape === 'fence_gate' && state.get('open')) return EMPTY_LIST;
  return shapeBoxes(state, getNeighbor);
}

/** True if this block is anything other than a plain full cube. */
export function isNonCube(state) {
  const shape = state.block.renderShape;
  return shape === 'slab' || shape === 'stair' || shape === 'pane' || shape === 'ladder' || shape === 'door' || shape === 'trapdoor' || shape === 'fence' || shape === 'wall' || shape === 'fence_gate' || shape === 'button' || shape === 'lever' || shape === 'pressure_plate' || shape === 'weighted_pressure_plate' || shape === 'redstone_wire' || shape === 'repeater' || shape === 'piston_head';
}

/** The shapes the mesher must render with the box emitter rather than as a cube. */
export const BOX_SHAPES = Object.freeze(new Set(['slab', 'stair', 'pane', 'ladder', 'door', 'trapdoor', 'fence', 'wall', 'fence_gate', 'button', 'lever', 'pressure_plate', 'weighted_pressure_plate', 'redstone_wire', 'repeater', 'piston_head']));
