// Stage 6 engine tests: the real Engine and pointer code run against a fake canvas (no browser needed), so selection,
// transforms, undo/redo, text editing, snapping and export all execute for real.
import assert from 'node:assert'
const fakeCtx = () => { const st = { font: '10px x' }; return new Proxy(st, { get: (t, k) => (k === 'measureText' ? (s) => ({ width: String(s).length * parseFloat(t.font) * 0.5 }) : k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) }) }
const fakeCanvas = () => ({ width: 0, height: 0, clientWidth: 800, clientHeight: 600, getContext: () => fakeCtx(), toDataURL: () => 'data:x' })
globalThis.document = { createElement: () => fakeCanvas(), addEventListener() {}, removeEventListener() {} }
globalThis.window = { devicePixelRatio: 1 }
globalThis.Path2D = class { moveTo() {} quadraticCurveTo() {} closePath() {} }
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0); globalThis.cancelAnimationFrame = clearTimeout
const { Engine } = await import('./src/engine/Engine.js')
const { renderPage, contentBounds } = await import('./src/export/render.js')
const tick = () => new Promise((r) => setTimeout(r, 5))
const mk = () => { const e = new Engine(fakeCanvas(), () => {}); e.resize(); return e }
const ids = (a) => a.map((x) => x.id)
const stroke = (e, pts) => { e.beginStroke(pts[0][0], pts[0][1], 0.5); for (const [x, y] of pts.slice(1)) e.extendStroke(x, y, 0.5); e.endStroke() }
const undoLen = (e) => e.page.undo.length

