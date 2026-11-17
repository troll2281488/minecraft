/**
 * Import and export of .mcw world files.
 *
 * This is the surface where the compatibility guarantees become something a
 * player actually experiences, so the reporting matters as much as the parsing.
 * When a world is migrated across four versions, the import says so, names what
 * changed, and says where the backup went. A save system that silently rewrites
 * someone's world is one nobody has a reason to trust.
 */

import { SAVE } from '../core/constants.js';
import {
  readMcw, writeMcw, materializeChunk, encodeChunk,
  NotAnMcwFileError, UnsupportedFormatError,
} from './format.js';
import { migrate, needsMigration, DATA_VERSION } from './migrate.js';
import { parseChunkKey } from '../core/math.js';

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Filesystem-safe filename from a world name. */
function safeFilename(name) {
  const cleaned = (name || 'world')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')  // illegal on Windows
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
  return (cleaned || 'world') + SAVE.FILE_EXTENSION;
}

/**
 * Serialize a save and hand it to the browser as a download.
 * @returns {Promise<{filename: string, bytes: number}>}
 */
export async function exportWorld(save, filename = null) {
  const data = await writeMcw(save);
  const name = filename ?? safeFilename(save.level?.name);

  const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in some browsers before it
  // starts; a short delay is the standard workaround.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return { filename: name, bytes: data.length };
}

/** Serialize without downloading. Used for backups and the test suite. */
export async function serializeWorld(save) {
  return writeMcw(save);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ImportResult
 * @property {object} save          migrated save, chunks materialized
 * @property {number} fromVersion
 * @property {number} toVersion
 * @property {Array<{to:number,note:string}>} migrationsApplied
 * @property {boolean} tooNew       written by a newer build than this one
 * @property {number} unknownBlockCount
 * @property {Uint8Array|null} backup  pre-migration bytes, if a backup was needed
 * @property {string} summary       human-readable, safe to show verbatim
 */

/**
 * Read, validate, and migrate a .mcw file.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {{keepBackup?: boolean}} options
 * @returns {Promise<ImportResult>}
 */
export async function importWorld(buffer, options = {}) {
  const { keepBackup = true } = options;
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  const save = await readMcw(bytes);

  // Guarantee 6: keep the original before anything rewrites it. Held as bytes
  // rather than written here, so the caller decides where a backup belongs.
  const willMigrate = needsMigration(save.dataVersion);
  const backup = keepBackup && willMigrate ? bytes.slice() : null;

  const report = migrate(save);

  // Materialize chunks only after migrations have rewritten raw palette strings.
  let unknownBlockCount = 0;
  for (const dim of Object.values(save.dimensions ?? {})) {
    dim.liveChunks = new Map();
    for (const [key, decoded] of Object.entries(dim.chunks ?? {})) {
      const { cx, cz } = parseChunkKey(key);
      const chunk = materializeChunk(cx, cz, decoded);
      if (chunk.hasUnknownBlocks) unknownBlockCount++;
      dim.liveChunks.set(key, chunk);
    }
  }

  return {
    save,
    fromVersion: report.from,
    toVersion: report.to,
    migrationsApplied: report.applied,
    tooNew: report.tooNew,
    unknownBlockCount,
    backup,
    summary: buildSummary(save, report, unknownBlockCount),
  };
}

function buildSummary(save, report, unknownBlockCount) {
  const name = save.level?.name ?? 'Unnamed world';
  const lines = [`Imported "${name}"`];

  if (report.tooNew) {
    lines.push(
      `  written by a NEWER version (data version ${report.from}; this build is ${DATA_VERSION})`,
      `  unrecognized blocks will be preserved unchanged, not deleted`,
      `  saving over this file from here may lose newer features`,
    );
  } else if (report.applied.length > 0) {
    lines.push(`  data version ${report.from} -> ${report.to}`);
    lines.push(`  ${report.applied.length} migration${report.applied.length === 1 ? '' : 's'} applied:`);
    for (const m of report.applied) lines.push(`    v${m.to}: ${m.note}`);
  } else {
    lines.push(`  data version ${report.from} (already current)`);
  }

  const chunkCount = Object.values(save.dimensions ?? {})
    .reduce((n, d) => n + Object.keys(d.chunks ?? {}).length, 0);
  lines.push(`  ${chunkCount} chunk${chunkCount === 1 ? '' : 's'} across ` +
             `${Object.keys(save.dimensions ?? {}).length} dimension(s)`);

  if (unknownBlockCount > 0) {
    lines.push(`  ${unknownBlockCount} chunk(s) contain blocks unknown to this build (preserved)`);
  }

  return lines.join('\n');
}

/**
 * Turn a parse failure into something a player can act on.
 * Called by UI code around importWorld.
 */
export function describeImportError(err) {
  if (err instanceof NotAnMcwFileError) {
    return 'That file is not a world save. World files end in .mcw and are created ' +
           'by the "Export World" button.';
  }
  if (err instanceof UnsupportedFormatError) {
    return err.message;
  }
  return `Could not read that world file: ${err.message}`;
}

// ---------------------------------------------------------------------------
// Browser entry points
// ---------------------------------------------------------------------------

/** Open a file picker limited to .mcw and import the chosen file. */
export function pickAndImport(options = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SAVE.FILE_EXTENSION;
    input.style.display = 'none';

    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null); // dialog cancelled
      try {
        resolve(await importWorld(await file.arrayBuffer(), options));
      } catch (err) {
        reject(err);
      }
    };

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Accept a .mcw dropped anywhere on the page.
 *
 * Both dragover and drop must call preventDefault, or the browser navigates
 * away to the dropped file and the world -- along with any unsaved progress --
 * is gone.
 *
 * @returns {() => void} teardown
 */
