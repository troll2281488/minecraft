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

/** A 1.12.2 ore block. */
function ore(name, harvestLevel, texture) {
  stoneLike(`mc:${name}`, texture, 3.0, 3.0, harvestLevel);
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
    renderShape: 'cutout', tint: 'leaves',
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
stoneLike('mc:mossy_cobblestone', 'mossy_cobblestone', 2, 6);
stoneLike('mc:granite', 'granite', 1.5, 6);
stoneLike('mc:polished_granite', 'polished_granite', 1.5, 6);
stoneLike('mc:stone_bricks', 'stone_bricks', 1.5, 6);
stoneLike('mc:diorite', 'diorite', 1.5, 6);
stoneLike('mc:polished_diorite', 'polished_diorite', 1.5, 6);
stoneLike('mc:andesite', 'andesite', 1.5, 6);
stoneLike('mc:polished_andesite', 'polished_andesite', 1.5, 6);
stoneLike('mc:sandstone', 'sandstone', 0.8, 0.8);
stoneLike('mc:obsidian', 'obsidian', 50, 1200, 3);
stoneLike('mc:netherrack', 'netherrack', 0.4, 2);
stoneLike('mc:blackstone', 'blackstone', 1.5, 6);
stoneLike('mc:polished_blackstone', 'polished_blackstone', 1.5, 6);
stoneLike('mc:nether_bricks', 'nether_bricks', 2, 6);
stoneLike('mc:nether_brick_fence', 'nether_bricks', 2, 6);
stoneLike('mc:nether_gold_ore', 'nether_gold_ore', 3, 3);
define('mc:glowstone', {
  hardness: 0.3, resistance: 0.3, tool: 'pickaxe', soundGroup: 'glass',
  lightEmission: 15, texture: 'glowstone',
});
define('mc:soul_sand', { hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'sand', texture: 'soul_sand' });
define('mc:bed', { hardness: 0.2, resistance: 0.2, tool: 'axe', soundGroup: 'wood', texture: 'bed', renderShape: 'slab', opaqueCube: false, properties: { type: PROPS.slabType }, defaultValues: { type: 'bottom' } });


define('mc:bedrock', {
  hardness: -1, resistance: 3600000, texture: 'bedrock', soundGroup: 'stone',
});

define('mc:dirt', {
  hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'gravel', texture: 'dirt',
});

define('mc:coarse_dirt', {
  hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'gravel', texture: 'coarse_dirt',
});

// Biome-specific surface soils: distinct materials instead of a universal grass cap.
for (const [name, texture] of [
  ['plains_soil', 'plains_soil'], ['forest_floor', 'forest_floor'],
  ['birch_soil', 'birch_soil'], ['jungle_soil', 'jungle_soil'],
  ['savanna_soil', 'savanna_soil'], ['taiga_soil', 'taiga_soil'],
  ['swamp_mud', 'swamp_mud'], ['alpine_gravel', 'alpine_gravel'],
]) define(`mc:${name}`, {
  hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'gravel', texture,
});

define('mc:grass_block', {
  hardness: 0.6, resistance: 0.6, tool: 'shovel', soundGroup: 'grass',
  properties: { snowy: PROPS.snowy },
  textures: { top: 'grass_block_top', bottom: 'dirt', side: 'grass_block_side' },
  // Only the top face takes the biome grass colour; the side has a pre-tinted
  // overlay baked into its texture, matching how vanilla handles it.
  tint: 'grass', tintFaces: ['up', 'north', 'south', 'west', 'east'],
});

define('mc:podzol', {
  hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'gravel',
  textures: { top: 'podzol_top', bottom: 'dirt', side: 'podzol_side' },
});

define('mc:sand', {
  hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'sand',
  gravity: true, texture: 'sand',
});

define('mc:red_sand', {
  hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'sand',
  gravity: true, texture: 'red_sand',
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
ore('gold_ore', 2, 'gold_ore');
stoneLike('mc:redstone_ore', 'redstone_ore', 3, 3, 2, {
  properties: { lit: PROPS.lit }, defaultValues: { lit: false },
});
ore('lapis_ore', 1, 'lapis_ore');
ore('diamond_ore', 2, 'diamond_ore');
ore('emerald_ore', 2, 'emerald_ore');

stoneLike('mc:coal_block', 'coal_block', 5, 6);
stoneLike('mc:iron_block', 'iron_block', 5, 6, 1);
stoneLike('mc:gold_block', 'gold_block', 3, 6, 2);
stoneLike('mc:diamond_block', 'diamond_block', 5, 6, 2);
stoneLike('mc:emerald_block', 'emerald_block', 5, 6, 2);
stoneLike('mc:lapis_block', 'lapis_block', 3, 3, 1);
stoneLike('mc:redstone_block', 'redstone_block', 5, 6, 2);

// ---------------------------------------------------------------------------
// Additional classic 1.12.2 blocks
// ---------------------------------------------------------------------------

for (const [id, hardness, resistance, tool, texture, soundGroup] of [
  ['mc:red_sandstone', 0.8, 0.8, 'pickaxe', 'red_sandstone', 'stone'],
  ['mc:prismarine', 1.5, 6, 'pickaxe', 'stone', 'stone'],
  ['mc:prismarine_bricks', 1.5, 6, 'pickaxe', 'stone', 'stone'],
  ['mc:dark_prismarine', 1.5, 6, 'pickaxe', 'stone', 'stone'],
  ['mc:sea_lantern', 0.3, 0.3, 'pickaxe', 'glass', 'glass'],
  ['mc:end_stone', 3, 9, 'pickaxe', 'sandstone', 'stone'],
  ['mc:end_bricks', 3, 9, 'pickaxe', 'sandstone', 'stone'],
  ['mc:purpur_block', 1.5, 6, 'pickaxe', 'stone', 'stone'],
  ['mc:purpur_pillar', 1.5, 6, 'pickaxe', 'stone', 'stone'],
  ['mc:slime_block', 0, 0, null, 'slime_block', 'slime'],
  ['mc:honey_block', 0, 0, null, 'honey_block', 'honey'],
  ['mc:honeycomb_block', 0.6, 0.6, 'axe', 'honeycomb_block', 'grass'],
  ['mc:magma_block', 0.5, 0.5, 'pickaxe', 'stone', 'stone'],
  ['mc:bone_block', 2, 2, 'pickaxe', 'white_wool', 'stone'],
  ['mc:packed_ice', 0.5, 0.5, 'pickaxe', 'ice', 'glass'],
  ['mc:sponge', 0.6, 0.6, 'hoe', 'white_wool', 'cloth'],
  ['mc:wet_sponge', 0.6, 0.6, 'hoe', 'white_wool', 'cloth'],
  ['mc:hay_block', 0.5, 0.5, 'hoe', 'white_wool', 'grass'],
]) {
  if (!BLOCKS.get(id)) define(id, {
    hardness, resistance, tool, soundGroup, texture,
    ...(id === 'mc:sea_lantern' ? { lightEmission: 15 } : {}),
    ...(id === 'mc:slime_block' ? { slipperiness: 0.8 } : {}),
    ...(id === 'mc:honey_block' ? { slipperiness: 0.4 } : {}),
  });
}

// The full 16-colour families available in 1.12.2. The creative inventory
// receives block items automatically from the registry below.
const DYE_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
];
for (const color of DYE_COLORS) {
  if (color !== 'white') define(`mc:${color}_wool`, {
    hardness: 0.8, resistance: 0.8, soundGroup: 'cloth', texture: `${color}_wool`,
  });
  define(`mc:${color}_stained_glass`, {
    hardness: 0.3, resistance: 0.3, soundGroup: 'glass',
    opaqueCube: false, opacity: 0, renderShape: 'cutout', texture: `${color}_stained_glass`,
  });
  define(`mc:${color}_terracotta`, {
    hardness: 1.25, resistance: 4.2, tool: 'pickaxe', soundGroup: 'stone', texture: `${color}_terracotta`,
  });
  define(`mc:${color}_concrete`, {
    hardness: 1.8, resistance: 1.8, tool: 'pickaxe', soundGroup: 'stone', texture: `${color}_concrete`,
  });
  define(`mc:${color}_concrete_powder`, {
    hardness: 0.5, resistance: 0.5, tool: 'shovel', soundGroup: 'sand', gravity: true,
    texture: `${color}_concrete_powder`,
  });
}

// ---------------------------------------------------------------------------
// Wood
// ---------------------------------------------------------------------------

woodSet('oak');
woodSet('birch');
woodSet('spruce');
woodSet('jungle');
woodSet('acacia');
woodSet('dark_oak');

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

plant('mc:short_grass', 'short_grass', 'grass');
plant('mc:fern', 'fern', 'grass');
plant('mc:dandelion', 'dandelion');
plant('mc:poppy', 'poppy');
plant('mc:dead_bush', 'dead_bush');
plant('mc:red_mushroom', 'red_mushroom');
plant('mc:brown_mushroom', 'brown_mushroom');
plant('mc:bamboo', 'bamboo');
plant('mc:vine', 'vine', 'foliage');

define('mc:mycelium', {
  hardness: 0.6, resistance: 0.6, tool: 'shovel', soundGroup: 'grass',
  textures: { top: 'mycelium_top', bottom: 'dirt', side: 'mycelium_side' },
});

// ---------------------------------------------------------------------------
// Functional
// ---------------------------------------------------------------------------

define('mc:campfire', {
  hardness: 2, resistance: 2, tool: 'axe', soundGroup: 'wood',
  flammability: 5, lightEmission: 15, texture: 'campfire',
});

for (const id of ['mc:bee_nest', 'mc:beehive']) {
  define(id, {
    hardness: 0.6, resistance: 0.6, tool: 'axe', soundGroup: 'wood',
    flammability: 5, texture: id === 'mc:bee_nest' ? 'bee_nest' : 'beehive',
    properties: { facing: PROPS.facing, honey_level: PROPS.honeyLevel },
    defaultValues: { facing: 'north', honey_level: 0 },
  });
}

define('mc:crafting_table', {
  hardness: 2.5, resistance: 2.5, tool: 'axe', soundGroup: 'wood', flammability: 5,
  textures: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side' },
});

// Storage and processing blocks from Java 1.12.2.
define('mc:chest', {
  hardness: 2.5, resistance: 2.5, tool: 'axe', soundGroup: 'wood', flammability: 5,
  textures: { top: 'chest_top', bottom: 'chest_side', side: 'chest_side' },
});
define('mc:furnace', {
  hardness: 3.5, resistance: 3.5, tool: 'pickaxe', harvestLevel: 0,
  requiresTool: true, soundGroup: 'stone',
  textures: { top: 'furnace_top', bottom: 'furnace_side', side: 'furnace_front' },
});

define('mc:hopper', {
  hardness: 3, resistance: 4.8, tool: 'pickaxe', harvestLevel: 0,
  requiresTool: true, soundGroup: 'metal', texture: 'hopper',
  properties: { facing: PROPS.hopperFacing, enabled: PROPS.enabled },
  defaultValues: { facing: 'down', enabled: true },
});

define('mc:dropper', {
  hardness: 3.5, resistance: 3.5, tool: 'pickaxe', harvestLevel: 0,
  requiresTool: true, soundGroup: 'stone', texture: 'dropper',
  properties: { facing: PROPS.facingAll }, defaultValues: { facing: 'north' },
});

define('mc:piston', {
  hardness: 1.5, resistance: 1.5, tool: 'pickaxe', soundGroup: 'wood',
  textures: { top: 'piston_top', bottom: 'piston_bottom', side: 'piston_side' },
  properties: { facing: PROPS.facingAll, extended: PROPS.extended },
  defaultValues: { facing: 'north', extended: false },
});
define('mc:sticky_piston', {
  hardness: 1.5, resistance: 1.5, tool: 'pickaxe', soundGroup: 'slime',
  textures: { top: 'sticky_piston_top', bottom: 'piston_bottom', side: 'piston_side' },
  properties: { facing: PROPS.facingAll, extended: PROPS.extended },
  defaultValues: { facing: 'north', extended: false },
});
// The head is an internal moving part, not a placeable inventory block.
define('mc:piston_head', {
  hardness: 0, resistance: 0, soundGroup: 'wood', texture: 'piston_top',
  renderShape: 'piston_head', solid: true, opaqueCube: false, opacity: 0,
  properties: { facing: PROPS.facingAll, sticky: PROPS.sticky },
  defaultValues: { facing: 'north', sticky: false },
  notInCreative: true,
});

define('mc:observer', {
  hardness: 3, resistance: 3, tool: 'pickaxe', harvestLevel: 0,
  requiresTool: true, soundGroup: 'stone', texture: 'observer',
  properties: { facing: PROPS.facingAll, powered: PROPS.powered },
  defaultValues: { facing: 'south', powered: false },
});

define('mc:target', {
  hardness: 0.5, resistance: 0.5, tool: 'hoe', soundGroup: 'wood',
  texture: 'target', properties: { power: PROPS.power }, defaultValues: { power: 0 },
});

define('mc:mob_spawner', {
  hardness: 5, resistance: 5, tool: 'pickaxe', harvestLevel: -1,
  requiresTool: true, soundGroup: 'stone', texture: 'mob_spawner',
  properties: { spawner_type: PROPS.spawnerType },
  defaultValues: { spawner_type: 'dungeon' },
  notInCreative: true,
});

// Stronghold portal frames retain their inward-facing orientation and the
// per-frame eye-of-ender state in the saved blockstate palette.
define('mc:iron_bars', {
  hardness: 5, resistance: 6, tool: 'pickaxe', harvestLevel: 0,
  solid: true, opaqueCube: false, opacity: 0,
  renderShape: 'pane', soundGroup: 'metal', texture: 'iron_bars',
});

// Stronghold library and passage blocks. The ladder is a non-colliding
// wall-mounted model; cobweb slowdown is a later movement-physics refinement.
define('mc:bookshelf', {
  hardness: 1.5, resistance: 1.5, tool: 'axe', soundGroup: 'wood', flammability: 5,
  texture: 'bookshelf',
});

define('mc:cobweb', {
  hardness: 4, resistance: 4, solid: false, opaqueCube: false, opacity: 0,
  renderShape: 'cross', soundGroup: 'cloth', texture: 'cobweb',
});

define('mc:ladder', {
  hardness: 0.4, resistance: 0.4, solid: false, opaqueCube: false, opacity: 0,
  renderShape: 'ladder', soundGroup: 'wood', texture: 'ladder',
  properties: { facing: PROPS.facing }, defaultValues: { facing: 'north' },
});

// Two-block Java-style doors. Both halves carry the same orientation/open
// state so a click or save/load never leaves the upper half out of sync.
function door(id, texture, iron = false) {
  define(`mc:${id}_door`, {
    hardness: iron ? 5 : 3, resistance: iron ? 5 : 3,
    tool: iron ? 'pickaxe' : 'axe', soundGroup: iron ? 'metal' : 'wood',
    renderShape: 'door', texture, opaqueCube: false,
    // The resource-pack loader fetches the matching Java 1.19 upper/lower tiles.
    doorTextures: { lower: `${id}_door_bottom`, upper: `${id}_door_top` },
    properties: {
      facing: PROPS.facing, half: PROPS.doorHalf, hinge: PROPS.hinge,
      open: PROPS.open, powered: PROPS.powered,
    },
    defaultValues: { facing: 'north', half: 'lower', hinge: 'left', open: false, powered: false },
  });
}
for (const wood of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']) {
  door(wood, `${wood}_door`);
}
door('iron', 'iron_door', true);

// Trapdoors occupy one block and share their open state with collision geometry.
function trapdoor(id, texture, iron = false) {
  define(`mc:${id}_trapdoor`, {
    hardness: iron ? 5 : 3, resistance: iron ? 5 : 3,
    tool: iron ? 'pickaxe' : 'axe', soundGroup: iron ? 'metal' : 'wood',
    renderShape: 'trapdoor', texture, opaqueCube: false,
    properties: { facing: PROPS.facing, half: PROPS.half, open: PROPS.open, powered: PROPS.powered },
    defaultValues: { facing: 'north', half: 'bottom', open: false, powered: false },
  });
}
for (const wood of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']) {
  trapdoor(wood, `${wood}_trapdoor`);
}
trapdoor('iron', 'iron_trapdoor', true);

// Note block: 25 semitone pitches, tuned by right-click and triggered by redstone.
define('mc:note_block', {
  hardness: 0.8, resistance: 0.8, tool: 'axe', soundGroup: 'wood', texture: 'note_block',
  properties: { note: PROPS.note, powered: PROPS.powered },
  defaultValues: { note: 0, powered: false },
});

// Daylight detector: analogue output follows the world's 24,000-tick day clock.
define('mc:daylight_detector', {
  hardness: 0.2, resistance: 0.2, tool: 'axe', soundGroup: 'wood',
  texture: 'daylight_detector',
  properties: { power: PROPS.power, inverted: PROPS.inverted },
  defaultValues: { power: 0, inverted: false },
});

// Comparator: directional analogue transmission with compare/subtract modes.
define('mc:comparator', {
  hardness: 0, resistance: 0, solid: false, opaqueCube: false, opacity: 0,
  soundGroup: 'stone', renderShape: 'comparator', texture: 'comparator',
  properties: { facing: PROPS.facing, mode: PROPS.comparatorMode, power: PROPS.power, powered: PROPS.powered },
  defaultValues: { facing: 'north', mode: 'compare', power: 0, powered: false },
});

// Redstone lamp: the lit state controls both its appearance and block-light emission.
define('mc:redstone_lamp', {
  hardness: 0.3, resistance: 0.3, tool: 'pickaxe', soundGroup: 'glass',
  lightEmission: 15, texture: 'redstone_lamp',
  properties: { lit: PROPS.lit }, defaultValues: { lit: false },
});

// Redstone power sources from the Java 1.19 block set.
function button(id, texture, wood = false) {
  define(`mc:${id}_button`, {
    hardness: 0.5, resistance: 0.5, solid: false, opaqueCube: false, opacity: 0,
    soundGroup: wood ? 'wood' : 'stone', renderShape: 'button', texture,
    properties: { face: PROPS.face, facing: PROPS.facing, powered: PROPS.powered },
    defaultValues: { face: 'wall', facing: 'north', powered: false },
  });
}
for (const wood of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']) button(wood, `${wood}_button`, true);
button('stone', 'stone_button');
button('polished_blackstone', 'polished_blackstone_button');

define('mc:lever', {
  hardness: 0.5, resistance: 0.5, solid: false, opaqueCube: false, opacity: 0,
  soundGroup: 'stone', renderShape: 'lever', texture: 'lever',
  properties: { face: PROPS.face, facing: PROPS.facing, powered: PROPS.powered },
  defaultValues: { face: 'wall', facing: 'north', powered: false },
});

function pressurePlate(id, texture, wood = false) {
  define(`mc:${id}_pressure_plate`, {
    hardness: 0.5, resistance: 0.5, solid: false, opaqueCube: false, opacity: 0,
    soundGroup: wood ? 'wood' : 'stone', renderShape: 'pressure_plate', texture,
    properties: { powered: PROPS.powered }, defaultValues: { powered: false },
  });
}
for (const wood of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']) pressurePlate(wood, `${wood}_pressure_plate`, true);
pressurePlate('stone', 'stone_pressure_plate');
pressurePlate('polished_blackstone', 'polished_blackstone_pressure_plate');

// Weighted plates report entity-count strength instead of a binary signal.
for (const [id, texture] of [
  ['light_weighted_pressure_plate', 'light_weighted_pressure_plate'],
  ['heavy_weighted_pressure_plate', 'heavy_weighted_pressure_plate'],
]) define(`mc:${id}`, {
  hardness: 0.5, resistance: 0.5, soundGroup: 'stone', solid: false,
  opaqueCube: false, opacity: 0, renderShape: 'weighted_pressure_plate', texture,
  properties: { power: PROPS.power }, defaultValues: { power: 0 },
});

// Redstone dust is a flat, non-colliding wire with vanilla's 0..15 signal level.
define('mc:redstone_torch', {
  hardness: 0, resistance: 0, solid: false, opaqueCube: false, opacity: 0,
  lightEmission: 7, renderShape: 'torch', soundGroup: 'wood', texture: 'redstone_torch',
  properties: { lit: PROPS.lit }, defaultValues: { lit: true },
});

define('mc:repeater', {
  hardness: 0, resistance: 0, solid: false, opaqueCube: false, opacity: 0,
  soundGroup: 'stone', renderShape: 'repeater', texture: 'repeater',
  properties: { facing: PROPS.facing, delay: PROPS.repeaterDelay, powered: PROPS.powered },
  defaultValues: { facing: 'north', delay: 1, powered: false },
});

define('mc:redstone_wire', {
  hardness: 0, resistance: 0, solid: false, opaqueCube: false, opacity: 0,
  replaceable: true, soundGroup: 'stone', renderShape: 'redstone_wire', texture: 'redstone_wire',
  properties: {
    power: PROPS.power, north: PROPS.north, south: PROPS.south,
    east: PROPS.east, west: PROPS.west,
  },
  defaultValues: { power: 0, north: false, south: false, east: false, west: false },
});

define('mc:end_portal_frame', {
  hardness: -1, resistance: 3600000, soundGroup: 'stone',
  texture: 'end_portal_frame',
  properties: { facing: PROPS.facing, eye: PROPS.eye },
  defaultValues: { facing: 'south', eye: false },
  notInCreative: true,
});

define('mc:farmland', {
  hardness: 0.6, resistance: 0.6, tool: 'shovel', soundGroup: 'grass',
  texture: 'farmland',
  properties: { moisture: PROPS.moisture },
  defaultValues: { moisture: 0 },
});

define('mc:composter', {
  hardness: 0.6, resistance: 0.6, tool: 'axe', soundGroup: 'wood',
  texture: 'composter',
  properties: { level: PROPS.composterLevel }, defaultValues: { level: 0 },
});

define('mc:wheat', {
  hardness: 0, resistance: 0, solid: false, opaqueCube: false, opacity: 0,
  replaceable: true, renderShape: 'cross', soundGroup: 'grass',
  properties: { age: PROPS.age7 },
  defaultValues: { age: 0 },
  texture: 'wheat_crop',
});

for (const [id, texture] of [
  ['mc:carrots', 'carrots_crop'], ['mc:potatoes', 'potatoes_crop'],
  ['mc:beetroots', 'beetroots_crop'],
]) define(id, {
  hardness: 0, resistance: 0, solid: false, opaqueCube: false, opacity: 0,
  replaceable: true, renderShape: 'cross', soundGroup: 'grass',
  properties: { age: PROPS.age7 }, defaultValues: { age: 0 }, texture,
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

define('mc:lava', { hardness: 100, resistance: 100, solid: false, opaqueCube: false, opacity: 0, replaceable: true, renderShape: 'translucent', lightEmission: 15, soundGroup: 'none', texture: 'lava' });
define('mc:portal', { hardness: -1, resistance: 0, solid: false, opaqueCube: false, opacity: 0, replaceable: false, renderShape: 'translucent', soundGroup: 'none', texture: 'purple_stained_glass', notInCreative: true });

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
    renderShape: 'slab', opaqueCube: false,
    texture: base.texture ?? base.textures?.side,
    textures: base.textures,
    properties: { type: PROPS.slabType },
    defaultValues: { type: 'bottom' },
  });
}

function stairs(baseId, { tool, harvestLevel = -1, requiresTool = false, sound = 'stone' } = {}) {
  const base = BLOCKS.get(baseId);
  define(`${baseId.replace('_planks', '')}_stairs`, {
    hardness: base.hardness, resistance: base.resistance,
    tool, harvestLevel, requiresTool, soundGroup: sound,
    renderShape: 'stair', opaqueCube: false,
    texture: base.texture ?? base.textures?.side,
    textures: base.textures,
    properties: {
      facing: PROPS.facing, half: PROPS.half,
      shape: PROPS.stairShape,
    },
    defaultValues: { facing: 'north', half: 'bottom', shape: 'straight' },
  });
}

const STONE_LIKE = { tool: 'pickaxe', harvestLevel: 0, requiresTool: true, sound: 'stone' };
const WOOD_LIKE = { tool: 'axe', sound: 'wood' };

for (const base of ['mc:stone', 'mc:cobblestone', 'mc:sandstone',
  'mc:granite', 'mc:polished_granite', 'mc:diorite', 'mc:polished_diorite',
  'mc:andesite', 'mc:polished_andesite', 'mc:stone_bricks']) {
  slab(base, STONE_LIKE);
  stairs(base, STONE_LIKE);
}
for (const wood of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak']) {
  slab(`mc:${wood}_planks`, WOOD_LIKE);
  stairs(`mc:${wood}_planks`, WOOD_LIKE);
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

BLOCK_TAGS.define('#mc:dirt', ['mc:dirt', 'mc:grass_block', 'mc:coarse_dirt', 'mc:podzol',
  'mc:plains_soil', 'mc:forest_floor', 'mc:birch_soil', 'mc:jungle_soil',
  'mc:savanna_soil', 'mc:taiga_soil', 'mc:swamp_mud', 'mc:alpine_gravel']);
BLOCK_TAGS.define('#mc:base_stone_overworld', [
  'mc:stone', 'mc:granite', 'mc:diorite', 'mc:andesite',
]);
BLOCK_TAGS.define('#mc:coal_ores', ['mc:coal_ore']);
BLOCK_TAGS.define('#mc:iron_ores', ['mc:iron_ore']);
BLOCK_TAGS.define('#mc:gold_ores', ['mc:gold_ore']);
BLOCK_TAGS.define('#mc:diamond_ores', ['mc:diamond_ore']);

ITEM_TAGS.define('#mc:planks', [
  'mc:oak_planks', 'mc:birch_planks', 'mc:spruce_planks',
  'mc:jungle_planks', 'mc:acacia_planks', 'mc:dark_oak_planks',
]);
ITEM_TAGS.define('#mc:logs', [
  'mc:oak_log', 'mc:birch_log', 'mc:spruce_log',
  'mc:jungle_log', 'mc:acacia_log', 'mc:dark_oak_log',
]);
ITEM_TAGS.define('#mc:stone_tool_materials', ['mc:cobblestone']);
ITEM_TAGS.define('#mc:wooden_slabs', [
  'mc:oak_slab', 'mc:birch_slab', 'mc:spruce_slab', 'mc:jungle_slab',
  'mc:acacia_slab', 'mc:dark_oak_slab',
]);
ITEM_TAGS.define('#mc:coals', ['mc:coal', 'mc:charcoal']);

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Every block gets an item form unless it is unobtainable. */
const NO_ITEM = new Set(['mc:air', 'mc:water', 'mc:lava', 'mc:portal', 'mc:wheat', 'mc:carrots', 'mc:potatoes', 'mc:beetroots', 'mc:redstone_wire', 'mc:piston_head']);
for (const block of BLOCKS.blocks.values()) {
  if (NO_ITEM.has(block.id)) continue;
  ITEMS.defineBlockItem(block.id, {
    fuelTicks: block.soundGroup === 'wood' ? 300 : 0,
    notInCreative: block.notInCreative === true,
  });
}
// A coal block burns for 16,000 ticks in a 1.12.2 furnace.
ITEMS.get('mc:coal_block').fuelTicks = 16000;

// Materials
const MATERIALS = [
  ['mc:stick', { fuelTicks: 100 }],
  ['mc:coal', { fuelTicks: 1600 }],
  ['mc:charcoal', { fuelTicks: 1600 }],
    ['mc:iron_ingot', {}],
  ['mc:gold_ingot', {}],
  ['mc:gold_nugget', {}],
  ['mc:diamond', {}],
  ['mc:emerald', {}],
  ['mc:lapis_lazuli', {}],
  ['mc:redstone', { block: 'mc:redstone_wire' }],
  ['mc:flint', {}],
  ['mc:blaze_rod', {}],
  ['mc:snowball', {}],
  ['mc:clay_ball', {}],
  ['mc:string', {}],
  ['mc:quartz', {}],
  ['mc:slime_ball', {}],
  ['mc:honeycomb', {}],
  ['mc:glass_bottle', {}],
  ['mc:glowstone_dust', {}],
  ['mc:bone', {}],
  ['mc:bone_meal', {}],
  ['mc:leather', {}],
  ['mc:feather', {}],
  ['mc:rabbit_hide', {}],
  ['mc:wheat_seeds', {}],
  ['mc:wheat', {}],
  ['mc:paper', {}],
  ['mc:book', {}],
  ['mc:compass', { stackSize: 1 }],
  ['mc:map', { stackSize: 1 }],
  ['mc:ender_pearl', { stackSize: 16 }],
  ['mc:enchanted_book', { stackSize: 1, rarity: 'uncommon' }],
  ['mc:gunpowder', {}],
  ['mc:name_tag', { stackSize: 1 }],
  ['mc:music_disc_13', { stackSize: 1 }],
  ['mc:music_disc_cat', { stackSize: 1 }],
  ['mc:music_disc_otherside', { stackSize: 1 }],
  ['mc:golden_apple', { food: { nutrition: 4, saturation: 9.6 } }],
  ['mc:enchanted_golden_apple', { stackSize: 1, food: { nutrition: 4, saturation: 9.6 } }],
  ['mc:bucket', { stackSize: 16 }],
  ['mc:melon_seeds', {}],
  ['mc:pumpkin_seeds', {}],
  ['mc:beetroot_seeds', {}],
  ['mc:beetroot', { food: { nutrition: 1, saturation: 0.6 } }],
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
  ['mc:raw_rabbit', 3, 0.3],
  ['mc:cooked_rabbit', 5, 0.6],
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
ITEMS.define('mc:honey_bottle', { stackSize: 16, food: { nutrition: 6, saturation: 0.1 } });
ITEMS.define('mc:shears', { stackSize: 1, maxDamage: 238, tool: 'shears', attackDamage: 1 });
ITEMS.define('mc:flint_and_steel', { stackSize: 1, maxDamage: 64, tool: 'flint_and_steel' });
ITEMS.define('mc:fishing_rod', { stackSize: 1, maxDamage: 64, tool: 'fishing_rod' });
ITEMS.define('mc:bow', { stackSize: 1, maxDamage: 384, weapon: 'bow' });
ITEMS.define('mc:arrow', { stackSize: 64 });
ITEMS.define('mc:saddle', { stackSize: 1 });
ITEMS.define('mc:iron_horse_armor', { stackSize: 1, horseArmor: 'iron' });
ITEMS.define('mc:golden_horse_armor', { stackSize: 1, horseArmor: 'golden' });
ITEMS.define('mc:diamond_horse_armor', { stackSize: 1, horseArmor: 'diamond' });

// Creative-only spawn eggs for the mobs currently supported by the renderer.
for (const mobType of [
  'cow','pig','sheep','chicken','zombie','husk','zombie_villager','skeleton','stray','wither_skeleton',
  'creeper','enderman','spider','cave_spider','silverfish','endermite','slime','magma_cube','vex','vindicator','evoker','witch','blaze','ghast','guardian','elder_guardian','wither',
  'mooshroom','rabbit','wolf','horse','polar_bear','villager','bee',
]) {
  ITEMS.define(`mc:${mobType}_spawn_egg`, {
    stackSize: 64, spawnEggMob: mobType,
  });
}

// Armour (Java 1.12.2). Slot values follow the inventory's vanilla order.
const ARMOR_SLOTS = [
  ['boots'],
  ['leggings'],
  ['chestplate'],
  ['helmet'],
];
const ARMOR_MATERIALS = [
  ['leather', [65, 75, 80, 55], [1, 2, 3, 1], 0],
  ['chainmail', [195, 225, 240, 165], [1, 4, 5, 2], 0],
  ['iron', [195, 225, 240, 165], [2, 5, 6, 2], 0],
  ['golden', [91, 105, 112, 77], [1, 3, 5, 2], 0],
  ['diamond', [429, 495, 528, 363], [3, 6, 8, 3], 2],
];
for (const [material, durability, points, toughness] of ARMOR_MATERIALS) {
  ARMOR_SLOTS.forEach(([slot], i) => {
    ITEMS.define(`mc:${material}_${slot}`, {
      stackSize: 1, maxDamage: durability[i], armorSlot: slot,
      armorPoints: points[i], armorToughness: toughness,
    });
  });
}

const TOOL_TYPES = [
  ['pickaxe', 'PICKAXE', ATTACK_SPEED.PICKAXE],
  ['axe', 'AXE', null],       // axe speed varies by tier
  ['shovel', 'SHOVEL', ATTACK_SPEED.SHOVEL],
  ['hoe', 'HOE', 1.0],
  ['sword', 'SWORD', ATTACK_SPEED.SWORD],
];

const TIER_KEYS = [
  ['wooden', 'WOOD', 'wood'],
  ['stone', 'STONE', 'stone'],
  ['iron', 'IRON', 'iron'],
  ['golden', 'GOLD', 'gold'],
  ['diamond', 'DIAMOND', 'diamond'],
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
      attackDamage: WEAPON_DAMAGE[damageTable]?.[damageKey] ?? 1,
      attackSpeed: fixedSpeed ?? axeSpeed,
      // Wooden tools burn. Golden ones do not, despite being equally flimsy.
      fuelTicks: prefix === 'wooden' ? 200 : 0,
    });
  }
}

// Exact Java 1.12.2 furnace fuel values for the wood items currently in this catalog.
// Values are ticks at 20 TPS; only registered items are touched.
const VANILLA_FUEL_TICKS_112 = {
  'mc:oak_sapling': 100, 'mc:spruce_sapling': 100, 'mc:birch_sapling': 100,
  'mc:jungle_sapling': 100, 'mc:acacia_sapling': 100, 'mc:dark_oak_sapling': 100,
  'mc:oak_slab': 150, 'mc:spruce_slab': 150, 'mc:birch_slab': 150,
  'mc:jungle_slab': 150, 'mc:acacia_slab': 150, 'mc:dark_oak_slab': 150,
  'mc:oak_stairs': 300, 'mc:spruce_stairs': 300, 'mc:birch_stairs': 300,
  'mc:jungle_stairs': 300, 'mc:acacia_stairs': 300, 'mc:dark_oak_stairs': 300,
  'mc:crafting_table': 300, 'mc:chest': 300, 'mc:trapped_chest': 300,
  'mc:bookshelf': 300, 'mc:jukebox': 300, 'mc:note_block': 300,
  'mc:ladder': 300, 'mc:fence': 300, 'mc:fence_gate': 300,
  'mc:wooden_door': 200, 'mc:wooden_trapdoor': 300,
  'mc:wooden_pickaxe': 200, 'mc:wooden_axe': 200,
  'mc:wooden_shovel': 200, 'mc:wooden_hoe': 200, 'mc:wooden_sword': 200,
};
for (const [id, ticks] of Object.entries(VANILLA_FUEL_TICKS_112)) {
  const item = ITEMS.get(id);
  if (item) item.fuelTicks = ticks;
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
