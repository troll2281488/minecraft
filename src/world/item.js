/**
 * Item registry and item stacks.
 *
 * Like blocks, items are identified in save files by namespaced string ID
 * (`mc:diamond_pickaxe`), never by a numeric index -- player inventories are
 * saved data and fall under the same compatibility contract. See
 * docs/SAVE_FORMAT.md.
 *
 * Item BEHAVIOR (tools, food, armor, buckets) arrives in Phase 1 as subclasses.
 * What is here is the registry, the stack, and the serialization those depend on.
 */

import { ITEM } from '../core/constants.js';
import { BLOCKS } from './block.js';

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

const ITEM_DEFAULTS = {
  stackSize: ITEM.DEFAULT_STACK_SIZE,
  maxDamage: 0,          // 0 means the item has no durability
  block: null,           // block id this item places, if any
  tool: null,            // 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'shears'
  tier: null,            // key into TOOL_TIER
  attackDamage: 0,
  attackSpeed: 4.0,
  food: null,            // { nutrition, saturation, canAlwaysEat }
  armorSlot: null,       // 'helmet' | 'chestplate' | 'leggings' | 'boots'
  armorPoints: 0,
  armorToughness: 0,
  fuelTicks: 0,          // burn time in a furnace
  rarity: 'common',
};

export class Item {
  constructor(id, options = {}) {
    if (!/^[a-z0-9_]+:[a-z0-9_/]+$/.test(id)) {
      throw new Error(
        `Item id must be namespaced snake_case like "mc:oak_planks", got "${id}"`,
      );
    }
    Object.assign(this, ITEM_DEFAULTS, options);
    this.id = id;
  }

  get isDamageable() {
    return this.maxDamage > 0;
  }

  get isStackable() {
    return this.stackSize > 1 && !this.isDamageable;
  }
}

class ItemRegistry {
  constructor() {
    this.items = new Map();
    /** Unknown items preserved from newer saves -- guarantee 4, as for blocks. */
    this.unknownItems = new Map();
    this.frozen = false;
  }

  register(item) {
    if (this.frozen) {
      throw new Error(`Registry is frozen; cannot register ${item.id}`);
    }
    if (this.items.has(item.id)) {
      throw new Error(`Duplicate item id: ${item.id}`);
    }
    this.items.set(item.id, item);
    return item;
  }

  define(id, options) {
    return this.register(new Item(id, options));
  }

  /**
   * Register the item form of an already-registered block.
   * Most blocks have one, and it almost always shares the block's ID.
   */
  defineBlockItem(blockId, options = {}) {
    if (!BLOCKS.get(blockId)) {
      throw new Error(`No such block for block item: ${blockId}`);
    }
    return this.define(blockId, { block: blockId, ...options });
  }

  get(id) {
    return this.items.get(id);
  }

  /**
   * Resolve an ID from a save. An unrecognized item is preserved as an inert
   * placeholder rather than deleted, so that opening a world in an older build
   * and saving does not silently empty the player's inventory of anything that
   * build does not know about.
   */
  resolve(id) {
    const known = this.items.get(id);
    if (known) return known;

    const cached = this.unknownItems.get(id);
    if (cached) return cached;

    const placeholder = new Item('mc:unknown', { stackSize: 64 });
    placeholder.isUnknown = true;
    placeholder.originalId = id;
    this.unknownItems.set(id, placeholder);
    return placeholder;
  }

  freeze() {
    this.frozen = true;
    return this;
  }

  get count() {
    return this.items.size;
  }
}

export const ITEMS = new ItemRegistry();

// ---------------------------------------------------------------------------
// ItemStack
// ---------------------------------------------------------------------------

/**
 * A quantity of one item, optionally damaged and optionally carrying extra data
 * (custom name, enchantments) once those exist.
 *
 * The empty stack is represented by `ItemStack.EMPTY` rather than null, so that
 * inventory code can call methods on any slot without null-checking every
 * access. Slots hold EMPTY, never null.
 */
export class ItemStack {
  constructor(item, count = 1, damage = 0, data = null) {
    this.item = item;
    this.count = count;
    this.damage = damage;
    this.data = data;
  }

  static of(itemId, count = 1, damage = 0, data = null) {
    const item = ITEMS.get(itemId);
    if (!item) throw new Error(`Unknown item id: ${itemId}`);
    return new ItemStack(item, count, damage, data);
  }

  get isEmpty() {
    return this.item === null || this.count <= 0;
  }

  get maxStackSize() {
    return this.item ? this.item.stackSize : 0;
  }

  get isDamaged() {
    return this.damage > 0;
  }

  /** Remaining durability, or Infinity for items without any. */
  get remainingDurability() {
    if (!this.item || !this.item.isDamageable) return Infinity;
    return this.item.maxDamage - this.damage;
  }

  clone() {
    return new ItemStack(
      this.item,
      this.count,
      this.damage,
      this.data ? structuredClone(this.data) : null,
    );
  }

  /**
   * Whether two stacks are the same "kind" and can merge.
   * Damage matters: two half-worn pickaxes must not stack into one.
   */
  canStackWith(other) {
    if (this.isEmpty || other.isEmpty) return false;
    if (this.item !== other.item) return false;
    if (this.damage !== other.damage) return false;
    if (!this.item.isStackable) return false;
    return JSON.stringify(this.data) === JSON.stringify(other.data);
  }

  /**
   * Merge `other` into this stack up to the stack limit.
   * Returns how many were actually moved so the caller can handle the remainder.
   */
  mergeFrom(other) {
    if (!this.canStackWith(other)) return 0;
    const room = this.maxStackSize - this.count;
    const moved = Math.min(room, other.count);
    this.count += moved;
    other.count -= moved;
    return moved;
  }

  split(amount) {
    const taken = Math.min(amount, this.count);
    this.count -= taken;
    return new ItemStack(this.item, taken, this.damage, this.data ? structuredClone(this.data) : null);
  }

  /** Returns true if the item broke. */
  applyDamage(amount = 1) {
    if (!this.item.isDamageable) return false;
    this.damage += amount;
    if (this.damage >= this.item.maxDamage) {
      this.count = 0;
      this.item = null;
      return true;
    }
    return false;
  }

  // -- Serialization ------------------------------------------------------

  /**
   * Compact JSON form for saves. Fields at their defaults are omitted, because
   * a full inventory of 36 slots is written for every player on every save and
   * the noise adds up.
   */
  toJSON() {
    if (this.isEmpty) return null;
    const out = { id: this.item.isUnknown ? this.item.originalId : this.item.id };
    if (this.count !== 1) out.count = this.count;
    if (this.damage !== 0) out.damage = this.damage;
    if (this.data !== null) out.data = this.data;
    return out;
  }

  static fromJSON(json) {
    if (!json || !json.id) return ItemStack.EMPTY.clone();
    return new ItemStack(
      ITEMS.resolve(json.id),
      json.count ?? 1,
      json.damage ?? 0,
      json.data ?? null,
    );
  }

  toString() {
    if (this.isEmpty) return 'empty';
    const id = this.item.isUnknown ? this.item.originalId : this.item.id;
    return this.count === 1 ? id : `${this.count}x ${id}`;
  }
}

/**
 * The canonical empty stack. Frozen so a bug that tries to mutate it fails
 * loudly at the mutation rather than silently corrupting every empty slot in
 * the game -- they all reference this one object.
 */
ItemStack.EMPTY = Object.freeze(new ItemStack(null, 0, 0, null));