{ // sticky note: creation + typing is ONE undo step, and the text survives redo
  const e = mk(); e.addSticky('#bbf7d0'); const id = [...e.sel][0]
  assert.equal(e.page.objects.length, 1); assert.equal(e.editing, id); assert.equal(e.tool, 'select')
  e.setEditText('hello world'); e.endEdit()
  assert.equal(undoLen(e), 1); assert.equal(e.page.objects[0].text, 'hello world'); assert.equal(e.editing, null)
  const o = e.page.objects[0]; assert.ok(Math.abs(o.x + o.w / 2 - 400) < 1e-9 && Math.abs(o.y + o.h / 2 - 300) < 1e-9, 'appears at view centre')
  e.undo(); assert.equal(e.page.objects.length, 0); assert.equal(e.sel.size, 0)
  e.redo(); assert.equal(e.page.objects[0].text, 'hello world')
  e.snapshot(); await tick() // thumbnails + full draw with objects must not throw
}
{ // empty text box is discarded and leaves no history; typed text wraps and grows the box
  const e = mk(); e.addText(); e.endEdit(); assert.equal(e.page.objects.length, 0); assert.equal(undoLen(e), 0)
  e.addText(); e.setEditText('the quick brown fox jumps over the lazy dog and keeps running far away'); const h1 = e.page.objects[0].h; e.endEdit()
  assert.ok(h1 > 28, 'height grows with wrapped text'); assert.equal(undoLen(e), 1)
  e.beginEdit([...e.sel][0]); e.setEditText(''); e.endEdit(); assert.equal(e.page.objects.length, 0) // clearing an existing box removes it
  e.undo(); assert.equal(e.page.objects.length, 1)
}
{ // shape tool: drag out a rectangle; a tap makes a default one; lines remember direction
  const e = mk(); e.setShapeKind('rect'); e.beginShape(100, 100); e.shapeTo(250, 190); e.endShape()
  let o = e.page.objects[0]; assert.deepEqual([o.x, o.y, o.w, o.h], [100, 100, 150, 90]); assert.equal(e.tool, 'select'); assert.ok(e.sel.has(o.id))
  e.setShapeKind('star'); e.beginShape(300, 300); e.endShape(); assert.equal(e.page.objects[1].shape, 'star'); assert.ok(e.page.objects[1].w > 100)
  e.setShapeKind('arrow'); e.beginShape(500, 400); e.shapeTo(400, 300); e.endShape(); o = e.page.objects[2]; assert.equal(o.flipX, true); assert.equal(o.flipY, true)
  assert.equal(undoLen(e), 3); e.undo(); assert.equal(e.page.objects.length, 2)
}
{ // select + move: one undo step, tap without moving makes none
  const e = mk(); e.setShapeKind('rect'); e.beginShape(100, 100); e.shapeTo(200, 200); e.endShape(); e.clearSelection()
  e.selectDown(100, 150); e.selectMove(102, 151); e.selectMove(160, 190); e.selectUp(160, 190) // grab the left edge: an unfilled shape is picked by its outline
  let o = e.page.objects[0]; assert.deepEqual([Math.round(o.x), Math.round(o.y)], [160, 140]); assert.equal(undoLen(e), 2); assert.ok(e.sel.has(o.id))
  e.undo(); o = e.page.objects[0]; assert.deepEqual([o.x, o.y], [100, 100])
  e.redo(); assert.equal(Math.round(e.page.objects[0].x), 160)
  const n = undoLen(e); e.selectDown(200, 190); e.selectUp(200, 190); assert.equal(undoLen(e), n) // tap = no history
  e.selectDown(700, 500); e.selectUp(700, 500); assert.equal(e.sel.size, 0) // tap on empty space clears
}
{ // corner resize (opposite corner stays) and rotate handle
  const e = mk(); e.setShapeKind('rect'); e.beginShape(100, 100); e.shapeTo(200, 200); e.endShape()
  e.selectDown(200, 200); e.selectMove(205, 205); e.selectMove(300, 260); e.selectUp(300, 260)
  let o = e.page.objects[0]; assert.deepEqual([o.x, o.y, o.w, o.h], [100, 100, 200, 160]); assert.equal(undoLen(e), 2)
  const g = e.selGeom(); e.selectDown(g.rot[0], g.rot[1]); e.selectMove(g.rot[0] + 5, g.rot[1]); e.selectMove(e.selGeom().c[0] + 300, e.selGeom().c[1]); e.selectUp(0, 0) // swing handle to the right: quarter turn
  o = e.page.objects[0]; assert.ok(Math.abs(o.rot - Math.PI / 2) < 1e-6, 'rotation ' + o.rot); assert.equal(undoLen(e), 3)
}
{ // lasso picks up ink and objects together; group move, group scale; delete + undo
  const e = mk(); stroke(e, [[100, 100], [150, 120], [180, 100]]); stroke(e, [[600, 500], [650, 520]])
  e.setShapeKind('ellipse'); e.beginShape(110, 150); e.shapeTo(190, 200); e.endShape(); e.setTool('select')
  const loop = [[60, 60], [260, 60], [260, 260], [60, 260], [62, 62]]
  e.selectDown(...loop[0]); for (const p of loop.slice(1)) e.selectMove(...p); e.selectUp(...loop.at(-1))
  assert.equal(e.sel.size, 2); assert.ok(e.sel.has(e.page.strokes[0].id) && e.sel.has(e.page.objects[0].id) && !e.sel.has(e.page.strokes[1].id))
  const before = undoLen(e); const g = e.selGeom(); const [gx, gy] = [(g.sc[0][0] + g.sc[2][0]) / 2, (g.sc[0][1] + g.sc[2][1]) / 2]
  e.selectDown(gx, gy); e.selectMove(gx + 10, gy); e.selectMove(gx + 100, gy + 50); e.selectUp(gx + 100, gy + 50)
  assert.equal(undoLen(e), before + 1); assert.ok(Math.abs(e.page.strokes[0].pts[0].x - 200) < 1e-6)
  const g2 = e.selGeom(); e.selectDown(...g2.sc[2]); e.selectMove(g2.sc[2][0] + 5, g2.sc[2][1] + 5); e.selectMove(g2.sc[0][0] + (g2.sc[2][0] - g2.sc[0][0]) * 2, g2.sc[0][1] + (g2.sc[2][1] - g2.sc[0][1]) * 2); e.selectUp(0, 0)
  assert.ok(e.page.objects[0].w > 100, 'group scale doubled the ellipse'); assert.ok(Math.abs(e.page.objects[0].w - 160) < 1)
  e.deleteSelected(); assert.equal(e.page.strokes.length, 1); assert.equal(e.page.objects.length, 0); assert.equal(e.sel.size, 0)
  e.undo(); assert.equal(e.page.strokes.length, 2); assert.equal(e.page.objects.length, 1)
}
{ // duplicate / copy / paste (also onto another page): fresh ids, objects shared by blob id, never sharing arrays with history
  const e = mk(); e.addSticker({ g: '⭐' }); e.duplicateSelected(); assert.equal(e.page.objects.length, 2); assert.equal(new Set(ids(e.page.objects)).size, 2)
  assert.equal(e.sel.size, 1); assert.ok(e.page.objects[1].x > e.page.objects[0].x)
  e.copySelected(); e.addPage(); e.paste(); assert.equal(e.page.objects.length, 1); assert.equal(e.pages[0].objects.length, 2)
  e.paste(); assert.equal(e.page.objects.length, 2); assert.notEqual(e.page.objects[0].x, e.page.objects[1].x)
  e.duplicatePage(); assert.equal(e.page.objects.length, 2); assert.notEqual(e.page.objects[0].id, e.pages[1].objects[0].id)
}
{ // z-order, lock, and properties (slider drags coalesce into one undo step)
  const e = mk(); e.addSticky(); e.endEdit(); const a = [...e.sel][0]; e.addSticky(); e.endEdit(); const b = [...e.sel][0]
  e.page.objects[1] = { ...e.page.objects[1], x: e.page.objects[1].x + 300 } // keep them apart so a click can only hit one
  e.selectIds([a]); e.bringToFront(); assert.deepEqual(ids(e.page.objects), [b, a]); e.sendToBack(); assert.deepEqual(ids(e.page.objects), [a, b])
  e.toggleLock(); assert.ok(e.page.objects[0].locked); const x0 = e.page.objects[0].x
  e.deleteSelected(); assert.equal(e.page.objects.length, 2, 'locked objects survive delete')
  const g = e.selGeom(); assert.equal(g.locked, true)
  e.selectDown(...g.c); e.selectMove(g.c[0] + 20, g.c[1]); e.selectMove(g.c[0] + 80, g.c[1]); e.selectUp(0, 0); assert.equal(e.page.objects[0].x, x0, 'locked objects do not move')
  e.toggleLock(); assert.ok(!e.page.objects[0].locked)
  e.setShapeKind('rect'); e.beginShape(10, 10); e.shapeTo(100, 100); e.endShape(); const n = undoLen(e)
  e.setProps({ strokeWidthPx: 5 }, 'w'); e.setProps({ strokeWidthPx: 8 }, 'w'); e.setProps({ strokeWidthPx: 12 }, 'w')
  assert.equal(undoLen(e), n + 1); assert.equal(e.page.objects.at(-1).strokeWidth, 12); e.setProps({ fill: '#ff0000' }); assert.equal(e.page.objects.at(-1).fill, '#ff0000')
  e.undo(); assert.equal(e.page.objects.at(-1).fill, null); e.undo(); assert.equal(e.page.objects.at(-1).strokeWidth, 4)
}
{ // shape snapping: a held circle becomes an ellipse object; undo returns the original stroke, undo again removes it
  const e = mk(); e.snap = true; e.beginStroke(400 + 80, 300, 0.5)
  for (let i = 1; i <= 60; i++) { const a = (i / 58) * Math.PI * 2; e.extendStroke(400 + Math.cos(a) * 80, 300 + Math.sin(a) * 80, 0.5) }
  e.trySnap(); assert.ok(e.snapped, 'recognised'); assert.equal(e.snapped.shape, 'ellipse'); e.extendStroke(10, 10, 0.5); assert.equal(e.live.pts.length, 61, 'frozen once snapped')
  e.endStroke(); assert.equal(e.page.strokes.length, 0); assert.equal(e.page.objects.length, 1); assert.equal(e.page.objects[0].shape, 'ellipse')
  e.undo(); assert.equal(e.page.strokes.length, 1); assert.equal(e.page.objects.length, 0)
  e.undo(); assert.equal(e.page.strokes.length, 0); e.redo(); e.redo(); assert.equal(e.page.objects.length, 1); assert.equal(e.page.strokes.length, 0)
  // snapping off, highlighter, or handwriting: stays ink
  const f = mk(); f.beginStroke(10, 10, 0.5); for (let i = 1; i < 30; i++) f.extendStroke(10 + i * 4, 10 + (i % 2) * 30, 0.5); f.trySnap(); assert.equal(f.snapped, null); f.endStroke(); assert.equal(f.page.strokes.length, 1)
}
{ // the hold timer: pen stays still 600 ms -> snaps; keeps moving -> does not
  const e = mk(); e.snap = true; e.beginStroke(100, 100, 0.5); for (let i = 1; i <= 30; i++) e.extendStroke(100 + i * 10, 100 + i * 2, 0.5)
  assert.equal(e.snapped, null); await new Promise((r) => setTimeout(r, 700)); assert.equal(e.snapped?.shape, 'line'); e.endStroke(); assert.equal(e.page.objects[0].shape, 'line')
}
{ // clear page removes objects too, undoable; export bounds and rendering include objects
  const e = mk(); stroke(e, [[10, 10], [20, 20]]); e.setShapeKind('rect'); e.beginShape(300, 300); e.shapeTo(500, 400); e.endShape()
  const b = contentBounds(e.page.strokes, e.page.objects); assert.ok(b.x1 >= 500 && b.y1 >= 400)
  assert.ok(renderPage(e, e.page)); e.clearPage(); assert.equal(e.page.objects.length + e.page.strokes.length, 0); assert.equal(renderPage(e, e.page), null)
  e.undo(); assert.equal(e.page.objects.length, 1); assert.equal(e.page.strokes.length, 1)
}
{ // pages: switching ends editing + clears selection; restore tolerates old records without objects; existing 'doc' undo keeps selection valid
  const e = mk(); e.addText(); e.setEditText('hi'); e.nextPage(); assert.equal(e.editing, null); assert.equal(e.pages[0].objects[0].text, 'hi'); assert.equal(e.sel.size, 0)
  e.restore({ order: ['p1'], index: 0, pages: [{ id: 'p1', strokes: [], scale: 1, ox: 0, oy: 0, bg: { type: 'white', color: '#ffffff' } }] }); assert.deepEqual(e.page.objects, [])
  const snap = e.snapshot(); assert.equal(snap.sel, null); assert.equal(snap.editing, null)
}
{ // snapshot for React: selection info and editor geometry
  const e = mk(); e.setShapeKind('rect'); e.beginShape(100, 100); e.shapeTo(200, 180); e.endShape()
  let s = e.snapshot(); assert.equal(s.sel.n, 1); assert.equal(s.sel.one.type, 'shape'); assert.deepEqual(s.sel.rect, { x: 100, y: 100, w: 100, h: 80 }); assert.equal(s.sel.busy, false)
  e.addSticky(); s = e.snapshot(); assert.equal(s.editing.type, 'sticky'); assert.ok(s.editing.fontPx > 0 && s.editing.w > 0); e.endEdit()
}
console.log('objects engine ok')

