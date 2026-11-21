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
import { ITEMS } from '../world/item.js';

// Keep the gold-nugget material available even if a cached/older block catalog
// is loaded by a browser. The catalog remains the canonical registration site.
if (!ITEMS.get('mc:gold_nugget')) ITEMS.define('mc:gold_nugget', {});

const WOODS = ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak'];

const recipes = [];

// -- Buckets and fluids ---------------------------------------------------
recipes.push({ result: 'mc:bucket', count: 1, pattern: ['I I', ' I '], key: { I: 'mc:iron_ingot' } });
recipes.push({ result: 'mc:cauldron', count: 1, pattern: ['I I', 'I I', 'III'], key: { I: 'mc:iron_ingot' } });

// -- Rail transport -------------------------------------------------------
recipes.push({ result: 'mc:minecart', count: 1, pattern: ['I I', 'III'], key: { I: 'mc:iron_ingot' } });
recipes.push({ result: 'mc:rail', count: 16, pattern: ['I I', 'ISI', 'I I'], key: { I: 'mc:iron_ingot', S: 'mc:stick' } });
recipes.push({ result: 'mc:powered_rail', count: 6, pattern: ['G G', 'GSG', 'GRG'], key: { G: 'mc:gold_ingot', S: 'mc:stick', R: 'mc:redstone' } });
recipes.push({ result: 'mc:detector_rail', count: 6, pattern: ['I I', 'IPI', 'IRI'], key: { I: 'mc:iron_ingot', P: 'mc:stone_pressure_plate', R: 'mc:redstone' } });
recipes.push({ result: 'mc:activator_rail', count: 6, pattern: ['ISI', 'IRI', 'ISI'], key: { I: 'mc:iron_ingot', S: 'mc:stick', R: 'mc:redstone_torch' } });

// -- Processing stations --------------------------------------------------
recipes.push({ result: 'mc:smoker', count: 1, pattern: [' L ', 'LFL', ' L '], key: { L: '#mc:logs', F: 'mc:furnace' } });
recipes.push({ result: 'mc:blast_furnace', count: 1, pattern: ['III', 'IFI', 'SSS'], key: { I: 'mc:iron_ingot', F: 'mc:furnace', S: 'mc:smooth_stone' } });

// -- Wood ------------------------------------------------------------------

for (const wood of WOODS) {
  recipes.push({
    result: `mc:${wood}_planks`, count: 4,
    ingredients: [`mc:${wood}_log`],
  });
}

// Six matching planks craft three doors; iron uses the same 2×3 shape.
for (const wood of WOODS) {
  recipes.push({
    result: `mc:${wood}_fence`, count: 3,
    pattern: ['PSP', 'PSP'],
    key: { P: `mc:${wood}_planks`, S: 'mc:stick' },
  });
  recipes.push({
    result: `mc:${wood}_fence_gate`, count: 1,
    pattern: ['SPS', 'SPS'],
    key: { P: `mc:${wood}_planks`, S: 'mc:stick' },
  });
  recipes.push({
    result: `mc:${wood}_door`, count: 3,
    pattern: ['PP', 'PP', 'PP'],
    key: { P: `mc:${wood}_planks` },
  });
  recipes.push({
    result: `mc:${wood}_trapdoor`, count: 2,
    pattern: ['PPP', 'PPP'],
    key: { P: `mc:${wood}_planks` },
  });
}
recipes.push({
  result: 'mc:nether_brick_fence', count: 6,
  pattern: ['NNN', 'NNN'], key: { N: 'mc:nether_bricks' },
});

// Six matching stone blocks craft six walls, as in Java Edition.
const WALL_MATERIALS = [
  ['cobblestone', 'cobblestone'], ['mossy_cobblestone', 'mossy_cobblestone'],
  ['brick', 'bricks'], ['prismarine', 'prismarine'],
  ['red_sandstone', 'red_sandstone'], ['mossy_stone_brick', 'mossy_stone_bricks'],
  ['granite', 'granite'], ['stone_brick', 'stone_bricks'],
  ['nether_brick', 'nether_bricks'], ['andesite', 'andesite'],
  ['red_nether_brick', 'red_nether_bricks'], ['sandstone', 'sandstone'],
  ['end_stone_brick', 'end_bricks'], ['diorite', 'diorite'],
  ['blackstone', 'blackstone'], ['polished_blackstone_brick', 'polished_blackstone_bricks'],
  ['polished_blackstone', 'polished_blackstone'],
];
for (const [material, ingredient] of WALL_MATERIALS) {
  recipes.push({
    result: `mc:${material}_wall`, count: 6,
    pattern: ['BBB', 'BBB'], key: { B: `mc:${ingredient}` },
  });
}
recipes.push({
  result: 'mc:iron_door', count: 3,
  pattern: ['II', 'II', 'II'],
  key: { I: 'mc:iron_ingot' },
});
recipes.push({
  result: 'mc:iron_trapdoor', count: 1,
  pattern: ['II', 'II'],
  key: { I: 'mc:iron_ingot' },
});

