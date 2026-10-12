// IndexedDB layout: 'pages' store holds one record per page (so only changed pages are rewritten),
// 'meta' holds page order + current index. Undo history is deliberately not stored.
let dbp
const getDb = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open('whiteboard', 1)
  r.onupgradeneeded = () => { r.result.createObjectStore('pages', { keyPath: 'id' }); r.result.createObjectStore('meta') }
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
