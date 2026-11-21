import { describe, it, assertEqual } from './framework.js';
import { ITEMS } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';
import { ItemStack } from '../src/world/item.js';
import '../src/world/blocks/index.js';

describe('Fire charge and material recipes', () => {
  it('registers fire charge and blaze powder', () => {
    assertEqual(ITEMS.get('mc:fire_charge').stackSize, 64);
    assertEqual(ITEMS.get('mc:blaze_powder').id, 'mc:blaze_powder');
  });

  it('converts a blaze rod into two blaze powder', () => {
    const recipe = RECIPES.match([ItemStack.of('mc:blaze_rod', 1)], 2);
    assertEqual(recipe?.result, 'mc:blaze_powder');
    assertEqual(recipe?.count, 2);
  });
  it('crafts three fire charges from gunpowder, blaze powder and coal', () => {
    const recipe = RECIPES.match([
      ItemStack.of('mc:gunpowder', 1),
      ItemStack.of('mc:blaze_powder', 1),
      ItemStack.of('mc:coal', 1),
      ItemStack.EMPTY, ItemStack.EMPTY, ItemStack.EMPTY,
      ItemStack.EMPTY, ItemStack.EMPTY, ItemStack.EMPTY,
    ], 3);
    assertEqual(recipe?.result, 'mc:fire_charge');
    assertEqual(recipe?.count, 3);
  });

  it('also accepts charcoal for fire charge crafting', () => {
    const recipe = RECIPES.match([
      ItemStack.of('mc:gunpowder', 1), ItemStack.of('mc:blaze_powder', 1), ItemStack.of('mc:charcoal', 1),
      ItemStack.EMPTY, ItemStack.EMPTY, ItemStack.EMPTY,
      ItemStack.EMPTY, ItemStack.EMPTY, ItemStack.EMPTY,
    ], 3);
    assertEqual(recipe?.result, 'mc:fire_charge');
    assertEqual(recipe?.count, 3);
  });
  it('converts four rabbit hides into leather', () => {
    const recipe = RECIPES.match([
      ItemStack.of('mc:rabbit_hide', 1), ItemStack.EMPTY, ItemStack.EMPTY,
      ItemStack.EMPTY, ItemStack.of('mc:rabbit_hide', 1), ItemStack.EMPTY,
      ItemStack.EMPTY, ItemStack.EMPTY, ItemStack.of('mc:rabbit_hide', 2),
    ], 3);
    assertEqual(recipe?.result, 'mc:leather');
    assertEqual(recipe?.count, 1);
  });

  it('crafts a book from three paper and one leather', () => {
    const recipe = RECIPES.match([
      ItemStack.of('mc:paper', 1), ItemStack.EMPTY, ItemStack.EMPTY,
      ItemStack.of('mc:paper', 1), ItemStack.of('mc:paper', 1), ItemStack.EMPTY,
      ItemStack.EMPTY, ItemStack.of('mc:leather', 1), ItemStack.EMPTY,
    ], 3);
    assertEqual(recipe?.result, 'mc:book');
    assertEqual(recipe?.count, 1);
  });
});