// Buttons, levers and pressure plates.
for (const wood of WOODS) {
  recipes.push({ result: `mc:${wood}_button`, count: 1, ingredients: [`mc:${wood}_planks`] });
  recipes.push({ result: `mc:${wood}_pressure_plate`, count: 1, pattern: ['PP'], key: { P: `mc:${wood}_planks` } });
}
recipes.push({ result: 'mc:stone_button', count: 1, ingredients: ['mc:stone'] });
recipes.push({ result: 'mc:polished_blackstone', count: 4, pattern: ['BB', 'BB'], key: { B: 'mc:blackstone' } });
recipes.push({ result: 'mc:polished_blackstone_button', count: 1, ingredients: ['mc:polished_blackstone'] });
recipes.push({ result: 'mc:stone_pressure_plate', count: 1, pattern: ['SS'], key: { S: 'mc:stone' } });
recipes.push({ result: 'mc:polished_blackstone_pressure_plate', count: 1, pattern: ['SS'], key: { S: 'mc:polished_blackstone' } });
recipes.push({ result: 'mc:lever', count: 1, pattern: ['T', 'S'], key: { T: 'mc:stick', S: 'mc:cobblestone' } });
recipes.push({ result: 'mc:redstone_torch', count: 1, pattern: ['R', 'S'], key: { R: 'mc:redstone', S: 'mc:stick' } });
recipes.push({ result: 'mc:glowstone', count: 1, pattern: ['DD', 'DD'], key: { D: 'mc:glowstone_dust' } });
recipes.push({ result: 'mc:redstone_lamp', count: 1, pattern: [' R ', 'RGR', ' R '], key: { R: 'mc:redstone', G: 'mc:glowstone' } });
recipes.push({ result: 'mc:hopper', count: 1, pattern: ['I I', 'ICI', ' I '], key: { I: 'mc:iron_ingot', C: 'mc:chest' } });
recipes.push({ result: 'mc:slime_block', count: 1, pattern: ['SSS', 'SSS', 'SSS'], key: { S: 'mc:slime_ball' } });
recipes.push({ result: 'mc:honeycomb_block', count: 1, pattern: ['HH', 'HH'], key: { H: 'mc:honeycomb' } });
recipes.push({ result: 'mc:honeycomb', count: 4, ingredients: ['mc:honeycomb_block'] });
recipes.push({ result: 'mc:beehive', count: 1, pattern: ['PPP', 'HHH', 'PPP'], key: { P: '#mc:planks', H: 'mc:honeycomb' } });
recipes.push({ result: 'mc:campfire', count: 1, pattern: [' S ', 'SCS', 'LLL'], key: { S: 'mc:stick', C: 'mc:coal', L: '#mc:logs' } });
recipes.push({ result: 'mc:composter', count: 1, pattern: ['S S', 'S S', 'SSS'], key: { S: '#mc:wooden_slabs' } });
recipes.push({ result: 'mc:pumpkin_seeds', count: 4, ingredients: ['mc:pumpkin'] });
recipes.push({ result: 'mc:melon_seeds', count: 1, ingredients: ['mc:melon_slice'] });
recipes.push({ result: 'mc:melon', count: 1, pattern: ['MMM', 'MMM', 'MMM'], key: { M: 'mc:melon_slice' } });
recipes.push({ result: 'mc:sugar', count: 1, ingredients: ['mc:sugar_cane'] });
recipes.push({ result: 'mc:paper', count: 3, pattern: ['CCC'], key: { C: 'mc:sugar_cane' } });
recipes.push({ result: 'mc:bone_meal', count: 3, ingredients: ['mc:bone'] });
recipes.push({ result: 'mc:piston', count: 1, pattern: ['PPP', 'CIC', 'CRC'], key: { P: '#mc:planks', C: 'mc:cobblestone', I: 'mc:iron_ingot', R: 'mc:redstone' } });
recipes.push({ result: 'mc:sticky_piston', count: 1, ingredients: ['mc:piston', 'mc:slime_ball'] });
recipes.push({ result: 'mc:dropper', count: 1, pattern: ['CCC', 'C C', 'CRC'], key: { C: 'mc:cobblestone', R: 'mc:redstone' } });
recipes.push({ result: 'mc:observer', count: 1, pattern: ['CCC', 'RQR', 'CCC'], key: { C: 'mc:cobblestone', R: 'mc:redstone', Q: 'mc:quartz' } });
recipes.push({ result: 'mc:target', count: 1, pattern: ['R R', ' H ', 'R R'], key: { R: 'mc:redstone', H: 'mc:hay_block' } });
recipes.push({ result: 'mc:lightning_rod', count: 1, pattern: ['C', 'C', 'C'], key: { C: 'mc:copper_ingot' } });
recipes.push({ result: 'mc:repeater', count: 1, pattern: ['T T', ' R ', 'SSS'], key: { T: 'mc:redstone_torch', R: 'mc:redstone', S: 'mc:stone' } });
recipes.push({ result: 'mc:light_weighted_pressure_plate', count: 1, pattern: ['GG'], key: { G: 'mc:gold_ingot' } });
recipes.push({ result: 'mc:heavy_weighted_pressure_plate', count: 1, pattern: ['II'], key: { I: 'mc:iron_ingot' } });
recipes.push({ result: 'mc:daylight_detector', count: 1, pattern: ['GGG', 'QQQ', 'SSS'], key: { G: 'mc:glass', Q: 'mc:quartz', S: 'mc:oak_slab' } });
recipes.push({ result: 'mc:note_block', count: 1, pattern: ['PPP', 'PRP', 'PPP'], key: { P: '#mc:planks', R: 'mc:redstone' } });
recipes.push({ result: 'mc:jukebox', count: 1, pattern: ['PPP', 'PDP', 'PPP'], key: { P: '#mc:planks', D: 'mc:diamond' } });
recipes.push({ result: 'mc:comparator', count: 1, pattern: [' T ', 'TQT', 'SSS'], key: { T: 'mc:redstone_torch', Q: 'mc:quartz', S: 'mc:stone' } });

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
  result: 'mc:chest', count: 1,
  pattern: ['PPP', 'P P', 'PPP'],
  key: { P: '#mc:planks' },
});

