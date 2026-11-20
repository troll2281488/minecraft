import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual, assertDeepEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { shapeBoxes, collisionBoxes, isNonCube } from '../src/world/shapes.js';
import { Player, GAMEMODE } from '../src/entity/player.js';
import { meshChunk } from '../src/render/mesher.js';
import { Chunk } from '../src/world/chunk.js';
import { computeChunkLight } from '../src/world/lighting.js';
import { CHUNK_SIZE, MIN_Y, SECTION_COUNT, SECTION_HEIGHT, MAX_LIGHT } from '../src/core/constants.js';
import { yToSectionIndex, yToSectionLocal, sectionIndex } from '../src/core/math.js';

/**
 * The box-model system: slabs and stairs render and collide from ONE box list,
 * so what you see is what you hit. These tests pin the box geometry, the
 * collision boxes derived from it, and the mesher's box emission.
 */

const AIR = BLOCKS.get('mc:air').defaultState;
const STONE = BLOCKS.get('mc:stone').defaultState;
const OAK_SLAB = BLOCKS.get('mc:oak_slab').defaultState; // bottom by default
const STONE_STAIRS = BLOCKS.get('mc:stone_stairs').defaultState;
const IRON_BARS = BLOCKS.get('mc:iron_bars').defaultState;

describe('shapes: box geometry', () => {
  it('a full cube is one unit box', () => {
    assertDeepEqual(shapeBoxes(STONE), [[0, 0, 0, 1, 1, 1]]);
  });

  it('a bottom slab is the lower half', () => {
    assertDeepEqual(shapeBoxes(OAK_SLAB), [[0, 0, 0, 1, 0.5, 1]]);
  });

  it('a top slab is the upper half', () => {
    assertDeepEqual(shapeBoxes(OAK_SLAB.with('type', 'top')), [[0, 0.5, 0, 1, 1, 1]]);
  });

  it('a double slab fills the block', () => {
    assertDeepEqual(shapeBoxes(OAK_SLAB.with('type', 'double')), [[0, 0, 0, 1, 1, 1]]);
  });

  it('a stair is a base slab plus a raised step on the facing side', () => {
    const north = STONE_STAIRS.with('facing', 'north').with('half', 'bottom');
    const boxes = shapeBoxes(north);
    assertEqual(boxes.length, 2, 'a straight stair should be two boxes');
    assertDeepEqual(boxes[0], [0, 0, 0, 1, 0.5, 1], 'base slab');
    assertDeepEqual(boxes[1], [0, 0.5, 0, 1, 1, 0.5], 'north step');
  });

  it('an upside-down stair puts its base on top', () => {
    const boxes = shapeBoxes(STONE_STAIRS.with('facing', 'east').with('half', 'top'));
    assertDeepEqual(boxes[0], [0, 0.5, 0, 1, 1, 1], 'top base');
    assertDeepEqual(boxes[1], [0.5, 0, 0, 1, 0.5, 1], 'east step below');
  });

  it('iron bars use a thin five-part pane profile', () => {
    const boxes = shapeBoxes(IRON_BARS);
    assertEqual(boxes.length, 5);
    assertDeepEqual(boxes[0], [0.4375, 0, 0.4375, 0.5625, 1, 0.5625]);
    assert(isNonCube(IRON_BARS));
    assertDeepEqual(collisionBoxes(IRON_BARS), boxes);
  });

  it('door panels are thin, rotate when opened, and use both halves consistently', () => {
    const door = BLOCKS.get('mc:oak_door').defaultState;
    const closed = shapeBoxes(door);
    assertEqual(closed.length, 1);
    assertDeepEqual(closed[0], [0, 0, 0.8125, 1, 1, 1]);
    const opened = shapeBoxes(door.with('open', true));
    assertDeepEqual(opened[0], [0, 0, 0, 0.1875, 1, 1]);
    assertDeepEqual(shapeBoxes(door.with('half', 'upper')), closed);
    assert(isNonCube(door));
    assertDeepEqual(collisionBoxes(door), closed);
  });

  it('trapdoors use a thin horizontal panel when closed and vertical panel when open', () => {
    const trapdoor = BLOCKS.get('mc:oak_trapdoor').defaultState;
    assertDeepEqual(shapeBoxes(trapdoor), [[0, 0, 0, 1, 0.1875, 1]]);
    assertDeepEqual(shapeBoxes(trapdoor.with('half', 'top')), [[0, 0.8125, 0, 1, 1, 1]]);
    assertDeepEqual(shapeBoxes(trapdoor.with('open', true)), [[0, 0, 0, 1, 1, 0.1875]]);
    assertDeepEqual(collisionBoxes(trapdoor), shapeBoxes(trapdoor));
    assert(isNonCube(trapdoor));
  });

  it('all six wooden trapdoors and iron trapdoor are registered', () => {
    for (const id of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'iron']) {
      const block = BLOCKS.get(`mc:${id}_trapdoor`);
      assert(block, `${id} trapdoor missing`);
      assertEqual(block.renderShape, 'trapdoor');
      assertEqual(block.states.length, 4 * 2 * 2 * 2);
    }
  });

  it('buttons, levers and pressure plates have compact render geometry', () => {
    const button = BLOCKS.get('mc:stone_button').defaultState;
    assertDeepEqual(shapeBoxes(button), [[0.375, 0.375, 0, 0.625, 0.625, 0.125]]);
    assertDeepEqual(shapeBoxes(button.with('powered', true)), [[0.375, 0.375, 0, 0.625, 0.625, 0.0625]]);
    const plate = BLOCKS.get('mc:stone_pressure_plate').defaultState;
    assertDeepEqual(shapeBoxes(plate), [[0, 0, 0, 1, 0.0625, 1]]);
    assertDeepEqual(shapeBoxes(plate.with('powered', true)), [[0, 0, 0, 1, 0.03125, 1]]);
    assertEqual(shapeBoxes(BLOCKS.get('mc:lever').defaultState).length, 2);
    assert(isNonCube(button));
    assertEqual(collisionBoxes(button).length, 0, 'buttons are non-solid controls');
    assertEqual(collisionBoxes(plate).length, 0, 'pressure plates are non-solid controls');
  });

  it('all Java 1.19 button, lever and pressure plate blocks are registered', () => {
    for (const id of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']) {
      assert(BLOCKS.get(`mc:${id}_button`), `${id} button missing`);
      assert(BLOCKS.get(`mc:${id}_pressure_plate`), `${id} pressure plate missing`);
    }
    for (const id of ['stone', 'polished_blackstone']) {
      assert(BLOCKS.get(`mc:${id}_button`), `${id} button missing`);
      assert(BLOCKS.get(`mc:${id}_pressure_plate`), `${id} pressure plate missing`);
    }
    assert(BLOCKS.get('mc:lever'), 'lever missing');
  });

  it('all six wooden door variants and iron door are registered', () => {
    for (const id of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'iron']) {
      const block = BLOCKS.get(`mc:${id}_door`);
      assert(block, `${id} door missing`);
      assertEqual(block.renderShape, 'door');
      assertEqual(block.states.length, 4 * 2 * 2 * 2 * 2);
    }
  });

  it('isNonCube distinguishes slabs, stairs and panes from cubes', () => {
    assert(isNonCube(OAK_SLAB));
    assert(isNonCube(STONE_STAIRS));
    assert(isNonCube(IRON_BARS));
    assert(!isNonCube(STONE));
  });
});

