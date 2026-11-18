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
  it('recipe book loads with the new recipes', () => {
    assert(RECIPES.size >= 78, 'expected at least 78 recipes');
  });
});
