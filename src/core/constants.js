/**
 * Every vanilla Minecraft numeric constant, in one place.
 *
 * The reason this file exists rather than letting these numbers live where they
 * are used: "copy Minecraft 1:1" is only a checkable claim if the numbers being
 * claimed are all visible together. Scattered through twenty modules, a wrong
 * gravity value is invisible. Here it is one line next to its documented source.
 *
 * Reference target is Minecraft: Java Edition 1.20.x.
 *
 * CONVENTIONS
 *   - "per tick" means per 1/20 second. The simulation runs at a fixed 20 TPS
 *     precisely so these transfer verbatim rather than needing rescaling.
 *   - Speeds documented by the wiki in blocks/second are stored that way and
 *     converted at the point of use, because that is the form that can actually
 *     be checked against a source.
 *   - Per-BLOCK data (hardness, blast resistance, tool, light) does NOT live
 *     here. It belongs on block definitions, where it stays next to the block.
 *     Duplicating it would create two sources of truth and one of them would rot.
 *
 * Anything approximated rather than sourced is marked APPROX with the reason.
 */

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export const TICKS_PER_SECOND = 20;
export const MS_PER_TICK = 1000 / TICKS_PER_SECOND; // 50
export const TICKS_PER_DAY = 24000;                 // 20 real-time minutes

/** Time-of-day boundaries, in ticks since dawn. */
export const TIME = {
  DAY_START: 0,
  NOON: 6000,
  SUNSET: 12000,
  NIGHT_START: 13000,   // hostile mobs can spawn on the surface from here
  MIDNIGHT: 18000,
  SUNRISE: 23000,
  DAY_END: 24000,
};

/** A redstone tick is two game ticks. Repeater delays are multiples of this. */
export const REDSTONE_TICK = 2;

// ---------------------------------------------------------------------------
// World geometry
// ---------------------------------------------------------------------------

export const CHUNK_SIZE = 16;
export const SECTION_HEIGHT = 16;
export const SECTION_VOLUME = CHUNK_SIZE * CHUNK_SIZE * SECTION_HEIGHT; // 4096

export const MIN_Y = -64;
export const MAX_Y = 320;                       // exclusive build ceiling
export const WORLD_HEIGHT = MAX_Y - MIN_Y;      // 384
export const SECTION_COUNT = WORLD_HEIGHT / SECTION_HEIGHT; // 24

export const SEA_LEVEL = 63;

/** Biomes are stored at 4x4x4 resolution, not per block. */
export const BIOME_CELL = 4;
export const BIOMES_PER_SECTION = 64; // 4*4*4

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

export const MAX_LIGHT = 15;
export const LIGHT_LEVELS = 16;

/** Mobs spawn at or below this block light level (1.18+ surface rule). */
export const HOSTILE_SPAWN_MAX_LIGHT = 0;

// ---------------------------------------------------------------------------
// Physics
//
// These are the numbers that make movement *feel* like Minecraft. They are
// unusual-looking on purpose -- 0.42 jump velocity and 0.98 drag are not tuned
// values, they are the actual constants, and approximating them produces
// movement that is subtly but immediately wrong to anyone who has played.
// ---------------------------------------------------------------------------

export const PHYSICS = {
  GRAVITY: 0.08,              // blocks/tick^2, applied to living entities
  DRAG_VERTICAL: 0.98,        // multiplied into vertical velocity each tick
  DRAG_HORIZONTAL_AIR: 0.91,
  TERMINAL_VELOCITY: -3.92,   // blocks/tick

  JUMP_VELOCITY: 0.42,
  JUMP_BOOST_PER_LEVEL: 0.1,
  SPRINT_JUMP_BOOST: 0.2,     // forward impulse added to a sprinting jump

  ITEM_GRAVITY: 0.04,
  ITEM_DRAG: 0.98,
  ARROW_GRAVITY: 0.05,
  ARROW_DRAG: 0.99,

  STEP_HEIGHT: 0.6,           // auto-step for players and most mobs
  DEFAULT_SLIPPERINESS: 0.6,

  /** Blocks tall the player is; the crouched value changes the collision box. */
  PLAYER_HEIGHT: 1.8,
  PLAYER_CROUCH_HEIGHT: 1.5,
  PLAYER_WIDTH: 0.6,
  PLAYER_EYE_HEIGHT: 1.62,
  PLAYER_CROUCH_EYE_HEIGHT: 1.27,

  REACH_SURVIVAL: 4.5,
  REACH_CREATIVE: 5.0,
};

