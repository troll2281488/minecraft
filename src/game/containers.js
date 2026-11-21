/**
 * Chest, furnace and hopper block-entity logic (Java Edition).
 *
 * Pure game state with no DOM or GL dependency, so it is testable under node
 * and reusable from any UI. The furnace numbers come from the 1.12.2 reference:
 * one smelt takes 200 ticks (10 s), and each fuel item gives its fuelTicks worth
 * of burning. When the furnace cannot smelt, progress falls back instead of
 * snapping to zero, as vanilla does.
 */

import { ItemStack } from '../world/item.js';

export const CHEST_SLOTS = 27;
export const SMELT_TICKS = 200;

/** Java Edition furnace XP per smelted output item for supported recipes. */
export const SMELTING_XP = new Map([
  ['mc:oak_log', 0.1], ['mc:birch_log', 0.1], ['mc:spruce_log', 0.1],
  ['mc:jungle_log', 0.1], ['mc:acacia_log', 0.1], ['mc:dark_oak_log', 0.1],
  ['mc:iron_ore', 0.7], ['mc:gold_ore', 1.0], ['mc:stone', 0.1],
  ['mc:sand', 0.1], ['mc:cobblestone', 0.1],
  ['mc:raw_beef', 0.35], ['mc:raw_porkchop', 0.35],
  ['mc:raw_chicken', 0.35], ['mc:raw_mutton', 0.35],
  ['mc:potato', 0.35], ['mc:raw_cod', 0.35],
  ['mc:raw_salmon', 0.35], ['mc:raw_rabbit', 0.35],
]);
/** Progress lost per tick while the furnace is not smelting (vanilla behaviour). */
const COOL_PER_TICK = 2;

/** Smelting table: input item id -> { result, count }. From the 1.12.2 smelting list. */
export const SMELTING = new Map([
  ['mc:oak_log',       { result: 'mc:charcoal', count: 1 }],
  ['mc:birch_log',     { result: 'mc:charcoal', count: 1 }],
  ['mc:spruce_log',    { result: 'mc:charcoal', count: 1 }],
  ['mc:jungle_log',    { result: 'mc:charcoal', count: 1 }],
  ['mc:acacia_log',    { result: 'mc:charcoal', count: 1 }],
  ['mc:dark_oak_log',  { result: 'mc:charcoal', count: 1 }],
  ['mc:iron_ore',     { result: 'mc:iron_ingot', count: 1 }],
  ['mc:gold_ore',     { result: 'mc:gold_ingot', count: 1 }],
  ['mc:sand',         { result: 'mc:glass', count: 1 }],
  ['mc:cobblestone',  { result: 'mc:stone', count: 1 }],
  ['mc:stone',        { result: 'mc:smooth_stone', count: 1 }],
  ['mc:raw_beef',     { result: 'mc:cooked_beef', count: 1 }],
  ['mc:raw_porkchop', { result: 'mc:cooked_porkchop', count: 1 }],
  ['mc:raw_chicken',  { result: 'mc:cooked_chicken', count: 1 }],
  ['mc:raw_mutton',   { result: 'mc:cooked_mutton', count: 1 }],
  ['mc:potato',       { result: 'mc:baked_potato', count: 1 }],
  ['mc:raw_cod',      { result: 'mc:cooked_cod', count: 1 }],
  ['mc:raw_salmon',   { result: 'mc:cooked_salmon', count: 1 }],
  ['mc:raw_rabbit',   { result: 'mc:cooked_rabbit', count: 1 }],
]);



/** Smoker accepts food inputs only; blast furnace accepts metal ores only. */
export const SMOKING = new Map([
  ['mc:raw_beef', { result: 'mc:cooked_beef', count: 1 }],
  ['mc:raw_porkchop', { result: 'mc:cooked_porkchop', count: 1 }],
  ['mc:raw_chicken', { result: 'mc:cooked_chicken', count: 1 }],
  ['mc:raw_mutton', { result: 'mc:cooked_mutton', count: 1 }],
  ['mc:raw_cod', { result: 'mc:cooked_cod', count: 1 }],
  ['mc:raw_salmon', { result: 'mc:cooked_salmon', count: 1 }],
  ['mc:raw_rabbit', { result: 'mc:cooked_rabbit', count: 1 }],
  ['mc:potato', { result: 'mc:baked_potato', count: 1 }],
]);
export const BLASTING = new Map([
  ['mc:iron_ore', { result: 'mc:iron_ingot', count: 1 }],
  ['mc:gold_ore', { result: 'mc:gold_ingot', count: 1 }],
]);

