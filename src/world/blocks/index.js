/**
 * The Phase 1 block catalog.
 *
 * Every hardness, tool, and harvest level here is the real vanilla value. Where
 * a number is guessed rather than sourced it is marked APPROX -- there are only
 * a couple, and they are cosmetic.
 *
 * The 16-colour families, the full stone and wood sets, and every non-cube shape
 * beyond torches and cross-plants arrive in Phase 2 with the model system.
 * Registering a stair before anything can draw one would just be a block that
 * renders as a hole.
 *
 * TEXTURE KEYS
 *
 * Blocks name their textures rather than declaring pixels. src/render/atlas.js
 * owns what each key actually looks like, so the catalog stays about game data
 * and the art stays in one place.
 */

import { BLOCKS, PROPS } from '../block.js';
import { ITEMS } from '../item.js';
import { BLOCK_TAGS, ITEM_TAGS } from '../tags.js';
import { TOOL_TIER, ATTACK_SPEED, WEAPON_DAMAGE } from '../../core/constants.js';

const define = (id, opts) => BLOCKS.define(id, opts);

// ---------------------------------------------------------------------------
// Helpers -- the catalog is mostly repetition, and repetition is where typos
// hide. Each family is described once.
// ---------------------------------------------------------------------------

/** A plain full cube of stone: pickaxe, requires a tool for drops. */
function stoneLike(id, texture, hardness, resistance, harvestLevel = 0, extra = {}) {
  return define(id, {
    hardness, resistance, tool: 'pickaxe', harvestLevel, requiresTool: true,
    soundGroup: 'stone', texture, ...extra,
  });
}

/** An ore, plus its deepslate variant. Deepslate ores are harder but drop the same. */
function ore(name, harvestLevel, texture) {
  stoneLike(`mc:${name}`, texture, 3.0, 3.0, harvestLevel);
  stoneLike(`mc:deepslate_${name}`, `deepslate_${texture}`, 4.5, 3.0, harvestLevel);
}

/** Log, planks, leaves, sapling for one tree species. */
function woodSet(species) {
  define(`mc:${species}_log`, {
    hardness: 2, resistance: 2, tool: 'axe', soundGroup: 'wood', flammability: 5,
    properties: { axis: PROPS.axis },
    defaultValues: { axis: 'y' },
    textures: { top: `${species}_log_top`, bottom: `${species}_log_top`, side: `${species}_log` },
  });

  define(`mc:${species}_planks`, {
    hardness: 2, resistance: 3, tool: 'axe', soundGroup: 'wood', flammability: 5,
    texture: `${species}_planks`,
  });

  define(`mc:${species}_leaves`, {
    hardness: 0.2, resistance: 0.2, tool: 'shears', soundGroup: 'grass',
    // Leaves are a full cube but do not hide their neighbours' faces -- that is
    // what makes a tree canopy look like foliage rather than a solid green box.
    opaqueCube: false, opacity: 1, flammability: 30,
    renderShape: 'cutout', tint: species === 'spruce' || species === 'birch' ? null : 'foliage',
    texture: `${species}_leaves`,
    properties: { distance: PROPS.distance, persistent: PROPS.persistent },
    defaultValues: { distance: 7, persistent: false },
  });

  define(`mc:${species}_sapling`, {
    hardness: 0, resistance: 0, solid: false, opaqueCube: false, opacity: 0,
    replaceable: false, renderShape: 'cross', soundGroup: 'grass',
    texture: `${species}_sapling`,
  });

  BLOCK_TAGS.define('#mc:logs', [`mc:${species}_log`]);
  BLOCK_TAGS.define('#mc:planks', [`mc:${species}_planks`]);
  BLOCK_TAGS.define('#mc:leaves', [`mc:${species}_leaves`]);
  BLOCK_TAGS.define('#mc:saplings', [`mc:${species}_sapling`]);
}

/** A cross-shaped plant: no collision, broken instantly, replaceable by placement. */
function plant(id, texture, tint = null) {
  return define(id, {
    hardness: 0, resistance: 0, solid: false, opaqueCube: false, opacity: 0,
    replaceable: true, renderShape: 'cross', soundGroup: 'grass', texture, tint,
  });
}

