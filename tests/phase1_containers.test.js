import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { ItemStack } from '../src/world/item.js';
import { Chest, Furnace, SMELT_TICKS, CHEST_SLOTS } from '../src/game/containers.js';
import { RECIPES } from '../src/game/recipes.js';

/**
 * Chest and furnace rules from the 1.12.2 reference (docs/TARGET_1_12_2.md, sections 11 and 17).
 */
describe('Chest', () => {
  it('has 27 slots', () => assertEqual(new Chest().slots.length, CHEST_SLOTS));
  it('fills matching partial stacks before empty slots', () => {
    const c = new Chest();
    c.insert(ItemStack.of('mc:cobblestone', 10));
    c.insert(ItemStack.of('mc:cobblestone', 5));
    assertEqual(c.slots[0].count, 15);
    assert(c.slots[1].isEmpty, 'second slot should stay empty');
  });
  it('returns the leftover when full', () => {
    const c = new Chest();
    let leftover = 0;
    for (let i = 0; i < CHEST_SLOTS; i++) leftover = c.insert(ItemStack.of('mc:stone', 64));
    assertEqual(leftover, 0);
    assertEqual(c.insert(ItemStack.of('mc:stone', 64)), 64);
  });
});

describe('1.12.2 crafting access to containers', () => {
  it('crafts a chest from any of the six plank families', () => {
    const grid = [
      ItemStack.of('mc:jungle_planks'), ItemStack.of('mc:jungle_planks'), ItemStack.of('mc:jungle_planks'),
      ItemStack.of('mc:jungle_planks'), ItemStack.EMPTY.clone(), ItemStack.of('mc:jungle_planks'),
      ItemStack.of('mc:jungle_planks'), ItemStack.of('mc:jungle_planks'), ItemStack.of('mc:jungle_planks'),
    ];
    assertEqual(RECIPES.match(grid, 3)?.result, 'mc:chest');
  });

  it('crafts a furnace from eight cobblestone', () => {
    const grid = [
      ItemStack.of('mc:cobblestone'), ItemStack.of('mc:cobblestone'), ItemStack.of('mc:cobblestone'),
      ItemStack.of('mc:cobblestone'), ItemStack.EMPTY.clone(), ItemStack.of('mc:cobblestone'),
      ItemStack.of('mc:cobblestone'), ItemStack.of('mc:cobblestone'), ItemStack.of('mc:cobblestone'),
    ];
    assertEqual(RECIPES.match(grid, 3)?.result, 'mc:furnace');
  });
});

describe('Furnace', () => {
  it('smelts iron ore to an ingot after 200 ticks with coal', () => {
    const f = new Furnace();
    f.input = ItemStack.of('mc:iron_ore', 1);
    f.fuel = ItemStack.of('mc:coal', 1);
    for (let i = 0; i < SMELT_TICKS; i++) f.tick();
    assertEqual(f.output.item.id, 'mc:iron_ingot');
    assertEqual(f.output.count, 1);
    assert(f.input.isEmpty, 'input should be consumed');
  });
  it('does not smelt without fuel', () => {
    const f = new Furnace();
    f.input = ItemStack.of('mc:cobblestone', 1);
    for (let i = 0; i < SMELT_TICKS + 10; i++) f.tick();
    assert(f.output.isEmpty, 'no output without fuel');
  });
  it('coal burns for 1600 ticks', () => {
    const f = new Furnace();
    f.input = ItemStack.of('mc:cobblestone', 1);
    f.fuel = ItemStack.of('mc:coal', 1);
    f.tick();
    assertEqual(f.burnTotal, 1600);
  });
  it('smelts every 1.12.2 overworld log into charcoal', () => {
    for (const wood of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak']) {
      const f = new Furnace();
      f.input = ItemStack.of(`mc:${wood}_log`, 1);
      f.fuel = ItemStack.of('mc:coal', 1);
      for (let i = 0; i < SMELT_TICKS; i++) f.tick();
      assertEqual(f.output.item.id, 'mc:charcoal', wood);
    }
  });

  it('progress falls back when it stops smelting', () => {
    const f = new Furnace();
    f.cookProgress = 100;
    f.tick();
    assertEqual(f.cookProgress, 98);
  });
});