/** Remove one item from a stack, returning the stack or the empty stack. */
function takeOne(stack) {
  stack.count -= 1;
  return stack.count > 0 ? stack : ItemStack.EMPTY.clone();
}

export class Chest {
  constructor() {
    this.slots = Array.from({ length: CHEST_SLOTS }, () => ItemStack.EMPTY.clone());
  }

  /**
   * Insert a stack, filling matching partial stacks first, then empty slots.
   * Returns the leftover count that did not fit (0 when everything was stored).
   */
  insert(stack) {
    let remaining = stack.count;
    for (const slot of this.slots) {
      if (remaining <= 0) break;
      if (!slot.isEmpty && slot.canStackWith(stack) && slot.count < slot.maxStackSize) {
        const moved = Math.min(remaining, slot.maxStackSize - slot.count);
        slot.count += moved;
        remaining -= moved;
      }
    }
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (this.slots[i].isEmpty) {
        const moved = Math.min(remaining, stack.maxStackSize);
        this.slots[i] = ItemStack.of(stack.item.id, moved, stack.damage, stack.data);
        remaining -= moved;
      }
    }
    return remaining;
  }
}

export const HOPPER_SLOTS = 5;
export const DROPPER_SLOTS = 9;

/**
 * Whether an item entity intersects the hopper's top intake volume.
 * The hopper mouth occupies the block footprint above the hopper body.
 */
export function isItemInHopperIntake(drop, x, y, z) {
  if (!drop || ![drop.x, drop.y, drop.z, x, y, z].every(Number.isFinite)) return false;
  return drop.x >= x + 0.05 && drop.x <= x + 0.95 &&
    drop.z >= z + 0.05 && drop.z <= z + 0.95 &&
    drop.y >= y + 0.65 && drop.y <= y + 1.35;
}

/** Insert as much of a dropped stack as possible; return the remaining count. */
export function insertDroppedStack(hopper, stack) {
  if (!(hopper instanceof Hopper) || !stack || stack.isEmpty || !stack.item) {
    return { inserted: 0, remaining: stack?.count || 0 };
  }
  const before = stack.count;
  const remaining = hopper.insert(stack);
  return { inserted: before - remaining, remaining };
}



/** Five-slot hopper inventory with the same stack rules as a chest. */
export class Hopper extends Chest {
  constructor() {
    super();
    this.slots = Array.from({ length: HOPPER_SLOTS }, () => ItemStack.EMPTY.clone());
  }
}

/** Nine-slot dropper inventory; activation ejects or inserts one item. */
export class Dropper extends Chest {
  constructor() {
    super();
    this.slots = Array.from({ length: DROPPER_SLOTS }, () => ItemStack.EMPTY.clone());
  }
}

/** Move exactly one item between two slot arrays; false when blocked or empty. */
export function moveOneItem(sourceSlots, destinationSlots) {
  if (!Array.isArray(sourceSlots) || !Array.isArray(destinationSlots)) return false;
  for (let i = 0; i < sourceSlots.length; i++) {
    const source = sourceSlots[i];
    if (!source || source.isEmpty) continue;
    const one = ItemStack.of(source.item.id, 1, source.damage, source.data);
    let moved = false;
    for (const target of destinationSlots) {
      if (!target || target.isEmpty || !target.canStackWith(one) || target.count >= target.maxStackSize) continue;
      target.count += 1;
      moved = true;
      break;
    }
    if (!moved) {
      const empty = destinationSlots.findIndex((slot) => !slot || slot.isEmpty);
      if (empty < 0) return false;
      destinationSlots[empty] = one;
      moved = true;
    }
    if (moved) {
      source.count -= 1;
      if (source.count <= 0) sourceSlots[i] = ItemStack.EMPTY.clone();
      return true;
    }
  }
  return false;
}

