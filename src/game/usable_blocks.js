/**
 * Blocks that do something when right-clicked.
 *
 * Pure game data, so it does not belong in the entry point. Kept as a table keyed by
 * block id rather than a field on the block definition because the handlers need the
 * Game instance, and block definitions must stay free of game-loop dependencies.
 */

/**
 * Keyed by block id; each handler receives the Game instance. Furnace, chest, and the
 * other containers join this table as they are implemented.
 */
export const USABLE_BLOCKS = {
  'mc:crafting_table': (game) => game._openCraftingTable(),
};
