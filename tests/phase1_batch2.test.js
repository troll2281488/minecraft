import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { SMELTING } from '../src/game/containers.js';

/** Batch 2 of Phase 1 (docs/TARGET_1_12_2.md): armour, brewing, Nether and End items. */
describe('1.12.2 armour', () => {
  const TIERS = ['leather', 'iron', 'golden', 'diamond'];
  const SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
  for (const t of TIERS) for (const s of SLOTS) {
    it(`mc:${t}_${s} exists with its armour slot`, () => {
      const item = ITEMS.get(`mc:${t}_${s}`);
      assert(item !== undefined, 'missing');
      assertEqual(item.armorSlot, s);
    });
  }
  it('iron helmet durability is 165 (vanilla)', () => {
    assertEqual(ITEMS.get('mc:iron_helmet').maxDamage, 165);
  });
  it('diamond chestplate durability is 528 (vanilla)', () => {
    assertEqual(ITEMS.get('mc:diamond_chestplate').maxDamage, 528);
  });
});

describe('1.12.2 brewing and Nether/End items', () => {
  const IDS = ['mc:blaze_rod', 'mc:blaze_powder', 'mc:ghast_tear', 'mc:nether_wart',
    'mc:glowstone_dust', 'mc:magma_cream', 'mc:glass_bottle', 'mc:eye_of_ender',
    'mc:fire_charge', 'mc:ender_pearl', 'mc:gunpowder', 'mc:saddle', 'mc:lead'];
  for (const id of IDS) {
    it(`${id} is registered`, () => assert(ITEMS.get(id) !== undefined, `${id} missing`));
  }
  it('ender pearls stack to 16 (vanilla)', () => {
    assertEqual(ITEMS.get('mc:ender_pearl').stackSize, 16);
  });
});

describe('1.12.2 recipes and smelting', () => {
  it('recipe book holds at least 100 recipes', () => {
    assert(RECIPES.size >= 100, `got ${RECIPES.size}`);
  });
  it('raw cod, salmon and rabbit smelt to cooked foods', () => {
    assertEqual(SMELTING.get('mc:raw_cod').result, 'mc:cooked_cod');
    assertEqual(SMELTING.get('mc:raw_salmon').result, 'mc:cooked_salmon');
    assertEqual(SMELTING.get('mc:raw_rabbit').result, 'mc:cooked_rabbit');
  });
});
