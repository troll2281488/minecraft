import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { Hopper, moveOneItem, serializeContainer, deserializeContainer, drainContainer } from '../src/game/containers.js';
import { RECIPES } from '../src/game/recipes.js';

describe('Java hopper inventory and automation primitives', () => {
  it('registers a five-slot hopper with a downward default outlet', () => {
    const state = BLOCKS.get('mc:hopper').defaultState;
    assertEqual(state.get('facing'), 'down');
    assertEqual(state.get('enabled'), true);
    assertEqual(ITEMS.get('mc:hopper').block, 'mc:hopper');
  });
  it('inserts items into the five-slot inventory', () => {
    const hopper = new Hopper();
    assertEqual(hopper.slots.length, 5);
    assertEqual(hopper.insert(ItemStack.of('mc:oak_planks', 12)), 0);
    assertEqual(hopper.slots[0].count, 12);
  });
  it('moves one item at a time and preserves stack identity', () => {
    const source = [ItemStack.of('mc:oak_planks', 3)];
    const destination = Array.from({ length: 5 }, () => ItemStack.EMPTY.clone());
    assert(moveOneItem(source, destination), 'one item should move');
    assertEqual(source[0].count, 2);
    assertEqual(destination[0].item.id, 'mc:oak_planks');
    assertEqual(destination[0].count, 1);
  });
  it('does not move an item into a full incompatible destination', () => {
    const source = [ItemStack.of('mc:oak_planks', 1)];
    const destination = [ItemStack.of('mc:stick', 64)];
    assertEqual(moveOneItem(source, destination), false);
    assertEqual(source[0].count, 1);
  });
  it('serializes and restores all five hopper slots', () => {
    const hopper = new Hopper();
    hopper.insert(ItemStack.of('mc:iron_ingot', 9));
    const record = serializeContainer('hopper', hopper);
    assertEqual(record.slots.length, 5);
    const restored = deserializeContainer(record);
    assertEqual(restored.type, 'hopper');
    assertEqual(restored.data.slots[0].item.id, 'mc:iron_ingot');
    assertEqual(restored.data.slots[0].count, 9);
  });
  it('drops stored contents when a hopper is broken', () => {
    const hopper = new Hopper();
    hopper.insert(ItemStack.of('mc:coal', 4));
    const drops = drainContainer('hopper', hopper);
    assertEqual(drops.length, 1);
    assertEqual(drops[0].count, 4);
    assertEqual(hopper.slots.filter((slot) => !slot.isEmpty).length, 0);
  });
  it('has the vanilla five-iron-and-chest crafting recipe', () => {
    assert(RECIPES.recipes.some((recipe) => recipe.result === 'mc:hopper' &&
      recipe.pattern?.join('|') === 'I I|ICI| I '), 'hopper recipe missing');
  });
});
