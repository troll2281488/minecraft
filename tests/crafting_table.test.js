import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { CraftingGrid } from '../src/game/inventory.js';
import { RECIPES } from '../src/game/recipes.js';
import { BLOCKS } from '../src/world/block.js';
import { ItemStack } from '../src/world/item.js';
// These used to come from main.js, which meant this test pulled in gl.js, atlas.js,
// chunk_renderer.js and storage.js -- the whole render graph -- to read two pieces of
// pure game data. They now live in game/ modules with no GL or DOM dependency.
import { USABLE_BLOCKS } from '../src/game/usable_blocks.js';
import { creativeItemList } from '../src/game/creative.js';

/**
 * Crafting-table interaction and grid-size rules.
 *
 * The playtest found that no tool, weapon, or armour could be crafted in-game:
 * those are all 3x3 recipes, and there was no crafting-table UI to reach a 3x3
 * grid. These tests pin both halves of the fix -- that a crafting table is a
 * usable block, and that the 3x3 recipes genuinely need the 3x3 grid.
 */

/** Fill a grid from a 3x3 (or 2x2) layout of item ids, '.' meaning empty. */
function fill(size, layout) {
  const grid = new CraftingGrid(size, RECIPES);
  layout.forEach((id, i) => {
    grid.slots[i] = id === '.' ? ItemStack.EMPTY.clone() : ItemStack.of(id, 1);
  });
  grid.refresh();
  return grid;
}

const P = 'mc:oak_planks';
const C = 'mc:cobblestone';
const S = 'mc:stick';
const _ = '.';

describe('creative inventory list', () => {
  const list = creativeItemList();
  const ids = new Set(list.map((it) => it.id));

  it('includes a broad slice of the catalog', () => {
    assert(list.length > 80, `only ${list.length} creative items`);
  });

  it('includes blocks, slabs/stairs, tools, and materials', () => {
    for (const id of ['mc:stone', 'mc:oak_slab', 'mc:stone_stairs',
                      'mc:diamond_pickaxe', 'mc:iron_ingot', 'mc:oak_planks']) {
      assert(ids.has(id), `creative list is missing ${id}`);
    }
  });

  it('includes granite, polished granite and stone-brick decorative shapes', () => {
    for (const id of ['mc:granite', 'mc:polished_granite', 'mc:granite_stairs',
      'mc:granite_slab', 'mc:polished_granite_stairs', 'mc:stone_bricks',
      'mc:stone_brick_stairs', 'mc:jungle_stairs']) {
      assert(BLOCKS.get(id), `missing decorative block ${id}`);
      assert(ids.has(id), `creative inventory is missing ${id}`);
    }
  });

  it('crafts polished granite and stone bricks from stone materials', () => {
    const polished = fill(2, ['mc:granite', 'mc:granite', 'mc:granite', 'mc:granite']);
    assertEqual(polished.result.item?.id, 'mc:polished_granite');
    assertEqual(polished.result.count, 4);
    const bricks = fill(2, ['mc:stone', 'mc:stone', 'mc:stone', 'mc:stone']);
    assertEqual(bricks.result.item?.id, 'mc:stone_bricks');
    assertEqual(bricks.result.count, 4);
  });

  it('excludes the unknown-block placeholder', () => {
    assert(!ids.has('mc:unknown'), 'the unknown placeholder leaked into creative');
    assert(!list.some((it) => it.isUnknown), 'an unknown item leaked into creative');
  });

  it('has no duplicate ids', () => {
    assertEqual(ids.size, list.length, 'creative list contains duplicates');
  });
});

describe('crafting table: block-use wiring', () => {
  it('a crafting table is a usable block', () => {
    // The exact thing that was missing: right-clicking the table has to do
    // something other than place a block.
    assert(typeof USABLE_BLOCKS['mc:crafting_table'] === 'function',
      'crafting_table is not registered as a usable block');
  });
});

describe('crafting table: tools need the 3x3 grid', () => {
  // Top row material, middle column of sticks -- the pickaxe pattern.
  const pickaxe = (m) => [m, m, m, _, S, _, _, S, _];

  it('a wooden pickaxe crafts in a 3x3 grid', () => {
    assertEqual(fill(3, pickaxe(P)).result.item?.id, 'mc:wooden_pickaxe');
  });

  it('a stone pickaxe crafts in a 3x3 grid', () => {
    assertEqual(fill(3, pickaxe(C)).result.item?.id, 'mc:stone_pickaxe');
  });

  it('a pickaxe CANNOT be made in the 2x2 personal grid', () => {
    // This is why the table is necessary. The pattern does not fit in 2x2.
    const grid = fill(2, [P, P, S, _]); // best you can do in 2x2
    assert(grid.result.isEmpty, 'a pickaxe was craftable without a table');
  });

  it('every tool type crafts across every tier in 3x3', () => {
    const tiers = [['wooden', P], ['stone', C], ['iron', 'mc:iron_ingot'],
                   ['golden', 'mc:gold_ingot'], ['diamond', 'mc:diamond']];
    const shapes = {
      pickaxe: (m) => [m, m, m, _, S, _, _, S, _],
      axe:     (m) => [m, m, _, m, S, _, _, S, _],
      shovel:  (m) => [_, m, _, _, S, _, _, S, _],
      sword:   (m) => [_, m, _, _, m, _, _, S, _],
    };
    for (const [prefix, mat] of tiers) {
      for (const [tool, shape] of Object.entries(shapes)) {
        const result = fill(3, shape(mat)).result;
        assertEqual(result.item?.id, `mc:${prefix}_${tool}`, `${prefix} ${tool}`);
      }
    }
  });
});

describe('crafting table: 2x2 recipes still work in both grids', () => {
  // A crafting table can make anything the personal grid can, plus 3x3 recipes.
  it('planks -> sticks works in a 3x3 grid', () => {
    // Two planks stacked vertically, anywhere in the 3x3 -- top-left corner.
    assertEqual(fill(3, [P, _, _, P, _, _, _, _, _]).result.item?.id, 'mc:stick');
  });

  it('a crafting table itself crafts in a 3x3 grid', () => {
    assertEqual(fill(3, [P, P, _, P, P, _, _, _, _]).result.item?.id, 'mc:crafting_table');
  });

  it('planks -> sticks still works in the 2x2 grid', () => {
    assertEqual(fill(2, [P, _, P, _]).result.item?.id, 'mc:stick');
  });
});
