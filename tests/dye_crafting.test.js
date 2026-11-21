import '../src/world/blocks/index.js';
import { describe, it, assertEqual } from './framework.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { RECIPES } from '../src/game/recipes.js';

const COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
];

describe('Java 1.19 dye materials and wool recolouring', () => {
  it('registers all sixteen modern dye item IDs', () => {
    for (const color of COLORS) {
      assertEqual(ITEMS.get(`mc:${color}_dye`)?.id, `mc:${color}_dye`);
    }
  });

  it('crafts every coloured wool from white wool and its matching dye', () => {
    for (const color of COLORS) {
      const grid = [ItemStack.of('mc:white_wool'), ItemStack.of(`mc:${color}_dye`), null, null];
      const recipe = RECIPES.match(grid, 2);
      assertEqual(recipe?.result, `mc:${color}_wool`);
      assertEqual(RECIPES.resultOf(recipe).count, 1);
    }
  });

  it('crafts all stained-glass, terracotta and concrete-powder colour variants', () => {
    for (const color of COLORS) {
      const dye = `mc:${color}_dye`;
      const glassGrid = [
        ItemStack.of('mc:glass'), ItemStack.of('mc:glass'), ItemStack.of('mc:glass'),
        ItemStack.of('mc:glass'), ItemStack.of(dye), ItemStack.of('mc:glass'),
        ItemStack.of('mc:glass'), ItemStack.of('mc:glass'), ItemStack.of('mc:glass'),
      ];
      const glassRecipe = RECIPES.match(glassGrid, 3);
      assertEqual(glassRecipe?.result, `mc:${color}_stained_glass`);
      assertEqual(RECIPES.resultOf(glassRecipe).count, 8);

      const terracottaGrid = [
        ItemStack.of('mc:terracotta'), ItemStack.of('mc:terracotta'), ItemStack.of('mc:terracotta'),
        ItemStack.of('mc:terracotta'), ItemStack.of(dye), ItemStack.of('mc:terracotta'),
        ItemStack.of('mc:terracotta'), ItemStack.of('mc:terracotta'), ItemStack.of('mc:terracotta'),
      ];
      const terracottaRecipe = RECIPES.match(terracottaGrid, 3);
      assertEqual(terracottaRecipe?.result, `mc:${color}_terracotta`);
      assertEqual(RECIPES.resultOf(terracottaRecipe).count, 8);

      const powderGrid = [
        ItemStack.of('mc:sand'), ItemStack.of('mc:gravel'), ItemStack.of('mc:sand'),
        ItemStack.of('mc:gravel'), ItemStack.of(dye), ItemStack.of('mc:gravel'),
        ItemStack.of('mc:sand'), ItemStack.of('mc:gravel'), ItemStack.of('mc:sand'),
      ];
      const powderRecipe = RECIPES.match(powderGrid, 3);
      assertEqual(powderRecipe?.result, `mc:${color}_concrete_powder`);
      assertEqual(RECIPES.resultOf(powderRecipe).count, 8);
    }
  });

  it('provides dye recipes for the represented vanilla sources', () => {
    const sources = [
      ['mc:bone_meal', 'mc:white_dye'],
      ['mc:poppy', 'mc:red_dye'],
      ['mc:dandelion', 'mc:yellow_dye'],
      ['mc:lapis_lazuli', 'mc:blue_dye'],
    ];
    for (const [source, result] of sources) {
      const recipe = RECIPES.match([ItemStack.of(source), null, null, null], 2);
      assertEqual(recipe?.result, result);
    }
  });
});
