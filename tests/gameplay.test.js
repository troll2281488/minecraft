import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { Inventory, CraftingGrid, SLOT } from '../src/game/inventory.js';
import { RECIPES } from '../src/game/recipes.js';
import { breakTicks, canHarvest, blockDrops, raycast } from '../src/game/interaction.js';
import { meshChunk } from '../src/render/mesher.js';
import { Chunk } from '../src/world/chunk.js';
import { computeChunkLight } from '../src/world/lighting.js';
import { TerrainGenerator } from '../src/world/gen/terrain.js';
import { CHUNK_SIZE, MIN_Y, SECTION_COUNT, SECTION_HEIGHT, MAX_LIGHT } from '../src/core/constants.js';
import { yToSectionIndex, yToSectionLocal, sectionIndex } from '../src/core/math.js';

const AIR = BLOCKS.get('mc:air').defaultState;
const STONE = BLOCKS.get('mc:stone').defaultState;

/** Minimal mesher view over a single chunk, treating everything outside as air. */
function viewFor(chunk) {
  const inside = (x, z) => x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE;
  return {
    getState: (x, y, z) =>
      inside(x, z) && y >= MIN_Y && y < MIN_Y + SECTION_COUNT * SECTION_HEIGHT
        ? chunk.getBlock(x, y, z)
        : AIR,
    lightAt: (x, y, z) => {
      if (!inside(x, z)) return MAX_LIGHT;
      const si = yToSectionIndex(y);
      if (si === -1) return y >= 0 ? MAX_LIGHT : 0;
      const section = chunk.sections[si];
      if (!section) return y > chunk.getHeight(x, z) ? MAX_LIGHT : 0;
      const i = sectionIndex(x, yToSectionLocal(y), z);
      return section.skyLight.get(i) | (section.blockLight.get(i) << 4);
    },
    sectionHasBlocks: (si) => !!chunk.sections[si] && !chunk.sections[si].isEmpty,
    textureLayer: () => 1,
  };
}

describe('mining: vanilla break times', () => {
  // Regression values taken from the Minecraft Wiki, not from this
  // implementation -- so the test can actually disagree with the code.
  const cases = [
    ['mc:stone', null, 7.5],
    ['mc:stone', 'mc:wooden_pickaxe', 1.15],
    ['mc:stone', 'mc:stone_pickaxe', 0.6],
    ['mc:stone', 'mc:iron_pickaxe', 0.4],
    ['mc:stone', 'mc:diamond_pickaxe', 0.3],
    ['mc:stone', 'mc:golden_pickaxe', 0.2],
    ['mc:obsidian', 'mc:diamond_pickaxe', 9.4],
    ['mc:dirt', null, 0.75],
    ['mc:dirt', 'mc:wooden_shovel', 0.4],
    ['mc:oak_log', 'mc:wooden_axe', 1.5],
  ];

  for (const [blockId, toolId, expectedSeconds] of cases) {
    it(`${blockId} with ${toolId ?? 'bare hands'} ≈ ${expectedSeconds}s`, () => {
      const block = BLOCKS.get(blockId);
      const tool = toolId ? ItemStack.of(toolId) : ItemStack.EMPTY;
      const ticks = breakTicks(block, tool, {});
      const seconds = ticks / 20;
      // Tight tolerance on purpose. With the per-tick ceiling these reproduce
      // the published figures exactly; a loose tolerance here is what let the
      // missing ceiling hide, since every value was only ~6% off.
      assert(
        Math.abs(seconds - expectedSeconds) < 0.001,
        `expected ${expectedSeconds}s, got ${seconds}s (${ticks} ticks)`,
      );
      assertEqual(ticks, Math.round(ticks), 'break time must be a whole number of ticks');
    });
  }

  it('bedrock is unbreakable', () => {
    assertEqual(breakTicks(BLOCKS.get('mc:bedrock'), ItemStack.EMPTY, {}), Infinity);
  });

  it('durations landing on a whole tick are not pushed to the next one', () => {
    // Floating-point regression. 0.2 * 1.5 * 20 is 6.000000000000001 in IEEE
    // 754, so a bare Math.ceil returns 7 -- and every block whose time lands
    // exactly on a tick boundary quietly costs an extra tick.
    assertEqual(breakTicks(BLOCKS.get('mc:oak_leaves'), ItemStack.EMPTY, {}), 6);

    // A genuinely fractional case must still round up.
    assertEqual(breakTicks(BLOCKS.get('mc:stone'), ItemStack.of('mc:wooden_pickaxe'), {}), 23);
  });

  it('instant-break blocks take no time', () => {
    assertEqual(breakTicks(BLOCKS.get('mc:short_grass'), ItemStack.EMPTY, {}), 0);
  });

  it('underwater and airborne each cost a factor of 5', () => {
    // The penalty divides SPEED, and the whole-tick ceiling is applied once at
    // the very end -- so the result is NOT five times the already-rounded base
    // time. Stone with an iron pickaxe is 7.5 raw ticks (8 after rounding);
    // underwater it is 37.5 raw ticks, so 38 rather than 40.
    //
    // Asserting `base * 5` here would be asserting a bug.
    const block = BLOCKS.get('mc:stone');
    const tool = ItemStack.of('mc:iron_pickaxe');

    assertEqual(breakTicks(block, tool, {}), 8, 'baseline');
    assertEqual(breakTicks(block, tool, { underwater: true }), 38, 'underwater');
    assertEqual(breakTicks(block, tool, { airborne: true }), 38, 'airborne');
  });

  it('Aqua Affinity cancels the underwater penalty', () => {
    const block = BLOCKS.get('mc:stone');
    const tool = ItemStack.of('mc:iron_pickaxe');
    assertEqual(
      breakTicks(block, tool, { underwater: true, aquaAffinity: true }),
      breakTicks(block, tool, {}),
    );
  });

  it('a tool below the harvest level mines but drops nothing', () => {
    const iron = BLOCKS.get('mc:iron_ore');
    const wooden = ItemStack.of('mc:wooden_pickaxe');
    assert(Number.isFinite(breakTicks(iron, wooden, {})), 'should still be breakable');
    assert(!canHarvest(iron, wooden), 'wooden pickaxe should not harvest iron ore');
    assertEqual(blockDrops(iron.defaultState, wooden, 1, 0, 0, 0).length, 0);
  });
});