recipes.push({
  result: 'mc:furnace', count: 1,
  pattern: ['CCC', 'C C', 'CCC'],
  key: { C: 'mc:cobblestone' },
});

recipes.push({
  result: 'mc:torch', count: 4,
  pattern: ['C', 'S'],
  key: { C: '#mc:coals', S: 'mc:stick' },
});

recipes.push({
  result: 'mc:bed', count: 1,
  pattern: ['WWW', 'PPP'],
  key: { W: 'mc:white_wool', P: '#mc:planks' },
});

// Java 1.19 dye items and the complete recolouring path for wool.
// Only sources already represented by this project are exposed as recipes;
// the remaining dye items are registered so future flower/material sources
// can be added without changing the wool recipe contract.
for (const color of ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']) {
  recipes.push({
    result: `mc:${color}_wool`, count: 1,
    ingredients: ['mc:white_wool', `mc:${color}_dye`],
  });
}
recipes.push({ result: 'mc:white_dye', count: 1, ingredients: ['mc:bone_meal'] });
recipes.push({ result: 'mc:red_dye', count: 1, ingredients: ['mc:poppy'] });
recipes.push({ result: 'mc:yellow_dye', count: 1, ingredients: ['mc:dandelion'] });
recipes.push({ result: 'mc:blue_dye', count: 1, ingredients: ['mc:lapis_lazuli'] });
for (const color of ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']) {
  // Eight glass blocks plus dye produce eight matching stained-glass blocks.
  recipes.push({
    result: `mc:${color}_stained_glass`, count: 8,
    pattern: ['GGG', 'GDG', 'GGG'],
    key: { G: 'mc:glass', D: `mc:${color}_dye` },
  });
  // Eight terracotta blocks plus dye produce eight matching glazed-colour base blocks.
  recipes.push({
    result: `mc:${color}_terracotta`, count: 8,
    pattern: ['TTT', 'TDT', 'TTT'],
    key: { T: 'mc:terracotta', D: `mc:${color}_dye` },
  });
  // Four sand, four gravel and one dye make eight concrete powder.
  recipes.push({
    result: `mc:${color}_concrete_powder`, count: 8,
    pattern: ['SGS', 'GDG', 'SGS'],
    key: { S: 'mc:sand', G: 'mc:gravel', D: `mc:${color}_dye` },
  });
}


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
  hoe:     { pattern: ['MM', ' S', ' S'] },
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
  result: 'mc:carrot_on_a_stick', count: 1,
  pattern: ['  R', ' C '],
  key: { R: 'mc:fishing_rod', C: 'mc:carrot' },
});

recipes.push({
  result: 'mc:bow', count: 1,
  pattern: [' ST', 'S T', ' ST'],
  key: { S: 'mc:stick', T: 'mc:string' },
});

recipes.push({
  result: 'mc:arrow', count: 4,
  pattern: ['F', 'S', 'G'],
  key: { F: 'mc:flint', S: 'mc:stick', G: 'mc:feather' },
});