describe('shapes: collision boxes', () => {
  it('a solid cube collides as a full box', () => {
    assertDeepEqual(collisionBoxes(STONE), [[0, 0, 0, 1, 1, 1]]);
  });

  it('a slab collides only in its half', () => {
    assertDeepEqual(collisionBoxes(OAK_SLAB), [[0, 0, 0, 1, 0.5, 1]]);
  });

  it('non-solid blocks have no collision', () => {
    assertEqual(collisionBoxes(AIR).length, 0);
    assertEqual(collisionBoxes(BLOCKS.get('mc:short_grass').defaultState).length, 0);
    assertEqual(collisionBoxes(BLOCKS.get('mc:water').defaultState).length, 0);
  });
});

// ---------------------------------------------------------------------------
// Collision behaviour: the player rests on the box the mesher draws
// ---------------------------------------------------------------------------

/** Stub world: solid floor at/below floorY, plus an optional slab layer. */
function slabWorld(floorY, slabAt) {
  return {
    getBlock(x, y, z) {
      if (slabAt && y === slabAt.y && x >= slabAt.x0 && x <= slabAt.x1 &&
          z >= slabAt.z0 && z <= slabAt.z1) {
        return OAK_SLAB;
      }
      return y <= floorY ? STONE : AIR;
    },
  };
}

function resetInput(p, o = {}) {
  Object.assign(p.input, { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false }, o);
}