describe('block drops are deterministic (seeded, not Math.random)', () => {
  // A world is meant to be reproducible from its seed. A global RNG breaks that
  // invisibly: two players on one seed breaking the same ore get different
  // amounts, and nothing can pin the behaviour down in a test.

  it('the same block at the same position always drops the same thing', () => {
    const redstone = BLOCKS.get('mc:redstone_ore').defaultState;
    const pick = ItemStack.of('mc:iron_pickaxe');
    const first = JSON.stringify(blockDrops(redstone, pick, 12345, 10, 20, 30));
    for (let i = 0; i < 50; i++) {
      assertEqual(
        JSON.stringify(blockDrops(redstone, pick, 12345, 10, 20, 30)), first,
        'repeated calls disagreed',
      );
    }
  });

  it('leaf sapling drops are stable per position', () => {
    const leaves = BLOCKS.get('mc:oak_leaves').defaultState;
    const results = new Set();
    for (let i = 0; i < 40; i++) {
      results.add(JSON.stringify(blockDrops(leaves, ItemStack.EMPTY, 7, 4, 64, 9)));
    }
    assertEqual(results.size, 1, 'leaf drops varied across identical calls');
  });

  it('different positions still give varied results', () => {
    const redstone = BLOCKS.get('mc:redstone_ore').defaultState;
    const pick = ItemStack.of('mc:iron_pickaxe');
    const counts = new Set();
    for (let x = 0; x < 60; x++) counts.add(blockDrops(redstone, pick, 1, x, 12, 0)[0].count);
    assert(counts.size > 1, 'every position produced an identical count; not actually random');
  });

  it('different world seeds give different results', () => {
    const redstone = BLOCKS.get('mc:redstone_ore').defaultState;
    const pick = ItemStack.of('mc:iron_pickaxe');
    const a = [], b = [];
    for (let x = 0; x < 40; x++) {
      a.push(blockDrops(redstone, pick, 111, x, 12, 0)[0].count);
      b.push(blockDrops(redstone, pick, 222, x, 12, 0)[0].count);
    }
    assert(a.join() !== b.join(), 'two different seeds produced identical drop sequences');
  });
});

