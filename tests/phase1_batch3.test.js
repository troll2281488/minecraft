import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { reduceDamage, armorTotals } from '../src/entity/armor.js';

/** Batch 3 (docs/TARGET_1_12_2.md): armour damage reduction, paper, books, enchanting. */
describe('armour damage reduction (1.12.2 formula)', () => {
  it('no armour changes nothing', () => assertEqual(reduceDamage(6, 0), 6));
  it('full iron set (defense 15) against 10 damage leaves 6', () => {
    // effective = min(20, max(15/5, 15 - 10/2)) = 10; multiplier 1 - 10/25 = 0.6
    assertEqual(reduceDamage(10, 15), 6);
  });
  it('defense is capped at 20 points (80% reduction)', () => {
    assert(Math.abs(reduceDamage(10, 40) - 2) < 1e-9, 'capped at 20/25 reduction');
  });
  it('armour totals sum over worn pieces', () => {
    const t = armorTotals(['mc:iron_helmet', 'mc:iron_chestplate', 'mc:diamond_boots']);
    assertEqual(t.defense, 2 + 6 + 3);
    assertEqual(t.toughness, 2);
  });
});

describe('paper, books, enchanting', () => {
  for (const id of ['mc:sugar_cane', 'mc:sugar', 'mc:paper', 'mc:ibook', 'mc:ibookshelf', 'mc:enchanting_table']) {
    it(`${id} is registered`, () => assert(ITEMS.get(id) !== undefined, `${id} missing`));
  }
  it('recipe book holds at least 109 recipes', () => {
    assert(RECIPES.size >= 109, `got ${RECIPES.size}`);
  });
});