// ---------------------------------------------------------------------------
// Stone and terrain
// ---------------------------------------------------------------------------

stoneLike('mc:stone', 'stone', 1.5, 6);
stoneLike('mc:cobblestone', 'cobblestone', 2, 6);
stoneLike('mc:granite', 'granite', 1.5, 6);
stoneLike('mc:polished_granite', 'polished_granite', 1.5, 6);
stoneLike('mc:diorite', 'diorite', 1.5, 6);
stoneLike('mc:polished_diorite', 'polished_diorite', 1.5, 6);
stoneLike('mc:andesite', 'andesite', 1.5, 6);
stoneLike('mc:polished_andesite', 'polished_andesite', 1.5, 6);
stoneLike('mc:sandstone', 'sandstone', 0.8, 0.8);
stoneLike('mc:obsidian', 'obsidian', 50, 1200, 3);

// Deepslate is directional: it has a distinct top texture and rotates on place.
stoneLike('mc:deepslate', 'deepslate', 3, 6, 0, {
  properties: { axis: PROPS.axis },
  defaultValues: { axis: 'y' },
  textures: { top: 'deepslate_top', bottom: 'deepslate_top', side: 'deepslate' },
});
stoneLike('mc:cobbled_deepslate', 'cobbled_deepslate', 3.5, 6);

define('mc:bedrock', {
  hardness: -1, resistance: 3600000, texture: 'bedrock', soundGroup: 'stone',
});

define('mc:dirt', {
  hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'gravel', texture: 'dirt',
});

define('mc:coarse_dirt', {
  hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'gravel', texture: 'coarse_dirt',
});

define('mc:grass_block', {
  hardness: 0.6, resistance: 0.6, tool: 'shovel', soundGroup: 'grass',
  properties: { snowy: PROPS.snowy },
  textures: { top: 'grass_block_top', bottom: 'dirt', side: 'grass_block_side' },
  // Only the top face takes the biome grass colour; the side has a pre-tinted
  // overlay baked into its texture, matching how vanilla handles it.
  tint: 'grass', tintFaces: ['up'],
});

define('mc:podzol', {
  hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'gravel',
  textures: { top: 'podzol_top', bottom: 'dirt', side: 'podzol_side' },
});

define('mc:sand', {
  hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'sand',
  gravity: true, texture: 'sand',
});

define('mc:gravel', {
  hardness: 0.6, resistance: 0.6, tool: 'shovel', soundGroup: 'gravel',
  gravity: true, texture: 'gravel',
});

define('mc:clay', {
  hardness: 0.6, resistance: 0.6, tool: 'shovel', soundGroup: 'gravel', texture: 'clay',
});

define('mc:snow_block', {
  hardness: 0.2, resistance: 0.2, tool: 'shovel', requiresTool: true,
  soundGroup: 'snow', texture: 'snow',
});

define('mc:ice', {
  hardness: 0.5, resistance: 0.5, tool: 'pickaxe', soundGroup: 'glass',
  opaqueCube: false, opacity: 3, renderShape: 'translucent', texture: 'ice',
  slipperiness: 0.98,
});

define('mc:glass', {
  hardness: 0.3, resistance: 0.3, soundGroup: 'glass',
  opaqueCube: false, opacity: 0, renderShape: 'cutout', texture: 'glass',
});

define('mc:white_wool', {
  hardness: 0.8, resistance: 0.8, soundGroup: 'cloth', texture: 'white_wool',
});

// ---------------------------------------------------------------------------
// Ores and mineral blocks
// ---------------------------------------------------------------------------

ore('coal_ore', 0, 'coal_ore');
ore('iron_ore', 1, 'iron_ore');
ore('copper_ore', 1, 'copper_ore');
ore('gold_ore', 2, 'gold_ore');
ore('redstone_ore', 2, 'redstone_ore');
ore('lapis_ore', 1, 'lapis_ore');
ore('diamond_ore', 2, 'diamond_ore');
ore('emerald_ore', 2, 'emerald_ore');

