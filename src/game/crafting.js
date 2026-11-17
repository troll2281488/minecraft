/**
 * Recipe matching.
 *
 * Vanilla's shaped matching has two properties that are easy to miss and
 * immediately obvious when wrong:
 *
 *   1. A pattern matches at ANY offset within the grid. A 2x2 pattern placed in
 *      the bottom-right of a 3x3 table works exactly as well as top-left. Every
 *      player relies on this without ever thinking about it.
 *
 *   2. Patterns match MIRRORED horizontally as well. This is why a bow or a
 *      chest works regardless of which way round you lay it out.
 *
 * Ingredients may be a concrete item id, a `#tag` reference, or an array of
 * alternatives -- so one recipe covers every wood species instead of needing
 * eight copies that will drift apart the first time a ninth is added.
 */

import { ITEM_TAGS } from '../world/tags.js';
import { ITEMS, ItemStack } from '../world/item.js';

export class Recipe {
  constructor(spec) {
    Object.assign(this, spec);
    this.type = spec.pattern ? 'shaped' : 'shapeless';
  }
}

/** Does one grid slot satisfy one ingredient? */
function matchesIngredient(stack, ingredient) {
  if (ingredient === null || ingredient === undefined) return !stack || stack.isEmpty;
  if (!stack || stack.isEmpty) return false;

  const id = stack.item.id;
  if (Array.isArray(ingredient)) return ingredient.some((alt) => matchesIngredient(stack, alt));
  if (typeof ingredient === 'string') {
    if (ingredient.startsWith('#')) return ITEM_TAGS.contains(ingredient, id);
    return ingredient === id;
  }
  return false;
}

/** Trim a pattern's empty border so it can be slid around inside the grid. */
function normalizePattern(pattern, key) {
  const rows = pattern.map((row) => row.split(''));
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));

  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x] ?? ' ';
      row.push(ch === ' ' ? null : key[ch]);
    }
    grid.push(row);
  }
  return { grid, width, height };
}

export class RecipeBook {
  constructor() {
    /** @type {Recipe[]} */
    this.recipes = [];
    this._normalized = new Map();
  }

  add(spec) {
    const recipe = new Recipe(spec);
    if (recipe.type === 'shaped') {
      this._normalized.set(recipe, normalizePattern(recipe.pattern, recipe.key));
    }
    this.recipes.push(recipe);
    return recipe;
  }

  addAll(specs) {
    for (const spec of specs) this.add(spec);
    return this;
  }

  /**
   * Find the recipe a grid produces, if any.
   *
   * @param {ItemStack[]} grid  row-major, length size*size
   * @param {number} size       2 or 3
   */
  match(grid, size) {
    for (const recipe of this.recipes) {
      if (recipe.type === 'shapeless') {
        if (this._matchShapeless(recipe, grid)) return recipe;
      } else if (this._matchShaped(recipe, grid, size)) {
        return recipe;
      }
    }
    return null;
  }

  _matchShaped(recipe, grid, size) {
    const norm = this._normalized.get(recipe);
    if (norm.width > size || norm.height > size) return false;

    for (let offsetY = 0; offsetY <= size - norm.height; offsetY++) {
      for (let offsetX = 0; offsetX <= size - norm.width; offsetX++) {
        if (this._fitsAt(norm, grid, size, offsetX, offsetY, false)) return true;
        if (this._fitsAt(norm, grid, size, offsetX, offsetY, true)) return true;
      }
    }
    return false;
  }

  _fitsAt(norm, grid, size, offsetX, offsetY, mirrored) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const withinX = x - offsetX;
        const withinY = y - offsetY;
        const inside =
          withinX >= 0 && withinX < norm.width && withinY >= 0 && withinY < norm.height;

        const ingredient = inside
          ? norm.grid[withinY][mirrored ? norm.width - 1 - withinX : withinX]
          : null;

        if (!matchesIngredient(grid[y * size + x], ingredient)) return false;
      }
    }
    return true;
  }

  _matchShapeless(recipe, grid) {
    const stacks = grid.filter((s) => s && !s.isEmpty);
    if (stacks.length !== recipe.ingredients.length) return false;

    // Greedy assignment over a copy: each ingredient consumes one stack, and a
    // stack cannot satisfy two ingredients.
    const remaining = [...stacks];
    for (const ingredient of recipe.ingredients) {
      const index = remaining.findIndex((s) => matchesIngredient(s, ingredient));
      if (index === -1) return false;
      remaining.splice(index, 1);
    }
    return remaining.length === 0;
  }

  /** The output stack for a matched recipe. */
  resultOf(recipe) {
    if (!recipe) return ItemStack.EMPTY.clone();
    return ItemStack.of(recipe.result, recipe.count ?? 1);
  }

  /**
   * Every recipe whose result is `itemId`. Used by the recipe hint UI.
   */
  producing(itemId) {
    return this.recipes.filter((r) => r.result === itemId);
  }

  /** Verify every referenced id exists. Run once at startup. */
  validate() {
    const problems = [];
    const checkIngredient = (ingredient, where) => {
      if (ingredient == null) return;
      if (Array.isArray(ingredient)) {
        ingredient.forEach((alt) => checkIngredient(alt, where));
        return;
      }
      if (ingredient.startsWith('#')) {
        if (!ITEM_TAGS.has(ingredient)) problems.push(`${where}: unknown tag ${ingredient}`);
        return;
      }
      if (!ITEMS.get(ingredient)) problems.push(`${where}: unknown item ${ingredient}`);
    };

    for (const recipe of this.recipes) {
      const where = `recipe for ${recipe.result}`;
      if (!ITEMS.get(recipe.result)) problems.push(`${where}: unknown result item`);
      if (recipe.type === 'shaped') {
        for (const ingredient of Object.values(recipe.key)) checkIngredient(ingredient, where);
      } else {
        for (const ingredient of recipe.ingredients) checkIngredient(ingredient, where);
      }
    }
    return problems;
  }

  get size() {
    return this.recipes.length;
  }
}

export { matchesIngredient, normalizePattern };
