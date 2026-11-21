import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual, assertDeepEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { shapeBoxes, collisionBoxes, isNonCube, wallStateFromNeighbors } from '../src/world/shapes.js';
import { refreshWallConnections, refreshWallConnectionsInChunk } from '../src/game/wall_updates.js';
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
      _placeBlock: () => {},
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


describe('Java wall family geometry and crafting', () => {
  const materials = [
    'cobblestone', 'mossy_cobblestone', 'brick', 'prismarine',
    'red_sandstone', 'mossy_stone_brick', 'granite', 'stone_brick',
    'nether_brick', 'andesite', 'red_nether_brick', 'sandstone',
    'end_stone_brick', 'diorite', 'blackstone',
    'polished_blackstone_brick', 'polished_blackstone',
  ];

  it('registers all 17 Java wall variants as connected non-cube blocks', () => {
    for (const material of materials) {
      const block = BLOCKS.get(`mc:${material}_wall`);
      assert(block, `${material} wall missing`);
      assertEqual(block.renderShape, 'wall');
      assertEqual(block.solid, true);
      assertEqual(block.opaqueCube, false);
      assert(isNonCube(block.defaultState));
    }
  });

  it('an isolated wall has a 1.5-block-high central post', () => {
    const wall = BLOCKS.get('mc:cobblestone_wall').defaultState;
    const boxes = shapeBoxes(wall);
    assertDeepEqual(boxes, [[0.25, 0, 0.25, 0.75, 1.5, 0.75]]);
    assertDeepEqual(collisionBoxes(wall), boxes);
  });

  it('connects wall arms to adjacent walls and opaque cubes', () => {
    const wall = BLOCKS.get('mc:cobblestone_wall').defaultState;
    const connectedState = wallStateFromNeighbors(wall, (dx, dy, dz) =>
      dx === 0 && dy === 0 && dz === -1 ? wall : null);
    const connected = shapeBoxes(connectedState);
    assertEqual(connected.length, 2);
    assertDeepEqual(connected[1], [0.25, 0.25, 0, 0.75, 0.8125, 0.25]);
    const stoneState = wallStateFromNeighbors(wall, (dx, dy, dz) =>
      dx === 1 && dy === 0 && dz === 0 ? STONE : null);
    const toStone = shapeBoxes(stoneState);
    assertEqual(toStone.length, 2);
    assertDeepEqual(toStone[1], [0.75, 0.25, 0.25, 1, 0.8125, 0.75]);
  });

  it('uses tall side arms when joining another wall, but low arms for opaque cubes', () => {
    const wall = BLOCKS.get('mc:cobblestone_wall').defaultState;
    const tall = shapeBoxes(wallStateFromNeighbors(wall, (dx, dy, dz) =>
      dx === 0 && dy === 0 && dz === -1 ? wall : null));
    assertDeepEqual(tall[1], [0.25, 0.25, 0, 0.75, 0.875, 0.25]);
    const low = shapeBoxes(wallStateFromNeighbors(wall, (dx, dy, dz) =>
      dx === 0 && dy === 0 && dz === -1 ? STONE : null));
    assertDeepEqual(low[1], [0.25, 0.25, 0, 0.75, 0.8125, 0.25]);
  });

  it('hides the central post in an uncapped straight wall run', () => {
    const wall = BLOCKS.get('mc:cobblestone_wall').defaultState;
    const straightState = wallStateFromNeighbors(wall, (dx, dy, dz) =>
      dy === 0 && dx === 0 && Math.abs(dz) === 1 ? wall : null);
    const straight = shapeBoxes(straightState);
    assertEqual(straight.length, 2);
    assertDeepEqual(straight[0], [0.25, 0.25, 0, 0.75, 0.8125, 0.25]);
    const cappedState = wallStateFromNeighbors(wall, (dx, dy, dz) =>
      dy === 1 && dx === 0 && dz === 0 ? STONE
        : dy === 0 && dx === 0 && Math.abs(dz) === 1 ? wall : null);
    const capped = shapeBoxes(cappedState);
    assertEqual(capped.length, 3);
    assertDeepEqual(capped[0], [0.25, 0, 0.25, 0.75, 1.5, 0.75]);
  });

  it('does not connect to glass, fences, or fence gates', () => {
    const wall = BLOCKS.get('mc:cobblestone_wall').defaultState;
    const glass = BLOCKS.get('mc:glass').defaultState;
    const fence = BLOCKS.get('mc:oak_fence').defaultState;
    const gate = BLOCKS.get('mc:oak_fence_gate').defaultState;
    for (const neighbor of [glass, fence, gate]) {
      assertEqual(shapeBoxes(wall, () => neighbor).length, 1);
    }
  });

  it('provides the vanilla brick block used by the brick-wall recipe', () => {
    assert(BLOCKS.get('mc:bricks'));
    const recipe = RECIPES.recipes.find((entry) => entry.result === 'mc:brick_wall');
    assert(recipe);
    assertEqual(recipe.key.B, 'mc:bricks');
  });

  it('registers six-wall recipes for every material variant', () => {
    for (const material of materials) {
      const recipe = RECIPES.recipes.find((entry) => entry.result === `mc:${material}_wall`);
      assert(recipe, `${material} wall recipe missing`);
      assertEqual(recipe.count, 6);
      assertDeepEqual(recipe.pattern, ['BBB', 'BBB']);
      assert(BLOCKS.get(recipe.key.B), `wall ingredient block ${recipe.key.B} missing`);
    }
  });

  it('stores all four wall connections and the post flag in blockstate', () => {
    const wallBlock = BLOCKS.get('mc:cobblestone_wall');
    for (const direction of ['north', 'south', 'east', 'west']) {
      assertEqual(wallBlock.properties[direction].stringValues.join(','), 'none,low,tall');
    }
    assertEqual(wallBlock.properties.up.stringValues.join(','), 'false,true');
    const wall = wallBlock.defaultState;
    const state = wallStateFromNeighbors(wall, (dx, dy, dz) =>
      dx === 0 && dy === 0 && dz === -1 ? STONE : null);
    assertEqual(state.get('north'), 'low');
    assertEqual(state.get('south'), 'none');
    assertEqual(state.get('up'), true);
    assert(state.stringId.includes('north=low'));
  });

  it('refreshes adjacent walls only when a serialized connection actually changes', () => {
    const wall = BLOCKS.get('mc:cobblestone_wall').defaultState;
    const worldBlocks = new Map([
      ['0,0,0', wall],
      ['0,0,-1', STONE],
    ]);
    const writes = [];
    const world = {
      getBlock(x, y, z) { return worldBlocks.get(`${x},${y},${z}`) || BLOCKS.get('mc:air').defaultState; },
      setBlock(x, y, z, state) {
        worldBlocks.set(`${x},${y},${z}`, state);
        writes.push({ x, y, z, state });
        return true;
      },
    };
    const pushes = [];
    const multiplayer = { pushBlockChange: (...args) => pushes.push(args) };
    const first = refreshWallConnections(world, multiplayer, { x: 0, y: 0, z: -1 });
    assertEqual(first.length, 1);
    assertEqual(world.getBlock(0, 0, 0).get('north'), 'low');
    assertEqual(pushes.length, 1);
    const second = refreshWallConnections(world, multiplayer, { x: 0, y: 0, z: -1 });
    assertEqual(second.length, 0);
    assertEqual(writes.length, 1);
    assertEqual(pushes.length, 1);
  });

  it('serializes straight wall runs without a post unless capped above', () => {
    const wall = BLOCKS.get('mc:cobblestone_wall').defaultState;
    const straight = wallStateFromNeighbors(wall, (dx, dy, dz) =>
      dy === 0 && dx === 0 && Math.abs(dz) === 1 ? wall : null);
    assertEqual(straight.get('north'), 'tall');
    assertEqual(straight.get('south'), 'tall');
    assertEqual(straight.get('up'), false);
    const capped = wallStateFromNeighbors(wall, (dx, dy, dz) =>
      dy === 1 && dx === 0 && dz === 0 ? STONE
        : dy === 0 && dx === 0 && Math.abs(dz) === 1 ? wall : null);
    assertEqual(capped.get('up'), true);
  });


  it('round-trips wall connection states through the canonical save string', () => {
    const wall = BLOCKS.get('mc:cobblestone_wall').defaultState;
    const connected = wallStateFromNeighbors(wall, (dx, dy, dz) =>
      dx === 1 && dy === 0 && dz === 0 ? STONE : null);
    const restored = BLOCKS.stateFromString(connected.stringId);
    assertEqual(restored.stringId, connected.stringId);
    assertEqual(restored.get('east'), 'low');
    assertEqual(restored.get('up'), true);
    const legacy = BLOCKS.stateFromString('mc:cobblestone_wall');
    assertEqual(legacy.get('east'), 'none');
    assertEqual(legacy.get('up'), true);
  });

});


