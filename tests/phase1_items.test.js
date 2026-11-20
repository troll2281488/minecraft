import '../src/world/blocks/index.js';
import { describe, it, assert } from './framework.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';

/**
 * Phase 1 items and recipes from the 1.12.2 reference (docs/TARGET_1_12_2.md).
 * Registration is checked here; recipe validation runs at import time in recipes.js.
 */
describe('1.12.2 Phase 1 items', () => {
  const NEW = ['mc:gold_nugget', 'mc:bucket', 'mc:bow', 'mc:arrow',
    'mc:flint_and_steel', 'mc:golden_apple', 'mc:enchanted_golden_apple'];
  for (const id of NEW) {
    it(`${id} is registered`, () => assert(ITEMS.get(id) !== undefined, `${id} missing`));
  }
  it('bow is durable and arrows stack to 64', () => {
    assert(ITEMS.get('mc:bow').maxDamage === 384, 'bow durability should be 384');
    assert(ITEMS.get('mc:arrow').stackSize === 64, 'arrow stack size should be 64');
  });
  it('recipe book loads with door recipes for all wood types and iron', () => {
    assert(RECIPES.size >= 109, 'expected door, trapdoor and redstone device recipes to be registered');
    for (const wood of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak']) {
      assert(RECIPES.recipes.some((recipe) => recipe.result === `mc:${wood}_door`), `${wood} door recipe missing`);
    }
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:iron_door'), 'iron door recipe missing');
    for (const wood of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak']) {
      assert(RECIPES.recipes.some((recipe) => recipe.result === `mc:${wood}_trapdoor`), `${wood} trapdoor recipe missing`);
    }
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:iron_trapdoor'), 'iron trapdoor recipe missing');
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:lever'), 'lever recipe missing');
    assert(ITEMS.get('mc:redstone').block === 'mc:redstone_wire', 'redstone dust must place wire');
    assert(ITEMS.get('mc:redstone_torch') !== undefined, 'redstone torch item missing');
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:repeater' && recipe.pattern?.length === 3), 'repeater recipe missing or malformed');
    assert(ITEMS.get('mc:repeater') !== undefined, 'repeater item missing');
    assert(ITEMS.get('mc:light_weighted_pressure_plate') !== undefined, 'light weighted plate item missing');
    assert(ITEMS.get('mc:heavy_weighted_pressure_plate') !== undefined, 'heavy weighted plate item missing');
    assert(ITEMS.get('mc:daylight_detector') !== undefined, 'daylight detector item missing');
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:daylight_detector'), 'daylight detector recipe missing');
    assert(ITEMS.get('mc:note_block') !== undefined, 'note block item missing');
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:note_block'), 'note block recipe missing');
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:light_weighted_pressure_plate'), 'light weighted plate recipe missing');
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:heavy_weighted_pressure_plate'), 'heavy weighted plate recipe missing');
    assert(ITEMS.get('mc:redstone_wire') === undefined, 'wire must not add a duplicate creative item');
    for (const id of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'stone', 'polished_blackstone']) {
      assert(RECIPES.recipes.some((recipe) => recipe.result === `mc:${id}_button`), `${id} button recipe missing`);
      assert(RECIPES.recipes.some((recipe) => recipe.result === `mc:${id}_pressure_plate`), `${id} pressure plate recipe missing`);
    }
  });
});