recipes.push({ result: 'mc:flint_and_steel', count: 1, pattern: ['F ', ' I'], key: { F: 'mc:flint', I: 'mc:iron_ingot' } });
recipes.push({ result: 'mc:shield', count: 1, pattern: ['PPP', 'PIP', ' P '], key: { P: '#mc:planks', I: 'mc:iron_ingot' } });
recipes.push({ result: 'mc:lead', count: 2, pattern: ['SS ', 'SL ', '  S'], key: { S: 'mc:string', L: 'mc:slime_ball' } });
recipes.push({ result: 'mc:blaze_powder', count: 2, ingredients: ['mc:blaze_rod'] });
recipes.push({ result: 'mc:fire_charge', count: 3, ingredients: ['mc:gunpowder', 'mc:blaze_powder', 'mc:coal'] });
recipes.push({ result: 'mc:fire_charge', count: 3, ingredients: ['mc:gunpowder', 'mc:blaze_powder', 'mc:charcoal'] });
recipes.push({ result: 'mc:leather', count: 1, ingredients: ['mc:rabbit_hide', 'mc:rabbit_hide', 'mc:rabbit_hide', 'mc:rabbit_hide'] });
recipes.push({ result: 'mc:book', count: 1, ingredients: ['mc:paper', 'mc:paper', 'mc:paper', 'mc:leather'] });

recipes.push({
  result: 'mc:bread', count: 1,
  pattern: ['WWW'],
  key: { W: 'mc:wheat' },
});

// Expanded Java food crafting: each recipe is reachable from registered items.
recipes.push({ result: 'mc:golden_carrot', count: 1, pattern: ['NNN', 'NCN', 'NNN'], key: { N: 'mc:gold_nugget', C: 'mc:carrot' } });
recipes.push({ result: 'mc:bowl', count: 4, pattern: ['P P', ' P '], key: { P: '#mc:planks' } });
recipes.push({ result: 'mc:mushroom_stew', count: 1, ingredients: ['mc:bowl', 'mc:red_mushroom', 'mc:brown_mushroom'] });
recipes.push({ result: 'mc:beetroot_soup', count: 1, pattern: ['BBB', 'BBB', ' C '], key: { B: 'mc:beetroot', C: 'mc:bowl' } });
recipes.push({ result: 'mc:rabbit_stew', count: 1, ingredients: ['mc:bowl', 'mc:cooked_rabbit', 'mc:carrot', 'mc:baked_potato', 'mc:brown_mushroom'] });

recipes.push({
  result: 'mc:shears', count: 1,
  pattern: [' I', 'I '],
  key: { I: 'mc:iron_ingot' },
});

// -- Armour ---------------------------------------------------------------

const ARMOR_PATTERNS = {
  helmet: ['MMM', 'M M'],
  chestplate: ['M M', 'MMM', 'MMM'],
  leggings: ['MMM', 'M M', 'M M'],
  boots: ['M M', 'M M'],
};
const ARMOR_MATERIALS = [
  ['leather', 'mc:leather'],
  ['iron', 'mc:iron_ingot'],
  ['golden', 'mc:gold_ingot'],
  ['diamond', 'mc:diamond'],
];
for (const [material, ingredient] of ARMOR_MATERIALS) {
  for (const [piece, pattern] of Object.entries(ARMOR_PATTERNS)) {
    recipes.push({
      result: `mc:${material}_${piece}`, count: 1,
      pattern, key: { M: ingredient },
    });
  }
}

// -- Gold currency (1.12.2) -----------------------------------------------

recipes.push({
  result: 'mc:gold_ingot', count: 1,
  pattern: ['NNN', 'NNN', 'NNN'],
  key: { N: 'mc:gold_nugget' },
});

recipes.push({
  result: 'mc:gold_nugget', count: 9,
  ingredients: ['mc:gold_ingot'],
});

// -- Mineral blocks --------------------------------------------------------

/**
 * Nine of a material packs into a block; a block unpacks into nine. Both
 * directions exist so storage is reversible -- a one-way recipe would make
 * compacting ore a trap.
 */
const PACKABLE = [
  ['mc:bone_meal', 'mc:bone_block'],
  ['mc:coal', 'mc:coal_block'],
  ['mc:iron_ingot', 'mc:iron_block'],
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
  result: 'mc:stone_bricks', count: 4,
  pattern: ['SS', 'SS'],
  key: { S: 'mc:stone' },
});

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
  ['mc:granite', 'granite'],
  ['mc:polished_granite', 'polished_granite'],
  ['mc:diorite', 'diorite'],
  ['mc:polished_diorite', 'polished_diorite'],
  ['mc:andesite', 'andesite'],
  ['mc:polished_andesite', 'polished_andesite'],
  ['mc:stone_bricks', 'stone_bricks'],
  ['mc:oak_planks', 'oak'],
  ['mc:birch_planks', 'birch'],
  ['mc:spruce_planks', 'spruce'],
  ['mc:jungle_planks', 'jungle'],
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
