import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual, assertDeepEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { shapeBoxes, collisionBoxes, isNonCube } from '../src/world/shapes.js';
import { orientPlacement } from '../src/game/interaction.js';
import { yawToFacing } from '../src/core/math.js';
import { RECIPES } from '../src/game/recipes.js';
import { Player } from '../src/entity/player.js';
import { BlockActionsMixin } from '../src/game/block_actions.js';
import { AABB } from '../src/core/math.js';

const OAK_FENCE = BLOCKS.get('mc:oak_fence').defaultState;
const OAK_GATE = BLOCKS.get('mc:oak_fence_gate').defaultState;
const STONE = BLOCKS.get('mc:stone').defaultState;

describe('Java fence and fence-gate registration and geometry', () => {
  it('registers all six wood fences and gates plus nether-brick fence', () => {
    for (const wood of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']) {
      assert(BLOCKS.get(`mc:${wood}_fence`), `${wood} fence missing`);
      assert(BLOCKS.get(`mc:${wood}_fence_gate`), `${wood} fence gate missing`);
      assertEqual(BLOCKS.get(`mc:${wood}_fence`).renderShape, 'fence');
      assertEqual(BLOCKS.get(`mc:${wood}_fence_gate`).renderShape, 'fence_gate');
    }
    assertEqual(BLOCKS.get('mc:nether_brick_fence').renderShape, 'fence');
  });

  it('an isolated fence is a 1.5-block-high post', () => {
    const boxes = shapeBoxes(OAK_FENCE);
    assertDeepEqual(boxes, [[0.375, 0, 0.375, 0.625, 1.5, 0.625]]);
    assert(isNonCube(OAK_FENCE));
    assertDeepEqual(collisionBoxes(OAK_FENCE), boxes);
  });

  it('adds two rails toward a neighbouring fence', () => {
    const boxes = shapeBoxes(OAK_FENCE, (dx, dy, dz) =>
      dx === 0 && dy === 0 && dz === -1 ? OAK_FENCE : null);
    assertEqual(boxes.length, 3);
    assertDeepEqual(boxes[1], [0.375, 0.375, 0, 0.625, 0.5625, 0.375]);
    assertDeepEqual(boxes[2], [0.375, 0.75, 0, 0.625, 0.9375, 0.375]);
  });

  it('connects to opaque full cubes but not glass or a misaligned gate', () => {
    const toStone = shapeBoxes(OAK_FENCE, (dx, dy, dz) =>
      dx === 1 && dy === 0 && dz === 0 ? STONE : null);
    assertEqual(toStone.length, 3);
    const glass = BLOCKS.get('mc:glass').defaultState;
    const toGlass = shapeBoxes(OAK_FENCE, (dx, dy, dz) =>
      dx === 1 && dy === 0 && dz === 0 ? glass : null);
    assertEqual(toGlass.length, 1);
    const northFacingGate = OAK_GATE.with('facing', 'north');
    const gateOnEast = shapeBoxes(OAK_FENCE, (dx, dy, dz) =>
      dx === 1 && dy === 0 && dz === 0 ? northFacingGate : null);
    assertEqual(gateOnEast.length, 3);
    const gateOnNorth = shapeBoxes(OAK_FENCE, (dx, dy, dz) =>
      dx === 0 && dy === 0 && dz === -1 ? northFacingGate : null);
    assertEqual(gateOnNorth.length, 1);
  });

  it('fence gate rotates its panel and removes collision while open', () => {
    const closed = shapeBoxes(OAK_GATE);
    const open = OAK_GATE.with('open', true);
    const opened = shapeBoxes(open);
    assertEqual(closed.length, 4);
    assertEqual(opened.length, 4);
    assertEqual(closed[0][0], 0);
    assertEqual(opened[0][0], 0.375);
    assertEqual(collisionBoxes(open).length, 0);
    assertEqual(collisionBoxes(OAK_GATE).length, 4);
  });

  it('fence gates are oriented along the player facing at placement', () => {
    const player = { yaw: 37 };
    const state = orientPlacement(BLOCKS.get('mc:oak_fence_gate'), player, {
      face: { dx: 0, dy: 1, dz: 0 },
    });
    assertEqual(state.get('facing'), yawToFacing(player.yaw));
  });

  it('fence collision scans the block below for its upper half', () => {
    const player = new Player(0.5, 1.2, 0.5);
    const world = {
      getBlock(x, y, z) {
        return x === 0 && y === 0 && z === 0 ? OAK_FENCE : BLOCKS.get('mc:air').defaultState;
      },
    };
    assertEqual(player._boxIntersectsSolid(world, new AABB(0.4, 1.2, 0.4, 0.6, 1.4, 0.6)), true);
  });

  it('toggles a wooden fence gate on right-click and leaves it unchanged while sneaking', () => {
    let state = OAK_GATE;
    const game = {
      hit: { x: 2, y: 4, z: 3, state },
      world: {
        getBlock() { return BLOCKS.get('mc:air').defaultState; },
        setBlock(x, y, z, next) { state = next; return true; },
      },
      inventory: { held: { item: null, isEmpty: true } },
      player: {},
      entities: {
        targetedMob: () => null,
        tameFromPlayer: () => false,
        useFishingRod: () => false,
        shearFromPlayer: () => false,
        feedAnimalFromPlayer: () => false,
      },
      keys: { has: () => false },
      _farmInteraction: () => false,
      ...BlockActionsMixin,
    };
    game._useOrPlace();
    assertEqual(state.get('open'), true);
    game.hit = { x: 2, y: 4, z: 3, state };
    game.keys = { has: () => true };
    game._useOrPlace();
    assertEqual(state.get('open'), true);
  });

  it('registers exact wooden fence and fence-gate output recipes', () => {
    for (const wood of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']) {
      const fence = RECIPES.recipes.find((recipe) => recipe.result === `mc:${wood}_fence`);
      const gate = RECIPES.recipes.find((recipe) => recipe.result === `mc:${wood}_fence_gate`);
      assert(fence, `${wood} fence recipe missing`);
      assert(gate, `${wood} gate recipe missing`);
      assertEqual(fence.count, 3);
      assertDeepEqual(fence.pattern, ['PSP', 'PSP']);
      assertEqual(gate.count, 1);
      assertDeepEqual(gate.pattern, ['SPS', 'SPS']);
    }
    const nether = RECIPES.recipes.find((recipe) => recipe.result === 'mc:nether_brick_fence');
    assert(nether);
    assertEqual(nether.count, 6);
    assertDeepEqual(nether.pattern, ['NNN', 'NNN']);
  });
});