stoneLike('mc:coal_block', 'coal_block', 5, 6);
stoneLike('mc:iron_block', 'iron_block', 5, 6, 1);
stoneLike('mc:copper_block', 'copper_block', 3, 6, 1);
stoneLike('mc:gold_block', 'gold_block', 3, 6, 2);
stoneLike('mc:diamond_block', 'diamond_block', 5, 6, 2);
stoneLike('mc:emerald_block', 'emerald_block', 5, 6, 2);
stoneLike('mc:lapis_block', 'lapis_block', 3, 3, 1);
stoneLike('mc:redstone_block', 'redstone_block', 5, 6, 2);

// ---------------------------------------------------------------------------
// Wood
// ---------------------------------------------------------------------------

woodSet('oak');
woodSet('birch');
woodSet('spruce');

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

plant('mc:short_grass', 'short_grass', 'grass');
plant('mc:fern', 'fern', 'grass');
plant('mc:dandelion', 'dandelion');
plant('mc:poppy', 'poppy');
plant('mc:dead_bush', 'dead_bush');

// ---------------------------------------------------------------------------
// Functional
// ---------------------------------------------------------------------------

define('mc:crafting_table', {
  hardness: 2.5, resistance: 2.5, tool: 'axe', soundGroup: 'wood', flammability: 5,
  textures: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side' },
});

define('mc:farmland', {
  hardness: 0.6, resistance: 0.6, tool: 'shovel', soundGroup: 'grass',
  texture: 'farmland',
});

define('mc:wheat', {
  hardness: 0, resistance: 0, solid: false, opaqueCube: false, opacity: 0,
  replaceable: true, renderShape: 'cross', soundGroup: 'grass',
  properties: { age: PROPS.age7 },
  defaultValues: { age: 0 },
  texture: 'wheat_crop',
});

define('mc:torch', {
  hardness: 0, resistance: 0, solid: false, opaqueCube: false, opacity: 0,
  lightEmission: 14, renderShape: 'torch', soundGroup: 'wood', texture: 'torch',
});

/**
 * Water.
 *
 * Phase 1 treats water as a static block so oceans and lakes render. Flow, source
 * spreading, waterlogging, and swimming physics are Phase 5 -- placing a bucket
 * of it will not spread yet. Recorded in docs/PARITY.md as a known difference
 * rather than left as a surprise.
 */
define('mc:water', {
  hardness: 100, resistance: 100, solid: false, opaqueCube: false, opacity: 1,
  replaceable: true, renderShape: 'translucent', tint: 'water',
  soundGroup: 'none', texture: 'water',
  properties: { level: PROPS.level },
});

// ---------------------------------------------------------------------------
// Slabs and stairs (Phase 2 box-model shapes)
//
// One definition each, keyed off a base block's material. The box geometry and
// collision live in src/world/shapes.js; these just declare the properties and
// point at the base texture.
// ---------------------------------------------------------------------------

function slab(baseId, { tool, harvestLevel = -1, requiresTool = false, sound = 'stone' } = {}) {
  const base = BLOCKS.get(baseId);
  // Wood slabs are named for the tree, not the planks: oak_planks -> oak_slab.
  define(`${baseId.replace('_planks', '')}_slab`, {
    hardness: base.hardness, resistance: base.resistance,
    tool, harvestLevel, requiresTool, soundGroup: sound,
    renderShape: 'slab', opaqueCube: false, waterloggable: true,
    texture: base.texture ?? base.textures?.side,
    textures: base.textures,
    properties: { type: PROPS.slabType, waterlogged: PROPS.waterlogged },
    defaultValues: { type: 'bottom', waterlogged: false },
  });
}

function stairs(baseId, { tool, harvestLevel = -1, requiresTool = false, sound = 'stone' } = {}) {
  const base = BLOCKS.get(baseId);
  define(`${baseId.replace('_planks', '')}_stairs`, {
    hardness: base.hardness, resistance: base.resistance,
    tool, harvestLevel, requiresTool, soundGroup: sound,
    renderShape: 'stair', opaqueCube: false, waterloggable: true,
    texture: base.texture ?? base.textures?.side,
    textures: base.textures,
    properties: {
      facing: PROPS.facing, half: PROPS.half,
      shape: PROPS.stairShape, waterlogged: PROPS.waterlogged,
    },
    defaultValues: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: false },
  });
}

