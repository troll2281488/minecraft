import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Inventory, CraftingGrid, SLOT } from '../src/game/inventory.js';
import { ItemStack } from '../src/world/item.js';
import { calculateArmorDamage, calculateHorseArmorDamage, MobSystem } from '../src/entity/mobs.js';
import { RECIPES } from '../src/game/recipes.js';

/** Shift-click puts armour on (docs/TARGET_1_12_2.md, section 7.4). */
describe('shift-click armour', () => {
  it('puts a helmet from the hotbar into the helmet slot', () => {
    const inv = new Inventory();
    inv.slots[0] = ItemStack.of('mc:iron_helmet', 1);
    inv.shiftClickSlot(0);
    assertEqual(inv.slots[SLOT.ARMOR_END].item.id, 'mc:iron_helmet');
    assert(inv.slots[0].isEmpty, 'hotbar slot should be empty');
  });
  it('swaps out the piece already worn', () => {
    const inv = new Inventory();
    inv.slots[SLOT.ARMOR_END] = ItemStack.of('mc:leather_helmet', 1);
    inv.slots[9] = ItemStack.of('mc:diamond_helmet', 1);
    inv.shiftClickSlot(9);
    assertEqual(inv.slots[SLOT.ARMOR_END].item.id, 'mc:diamond_helmet');
    assertEqual(inv.slots[9].item.id, 'mc:leather_helmet');
  });
});


describe('armour protection', () => {
  it('registers the Java 1.12.2 armour sets and durability', () => {
    assertEqual(ItemStack.of('mc:iron_helmet').item.maxDamage, 165);
    assertEqual(ItemStack.of('mc:diamond_chestplate').item.armorPoints, 8);
    assertEqual(ItemStack.of('mc:diamond_chestplate').item.armorToughness, 2);
    assertEqual(ItemStack.of('mc:leather_boots').item.armorSlot, 'boots');
  });

  it('reduces damage using the 1.12 armour formula', () => {
    assertEqual(calculateArmorDamage(10, 0, 0), 10);
    assertEqual(calculateArmorDamage(10, 15, 0), 6);
    assertEqual(calculateArmorDamage(10, 20, 8), 3);
  });


  it('reduces hostile damage and wears equipped armour', () => {
    const inventory = new Inventory();
    inventory.set(SLOT.ARMOR_START, ItemStack.of('mc:iron_boots'));
    const player = { gamemode: 'survival', health: 20 };
    const mobs = new MobSystem({ player, inventory });
    const dealt = mobs._damagePlayer(10);
    assert(Math.abs(dealt - 9.84) < 0.001, `expected 9.84 damage, got ${dealt}`);
    assert(Math.abs(player.health - 10.16) < 0.001);
    assertEqual(inventory.get(SLOT.ARMOR_START).damage, 10, 'armour durability should scale with incoming damage');
  });

  it('crafts an iron helmet in the 3x3 table', () => {
    const grid = new CraftingGrid(3, RECIPES);
    for (const index of [0, 1, 2, 3, 5]) grid.set(index, ItemStack.of('mc:iron_ingot'));
    assert(grid.matched, 'iron helmet recipe did not match');
    assertEqual(grid.result.item.id, 'mc:iron_helmet');
  });

  it('horse armour reduces incoming damage by material', () => {
    assertEqual(calculateHorseArmorDamage(10, null), 10);
    assertEqual(calculateHorseArmorDamage(10, 'iron'), 8);
    assertEqual(calculateHorseArmorDamage(10, 'diamond'), 7.6);
  });

  it('does not turn invalid or zero damage into health loss', () => {
    assertEqual(calculateArmorDamage(0, 20, 8), 0);
    assertEqual(calculateArmorDamage(-4, 20, 8), 0);
  });
});