describe('inventory rules', () => {
  it('fills partial stacks before taking an empty slot', () => {
    const inv = new Inventory();
    inv.set(0, ItemStack.of('mc:cobblestone', 60));
    inv.addItem('mc:cobblestone', 10);
    assertEqual(inv.get(0).count, 64, 'did not top up the existing stack first');
    assertEqual(inv.countOf('mc:cobblestone'), 70);
  });

  it('spills across multiple slots beyond one stack', () => {
    const inv = new Inventory();
    assertEqual(inv.addItem('mc:cobblestone', 200), 0, 'reported leftovers it had room for');
    assertEqual(inv.countOf('mc:cobblestone'), 200);
  });

  it('reports the remainder when full', () => {
    const inv = new Inventory();
    for (let i = SLOT.HOTBAR_START; i <= SLOT.MAIN_END; i++) inv.set(i, ItemStack.of('mc:stone', 64));
    assertEqual(inv.addItem('mc:dirt', 5), 5);
  });

  it('right-click takes the ceiling half', () => {
    const inv = new Inventory();
    inv.set(0, ItemStack.of('mc:dirt', 7));
    inv.rightClickSlot(0);
    assertEqual(inv.cursor.count, 4);
    assertEqual(inv.get(0).count, 3);
  });

  it('right-click on a single item picks it up rather than nothing', () => {
    const inv = new Inventory();
    inv.set(0, ItemStack.of('mc:dirt', 1));
    inv.rightClickSlot(0);
    assertEqual(inv.cursor.count, 1);
    assert(inv.get(0).isEmpty);
  });

  it('a damaged tool does not stack with an undamaged one', () => {
    const a = ItemStack.of('mc:iron_pickaxe', 1, 0);
    const b = ItemStack.of('mc:iron_pickaxe', 1, 40);
    assert(!a.canStackWith(b));
  });

  it('a tool breaking clears its slot', () => {
    const inv = new Inventory();
    const maxDamage = ITEMS.get('mc:wooden_pickaxe').maxDamage;
    inv.set(0, ItemStack.of('mc:wooden_pickaxe', 1, maxDamage - 1));
    inv.selectedSlot = 0;
    assert(inv.damageHeld(1), 'should report the break');
    assert(inv.get(0).isEmpty, 'broken tool left in the slot');
  });

  it('shift-click into a full destination leaves the stack alone', () => {
    const inv = new Inventory();
    for (let i = SLOT.HOTBAR_START; i <= SLOT.HOTBAR_END; i++) inv.set(i, ItemStack.of('mc:stone', 64));
    inv.set(SLOT.MAIN_START, ItemStack.of('mc:dirt', 32));
    inv.shiftClickSlot(SLOT.MAIN_START);
    assertEqual(inv.get(SLOT.MAIN_START).count, 32, 'stack was destroyed rather than left in place');
  });
});

describe('crafting', () => {
  it('a shaped recipe matches at every offset in a 3x3 grid', () => {
    // Vanilla lets a 2-tall stick pattern sit anywhere in the grid. Players
    // rely on this constantly without thinking about it.
    const positions = [[0, 3], [1, 4], [3, 6], [4, 7], [2, 5], [5, 8]];
    for (const [a, b] of positions) {
      const grid = new CraftingGrid(3, RECIPES);
      grid.slots[a] = ItemStack.of('mc:oak_planks', 1);
      grid.slots[b] = ItemStack.of('mc:oak_planks', 1);
      grid.refresh();
      assertEqual(grid.result.item?.id, 'mc:stick', `no match at offsets ${a}/${b}`);
      assertEqual(grid.result.count, 4);
    }
  });

  it('a pickaxe recipe matches mirrored', () => {
    const grid = new CraftingGrid(3, RECIPES);
    for (const i of [0, 1, 2]) grid.slots[i] = ItemStack.of('mc:cobblestone', 1);
    grid.slots[4] = ItemStack.of('mc:stick', 1);
    grid.slots[7] = ItemStack.of('mc:stick', 1);
    grid.refresh();
    assertEqual(grid.result.item?.id, 'mc:stone_pickaxe');
  });

  it('tag ingredients accept every wood species', () => {
    for (const wood of ['oak', 'birch', 'spruce']) {
      const grid = new CraftingGrid(2, RECIPES);
      grid.slots[0] = ItemStack.of(`mc:${wood}_planks`, 1);
      grid.slots[2] = ItemStack.of(`mc:${wood}_planks`, 1);
      grid.refresh();
      assertEqual(grid.result.item?.id, 'mc:stick', `${wood} planks did not match #mc:planks`);
    }
  });

  it('a wrong shape does not match', () => {
    const grid = new CraftingGrid(2, RECIPES);
    grid.slots[0] = ItemStack.of('mc:oak_planks', 1);
    grid.slots[1] = ItemStack.of('mc:oak_planks', 1); // horizontal, not vertical
    grid.refresh();
    assert(grid.result.isEmpty, 'horizontal planks should not craft sticks');
  });

  it('consuming a craft removes exactly one of each ingredient', () => {
    const grid = new CraftingGrid(2, RECIPES);
    grid.slots[0] = ItemStack.of('mc:oak_planks', 5);
    grid.slots[2] = ItemStack.of('mc:oak_planks', 5);
    grid.refresh();
    grid.consume();
    assertEqual(grid.slots[0].count, 4);
    assertEqual(grid.slots[2].count, 4);
  });

  it('draining the grid returns everything', () => {
    const grid = new CraftingGrid(2, RECIPES);
    grid.slots[0] = ItemStack.of('mc:diamond', 3);
    const returned = grid.drain();
    assertEqual(returned.length, 1);
    assertEqual(returned[0].count, 3);
    assert(grid.isEmpty);
  });

  it('every recipe result and ingredient exists', () => {
    assertEqual(RECIPES.validate().length, 0, RECIPES.validate().join('; '));
  });
});

