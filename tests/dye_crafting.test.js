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