/** Per-block friction. Higher is more slippery. */
export const SLIPPERINESS = {
  DEFAULT: 0.6,
  SLIME_BLOCK: 0.8,
  ICE: 0.98,
  PACKED_ICE: 0.98,
  FROSTED_ICE: 0.98,
  BLUE_ICE: 0.989,
};

/** Movement speeds in blocks/second. */
export const SPEED = {
  WALK: 4.317,
  SPRINT: 5.612,
  SNEAK: 1.295,
  CRAWL: 1.3,          // APPROX -- wiki gives this only imprecisely
  SWIM: 2.2,           // APPROX -- varies with Depth Strider and submersion
  FLY: 10.89,          // creative
  FLY_SPRINT: 21.78,
};

// ---------------------------------------------------------------------------
// Tool tiers
//
// Speed multiplier feeds the mining formula below; durability is total uses.
// Gold is the deliberate oddity: fastest tier in the game and the most fragile.
// ---------------------------------------------------------------------------

export const TOOL_TIER = {
  WOOD:      { level: 0, speed: 2,  durability: 59,   enchantability: 15, damageBonus: 0 },
  STONE:     { level: 1, speed: 4,  durability: 131,  enchantability: 5,  damageBonus: 1 },
  IRON:      { level: 2, speed: 6,  durability: 250,  enchantability: 14, damageBonus: 2 },
  DIAMOND:   { level: 3, speed: 8,  durability: 1561, enchantability: 10, damageBonus: 3 },
  NETHERITE: { level: 4, speed: 9,  durability: 2031, enchantability: 15, damageBonus: 4 },
  GOLD:      { level: 0, speed: 12, durability: 32,   enchantability: 22, damageBonus: 0 },
};

/** Harvest level required to get drops, by material class. */
export const HARVEST_LEVEL = {
  NONE: -1, WOOD: 0, STONE: 1, IRON: 2, DIAMOND: 3, NETHERITE: 4,
};

/**
 * Mining time in ticks.
 *
 *   ticks = ceil(hardness * (canHarvest ? 1.5 : 5) * 20 / toolSpeed)
 *
 * The 1.5-vs-5 split is why mining stone with a pickaxe you cannot harvest with
 * still works, just badly. Multipliers below stack onto toolSpeed.
 *
 * The CEILING matters: progress accumulates once per tick and the block breaks
 * on the tick it crosses 1.0, so durations are always whole ticks. Without it
 * every mining time in the game runs a few percent fast.
 */
export const MINING = {
  CORRECT_TOOL_DIVISOR: 1.5,
  WRONG_TOOL_DIVISOR: 5,
  UNDERWATER_PENALTY: 5,     // unless wearing Aqua Affinity
  AIRBORNE_PENALTY: 5,
  EFFICIENCY_BASE: 1,        // speed += level^2 + 1 when level > 0
  HASTE_PER_LEVEL: 0.2,      // +20% per level, multiplicative
  MINING_FATIGUE_BASE: 0.3,  // speed *= 0.3^level
  BREAK_STAGES: 10,          // crack overlay texture count
  INSTANT_BREAK_THRESHOLD: 0.05, // ticks; below this the block pops immediately
};

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