const STONE_LIKE = { tool: 'pickaxe', harvestLevel: 0, requiresTool: true, sound: 'stone' };
const WOOD_LIKE = { tool: 'axe', sound: 'wood' };

for (const base of ['mc:stone', 'mc:cobblestone', 'mc:sandstone']) {
  slab(base, STONE_LIKE);
  stairs(base, STONE_LIKE);
}
for (const wood of ['oak', 'birch', 'spruce']) {
  slab(`mc:${wood}_planks`, WOOD_LIKE);
  stairs(`mc:${wood}_planks`, WOOD_LIKE);
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

BLOCK_TAGS.define('#mc:dirt', ['mc:dirt', 'mc:grass_block', 'mc:coarse_dirt', 'mc:podzol']);
BLOCK_TAGS.define('#mc:base_stone_overworld', [
  'mc:stone', 'mc:granite', 'mc:diorite', 'mc:andesite', 'mc:deepslate',
]);
BLOCK_TAGS.define('#mc:coal_ores', ['mc:coal_ore', 'mc:deepslate_coal_ore']);
BLOCK_TAGS.define('#mc:iron_ores', ['mc:iron_ore', 'mc:deepslate_iron_ore']);
BLOCK_TAGS.define('#mc:gold_ores', ['mc:gold_ore', 'mc:deepslate_gold_ore']);
BLOCK_TAGS.define('#mc:diamond_ores', ['mc:diamond_ore', 'mc:deepslate_diamond_ore']);

ITEM_TAGS.define('#mc:planks', ['mc:oak_planks', 'mc:birch_planks', 'mc:spruce_planks']);
ITEM_TAGS.define('#mc:logs', ['mc:oak_log', 'mc:birch_log', 'mc:spruce_log']);
ITEM_TAGS.define('#mc:stone_tool_materials', ['mc:cobblestone', 'mc:cobbled_deepslate']);
ITEM_TAGS.define('#mc:coals', ['mc:coal', 'mc:charcoal']);

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Every block gets an item form unless it is unobtainable. */
const NO_ITEM = new Set(['mc:air', 'mc:water']);
for (const block of BLOCKS.blocks.values()) {
  if (NO_ITEM.has(block.id)) continue;
  ITEMS.defineBlockItem(block.id, {
    fuelTicks: block.soundGroup === 'wood' ? 300 : 0,
    notInCreative: block.notInCreative === true,
  });
}

// Materials
const MATERIALS = [
  ['mc:stick', { fuelTicks: 100 }],
  ['mc:coal', { fuelTicks: 1600 }],
  ['mc:charcoal', { fuelTicks: 1600 }],
  ['mc:raw_iron', {}],
  ['mc:raw_copper', {}],
  ['mc:raw_gold', {}],
  ['mc:iron_ingot', {}],
  ['mc:copper_ingot', {}],
  ['mc:gold_ingot', {}],
  ['mc:diamond', {}],
  ['mc:emerald', {}],
  ['mc:lapis_lazuli', {}],
  ['mc:redstone', {}],
  ['mc:flint', {}],
  ['mc:clay_ball', {}],
  ['mc:string', {}],
  ['mc:bone', {}],
  ['mc:leather', {}],
  ['mc:feather', {}],
  ['mc:wheat_seeds', {}],
  ['mc:wheat', {}],
];
for (const [id, opts] of MATERIALS) ITEMS.define(id, opts);

// Food: nutrition restores food points; saturation is nutrition * modifier * 2.
const FOODS = [
  ['mc:apple', 4, 0.3],
  ['mc:bread', 5, 0.6],
  ['mc:raw_beef', 3, 0.3],
  ['mc:cooked_beef', 8, 0.8],
  ['mc:raw_porkchop', 3, 0.3],
  ['mc:cooked_porkchop', 8, 0.8],
  ['mc:raw_chicken', 2, 0.3],
  ['mc:cooked_chicken', 6, 0.6],
  ['mc:carrot', 3, 0.6],
  ['mc:potato', 1, 0.3],
  ['mc:baked_potato', 5, 0.6],
  ['mc:raw_mutton', 2, 0.3],
  ['mc:rotten_flesh', 4, 0.1],
  ['mc:cooked_mutton', 6, 0.8],
  ['mc:raw_cod', 2, 0.2],
  ['mc:raw_salmon', 2, 0.2],
  ['mc:pufferfish', 1, 0.1],
  ['mc:tropical_fish', 1, 0.1],
];
for (const [id, nutrition, saturation] of FOODS) {
  ITEMS.define(id, { food: { nutrition, saturation } });
}

/**
 * Tools.
 *
 * Durability and speed come from TOOL_TIER in core/constants.js so there is
 * exactly one place those numbers live. Attack damage and speed per tool type
 * come from the vanilla tables in the same file.
 */
ITEMS.define('mc:shears', { stackSize: 1, maxDamage: 238, tool: 'shears', attackDamage: 1 });
ITEMS.define('mc:fishing_rod', { stackSize: 1, maxDamage: 64, tool: 'fishing_rod' });

const TOOL_TYPES = [
  ['pickaxe', 'PICKAXE', ATTACK_SPEED.PICKAXE],
  ['axe', 'AXE', null],       // axe speed varies by tier
  ['shovel', 'SHOVEL', ATTACK_SPEED.SHOVEL],
  ['sword', 'SWORD', ATTACK_SPEED.SWORD],
];

const TIER_KEYS = [
  ['wooden', 'WOOD', 'wood'],
  ['stone', 'STONE', 'stone'],
  ['iron', 'IRON', 'iron'],
  ['golden', 'GOLD', 'gold'],
  ['diamond', 'DIAMOND', 'diamond'],
  ['netherite', 'NETHERITE', 'netherite'],
];

for (const [prefix, tierKey, damageKey] of TIER_KEYS) {
  const tier = TOOL_TIER[tierKey];
  for (const [toolName, damageTable, fixedSpeed] of TOOL_TYPES) {
    const axeSpeed = ATTACK_SPEED[`AXE_${tierKey}`] ?? 1.0;
    ITEMS.define(`mc:${prefix}_${toolName}`, {
      stackSize: 1,
      maxDamage: tier.durability,
      tool: toolName,
      tier: tierKey,
      toolSpeed: tier.speed,
      harvestLevel: tier.level,
      attackDamage: WEAPON_DAMAGE[damageTable][damageKey],
      attackSpeed: fixedSpeed ?? axeSpeed,
      // Wooden tools burn. Golden ones do not, despite being equally flimsy.
      fuelTicks: prefix === 'wooden' ? 200 : 0,
    });
  }
}

/**
 * Close the registries to further registration.
 *
 * Called by main.js at startup rather than here, because freezing is an
 * application lifecycle decision and this is a data module. Tests register
 * throwaway blocks to exercise the registry, and a module-level freeze would
 * make that impossible purely as a side effect of importing the catalog.
 */
export function freezeRegistries() {
  BLOCKS.freeze();
  ITEMS.freeze();
}

// ---------------------------------------------------------------------------
// Startup validation
//
// A tag typo would otherwise surface much later as a recipe that mysteriously
// refuses to match, which is a genuinely unpleasant thing to debug.
// ---------------------------------------------------------------------------

const tagProblems = [
  ...BLOCK_TAGS.validate((id) => BLOCKS.get(id) !== undefined),
  ...ITEM_TAGS.validate((id) => ITEMS.get(id) !== undefined),
];
if (tagProblems.length > 0) {
  throw new Error('Tag validation failed:\n  - ' + tagProblems.join('\n  - '));
}

export const BLOCK_COUNT = BLOCKS.blockCount;
export const STATE_COUNT = BLOCKS.stateCount;
export const ITEM_COUNT = ITEMS.count;