describe('shapes: the player collides with the box, not a full cube', () => {
  it('rests on top of a bottom slab at +0.5, not +1', () => {
    // Floor at y=64, a slab layer at y=65. The slab's top is 65.5, so the
    // player should stand at 65.5 -- proving collision uses the half box.
    const world = slabWorld(64, { y: 65, x0: -2, x1: 2, z0: -2, z1: 2 });
    const p = new Player(0.5, 68, 0.5);
    p.gamemode = GAMEMODE.SURVIVAL;
    resetInput(p);
    for (let i = 0; i < 60; i++) p.tick(world);
    assert(p.onGround, 'never landed on the slab');
    assert(Math.abs(p.y - 65.5) < 0.01, `rested at ${p.y.toFixed(3)}, expected 65.5`);
  });

  it('auto-steps onto a 0.5 slab (step height 0.6 > 0.5)', () => {
    // Floor at 64; a slab wall the player walks into from the flat side.
    const world = slabWorld(64, { y: 65, x0: -2, x1: 2, z0: 3, z1: 12 });
    const p = new Player(0.5, 65, 0.5);
    p.gamemode = GAMEMODE.SURVIVAL;
    p.yaw = 0; // face +Z, into the slabs
    resetInput(p, {});
    for (let i = 0; i < 10; i++) p.tick(world);
    resetInput(p, { forward: 1 });
    for (let i = 0; i < 40; i++) p.tick(world);
    // Should have climbed onto the slabs and be standing at 65.5.
    assert(p.z > 3, `did not reach the slabs (z=${p.z.toFixed(2)})`);
    assert(Math.abs(p.y - 65.5) < 0.05, `did not step onto the slab (y=${p.y.toFixed(2)})`);
  });
});

// ---------------------------------------------------------------------------
// Mesher emits box geometry
// ---------------------------------------------------------------------------

function viewFor(chunk) {
  const inside = (x, z) => x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE;
  return {
    getState: (x, y, z) =>
      inside(x, z) && y >= MIN_Y && y < MIN_Y + SECTION_COUNT * SECTION_HEIGHT
        ? chunk.getBlock(x, y, z) : AIR,
    lightAt: (x, y, z) => {
      if (!inside(x, z)) return MAX_LIGHT;
      const si = yToSectionIndex(y);
      if (si === -1) return y >= 0 ? MAX_LIGHT : 0;
      const s = chunk.sections[si];
      if (!s) return y > chunk.getHeight(x, z) ? MAX_LIGHT : 0;
      const i = sectionIndex(x, yToSectionLocal(y), z);
      return s.skyLight.get(i) | (s.blockLight.get(i) << 4);
    },
    sectionHasBlocks: (si) => !!chunk.sections[si] && !chunk.sections[si].isEmpty,
    textureLayer: () => 1,
  };
}

describe('shapes: mesher emits box geometry', () => {
  it('a lone slab renders (fewer quads than a full cube)', () => {
    const cubeChunk = new Chunk(0, 0);
    cubeChunk.setBlock(8, 64, 8, STONE);
    computeChunkLight(cubeChunk);
    const cubeQuads = meshChunk(viewFor(cubeChunk)).opaqueQuads;

    const slabChunk = new Chunk(0, 0);
    slabChunk.setBlock(8, 64, 8, OAK_SLAB);
    computeChunkLight(slabChunk);
    const slabQuads = meshChunk(viewFor(slabChunk)).opaqueQuads;

    assert(slabQuads > 0, 'the slab emitted no geometry');
    assertEqual(cubeQuads, 6, 'sanity: a lone cube is 6 faces');
    // A slab still shows 6 faces (top, bottom, 4 shortened sides).
    assertEqual(slabQuads, 6, `slab emitted ${slabQuads} quads`);
  });

  it('a stair emits more faces than a cube (two boxes)', () => {
    const chunk = new Chunk(0, 0);
    chunk.setBlock(8, 64, 8, STONE_STAIRS.with('facing', 'north'));
    computeChunkLight(chunk);
    const quads = meshChunk(viewFor(chunk)).opaqueQuads;
    // Base slab (6) + step box (6), minus nothing culled in open air = 12.
    assert(quads >= 10, `a stair should emit ~12 faces, got ${quads}`);
  });

  it('iron bars emit pane geometry instead of a full cube', () => {
    const chunk = new Chunk(0, 0);
    chunk.setBlock(8, 64, 8, IRON_BARS);
    computeChunkLight(chunk);
    const quads = meshChunk(viewFor(chunk)).opaqueQuads;
    assert(quads > 6, `iron bars should emit multiple thin boxes, got ${quads} quads`);
  });

  it('a slab under an opaque block culls its top face', () => {
    // Regression for the boundary-culling rule: the slab's top is interior
    // (y=0.5) so it always draws; but its bottom at y=0 culls against the
    // block below. Here we put stone above a TOP slab and check the top slab's
    // top face (y=1, a boundary) is culled.
    const chunk = new Chunk(0, 0);
    chunk.setBlock(8, 64, 8, OAK_SLAB.with('type', 'top')); // occupies y 0.5..1
    chunk.setBlock(8, 65, 8, STONE); // full cube directly above
    computeChunkLight(chunk);
    const quads = meshChunk(viewFor(chunk)).opaqueQuads;
    // Top slab: top face (boundary, y=1) culled by the stone above; bottom
    // (interior, y=0.5) drawn; 4 sides drawn. Plus the stone's 5 visible faces
    // (its bottom is against the slab top but the slab is not opaqueCube, so it
    // still draws). We assert the slab contributed and nothing errored.
    assert(quads > 0 && quads < 12, `unexpected quad count ${quads}`);
  });
});
