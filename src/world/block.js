/**
 * Block registry and blockstate system.
 *
 * This file defines the canonical string form of a blockstate:
 *
 *     mc:stone
 *     mc:oak_stairs[facing=north,half=bottom,shape=straight]
 *
 * That string is what gets written into save files, which makes this module part
 * of the compatibility contract in docs/SAVE_FORMAT.md rather than an internal
 * detail. Two rules follow from that and are not negotiable:
 *
 *   1. Properties are serialized in ALPHABETICAL order, always. Without a fixed
 *      order the same state could serialize two different ways depending on
 *      declaration order, palettes would gain duplicate entries, and byte-level
 *      save comparison in the tests would be meaningless.
 *
 *   2. Runtime numeric IDs are assigned at registration and are EPHEMERAL. They
 *      exist because comparing integers in the mesher is much faster than
 *      comparing strings. They must never reach a save file -- registration
 *      order changes the moment a block is added, so a numeric ID means nothing
 *      across versions. The one-way door is enforced by there being no method
 *      here that serializes one.
 */

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export class Property {
  /**
   * @param {string} name
   * @param {Array<string|number|boolean>} values allowed values, in a stable order
   */
  constructor(name, values) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
      throw new Error(`Property name must be snake_case: ${name}`);
    }
    if (values.length < 1) throw new Error(`Property ${name} has no values`);
    this.name = name;
    this.values = Object.freeze([...values]);
    this.stringValues = Object.freeze(values.map(String));
    Object.freeze(this);
  }

  /** Parse a serialized value back to its typed form; undefined if not valid. */
  parse(str) {
    const i = this.stringValues.indexOf(str);
    return i === -1 ? undefined : this.values[i];
  }

  has(value) {
    return this.values.includes(value);
  }
}

export const boolProp = (name) => new Property(name, [false, true]);

export function intProp(name, min, max) {
  const values = [];
  for (let v = min; v <= max; v++) values.push(v);
  return new Property(name, values);
}

export const enumProp = (name, values) => new Property(name, values);

// Properties shared across many blocks. Declared once so that, for example,
// every stair block agrees on what "facing" means and its value ordering.
export const PROPS = {
  facing: enumProp('facing', ['north', 'south', 'west', 'east']),
  face: enumProp('face', ['floor', 'wall', 'ceiling']),
  doorHalf: enumProp('half', ['lower', 'upper']),
  hinge: enumProp('hinge', ['left', 'right']),
  eye: boolProp('eye'),
  spawnerType: enumProp('spawner_type', ['dungeon', 'silverfish']),
  facingAll: enumProp('facing', ['down', 'up', 'north', 'south', 'west', 'east']),
  hopperFacing: enumProp('facing', ['down', 'north', 'south', 'west', 'east']),
  enabled: boolProp('enabled'),
  axis: enumProp('axis', ['x', 'y', 'z']),
  half: enumProp('half', ['bottom', 'top']),
  slabType: enumProp('type', ['bottom', 'top', 'double']),
  stairShape: enumProp('shape', [
    'straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right',
  ]),
  powered: boolProp('powered'),
  extended: boolProp('extended'),
  sticky: boolProp('sticky'),
  inverted: boolProp('inverted'),
  lit: boolProp('lit'),
  open: boolProp('open'),
  snowy: boolProp('snowy'),
  persistent: boolProp('persistent'),
  distance: intProp('distance', 1, 7),
  age7: intProp('age', 0, 7),
  age15: intProp('age', 0, 15),
  note: intProp('note', 0, 24),
  record: enumProp('record', ['none', '13', 'cat', 'otherside']),
  comparatorMode: enumProp('mode', ['compare', 'subtract']),
  level: intProp('level', 0, 15),
  power: intProp('power', 0, 15),
  repeaterDelay: intProp('delay', 1, 4),
  repeaterDelay: intProp('delay', 1, 4),
  layers: intProp('layers', 1, 8),
  honeyLevel: intProp('honey_level', 0, 5),
  moisture: intProp('moisture', 0, 7),
  composterLevel: intProp('level', 0, 8),
  north: boolProp('north'),
  south: boolProp('south'),
  east: boolProp('east'),
  west: boolProp('west'),
  up: boolProp('up'),
  wallConnection: enumProp('wall_connection', ['none', 'low', 'tall']),
  down: boolProp('down'),
};

// ---------------------------------------------------------------------------
// BlockState
// ---------------------------------------------------------------------------

export class BlockState {
  constructor(block, values, runtimeId, stringId) {
    this.block = block;
    this.values = Object.freeze(values);
    this.runtimeId = runtimeId;
    this.stringId = stringId;
    /**
     * @type {Map<string, BlockState[]>}
     * Filled in by the registry after every sibling state exists, since a
     * transition table has to point at states that are not constructed yet.
     * That is also why this object is NOT frozen here -- the registry freezes
     * it once the table is attached.
     */
    this._transitions = null;
  }