describe('mesher', () => {
  it('emits nothing for an empty chunk', () => {
    const result = meshChunk(viewFor(new Chunk(0, 0)));
    assertEqual(result.opaqueQuads, 0);
    assertEqual(result.translucentQuads, 0);
  });

  it('a lone block emits exactly six faces', () => {
    const chunk = new Chunk(0, 0);
    chunk.setBlock(8, 64, 8, STONE);
    computeChunkLight(chunk);
    assertEqual(meshChunk(viewFor(chunk)).opaqueQuads, 6);
  });

  it('two stacked blocks hide the faces between them', () => {
    const chunk = new Chunk(0, 0);
    chunk.setBlock(8, 64, 8, STONE);
    chunk.setBlock(8, 65, 8, STONE);
    computeChunkLight(chunk);
    // 12 faces total minus the two that touch.
    assertEqual(meshChunk(viewFor(chunk)).opaqueQuads, 10);
  });

  it('a fully enclosed block emits nothing', () => {
    const chunk = new Chunk(0, 0);
    for (const [dx, dy, dz] of [[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      chunk.setBlock(8 + dx, 64 + dy, 8 + dz, STONE);
    }
    computeChunkLight(chunk);
    // The outer shell shows 30 faces; the buried centre contributes none.
    const quads = meshChunk(viewFor(chunk)).opaqueQuads;
    assertEqual(quads, 30, 'the enclosed block emitted geometry');
  });

  it('cross-plants emit four quads and are not collapsed', () => {
    // Regression: whole-block integer packing truncated the 0.1464 inset and
    // turned every plant in the world into a zero-area quad.
    const chunk = new Chunk(0, 0);
    chunk.setBlock(8, 64, 8, BLOCKS.get('mc:short_grass').defaultState);
    computeChunkLight(chunk);
    const result = meshChunk(viewFor(chunk));
    assertEqual(result.opaqueQuads, 4, 'expected two crossed quads drawn both ways');

    // Decode the x coordinates back out; they must not all be identical.
    const xs = new Set();
    for (let i = 0; i < result.opaque.length; i += 2) xs.add(result.opaque[i] & 511);
    assert(xs.size > 1, 'all vertices share one x -- the quad has no area');
  });

  it('adjacent water blocks do not draw the face between them', () => {
    const water = BLOCKS.get('mc:water').defaultState;
    const chunk = new Chunk(0, 0);
    chunk.setBlock(8, 64, 8, water);
    chunk.setBlock(9, 64, 8, water);
    computeChunkLight(chunk);
    const result = meshChunk(viewFor(chunk));
    assertEqual(result.translucentQuads, 10, 'shared water faces were drawn');
  });

  it('ambient occlusion darkens a corner next to solid neighbours', () => {
    const chunk = new Chunk(0, 0);
    chunk.setBlock(8, 64, 8, STONE);
    chunk.setBlock(9, 65, 8, STONE); // sits diagonally above the top face
    computeChunkLight(chunk);
    const result = meshChunk(viewFor(chunk));
    let minAo = 3;
    for (let i = 1; i < result.opaque.length; i += 2) {
      minAo = Math.min(minAo, (result.opaque[i] >> 19) & 3);
    }
    assert(minAo < 3, 'no vertex was occluded despite an adjacent block');
  });
});

describe('lighting', () => {
  it('sky light reaches full strength in open air', () => {
    const chunk = new Chunk(0, 0);
    chunk.setBlock(8, 64, 8, STONE);
    computeChunkLight(chunk);
    const si = yToSectionIndex(70);
    const i = sectionIndex(8, yToSectionLocal(70), 8);
    assertEqual(chunk.sections[si].skyLight.get(i), MAX_LIGHT);
  });

  it('sky light does not decay travelling straight down a shaft', () => {
    // This is why a 1x1 hole lights a deep room, and it is a rule people notice
    // immediately when it is wrong.
    const chunk = new Chunk(0, 0);
    for (let y = 60; y < 80; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          if (x === 8 && z === 8) continue; // leave one open column
          chunk.setBlock(x, y, z, STONE);
        }
      }
    }
    computeChunkLight(chunk);
    const si = yToSectionIndex(61);
    const i = sectionIndex(8, yToSectionLocal(61), 8);
    assertEqual(chunk.sections[si].skyLight.get(i), MAX_LIGHT, 'the shaft went dark');
  });

  it('a torch lights its surroundings and falls off with distance', () => {
    const chunk = new Chunk(0, 0);
    for (let y = 60; y < 70; y++)
      for (let x = 0; x < CHUNK_SIZE; x++)
        for (let z = 0; z < CHUNK_SIZE; z++) chunk.setBlock(x, y, z, STONE);
    chunk.setBlock(8, 65, 8, BLOCKS.get('mc:air').defaultState);
    chunk.setBlock(8, 64, 8, BLOCKS.get('mc:torch').defaultState);
    computeChunkLight(chunk);

    const at = (x, y, z) => {
      const s = chunk.sections[yToSectionIndex(y)];
      return s ? s.blockLight.get(sectionIndex(x, yToSectionLocal(y), z)) : 0;
    };
    assertEqual(at(8, 64, 8), 14, 'torch did not emit its own light level');
    assert(at(8, 65, 8) < 14, 'light did not fall off with distance');
  });
});