/** Base attack damage in half-hearts. Sword = 3 + tier bonus + 1. */
export const WEAPON_DAMAGE = {
  SWORD:   { wood: 4, stone: 5, iron: 6, diamond: 7, netherite: 8, gold: 4 },
  AXE:     { wood: 7, stone: 9, iron: 9, diamond: 9, netherite: 10, gold: 7 },
  PICKAXE: { wood: 2, stone: 3, iron: 4, diamond: 5, netherite: 6, gold: 2 },
  SHOVEL:  { wood: 2.5, stone: 3.5, iron: 4.5, diamond: 5.5, netherite: 6.5, gold: 2.5 },
  FIST: 1,
};

/** Attacks per second. Full damage requires waiting out the cooldown. */
export const ATTACK_SPEED = {
  SWORD: 1.6,
  AXE_WOOD: 0.8, AXE_STONE: 0.8, AXE_IRON: 0.9,
  AXE_DIAMOND: 1.0, AXE_NETHERITE: 1.0, AXE_GOLD: 1.0,
  PICKAXE: 1.2,
  SHOVEL: 1.0,
  FIST: 4.0,
};

export const COMBAT = {
  INVULNERABILITY_TICKS: 10,
  CRIT_MULTIPLIER: 1.5,
  /** Below this fraction of cooldown, the attack is weak and cannot crit/sweep. */
  COOLDOWN_FULL_DAMAGE: 0.9,
  COOLDOWN_SWEEP_THRESHOLD: 0.848,
  KNOCKBACK_BASE: 0.4,
  KNOCKBACK_PER_LEVEL: 0.5,
  SHIELD_DISABLE_TICKS: 100, // when hit by an axe
  BOW_MAX_DRAW_TICKS: 20,
  BOW_MAX_VELOCITY: 3.0,     // blocks/tick at full draw
};

/** Armor points per piece. Totals: leather 7, chain 12, iron 15, gold 11, diamond/netherite 20. */
export const ARMOR = {
  LEATHER:   { helmet: 1, chestplate: 3, leggings: 2, boots: 1, toughness: 0, knockbackRes: 0 },
  CHAINMAIL: { helmet: 2, chestplate: 5, leggings: 4, boots: 1, toughness: 0, knockbackRes: 0 },
  IRON:      { helmet: 2, chestplate: 6, leggings: 5, boots: 2, toughness: 0, knockbackRes: 0 },
  GOLD:      { helmet: 2, chestplate: 5, leggings: 3, boots: 1, toughness: 0, knockbackRes: 0 },
  DIAMOND:   { helmet: 3, chestplate: 8, leggings: 6, boots: 3, toughness: 2, knockbackRes: 0 },
  NETHERITE: { helmet: 3, chestplate: 8, leggings: 6, boots: 3, toughness: 3, knockbackRes: 0.1 },
};

/**
 * Vanilla damage reduction. Not a simple percentage -- toughness makes armor
 * hold up against big hits, which is the whole reason diamond outclasses iron
 * by more than its raw point total suggests.
 *
 *   reduced = damage * (1 - min(20, max(armor/5, armor - damage/(2 + toughness/4))) / 25)
 */
export function applyArmor(damage, armorPoints, toughness) {
  const effective = Math.min(
    20,
    Math.max(armorPoints / 5, armorPoints - damage / (2 + toughness / 4)),
  );
  return damage * (1 - effective / 25);
}

// ---------------------------------------------------------------------------
// Player vitals
// ---------------------------------------------------------------------------

export const MAX_HEALTH = 20;       // 10 hearts
export const MAX_FOOD = 20;         // 10 drumsticks
export const MAX_SATURATION = 20;
export const MAX_AIR_TICKS = 300;   // 15 seconds underwater

/**
 * Exhaustion accumulates from activity. Every 4.0 drains 1 saturation, or 1
 * hunger once saturation is gone. This indirection is why sprinting everywhere
 * empties the food bar so much faster than walking.
 */
