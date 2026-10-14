// IndexedDB layout: 'pages' store holds one record per page (so only changed pages are rewritten),
// 'meta' holds page order + current index. Undo history is deliberately not stored.
let dbp
const getDb = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open('whiteboard', 2) // v2 adds 'blobs' (inserted images live here, not inside the page records)
  r.onupgradeneeded = () => { const d = r.result, has = (n) => d.objectStoreNames.contains(n); if (!has('pages')) d.createObjectStore('pages', { keyPath: 'id' }); if (!has('meta')) d.createObjectStore('meta'); if (!has('blobs')) d.createObjectStore('blobs', { keyPath: 'id' }) }
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
}))
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error) })

export async function saveBoard(records, meta) {
  const db = await getDb(), tx = db.transaction(['pages', 'meta'], 'readwrite'), ps = tx.objectStore('pages')
  records.forEach((r) => ps.put(r))
  tx.objectStore('meta').put(meta, 'board')
  ps.getAllKeys().onsuccess = (e) => { for (const k of e.target.result) if (!meta.order.includes(k)) ps.delete(k) } // deleted pages
  await done(tx)
}
export async function loadBoard() {
  const db = await getDb(), tx = db.transaction(['pages', 'meta'], 'readonly')
  const [meta, pages] = await Promise.all([req(tx.objectStore('meta').get('board')), req(tx.objectStore('pages').getAll())])
  return meta && pages.length ? { ...meta, pages } : null
}

// Inserted images: one record per image, keyed by id. Objects only hold the id, so duplicating or pasting an image costs nothing.
export async function putBlob(id, blob) { const db = await getDb(), tx = db.transaction('blobs', 'readwrite'); tx.objectStore('blobs').put({ id, blob }); await done(tx) }
export async function getBlob(id) { const db = await getDb(), r = await req(db.transaction('blobs', 'readonly').objectStore('blobs').get(id)); return r ? r.blob : null }
export async function pruneBlobs(keep) { // only called at startup, when undo history is empty, so nothing can still need a dropped image
  const db = await getDb(), tx = db.transaction('blobs', 'readwrite'), st = tx.objectStore('blobs')
  st.getAllKeys().onsuccess = (e) => { for (const k of e.target.result) if (!keep.has(k)) st.delete(k) }
  await done(tx)
}
