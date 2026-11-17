/**
 * What the creative inventory shows.
 *
 * This lived in main.js only because that is where it was written. It is pure game
 * data with no GL or DOM dependency, and tests/crafting_table.test.js had to import
 * all of main.js -- dragging in gl.js, atlas.js, chunk_renderer.js and storage.js --
 * just to read it.
 */

import { ITEMS } from '../world/item.js';

/**
 * Every item shown in the creative inventory: all registered items except the
 * unknown-block placeholder and anything flagged out of creative. Registration
 * order puts blocks first, then materials, then tools -- a sensible browse order.
 */
export function creativeItemList() {
  return [...ITEMS.items.values()].filter(
    (it) => it.id !== 'mc:unknown' && !it.isUnknown && !it.notInCreative,
  );
}