export const EXHAUSTION = {
  THRESHOLD: 4.0,
  SPRINT_PER_METER: 0.1,
  WALK_PER_METER: 0.0,     // walking alone costs nothing
  SWIM_PER_METER: 0.01,
  JUMP: 0.05,
  SPRINT_JUMP: 0.2,
  ATTACK: 0.1,
  DAMAGE_TAKEN: 0.1,
  MINE_BLOCK: 0.005,
  REGENERATION: 6.0,       // healing is expensive; this is the food->health price
};

export const REGEN = {
  /** Slow regeneration: food at or above this. */
  MIN_FOOD: 18,
  SLOW_INTERVAL_TICKS: 80,
  /** Fast regeneration: food full AND saturation remaining. */
  FAST_MIN_FOOD: 20,
  FAST_INTERVAL_TICKS: 10,
  /** Below this food level the player starves. */
  STARVE_FOOD: 0,
  STARVE_INTERVAL_TICKS: 80,
  /** Sprinting requires at least this much food. */
  SPRINT_MIN_FOOD: 6,
};

export const DAMAGE = {
  /** Fall damage in half-hearts: max(0, floor(distance) - 3). */
  FALL_SAFE_DISTANCE: 3,
  DROWNING_PER_INTERVAL: 2,
  DROWNING_INTERVAL_TICKS: 20,
  LAVA_PER_INTERVAL: 4,
  FIRE_PER_INTERVAL: 1,
  CACTUS: 1,
  VOID_PER_INTERVAL: 4,
  SUFFOCATION: 1,
  /** Y below which void damage starts, relative to MIN_Y. */
  VOID_OFFSET: -64,
};