/**
 * JSON-safe block-entity state for local world saves.
 * Slot stacks use the same stable namespaced item IDs as player inventories.
 */
export function serializeContainer(type, data) {
  if (type === 'chest' && data instanceof Chest) {
    return { type, slots: data.slots.map((stack) => stack.toJSON()) };
  }
  if (type === 'hopper' && data instanceof Hopper) {
    return { type, slots: data.slots.map((stack) => stack.toJSON()) };
  }
  if (type === 'dropper' && data instanceof Dropper) {
    return { type, slots: data.slots.map((stack) => stack.toJSON()) };
  }
  if (['furnace', 'smoker', 'blast_furnace'].includes(type) && data instanceof Furnace) {
    return {
      type,
      kind: data.kind,
      input: data.input.toJSON(),
      fuel: data.fuel.toJSON(),
      output: data.output.toJSON(),
      burnLeft: data.burnLeft,
      burnTotal: data.burnTotal,
      cookProgress: data.cookProgress,
      xpStored: data.xpStored,
      xpOutputCount: data.xpOutputCount,
    };
  }
  return null;
}

/** Restore a validated record; malformed or unknown records are safely ignored. */
export function deserializeContainer(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.type === 'chest') {
    if (!Array.isArray(record.slots) || record.slots.length !== CHEST_SLOTS) return null;
    const chest = new Chest();
    chest.slots = record.slots.map((stack) => ItemStack.fromJSON(stack));
    return { type: 'chest', data: chest };
  }
  if (record.type === 'hopper') {
    if (!Array.isArray(record.slots) || record.slots.length !== HOPPER_SLOTS) return null;
    const hopper = new Hopper();
    hopper.slots = record.slots.map((stack) => ItemStack.fromJSON(stack));
    return { type: 'hopper', data: hopper };
  }
  if (record.type === 'dropper') {
    if (!Array.isArray(record.slots) || record.slots.length !== DROPPER_SLOTS) return null;
    const dropper = new Dropper();
    dropper.slots = record.slots.map((stack) => ItemStack.fromJSON(stack));
    return { type: 'dropper', data: dropper };
  }
  if (['furnace', 'smoker', 'blast_furnace'].includes(record.type)) {
    const furnace = new Furnace(record.type);
    furnace.input = ItemStack.fromJSON(record.input);
    furnace.fuel = ItemStack.fromJSON(record.fuel);
    furnace.output = ItemStack.fromJSON(record.output);
    const finiteInt = (value, max) =>
      Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
    furnace.burnTotal = finiteInt(record.burnTotal, 1_000_000);
    furnace.burnLeft = Math.min(finiteInt(record.burnLeft, 1_000_000), furnace.burnTotal);
    furnace.cookProgress = finiteInt(record.cookProgress, SMELT_TICKS - 1);
    furnace.xpStored = Number.isFinite(record.xpStored) ? Math.max(0, Math.min(1_000_000, record.xpStored)) : 0;
    furnace.xpOutputCount = finiteInt(record.xpOutputCount, 1_000_000);
    return { type: 'furnace', data: furnace };
  }
  return null;
}

/**
 * Remove all stored items when a container block is broken. The returned stacks
 * are independent copies; the block entity is emptied so stale contents cannot
 * reappear if another container is placed at the same coordinates.
 */
export function drainContainer(type, data) {
  if (type === 'chest' && data instanceof Chest) {
    const drops = data.slots.filter((stack) => !stack.isEmpty).map((stack) => stack.clone());
    data.slots = Array.from({ length: CHEST_SLOTS }, () => ItemStack.EMPTY.clone());
    return drops;
  }
  if (type === 'hopper' && data instanceof Hopper) {
    const drops = data.slots.filter((stack) => !stack.isEmpty).map((stack) => stack.clone());
    data.slots = Array.from({ length: HOPPER_SLOTS }, () => ItemStack.EMPTY.clone());
    return drops;
  }
  if (type === 'dropper' && data instanceof Dropper) {
    const drops = data.slots.filter((stack) => !stack.isEmpty).map((stack) => stack.clone());
    data.slots = Array.from({ length: DROPPER_SLOTS }, () => ItemStack.EMPTY.clone());
    return drops;
  }
  if (['furnace', 'smoker', 'blast_furnace'].includes(type) && data instanceof Furnace) {
    const drops = [data.input, data.fuel, data.output]
      .filter((stack) => !stack.isEmpty)
      .map((stack) => stack.clone());
    data.input = ItemStack.EMPTY.clone();
    data.fuel = ItemStack.EMPTY.clone();
    data.output = ItemStack.EMPTY.clone();
    data.burnLeft = 0;
    data.burnTotal = 0;
    data.cookProgress = 0;
    data.xpStored = 0;
    data.xpOutputCount = 0;
    return drops;
  }
  return [];
}