export function enableDropImport(target, onResult, onError, options = {}) {
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  const onDragOver = (e) => {
    stop(e);
    e.dataTransfer.dropEffect = 'copy';
    target.classList?.add('drop-active');
  };

  const onDragLeave = (e) => {
    stop(e);
    target.classList?.remove('drop-active');
  };

  const onDrop = async (e) => {
    stop(e);
    target.classList?.remove('drop-active');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(SAVE.FILE_EXTENSION)) {
      onError?.(new NotAnMcwFileError());
      return;
    }
    try {
      onResult(await importWorld(await file.arrayBuffer(), options));
    } catch (err) {
      onError?.(err);
    }
  };

  target.addEventListener('dragover', onDragOver);
  target.addEventListener('dragleave', onDragLeave);
  target.addEventListener('drop', onDrop);

  return () => {
    target.removeEventListener('dragover', onDragOver);
    target.removeEventListener('dragleave', onDragLeave);
    target.removeEventListener('drop', onDrop);
  };
}

// ---------------------------------------------------------------------------
// Building a save from live state
// ---------------------------------------------------------------------------

/**
 * Assemble the intermediate save form from live game objects, ready for
 * writeMcw or exportWorld.
 *
 * @param {object} level        level metadata
 * @param {object} players      uuid -> serialized player
 * @param {object} dimensions   dimId -> { chunks: Map<key, Chunk>, entities, blockEntities }
 */
export function buildSave(level, players, dimensions) {
  const save = {
    dataVersion: DATA_VERSION,
    level: { ...level, lastPlayedWith: DATA_VERSION },
    players,
    dimensions: {},
    stats: {},
  };

  for (const [dimId, dim] of Object.entries(dimensions)) {
    // Chunks arrive one of two ways: live from the running world (a Map of Chunk,
    // encoded here), or already encoded straight out of storage -- which is what
    // the export path has, since it reads the bytes it previously wrote. Both go
    // through this one envelope so a save and an export cannot drift apart.
    const chunks = { ...(dim.encodedChunks ?? {}) };
    for (const [key, chunk] of dim.chunks ?? []) {
      chunks[key] = encodeChunk(chunk);
    }
    save.dimensions[dimId] = {
      chunks,
      entities: dim.entities ?? [],
      blockEntities: dim.blockEntities ?? [],
    };
  }

  return save;
}