export function fallDamage(distance) {
  return Math.max(0, Math.floor(distance) - DAMAGE.FALL_SAFE_DISTANCE);
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

/** XP required to advance from `level` to `level + 1`. */
export function xpToNextLevel(level) {
  if (level <= 15) return 2 * level + 7;
  if (level <= 30) return 5 * level - 38;
  return 9 * level - 158;
}

/** Total XP accumulated at the start of `level`. */
export function xpForLevel(level) {
  if (level <= 16) return level * level + 6 * level;
  if (level <= 31) return 2.5 * level * level - 40.5 * level + 360;
  return 4.5 * level * level - 162.5 * level + 2220;
}

export const XP = {
  MAX_ENCHANT_LEVEL: 30,
  ANVIL_MAX_COST: 39,       // "Too Expensive!" above this
  ORB_MERGE_RADIUS: 0.5,
  ORB_ATTRACT_RADIUS: 8,
};

// ---------------------------------------------------------------------------
// Items and entities
// ---------------------------------------------------------------------------

export const ITEM = {
  DESPAWN_TICKS: 6000,       // 5 minutes
  PICKUP_DELAY_TICKS: 10,
  THROWN_PICKUP_DELAY_TICKS: 40,
  MERGE_RADIUS: 0.5,
  DEFAULT_STACK_SIZE: 64,
  SMALL_STACK_SIZE: 16,      // eggs, snowballs, ender pearls, buckets of fish
  UNSTACKABLE: 1,
};

export const INVENTORY = {
  HOTBAR_SIZE: 9,
  MAIN_SIZE: 27,
  TOTAL_SIZE: 36,
  ARMOR_SLOTS: 4,
  OFFHAND_SLOTS: 1,
  CRAFTING_2X2: 4,
  CRAFTING_3X3: 9,
  CHEST_SIZE: 27,
  DOUBLE_CHEST_SIZE: 54,
  HOPPER_SIZE: 5,
  DISPENSER_SIZE: 9,
};

/** Simultaneous mobs per category, scaled by loaded chunks. */
export const MOB_CAP = {
  HOSTILE: 70,
  PASSIVE: 10,
  AMBIENT: 15,
  WATER_CREATURE: 5,
  WATER_AMBIENT: 20,
  UNDERGROUND_WATER: 5,
};

export const DESPAWN = {
  /** Beyond this distance from any player, mobs vanish immediately. */
  IMMEDIATE_DISTANCE: 128,
  /** Between this and IMMEDIATE_DISTANCE, mobs vanish randomly over time. */
  RANDOM_DISTANCE: 32,
  RANDOM_CHANCE_TICKS: 800,
};

export const EXPLOSION = {
  CREEPER_POWER: 3,
  CREEPER_CHARGED_POWER: 6,
  CREEPER_FUSE_TICKS: 30,     // 1.5 seconds
  TNT_POWER: 4,
  TNT_FUSE_TICKS: 80,         // 4 seconds
  GHAST_FIREBALL_POWER: 1,
  WITHER_SKULL_POWER: 1,
  BED_IN_NETHER_POWER: 5,
  /** Explosion rays cast per axis face for blast resistance sampling. */
  RAY_RESOLUTION: 16,
};

// ---------------------------------------------------------------------------
// Fluids
// ---------------------------------------------------------------------------

export const FLUID = {
  MAX_LEVEL: 8,               // 0 = source, higher = thinner
  WATER_SPREAD_OVERWORLD: 7,  // horizontal blocks a source travels
  LAVA_SPREAD_OVERWORLD: 3,
  LAVA_SPREAD_NETHER: 7,
  WATER_TICK_RATE: 5,
  LAVA_TICK_RATE_OVERWORLD: 30,
  LAVA_TICK_RATE_NETHER: 10,
  /** Two adjacent sources create a third -- the infinite water rule. */
  INFINITE_SOURCE_NEIGHBORS: 2,
};

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

export const DIMENSION = {
  OVERWORLD: 'mc:overworld',
  NETHER: 'mc:the_nether',
  END: 'mc:the_end',
};

export const NETHER = {
  /** One block in the Nether is eight in the Overworld. */
  COORDINATE_RATIO: 8,
  PORTAL_SEARCH_RADIUS: 128,
  PORTAL_MIN_WIDTH: 2,
  PORTAL_MAX_WIDTH: 21,
  PORTAL_MIN_HEIGHT: 3,
  PORTAL_MAX_HEIGHT: 21,
  CEILING_Y: 128,
};

// ---------------------------------------------------------------------------
// Rendering / performance
//
// Tuned for a 4 GB VRAM budget. See PLAN.md. The mesh budget is a hard ceiling
// with farthest-first eviction rather than an unbounded cache, so overrunning it
// makes distant chunks unload instead of taking the GPU driver down.
// ---------------------------------------------------------------------------

export const RENDER = {
  DEFAULT_DISTANCE: 10,
  MIN_DISTANCE: 2,
  MAX_DISTANCE: 24,
  DEFAULT_FOV: 70,
  SPRINT_FOV_BONUS: 10,
  CLOUD_HEIGHT: 192,
  BYTES_PER_VERTEX: 8,
  MESH_BUDGET_BYTES: 512 * 1024 * 1024,
  ATLAS_TILE_SIZE: 16,
  ATLAS_PADDING: 1,          // gutter prevents mipmap bleed between tiles
  MAX_MIP_LEVEL: 4,
};

export const WORKER = {
  /** Leave headroom for the render thread and the browser itself. */
  poolSize: () => Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2)),
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const SAVE = {
  AUTOSAVE_INTERVAL_TICKS: 600,  // 30 seconds
  MAGIC: 'MCWORLD\0',
  FILE_EXTENSION: '.mcw',
  /**
   * Container structure version -- the shape of the header and entry index.
   * Distinct from DATA_VERSION (in save/migrate.js), which versions the game
   * CONTENT. This is expected to stay at 1 essentially forever; DATA_VERSION is
   * the one that moves with every content change.
   */
  FORMAT_VERSION: 1,
};