export class Furnace {
  constructor(kind = 'furnace') {
    this.kind = ['furnace', 'smoker', 'blast_furnace'].includes(kind) ? kind : 'furnace';
    this.input = ItemStack.EMPTY.clone();
    this.fuel = ItemStack.EMPTY.clone();
    this.output = ItemStack.EMPTY.clone();
    /** Ticks of fuel left in the current burn. */
    this.burnLeft = 0;
    /** Length of the current burn, so a UI can draw the flame's fraction. */
    this.burnTotal = 0;
    /** Ticks of smelting completed toward SMELT_TICKS. */
    this.cookProgress = 0;
    /** Fractional XP banked until output is manually collected. */
    this.xpStored = 0;
    this.xpOutputCount = 0;
  }

  /** Claim the proportional XP for output items removed by a player. */
  claimExperienceForOutput(count) {
    const removed = Math.max(0, Math.min(this.xpOutputCount, Math.floor(Number(count) || 0)));
    if (!removed || this.xpOutputCount <= 0) return 0;
    const share = this.xpStored * removed / this.xpOutputCount;
    this.xpStored = Math.max(0, this.xpStored - share);
    this.xpOutputCount -= removed;
    return share;
  }

  /** Recipe map and accepted input for this processing station. */
  get recipes() {
    return this.kind === 'smoker' ? SMOKING
      : this.kind === 'blast_furnace' ? BLASTING : SMELTING;
  }

  acceptsInput(itemId) { return this.recipes.has(itemId); }

  get smeltTicks() { return this.kind === 'furnace' ? SMELT_TICKS : SMELT_TICKS / 2; }

  /** The processing result for the current input, or null. */
  get recipe() {
    if (this.input.isEmpty) return null;
    return this.recipes.get(this.input.item.id) ?? null;
  }

  /** Whether the current input can be placed into the output slot right now. */
  get canSmelt() {
    const recipe = this.recipe;
    if (!recipe) return false;
    if (this.output.isEmpty) return true;
    return this.output.item.id === recipe.result &&
      this.output.count + recipe.count <= this.output.maxStackSize;
  }

  /** Advance the furnace by one tick. */
  tick() {
    const wasBurning = this.burnLeft > 0;
    if (this.burnLeft > 0) this.burnLeft -= 1;

    if (this.burnLeft === 0 && this.canSmelt && !this.fuel.isEmpty &&
        this.fuel.item.fuelTicks > 0) {
      this.burnTotal = this.fuel.item.fuelTicks;
      this.burnLeft = this.burnTotal;
      const consumedFuel = this.fuel.item;
      this.fuel = takeOne(this.fuel);
      if (this.fuel.isEmpty && consumedFuel.containerItem) {
        this.fuel = ItemStack.of(consumedFuel.containerItem, 1);
      }
    }

    if (this.burnLeft > 0 && this.canSmelt) {
      this.cookProgress += 1;
      if (this.cookProgress >= this.smeltTicks) {
        this._finishSmelt();
        this.cookProgress = 0;
      }
    } else {
      this.cookProgress = Math.max(0, this.cookProgress - COOL_PER_TICK);
    }

    return wasBurning !== (this.burnLeft > 0);
  }

  _finishSmelt() {
    const recipe = this.recipe;
    const xpPerItem = SMELTING_XP.get(this.input.item.id) ?? 0;
    this.xpStored += xpPerItem * recipe.count;
    this.xpOutputCount += recipe.count;
    this.input = takeOne(this.input);
    if (this.output.isEmpty) {
      this.output = ItemStack.of(recipe.result, recipe.count);
    } else {
      this.output.count += recipe.count;
    }
  }
}
