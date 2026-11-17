/**
 * Tags -- named sets of block or item IDs.
 *
 * These exist so that one recipe can cover every wood species. Without them,
 * "4 planks -> crafting table" needs eight near-identical recipes, and adding a
 * ninth wood type in a later version means remembering to add it to every one of
 * the dozens of plank recipes. With them, the recipe references `#mc:planks` and
 * a new wood type joins the tag once.
 *
 * Tags may contain other tags. `#mc:logs` is the union of `#mc:oak_logs`,
 * `#mc:birch_logs`, and so on, which is how vanilla organizes them and keeps
 * "any oak log" and "any log at all" both expressible.
 *
 * Tag IDs are written into recipe definitions but NOT into save files, so they
 * are not part of the compatibility contract and can be reorganized freely.
 */

export class TagRegistry {
  constructor(kind) {
    this.kind = kind; // 'block' or 'item', for error messages
    /** @type {Map<string, Set<string>>} raw contents, may include #tag refs */
    this.raw = new Map();
    /** @type {Map<string, Set<string>>} fully expanded, built lazily */
    this.resolved = new Map();
  }

  /**
   * Define or extend a tag. Calling twice with the same ID ADDS entries rather
   * than replacing them, so a later module can extend a tag defined earlier --
   * the nether block module adds to `#mc:logs` without editing the wood module.
   */
  define(tagId, entries) {
    if (!tagId.startsWith('#')) {
      throw new Error(`Tag id must start with '#', got "${tagId}"`);
    }
    let set = this.raw.get(tagId);
    if (!set) {
      set = new Set();
      this.raw.set(tagId, set);
    }
    for (const entry of entries) set.add(entry);
    this.resolved.clear(); // any cached expansion may now be stale
    return this;
  }

  /**
   * Expand a tag to the flat set of concrete IDs it contains.
   * Cycles are detected and reported rather than hanging the load.
   */
  expand(tagId, seen = new Set()) {
    const cached = this.resolved.get(tagId);
    if (cached) return cached;

    if (seen.has(tagId)) {
      throw new Error(
        `Cyclic ${this.kind} tag reference involving ${tagId}: ` +
        `${[...seen].join(' -> ')} -> ${tagId}`,
      );
    }
    seen.add(tagId);

    const raw = this.raw.get(tagId);
    if (!raw) {
      throw new Error(`Undefined ${this.kind} tag: ${tagId}`);
    }

    const out = new Set();
    for (const entry of raw) {
      if (entry.startsWith('#')) {
        for (const nested of this.expand(entry, seen)) out.add(nested);
      } else {
        out.add(entry);
      }
    }

    seen.delete(tagId);
    this.resolved.set(tagId, out);
    return out;
  }

  /** True if `id` is in `tagId`. Accepts a bare ID for symmetry with recipes. */
  contains(tagId, id) {
    if (!tagId.startsWith('#')) return tagId === id;
    return this.expand(tagId).has(id);
  }

  has(tagId) {
    return this.raw.has(tagId);
  }

  get all() {
    return [...this.raw.keys()];
  }

  /**
   * Verify every entry refers to something that exists.
   * Run once at startup: a typo in a tag would otherwise surface much later as
   * a recipe that mysteriously refuses to match.
   */
  validate(exists) {
    const problems = [];
    for (const tagId of this.raw.keys()) {
      let expanded;
      try {
        expanded = this.expand(tagId);
      } catch (err) {
        problems.push(err.message);
        continue;
      }
      for (const id of expanded) {
        if (!exists(id)) {
          problems.push(`${this.kind} tag ${tagId} references unknown id "${id}"`);
        }
      }
    }
    return problems;
  }
}

export const BLOCK_TAGS = new TagRegistry('block');
export const ITEM_TAGS = new TagRegistry('item');

// Tag CONTENTS live with the blocks they describe, in src/world/blocks/.
// Keeping them here too would mean two places to update and one of them
// eventually being wrong.