describe('terrain generation', () => {
  it('is reproducible for a seed', () => {
    const a = new TerrainGenerator('repeatme').generate(new Chunk(0, 0));
    const b = new TerrainGenerator('repeatme').generate(new Chunk(0, 0));
    for (let y = MIN_Y; y < 100; y += 11) {
      for (const [x, z] of [[0, 0], [7, 3], [15, 15]]) {
        assertEqual(
          b.getBlock(x, y, z).stringId, a.getBlock(x, y, z).stringId,
          `divergence at ${x},${y},${z}`,
        );
      }
    }
  });

  it('different seeds produce different worlds', () => {
    const a = new TerrainGenerator('one').generate(new Chunk(0, 0));
    const b = new TerrainGenerator('two').generate(new Chunk(0, 0));
    let differences = 0;
    for (let y = 40; y < 90; y++) {
      if (a.getBlock(8, y, 8).stringId !== b.getBlock(8, y, 8).stringId) differences++;
    }
    assert(differences > 0, 'two seeds produced an identical column');
  });

  it('lays bedrock at the bottom and nothing below it', () => {
    const chunk = new TerrainGenerator('bedrocktest').generate(new Chunk(0, 0));
    assertEqual(chunk.getBlock(8, MIN_Y, 8).block.id, 'mc:bedrock');
  });

  it('produces a surface above sea level somewhere in the chunk', () => {
    const chunk = new TerrainGenerator('surfacetest').generate(new Chunk(0, 0));
    let maxHeight = MIN_Y;
    for (let x = 0; x < CHUNK_SIZE; x++)
      for (let z = 0; z < CHUNK_SIZE; z++) maxHeight = Math.max(maxHeight, chunk.getHeight(x, z));
    assert(maxHeight > 0, `chunk never rose above y=0 (max ${maxHeight})`);
  });
});
