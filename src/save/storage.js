/**
 * Live world storage, backed by IndexedDB.
 *
 * The .mcw file in format.js is the portable, exportable form. This is the
 * working store: chunks are written here as they unload and on autosave, so a
 * crashed tab loses at most one autosave interval rather than the session.
 *
 * Chunks are stored individually rather than as one blob per world. A world can
 * reach hundreds of megabytes, and rewriting all of it every thirty seconds
 * would stall the game and burn through disk write endurance for no benefit --
 * only a handful of chunks change between autosaves.
 */

import { chunkKey } from '../core/math.js';
import { DATA_VERSION } from './migrate.js';

const DB_NAME = 'minecraft-clone';
const DB_VERSION = 1;

const STORE_WORLDS = 'worlds';
const STORE_CHUNKS = 'chunks';
const STORE_PLAYERS = 'players';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_WORLDS)) {
        const worlds = db.createObjectStore(STORE_WORLDS, { keyPath: 'id' });
        worlds.createIndex('lastPlayed', 'lastPlayed');
      }

      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        // Compound key so a whole world's chunks form a contiguous range,
        // making "delete this world" and "load this dimension" cheap.
        db.createObjectStore(STORE_CHUNKS, { keyPath: ['worldId', 'dim', 'key'] });
      }

      if (!db.objectStoreNames.contains(STORE_PLAYERS)) {
        db.createObjectStore(STORE_PLAYERS, { keyPath: ['worldId', 'uuid'] });
      }

      void event;
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
      new Error(
        `Could not open local world storage: ${request.error?.message}. ` +
        `Private browsing windows often block IndexedDB -- worlds cannot be saved there.`,
      ),
    );
    request.onblocked = () => reject(
      new Error('World storage is locked by another open tab. Close other tabs and retry.'),
    );
  });
  return dbPromise;
}

function tx(db, stores, mode) {
  const transaction = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
  });
  return { transaction, done };
}

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// ---------------------------------------------------------------------------
// Worlds
// ---------------------------------------------------------------------------

/** @returns {Promise<Array<object>>} world metadata, most recently played first */
export async function listWorlds() {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_WORLDS], 'readonly');
  const all = await request(transaction.objectStore(STORE_WORLDS).getAll());
  return all.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
}

export async function getWorld(worldId) {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_WORLDS], 'readonly');
  return request(transaction.objectStore(STORE_WORLDS).get(worldId));
}

/**
 * Create or update a world's metadata.
 * `createdWith` is set once and never overwritten -- it records which version
 * originally made the world, which is useful context when a migration misfires.
 */
export async function putWorld(meta) {
  const db = await openDb();
  const existing = await getWorld(meta.id);
  const record = {
    ...existing,
    ...meta,
    dataVersion: DATA_VERSION,
    createdWith: existing?.createdWith ?? meta.createdWith ?? DATA_VERSION,
    lastPlayedWith: DATA_VERSION,
    lastPlayed: meta.lastPlayed ?? Date.now(),
  };
  const { transaction, done } = tx(db, [STORE_WORLDS], 'readwrite');
  transaction.objectStore(STORE_WORLDS).put(record);
  await done;
  return record;
}

export async function deleteWorld(worldId) {
  const db = await openDb();
  const { transaction, done } = tx(db, [STORE_WORLDS, STORE_CHUNKS, STORE_PLAYERS], 'readwrite');

  transaction.objectStore(STORE_WORLDS).delete(worldId);

  // Bounded range delete rather than a full scan: the compound key puts every
  // chunk of a world together, so this touches only that world's records.
  const chunkRange = IDBKeyRange.bound([worldId], [worldId, '￿', '￿']);
  transaction.objectStore(STORE_CHUNKS).delete(chunkRange);

  const playerRange = IDBKeyRange.bound([worldId], [worldId, '￿']);
  transaction.objectStore(STORE_PLAYERS).delete(playerRange);

  await done;
}

// ---------------------------------------------------------------------------
// Chunks
// ---------------------------------------------------------------------------

/** @param {Uint8Array} bytes output of encodeChunk() */
export async function putChunk(worldId, dim, cx, cz, bytes) {
  const db = await openDb();
  const { transaction, done } = tx(db, [STORE_CHUNKS], 'readwrite');
  transaction.objectStore(STORE_CHUNKS).put({
    worldId, dim, key: chunkKey(cx, cz), bytes, dataVersion: DATA_VERSION,
  });
  await done;
}

/**
 * Write many chunks in one transaction.
 *
 * Autosave uses this rather than looping putChunk. One transaction per chunk
 * would mean hundreds of separate commits, which is dramatically slower and can
 * visibly hitch the frame the autosave lands on.
 */
export async function putChunks(worldId, dim, entries) {
  if (entries.length === 0) return;
  const db = await openDb();
  const { transaction, done } = tx(db, [STORE_CHUNKS], 'readwrite');
  const store = transaction.objectStore(STORE_CHUNKS);
  for (const { cx, cz, bytes } of entries) {
    store.put({ worldId, dim, key: chunkKey(cx, cz), bytes, dataVersion: DATA_VERSION });
  }
  await done;
}

export async function getChunk(worldId, dim, cx, cz) {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_CHUNKS], 'readonly');
  const record = await request(
    transaction.objectStore(STORE_CHUNKS).get([worldId, dim, chunkKey(cx, cz)]),
  );
  return record ?? null;
}

export async function getAllChunks(worldId, dim) {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_CHUNKS], 'readonly');
  const range = IDBKeyRange.bound([worldId, dim], [worldId, dim, '￿']);
  return request(transaction.objectStore(STORE_CHUNKS).getAll(range));
}

export async function countChunks(worldId) {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_CHUNKS], 'readonly');
  const range = IDBKeyRange.bound([worldId], [worldId, '￿', '￿']);
  return request(transaction.objectStore(STORE_CHUNKS).count(range));
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export async function putPlayer(worldId, uuid, data) {
  const db = await openDb();
  const { transaction, done } = tx(db, [STORE_PLAYERS], 'readwrite');
  transaction.objectStore(STORE_PLAYERS).put({ worldId, uuid, data });
  await done;
}

export async function getPlayer(worldId, uuid) {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_PLAYERS], 'readonly');
  const record = await request(transaction.objectStore(STORE_PLAYERS).get([worldId, uuid]));
  return record?.data ?? null;
}

export async function getAllPlayers(worldId) {
  const db = await openDb();
  const { transaction } = tx(db, [STORE_PLAYERS], 'readonly');
  const range = IDBKeyRange.bound([worldId], [worldId, '￿']);
  const records = await request(transaction.objectStore(STORE_PLAYERS).getAll(range));
  return Object.fromEntries(records.map((r) => [r.uuid, r.data]));
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/** Rough on-disk usage, for the world list screen. */
export async function estimateUsage() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usage, quota, percent: quota ? (usage / quota) * 100 : 0 };
}

/**
 * Ask the browser not to evict this origin's storage under disk pressure.
 *
 * Without this, a browser low on space may silently discard IndexedDB data --
 * which for this project means deleting someone's world. Worth requesting even
 * though the user may decline.
 */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}

/** Test-only: drop the whole database and reset the connection. */
export async function _resetForTests() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // another tab holds it; tests still proceed
  });
}
