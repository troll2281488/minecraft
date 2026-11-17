/**
 * Save data versioning and the migration chain.
 *
 * This is guarantee 3 from docs/SAVE_FORMAT.md, and the mechanism the whole
 * "worlds survive every future version" promise rests on.
 *
 * HOW TO ADD A MIGRATION
 *
 * When a change alters the MEANING of saved data -- a block is renamed, a
 * property is added with a non-default meaning, an entity field changes units --
 * you must, in the SAME COMMIT:
 *
 *   1. Append an entry to MIGRATIONS with `to` set to DATA_VERSION + 1.
 *   2. Bump DATA_VERSION to match.
 *
 * Doing one without the other fails `validateChain()`, which the test suite
 * calls on every run. That check exists because this is exactly the kind of
 * discipline that erodes silently: the migration is easy to forget, nothing
 * breaks locally, and the damage only appears when someone opens a year-old
 * world.
 *
 * WHAT DOES NOT NEED A MIGRATION
 *
 * Adding a genuinely new block, item, or biome. Old saves simply do not contain
 * it, and string IDs mean nothing shifts. That is the entire point of guarantee
 * 1 -- the common case of "we added content" costs nothing.
 */

/**
 * Current save data version.
 *
 * MUST equal the highest `to` in MIGRATIONS, or be 1 when there are none.
 */
export const DATA_VERSION = 1;

/**
 * Ordered migrations. Each transforms a save from version `to - 1` to `to`.
 *
 * Every entry receives the mutable in-memory save object, before chunks are
 * decoded, so that a block rename can be applied to raw palette strings without
 * the cost of building states that are about to be discarded.
 *
 * @type {Array<{to: number, note: string, apply: (save: object) => void}>}
 */
export const MIGRATIONS = [
  // Version 1 is the initial format; there is nothing before it to migrate from.
  //
  // The first real entry will look like:
  //
  //   {
  //     to: 2,
  //     note: 'mc:grass -> mc:short_grass, matching the 1.20.3 rename',
  //     apply(save) {
  //       renameBlock(save, 'mc:grass', 'mc:short_grass');
  //     },
  //   },
];

// ---------------------------------------------------------------------------
// Chain validation
// ---------------------------------------------------------------------------

/**
 * Verify the chain is well-formed. Called by the test suite; throwing here is
 * the point -- a broken chain must fail the build, not the player's world.
 */
export function validateChain() {
  const problems = [];

  if (MIGRATIONS.length === 0) {
    if (DATA_VERSION !== 1) {
      problems.push(
        `DATA_VERSION is ${DATA_VERSION} but MIGRATIONS is empty. Every version ` +
        `above 1 must be reachable from version 1 by applying migrations in order.`,
      );
    }
  } else {
    // Migrations must be contiguous starting at 2, with no gaps and no
    // duplicates -- a gap means some version can never be migrated past.
    MIGRATIONS.forEach((m, i) => {
      const expected = i + 2;
      if (m.to !== expected) {
        problems.push(
          `MIGRATIONS[${i}].to is ${m.to}, expected ${expected}. Migrations must ` +
          `be contiguous from 2 upward with no gaps or reordering.`,
        );
      }
      if (typeof m.apply !== 'function') {
        problems.push(`MIGRATIONS[${i}] (to ${m.to}) has no apply() function.`);
      }
      if (!m.note) {
        problems.push(`MIGRATIONS[${i}] (to ${m.to}) has no note describing what changed.`);
      }
    });

    const highest = MIGRATIONS[MIGRATIONS.length - 1].to;
    if (highest !== DATA_VERSION) {
      problems.push(
        `DATA_VERSION is ${DATA_VERSION} but the highest migration targets ${highest}. ` +
        `Bumping DATA_VERSION requires adding the migration that reaches it, in the ` +
        `same commit.`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error('Migration chain is invalid:\n  - ' + problems.join('\n  - '));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Applying migrations
// ---------------------------------------------------------------------------

export class SaveTooNewError extends Error {
  constructor(saveVersion, buildVersion) {
    super(
      `This world was saved by a newer version of the game ` +
      `(data version ${saveVersion}; this build understands up to ${buildVersion}).\n\n` +
      `It can still be opened, and any blocks this build does not recognize will be ` +
      `preserved unchanged rather than deleted. But saving over it from here may lose ` +
      `newer features.`,
    );
    this.name = 'SaveTooNewError';
    this.saveVersion = saveVersion;
    this.buildVersion = buildVersion;
  }
}

/**
 * Bring a save up to DATA_VERSION.
 *
 * Returns a report rather than only mutating, because the import UI states
 * plainly what happened -- silently rewriting someone's world is exactly the
 * kind of thing that destroys trust in a save system.
 *
 * @param {object} save the decoded save object; mutated in place
 * @returns {{from: number, to: number, applied: Array<{to:number, note:string}>, tooNew: boolean}}
 */
export function migrate(save) {
  const from = save.dataVersion ?? 1;
  const applied = [];

  if (from > DATA_VERSION) {
    // Guarantee 4: a newer save is readable, not rejected. Unknown blocks are
    // preserved by the registry, so opening it is safe; only overwriting is not.
    return { from, to: from, applied, tooNew: true };
  }

  for (const migration of MIGRATIONS) {
    if (migration.to > from && migration.to <= DATA_VERSION) {
      migration.apply(save);
      applied.push({ to: migration.to, note: migration.note });
    }
  }

  save.dataVersion = DATA_VERSION;
  return { from, to: DATA_VERSION, applied, tooNew: false };
}

/** True if migrating this save would change it. Used to decide whether to back up. */
export function needsMigration(dataVersion) {
  return dataVersion < DATA_VERSION;
}

// ---------------------------------------------------------------------------
// Helpers for writing migrations
//
// Migrations operate on raw palette strings, before decoding. These make the
// common transformations one-liners so that a migration is easy enough to write
// that nobody is tempted to skip it.
// ---------------------------------------------------------------------------

/**
 * Rewrite every occurrence of a block ID across all chunk palettes, preserving
 * whatever properties each state carried.
 */
export function renameBlock(save, fromId, toId) {
  forEachPaletteEntry(save, (entry) => {
    if (entry === fromId) return toId;
    if (entry.startsWith(fromId + '[')) return toId + entry.slice(fromId.length);
    return entry;
  });
}

/** Rewrite an item ID across every player inventory and container. */
export function renameItem(save, fromId, toId) {
  for (const player of Object.values(save.players || {})) {
    for (const stack of player.inventory || []) {
      if (stack && stack.id === fromId) stack.id = toId;
    }
  }
  for (const dim of Object.values(save.dimensions || {})) {
    for (const be of dim.blockEntities || []) {
      for (const stack of be.items || []) {
        if (stack && stack.id === fromId) stack.id = toId;
      }
    }
  }
}

/**
 * Apply a transform to every raw palette string in every chunk of every
 * dimension. Chunks are still in their encoded form at this point.
 */
export function forEachPaletteEntry(save, transform) {
  for (const dim of Object.values(save.dimensions || {})) {
    for (const chunk of Object.values(dim.chunks || {})) {
      for (const section of chunk.sections || []) {
        if (!section.palette) continue;
        for (let i = 0; i < section.palette.length; i++) {
          const next = transform(section.palette[i]);
          if (next !== undefined) section.palette[i] = next;
        }
      }
    }
  }
}