describe('wall connection rebuild on chunk load', () => {
  it('recomputes saved wall states and touching neighbour walls when a chunk is adopted', () => {
    const wall = BLOCKS.get('mc:cobblestone_wall').defaultState;
    const air = BLOCKS.get('mc:air').defaultState;
    const changed = new Map([
      ['0,0,0', wall],
      ['1,0,0', wall],
    ]);
    const writes = [];
    const world = {
      getChunk(cx, cz) {
        if (cx === 0 && cz === 0) return chunk;
        return null;
      },
      getBlock(x, y, z) {
        return changed.get(`${x},${y},${z}`) ?? air;
      },
      setBlock(x, y, z, state, options) {
        writes.push({ x, y, z, state, options });
        changed.set(`${x},${y},${z}`, state);
        return true;
      },
    };
    const section = {
      yOffset: 0,
      blocks: {
        palette: [wall, air],
        get(index) { return index === 0 ? wall : air; },
      },
    };
    const chunk = { cx: 0, cz: 0, sections: [section] };
    const updated = refreshWallConnectionsInChunk(world, chunk);
    assert(updated.length > 0, 'chunk-load rebuild did not update the connected wall');
    assert(writes.every((write) => write.options?.relight === false),
      'wall-only state changes should not trigger a full chunk relight');
    assertEqual(changed.get('0,0,0').get('east'), 'tall');
  });
});
