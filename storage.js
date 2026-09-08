// IndexedDB. Two stores: `sessions` holds the JSON session, `media` holds
// Blobs keyed "<sessionId>/<mediaId>". Photos and audio chunks are written the
// moment they exist, so a crash costs seconds of audio at most (AGENTS.md).

const DB_NAME = 'reporder';
const DB_VERSION = 1;

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && typeof r.then !== 'function' && 'onsuccess' in r) {
      r.onsuccess = () => { result = r.result; };
    }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function putSession(session) {
  const db = await openDb();
  return tx(db, 'sessions', 'readwrite', (s) => s.put(session));
}

export async function getSession(id) {
  const db = await openDb();
  return tx(db, 'sessions', 'readonly', (s) => s.get(id));
}

export async function listSessions() {
  const db = await openDb();
  const all = await tx(db, 'sessions', 'readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deleteSession(id) {
  const db = await openDb();
  const keys = await listMediaKeys(id);
  await tx(db, 'media', 'readwrite', (s) => { for (const k of keys) s.delete(k); });
  return tx(db, 'sessions', 'readwrite', (s) => s.delete(id));
}

export const mediaKey = (sessionId, mediaId) => `${sessionId}/${mediaId}`;

export async function putMedia(sessionId, mediaId, blob, meta = {}) {
  const db = await openDb();
  return tx(db, 'media', 'readwrite', (s) => s.put({ key: mediaKey(sessionId, mediaId), blob, ...meta }));
}

export async function getMedia(sessionId, mediaId) {
  const db = await openDb();
  const rec = await tx(db, 'media', 'readonly', (s) => s.get(mediaKey(sessionId, mediaId)));
  return rec ? rec.blob : null;
}

export async function listMediaKeys(sessionId) {
  const db = await openDb();
  const range = IDBKeyRange.bound(`${sessionId}/`, `${sessionId}/￿`);
  const keys = await tx(db, 'media', 'readonly', (s) => s.getAllKeys(range));
  return keys || [];
}

/** Audio is stored in numbered chunks; this stitches them back into one Blob. */
export async function getAudioBlob(session) {
  if (!session.audio) return null;
  const parts = [];
  for (let i = 0; i < session.audio.chunks; i++) {
    const b = await getMedia(session.id, `audio-${String(i).padStart(5, '0')}`);
    if (b) parts.push(b);
  }
  return parts.length ? new Blob(parts, { type: session.audio.type }) : null;
}

/** Rough storage use, for the list page. */
export async function storageEstimate() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null;
  } catch { return null; }
}

/** Ask the browser not to evict our data under pressure (best effort). */
export async function persist() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
