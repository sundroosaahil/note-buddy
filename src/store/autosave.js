import { saveBoard } from '../lib/notebooks.js'
// Debounced 800ms after changes; flush() is called immediately on page switch, undo/redo and when the tab hides.
// A page is rewritten only if its `rev` moved since the last successful save.
export function createAutosave(engine, notebookId) {
  let t = 0, q = Promise.resolve()
  const flush = () => {
    clearTimeout(t)
    const changed = engine.pages.filter((p) => p._sv !== p.rev)
    if (!changed.length) return q
    const pages = engine.pages.map((p) => ({ id: p.id, strokes: p.strokes, objects: p.objects, scale: p.scale, ox: p.ox, oy: p.oy, bg: p.bg }))
    const revs = changed.map((p) => p.rev); changed.forEach((p) => (p._sv = p.rev))
    const data = { order: engine.pages.map((p) => p.id), index: engine.index, pages }
    q = q.then(() => saveBoard(notebookId, data, { pageCount: pages.length })).catch((e) => { console.warn('autosave failed', e); changed.forEach((p, i) => { if (p._sv === revs[i]) p._sv = -1 }) })
    return q
  }
  const schedule = () => { clearTimeout(t); t = setTimeout(flush, 800) }
  const onVis = () => { if (document.visibilityState === 'hidden') flush() }
  document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', flush)
  return { schedule, flush, destroy() { flush(); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush) } }
}
