// Actions: {type:'add', s} | {type:'erase', list:[{old, pieces, at}]} | {type:'clear', old}
//  | {type:'doc', before, after}  (any edit of strokes + objects together: before/after are { strokes, objects } snapshots)
//  | {type:'snap', s, o}          (a freehand stroke s turned into shape object o; undo gives the original stroke back)
export function push(pg, a) { pg.undo.push(a); pg.redo.length = 0 }

function revert(pg, a) {
  if (a.type === 'doc') { pg.strokes = a.before.strokes.slice(); pg.objects = a.before.objects.slice(); return } // copies: live arrays are edited in place later
  if (a.type === 'snap') { pg.objects = pg.objects.filter((o) => o.id !== a.o.id); pg.strokes = [...pg.strokes, a.s]; return }
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
  if (a.type === 'doc') { pg.strokes = a.after.strokes.slice(); pg.objects = a.after.objects.slice(); return }
  if (a.type === 'snap') { pg.strokes = pg.strokes.filter((s) => s.id !== a.s.id); pg.objects = [...pg.objects, a.o]; return }
  if (a.type === 'clear') { pg.strokes = []; return }
  if (a.type === 'add') { pg.strokes = [...pg.strokes, a.s]; return }
  for (const { old, pieces } of a.list) {
    const i = pg.strokes.findIndex((s) => s.id === old.id)
    if (i >= 0) { pg.strokes = [...pg.strokes]; pg.strokes.splice(i, 1, ...pieces) }
  }
}
export function undo(pg) { const a = pg.undo.pop(); if (!a) return false; revert(pg, a); pg.redo.push(a); return true }
export function redo(pg) { const a = pg.redo.pop(); if (!a) return false; apply(pg, a); pg.undo.push(a); return true }