// --- the same flows through the real pointer handler (pen and finger events) ---
{
  const { attachPointer } = await import('./src/input/pointer.js')
  const L = {}, canvas = { addEventListener: (n, f) => (L[n] = f), removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {} }
  const e = mk(); attachPointer(canvas, e, () => 'erase')
  const ev = (type, x, y, o = {}) => ({ type, pointerType: 'pen', pointerId: 7, buttons: type === 'pointerup' ? 0 : 1, button: type === 'pointerdown' ? 0 : -1, pressure: type === 'pointerup' ? 0 : 0.5, clientX: x, clientY: y, preventDefault() {}, getCoalescedEvents: () => [], ...o })
  const drag = (pts, o) => { L.pointerdown(ev('pointerdown', ...pts[0], o)); for (const p of pts.slice(1)) L.pointermove(ev('pointermove', ...p, o)); L.pointerup(ev('pointerup', ...pts.at(-1), o)) }
  // shape tool: drag out an ellipse with the pen
  e.setShapeKind('ellipse'); drag([[100, 100], [150, 140], [260, 220]])
  assert.equal(e.page.objects.length, 1); let o = e.page.objects[0]; assert.deepEqual([o.shape, o.x, o.y, o.w, o.h], ['ellipse', 100, 100, 160, 120]); assert.equal(e.tool, 'select')
  // select tool: drag the selected shape by its outline; one undo step
  e.clearSelection(); const n = e.page.undo.length; drag([[100, 160], [110, 165], [180, 200]])
  o = e.page.objects[0]; assert.ok(Math.abs(o.x - 180) < 1e-6 && Math.abs(o.y - 140) < 1e-6, `moved to ${o.x},${o.y}`); assert.equal(e.page.undo.length, n + 1)
  // lasso with the pen on empty space, then a finger tap on empty space clears it
  drag([[20, 20], [400, 20], [400, 400], [20, 400], [24, 24]]); assert.equal(e.sel.size, 1)
  const touch = (type, x, y) => ({ type, pointerType: 'touch', pointerId: 3, buttons: 1, button: 0, pressure: 0.5, clientX: x, clientY: y, preventDefault() {}, getCoalescedEvents: () => [] })
  L.pointerdown(touch('pointerdown', 700, 500)); L.pointerup(touch('pointerup', 700, 500)); assert.equal(e.sel.size, 0)
  // sticky note: double tap with the pen edits it, a tap elsewhere ends the edit
  e.addSticky(); e.setEditText('abc'); e.endEdit(); e.clearSelection(); const [cx, cy] = [400, 300]
  const tap = (x, y) => { L.pointerdown(ev('pointerdown', x, y)); L.pointerup(ev('pointerup', x, y)) }
  tap(cx, cy); assert.equal(e.editing, null); assert.ok(e.sel.size === 1); tap(cx, cy); assert.ok(e.editing, 'double tap starts editing')
  L.pointerdown(ev('pointerdown', 700, 100)); L.pointerup(ev('pointerup', 700, 100)); assert.equal(e.editing, null)
  // finger double tap edits too (Select tool only); with the pen tool a finger never selects
  e.clearSelection(); e.lastTap = null
  L.pointerdown(touch('pointerdown', cx, cy)); L.pointerup(touch('pointerup', cx, cy)); assert.equal(e.sel.size, 1)
  L.pointerdown(touch('pointerdown', cx, cy)); L.pointerup(touch('pointerup', cx, cy)); assert.ok(e.editing, 'finger double tap edits'); e.endEdit()
  e.setTool('pen'); L.pointerdown(touch('pointerdown', cx, cy)); L.pointerup(touch('pointerup', cx, cy)); assert.equal(e.sel.size, 0)
  // pen tool still draws, and drawing a shape-like stroke without holding still stays ink
  const sc = e.page.strokes.length; drag([[10, 500], [60, 520], [120, 500]]); assert.equal(e.page.strokes.length, sc + 1)
  await tick(); e.snapshot()
}
console.log('objects pointer ok')
