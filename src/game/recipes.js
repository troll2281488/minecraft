/**
 * The Phase 1 recipe set.
 *
 * Vanilla shapes and yields throughout: four planks per log, four sticks from
 * two planks, eight cobblestone for a furnace. These numbers are load-bearing
 * for how the early game paces, and changing any of them changes how long the
 * first ten minutes take.
 *
 * Smelting, blasting, stonecutting, and smithing recipes are defined in Phase 3
 * alongside the furnace UI that would make them reachable.
 */

import { RecipeBook } from './crafting.js';

const WOODS = ['oak', 'birch', 'spruce'];

const recipes = [];

// -- Wood ------------------------------------------------------------------

for (const wood of WOODS) {
  recipes.push({
    result: `mc:${wood}_planks`, count: 4,
    ingredients: [`mc:${wood}_log`],
  });
}

recipes.push({
  result: 'mc:stick', count: 4,
  pattern: ['P', 'P'],
  key: { P: '#mc:planks' },
});

recipes.push({
  result: 'mc:crafting_table', count: 1,
  pattern: ['PP', 'PP'],
  key: { P: '#mc:planks' },
});

recipes.push({
  result: 'mc:torch', count: 4,
  pattern: ['C', 'S'],
  key: { C: '#mc:coals', S: 'mc:stick' },
});

// -- Tools -----------------------------------------------------------------

/**
 * Tool patterns are shared across every tier, so a new material is one entry in
 * MATERIALS rather than four new recipes that could disagree with each other.
 */
const TOOL_PATTERNS = {
  pickaxe: { pattern: ['MMM', ' S ', ' S '] },
  axe:     { pattern: ['MM', 'MS', ' S'] },
  shovel:  { pattern: ['M', 'S', 'S'] },
  sword:   { pattern: ['M', 'M', 'S'] },
};

const TOOL_MATERIALS = [
  ['wooden', '#mc:planks'],
  ['stone', '#mc:stone_tool_materials'],
  ['iron', 'mc:iron_ingot'],
  ['golden', 'mc:gold_ingot'],
  ['diamond', 'mc:diamond'],
];

for (const [prefix, material] of TOOL_MATERIALS) {
  for (const [tool, shape] of Object.entries(TOOL_PATTERNS)) {
    recipes.push({
      result: `mc:${prefix}_${tool}`, count: 1,
      pattern: shape.pattern,
      key: { M: material, S: 'mc:stick' },
    });
  }
}

recipes.push({
  result: 'mc:string', count: 4,
  ingredients: ['mc:white_wool'],
});

recipes.push({
  result: 'mc:fishing_rod', count: 1,
  pattern: ['  S', ' ST', 'S T'],
  key: { S: 'mc:stick', T: 'mc:string' },
});

recipes.push({
  result: 'mc:bread', count: 1,
  pattern: ['WWW'],
  key: { W: 'mc:wheat' },
});

recipes.push({
  result: 'mc:shears', count: 1,
  pattern: [' I', 'I '],
  key: { I: 'mc:iron_ingot' },
});

// -- Mineral blocks --------------------------------------------------------

/**
 * Nine of a material packs into a block; a block unpacks into nine. Both
 * directions exist so storage is reversible -- a one-way recipe would make
 * compacting ore a trap.
 */
const PACKABLE = [
  ['mc:coal', 'mc:coal_block'],
  ['mc:iron_ingot', 'mc:iron_block'],
  ['mc:copper_ingot', 'mc:copper_block'],
  ['mc:gold_ingot', 'mc:gold_block'],
  ['mc:diamond', 'mc:diamond_block'],
  ['mc:emerald', 'mc:emerald_block'],
  ['mc:redstone', 'mc:redstone_block'],
];

for (const [item, block] of PACKABLE) {
  recipes.push({
    result: block, count: 1,
    pattern: ['III', 'III', 'III'],
    key: { I: item },
  });
  recipes.push({
    result: item, count: 9,
    ingredients: [block],
  });
}

// Lapis packs nine-to-one but unpacks nine-to-one as well, same as vanilla.
recipes.push({
  result: 'mc:lapis_block', count: 1,
  pattern: ['LLL', 'LLL', 'LLL'],
  key: { L: 'mc:lapis_lazuli' },
});
recipes.push({ result: 'mc:lapis_lazuli', count: 9, ingredients: ['mc:lapis_block'] });

// -- Stone --------------------------------------------------------------------

const POLISHED = [
  ['mc:granite', 'mc:polished_granite'],
  ['mc:diorite', 'mc:polished_diorite'],
  ['mc:andesite', 'mc:polished_andesite'],
];

for (const [rough, polished] of POLISHED) {
  recipes.push({
    result: polished, count: 4,
    pattern: ['RR', 'RR'],
    key: { R: rough },
  });
}

recipes.push({
  result: 'mc:sandstone', count: 1,
  pattern: ['SS', 'SS'],
  key: { S: 'mc:sand' },
});

recipes.push({
  result: 'mc:coarse_dirt', count: 4,
  pattern: ['DG', 'GD'],
  key: { D: 'mc:dirt', G: 'mc:gravel' },
});

recipes.push({
  result: 'mc:clay', count: 1,
  pattern: ['CC', 'CC'],
  key: { C: 'mc:clay_ball' },
});

recipes.push({
  result: 'mc:snow_block', count: 1,
  pattern: ['SS', 'SS'],
  key: { S: 'mc:snow_block' },
});

// Vanilla makes granite, diorite, and andesite from quartz and cobble; without
// the Nether there is no quartz yet, so these are the diorite-free subset.
recipes.push({
  result: 'mc:andesite', count: 2,
  ingredients: ['mc:diorite', 'mc:cobblestone'],
});

// -- Slabs and stairs ------------------------------------------------------

/**
 * A row of three makes six slabs; the stair staircase pattern makes four
 * stairs. These are the vanilla yields, and they are why a slab floor is
 * cheaper per area than a full-block one.
 */
const SHAPED_FROM = [
  ['mc:stone', 'stone'],
  ['mc:cobblestone', 'cobblestone'],
  ['mc:sandstone', 'sandstone'],
  ['mc:oak_planks', 'oak'],
  ['mc:birch_planks', 'birch'],
  ['mc:spruce_planks', 'spruce'],
];

for (const [material, name] of SHAPED_FROM) {
  recipes.push({
    result: `mc:${name}_slab`, count: 6,
    pattern: ['MMM'],
    key: { M: material },
  });
  recipes.push({
    result: `mc:${name}_stairs`, count: 4,
    pattern: ['M  ', 'MM ', 'MMM'],
    key: { M: material },
  });
}

export const RECIPES = new RecipeBook().addAll(recipes);

const problems = RECIPES.validate();
if (problems.length > 0) {
  throw new Error('Recipe validation failed:\n  - ' + problems.join('\n  - '));
}

export const RECIPE_COUNT = RECIPES.size;
