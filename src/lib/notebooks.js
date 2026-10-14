// Local-only notebook store for Notes Buddy.
//  - A small index (title, dates, page count, thumbnail) lives in localStorage so the
//    front page renders instantly and synchronously.
//  - The heavy board data (strokes, objects) lives in IndexedDB, which has no 5 MB cap.
// Nothing here ever touches the network.

const INDEX_KEY = 'notesbuddy:index:v1';
const DB_NAME = 'notesbuddy';
const STORE = 'boards';

const listeners = new Set();
let cache = null;

function readIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list) {
  cache = list;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('[notes-buddy] could not write index', err);
  }
  listeners.forEach((fn) => fn(list));
}

export function listNotebooks() {
  if (!cache) cache = readIndex();
  return [...cache].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function subscribe(fn) {
  listeners.add(fn);
  const onStorage = (e) => {
    if (e.key === INDEX_KEY) {
      cache = readIndex();
      fn(cache);
    }
  };
  window.addEventListener('storage', onStorage); // other tabs
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function defaultTitle(date = new Date()) {
  const d = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const t = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `Class · ${d}, ${t}`;
}

export function createNotebook(title) {
  const now = Date.now();
  const meta = {
    id: crypto.randomUUID(),
    title: (title || '').trim() || defaultTitle(),
    createdAt: now,
    updatedAt: now,
    pageCount: 1,
    thumbnail: null,
  };
  writeIndex([meta, ...listNotebooks()]);
  return meta;
}

export function renameNotebook(id, title) {
  const clean = (title || '').trim();
  if (!clean) return;
  writeIndex(listNotebooks().map((n) => (n.id === id ? { ...n, title: clean } : n)));
}

export async function deleteNotebook(id) {
  writeIndex(listNotebooks().filter((n) => n.id !== id));
  try {
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.delete(id));
  } catch (err) {
    console.error('[notes-buddy] could not delete board data', err);
  }
}

// --- board data (called from the whiteboard, not the front page) ---------------

export async function loadBoard(id) {
  const db = await openDb();
  return tx(db, 'readonly', (s) => s.get(id));
}

// data: whatever your whiteboard serialises (pages, strokes, objects...).
// thumbnail: optional small data URL, e.g. canvas.toDataURL('image/jpeg', 0.6) at ~480px wide.
export async function saveBoard(id, data, { pageCount, thumbnail } = {}) {
  const db = await openDb();
  await tx(db, 'readwrite', (s) => s.put(data, id));
  writeIndex(
    listNotebooks().map((n) =>
      n.id === id
        ? {
            ...n,
            updatedAt: Date.now(),
            pageCount: pageCount ?? n.pageCount,
            thumbnail: thumbnail ?? n.thumbnail,
          }
        : n
    )
  );
}

// Ask the browser not to evict our data when storage runs low.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}

// --- IndexedDB plumbing ------------------------------------------------------------

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}