  get(propertyName) {
    return this.values[propertyName];
  }

  /**
   * The state identical to this one but with `property` set to `value`.
   * Precomputed, so this is a table lookup rather than a search -- it runs on
   * every neighbor update, and stair/fence shape recalculation hits it hard.
   */
  with(propertyName, value) {
    const row = this._transitions.get(propertyName);
    if (!row) {
      throw new Error(`${this.block.id} has no property "${propertyName}"`);
    }
    const prop = this.block.properties[propertyName];
    const index = prop.values.indexOf(value);
    if (index === -1) {
      throw new Error(
        `Invalid value ${JSON.stringify(value)} for ${this.block.id}.${propertyName}; ` +
        `expected one of ${prop.stringValues.join(', ')}`,
      );
    }
    return row[index];
  }

  /** True when this state came from a save written by a newer version. */
  get isUnknown() {
    return this.block.isUnknown === true;
  }

  toString() {
    return this.stringId;
  }
}

// ---------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------

/** Defaults applied to any field a block definition leaves out. */
const BLOCK_DEFAULTS = {
  hardness: 1.0,
  resistance: 1.0,
  tool: null,           // 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'shears' | null
  harvestLevel: -1,     // -1: no tool required for drops
  requiresTool: false,  // true: drops nothing without the correct tool
  lightEmission: 0,
  opacity: 15,          // how much sky light this block blocks
  solid: true,          // participates in collision
  opaqueCube: true,     // full cube that hides neighbouring faces
  replaceable: false,   // grass, water -- placing into it replaces it
  gravity: false,       // sand, gravel
  flammability: 0,
  soundGroup: 'stone',
  renderShape: 'cube',  // cube | cross | slab | stair | fence | pane | none
  tint: null,           // 'grass' | 'foliage' | 'water' | null
};

export class Block {
  constructor(id, options = {}) {
    if (!/^[a-z0-9_]+:[a-z0-9_/]+$/.test(id)) {
      throw new Error(
        `Block id must be namespaced snake_case like "mc:oak_log", got "${id}"`,
      );
    }
    // Defaults first, then the definition's overrides, then the two fields that
    // must not be overridable by a definition.
    Object.assign(this, BLOCK_DEFAULTS, options);
    this.id = id;
    this.properties = Object.freeze({ ...(options.properties || {}) });

    /** @type {BlockState[]} every combination of property values */
    this.states = [];
    /** @type {BlockState} */
    this.defaultState = null;

    this._defaultValues = options.defaultValues || {};
  }

  /** Unbreakable blocks (bedrock, void air) use a negative hardness, as in vanilla. */
  get isUnbreakable() {
    return this.hardness < 0;
  }
}

// ---------------------------------------------------------------------------
// Serialization of a state's string form
// ---------------------------------------------------------------------------

/**
 * Build the canonical string. Sorting is what makes this canonical -- see the
 * header note. `mc:stone` with no properties omits the brackets entirely rather
 * than writing `mc:stone[]`, keeping the common case compact in the palette.
 */
function buildStringId(blockId, propertyNames, values) {
  if (propertyNames.length === 0) return blockId;
  const sorted = [...propertyNames].sort();
  const parts = sorted.map((name) => `${name}=${String(values[name])}`);
  return `${blockId}[${parts.join(',')}]`;
}

