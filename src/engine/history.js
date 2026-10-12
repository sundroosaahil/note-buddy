// Actions: {type:'add', s} | {type:'erase', list:[{old, pieces, at}]}
export function push(pg, a) { pg.undo.push(a); pg.redo.length = 0 }

function revert(pg, a) {
  if (a.type === 'clear') { pg.strokes = [...a.old]; return } // copy: the live array gets pushed to later
  if (a.type === 'add') { pg.strokes = pg.strokes.filter((s) => s.id !== a.s.id); return }
  for (const { old, pieces, at } of [...a.list].reverse()) {
    const ids = new Set(pieces.map((p) => p.id))
    const rest = pg.strokes.filter((s) => !ids.has(s.id))
    rest.splice(Math.min(at, rest.length), 0, old)
    pg.strokes = rest
  }
}
function apply(pg, a) {
  if (a.type === 'clear') { pg.strokes = []; return }
  if (a.type === 'add') { pg.strokes = [...pg.strokes, a.s]; return }
  for (const { old, pieces } of a.list) {
    const i = pg.strokes.findIndex((s) => s.id === old.id)
    if (i >= 0) { pg.strokes = [...pg.strokes]; pg.strokes.splice(i, 1, ...pieces) }
  }
}
export function undo(pg) { const a = pg.undo.pop(); if (!a) return false; revert(pg, a); pg.redo.push(a); return true }
export function redo(pg) { const a = pg.redo.pop(); if (!a) return false; apply(pg, a); pg.undo.push(a); return true }