/** Split "mc:oak_stairs[facing=north,half=bottom]" into its parts. */
export function parseStateString(str) {
  const open = str.indexOf('[');
  if (open === -1) return { blockId: str, values: {} };
  if (!str.endsWith(']')) {
    throw new Error(`Malformed blockstate string (unterminated brackets): ${str}`);
  }
  const blockId = str.slice(0, open);
  const body = str.slice(open + 1, -1);
  const values = {};
  if (body.length > 0) {
    for (const pair of body.split(',')) {
      const eq = pair.indexOf('=');
      if (eq === -1) {
        throw new Error(`Malformed blockstate property "${pair}" in: ${str}`);
      }
      values[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  return { blockId, values };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

class BlockRegistry {
  constructor() {
    /** @type {Map<string, Block>} */
    this.blocks = new Map();
    /** @type {BlockState[]} indexed by runtime id */
    this.statesById = [];
    /** @type {Map<string, BlockState>} indexed by canonical string */
    this.statesByString = new Map();
    /** @type {Map<string, BlockState>} unknown states preserved from newer saves */
    this.unknownStates = new Map();
    this.frozen = false;
  }

  register(block) {
    if (this.frozen) {
      throw new Error(
        `Registry is frozen; cannot register ${block.id}. All blocks must be ` +
        `registered during startup, before any world is loaded.`,
      );
    }
    if (this.blocks.has(block.id)) {
      throw new Error(`Duplicate block id: ${block.id}`);
    }

    const propertyNames = Object.keys(block.properties);

    // Enumerate the cartesian product of all property values.
    let combinations = [{}];
    for (const name of propertyNames) {
      const prop = block.properties[name];
      const next = [];
      for (const combo of combinations) {
        for (const value of prop.values) {
          next.push({ ...combo, [name]: value });
        }
      }
      combinations = next;
    }

    for (const values of combinations) {
      const stringId = buildStringId(block.id, propertyNames, values);
      if (this.statesByString.has(stringId)) {
        throw new Error(`Duplicate blockstate string: ${stringId}`);
      }
      const state = new BlockState(block, values, this.statesById.length, stringId);
      this.statesById.push(state);
      this.statesByString.set(stringId, state);
      block.states.push(state);
    }

    // Precompute `with()` transition tables now that every state exists.
    for (const state of block.states) {
      const transitions = new Map();
      for (const name of propertyNames) {
        const prop = block.properties[name];
        const row = prop.values.map((value) => {
          const target = { ...state.values, [name]: value };
          return this.statesByString.get(buildStringId(block.id, propertyNames, target));
        });
        transitions.set(name, Object.freeze(row));
      }
      state._transitions = transitions;
      Object.freeze(state); // sealed only now that the table is attached
    }

    // Resolve the default state from any declared default values.
    const defaults = {};
    for (const name of propertyNames) {
      const prop = block.properties[name];
      defaults[name] = name in block._defaultValues
        ? block._defaultValues[name]
        : prop.values[0];
    }
    block.defaultState = this.statesByString.get(
      buildStringId(block.id, propertyNames, defaults),
    );
    if (!block.defaultState) {
      throw new Error(`Could not resolve default state for ${block.id}`);
    }

    this.blocks.set(block.id, block);
    return block;
  }

  /** Convenience: construct and register in one call. */
  define(id, options) {
    return this.register(new Block(id, options));
  }

  freeze() {
    this.frozen = true;
    return this;
  }

  get(blockId) {
    return this.blocks.get(blockId);
  }

  stateById(runtimeId) {
    return this.statesById[runtimeId];
  }

  /**
   * Resolve a canonical string to a state.
   *
   * This is the load path, so it is where the six guarantees are enforced in
   * practice. Three cases:
   *
   *   - Exact match: the common case.
   *   - Known block, unexpected properties: the block gained or lost a property
   *     in a later version and no migration covered it. Fall back to the default
   *     state, keeping whichever property values still apply, rather than
   *     failing the load. Losing a stair's `shape` is recoverable; losing the
   *     whole chunk is not.
   *   - Unknown block entirely: preserve the string verbatim behind a synthetic
   *     state (guarantee 4). Never drop it.
   */
  stateFromString(str) {
    const exact = this.statesByString.get(str);
    if (exact) return exact;

    const unknownCached = this.unknownStates.get(str);
    if (unknownCached) return unknownCached;

    const { blockId, values } = parseStateString(str);
    const block = this.blocks.get(blockId);

    if (block) {
      let state = block.defaultState;
      for (const [name, raw] of Object.entries(values)) {
        const prop = block.properties[name];
        if (!prop) continue;               // property removed in this version
        const parsed = prop.parse(raw);
        if (parsed === undefined) continue; // value no longer valid
        state = state.with(name, parsed);
      }
      return state;
    }

    return this._makeUnknown(str);
  }

  /**
   * Synthesize a placeholder that round-trips an unrecognized state byte for
   * byte. Registered outside the normal id space so it never collides with a
   * real block, and marked unbreakable so a player cannot destroy data the
   * current build does not understand.
   */
  _makeUnknown(str) {
    const block = new Block('mc:unknown', {
      hardness: -1,
      resistance: 3600000,
      opaqueCube: true,
      soundGroup: 'stone',
    });
    block.isUnknown = true;
    block.originalString = str;

    const state = new BlockState(block, {}, this.statesById.length, str);
    state._transitions = new Map(); // no properties, so no transitions exist
    Object.freeze(state);
    this.statesById.push(state);
    block.states.push(state);
    block.defaultState = state;

    this.unknownStates.set(str, state);
    return state;
  }

  get blockCount() {
    return this.blocks.size;
  }

  get stateCount() {
    return this.statesById.length;
  }
}

export const BLOCKS = new BlockRegistry();

// ---------------------------------------------------------------------------
// Air
//
// The only block defined here. Everything else lives in src/world/blocks/,
// which is a data module; this file is the machinery.
//
// AIR MUST BE REGISTERED FIRST, so it holds runtime id 0. That means a
// zero-filled section array is already a valid empty section -- which matters
// because most of a world is empty, and pre-filling every one of those arrays
// would be pure waste.
//
// chunk.js imports AIR directly, so it lives here rather than in the catalog to
// keep storage independent of which blocks a given phase happens to define.
// ---------------------------------------------------------------------------

export const AIR = BLOCKS.define('mc:air', {
  hardness: 0,
  resistance: 0,
  solid: false,
  opaqueCube: false,
  opacity: 0,
  replaceable: true,
  renderShape: 'none',
  soundGroup: 'none',
});
