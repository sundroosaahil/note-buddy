// Selection, lasso and transform, mixed into Engine.prototype (kept separate so Engine.js stays about drawing).
// The selection is a Set of ids that can hold freehand strokes and objects together. Each drag is ONE undoable 'doc' action:
// we snapshot before, edit the live arrays in place while dragging (cheap, no React), and push one history entry on release.
import * as H from './history.js'
import { cornersOf, hitObject, strokeHit, objectBounds, strokeBounds, unionBounds, strokeInPoly, objectInPoly, similarity,
  transformStroke, transformObject, resizeObject, snapAngle, pointInPoly } from './geom.js'
import { drawObject } from './objects.js'

const HANDLE = 22 // fingertip-friendly grab radius in screen px
const LOCK_ASPECT = new Set(['sticker', 'image', 'text'])
const same = (a, b) => a.strokes.length === b.strokes.length && a.objects.length === b.objects.length && a.strokes.every((s, i) => s === b.strokes[i]) && a.objects.every((o, i) => o === b.objects[i])

export const selectionMethods = {
  toScreen(x, y) { const p = this.page; return [x * p.scale + p.ox, y * p.scale + p.oy] },
  docSnap() { const p = this.page; return { strokes: p.strokes.slice(), objects: p.objects.slice() } }, // slices: snapshots must never change later
  commitDoc(before, extra = {}) { // one undo step for everything that changed since `before`
    const after = this.docSnap(); if (same(before, after)) return false
    H.push(this.page, { type: 'doc', before, after, ...extra }); this.invalidate(); this.emit(); return true
  },
  selectedItems() { const p = this.page; return { ss: p.strokes.filter((s) => this.sel.has(s.id)), os: p.objects.filter((o) => this.sel.has(o.id)) } },
  singleObj() { if (this.sel.size !== 1) return null; return this.page.objects.find((o) => this.sel.has(o.id)) || null },
  selLocked() { return this.page.objects.some((o) => this.sel.has(o.id) && o.locked) },
  selBounds() { const { ss, os } = this.selectedItems(); return unionBounds([...ss.map(strokeBounds), ...os.map(objectBounds)]) },
  pruneSel() { // after undo/redo/delete: forget ids that no longer exist
    const have = new Set([...this.page.strokes.map((s) => s.id), ...this.page.objects.map((o) => o.id)])
    for (const id of [...this.sel]) if (!have.has(id)) this.sel.delete(id)
  },
  clearSelection(emit = true) {
    if (!this.sel.size && !this.lasso) return
    this.sel = new Set(); this.tf = null; this.lasso = null; this.selDown = null; this.schedule(); if (emit) this.emit()
  },
  selectIds(ids) { this.sel = new Set(ids); this.schedule(); this.emit() },
  selectAll() {
    const p = this.page; this.tool = 'select'; this.ping = (this.ping || 0) + 1
    this.sel = new Set([...p.strokes.map((s) => s.id), ...p.objects.filter((o) => !o.locked).map((o) => o.id)]); this.schedule(); this.emit()
  },

  // where the selection box is on screen (the oriented box of one object, or the axis-aligned box of a group) + the handles
  selGeom() {
    if (!this.sel.size) return null
    const one = this.singleObj(); let cs
    if (one) cs = cornersOf(one)
    else { const b = this.selBounds(); if (!b) return null; cs = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]] }
    const sc = cs.map(([x, y]) => this.toScreen(x, y))
    const cx = sc.reduce((a, c) => a + c[0], 0) / 4, cy = sc.reduce((a, c) => a + c[1], 0) / 4
    const top = [(sc[0][0] + sc[1][0]) / 2, (sc[0][1] + sc[1][1]) / 2]
    let nx = top[0] - cx, ny = top[1] - cy; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L
    return { sc, c: [cx, cy], rot: [top[0] + nx * 36, top[1] + ny * 36], one, locked: this.selLocked() }
  },
  handleAt(g, x, y) {
    if (Math.hypot(x - g.rot[0], y - g.rot[1]) < HANDLE) return { t: 'rotate' }
    for (let i = 0; i < 4; i++) if (Math.hypot(x - g.sc[i][0], y - g.sc[i][1]) < HANDLE) return { t: 'corner', i }
    return pointInPoly(x, y, g.sc) ? { t: 'move' } : null
  },
  hitTest(x, y) { // topmost thing under a screen point: ink on top, then objects front to back, then highlighter
    const [wx, wy] = this.toWorld(x, y), tol = 8 / this.page.scale, { strokes, objects } = this.page
    for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i].kind !== 'hl' && strokeHit(strokes[i], wx, wy, tol * 0.6)) return { id: strokes[i].id }
    for (let i = objects.length - 1; i >= 0; i--) if (hitObject(objects[i], wx, wy, tol)) return { id: objects[i].id }
    for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i].kind === 'hl' && strokeHit(strokes[i], wx, wy, tol * 0.6)) return { id: strokes[i].id }
    return null
  },

  // --- pointer entry points (screen coordinates), called by input/pointer.js ---
  selectDown(x, y, add = false) {
    if (this.editing) this.endEdit()
    this.selDown = { x, y, moved: false, add }
    const g = this.selGeom()
    if (g && !g.locked) {
      const h = this.handleAt(g, x, y)
      if (h?.t === 'rotate') return this.beginTransform('rotate', x, y)
      if (h?.t === 'corner') return this.beginTransform('corner', x, y, h.i)
    }
    const hit = this.hitTest(x, y)
    if (hit) {
      if (add) { this.sel.has(hit.id) ? this.sel.delete(hit.id) : this.sel.add(hit.id); this.schedule(); this.emit(); return }
      if (!this.sel.has(hit.id)) { this.sel = new Set([hit.id]); this.emit() }
      if (!this.selLocked()) this.beginTransform('move', x, y)
      return
    }
    if (g && !g.locked && !add && pointInPoly(x, y, g.sc)) { this.beginTransform('move', x, y); return } // inside a group's box
    const [wx, wy] = this.toWorld(x, y); this.lasso = { pts: [[wx, wy]], add }; this.schedule()
  },
  selectMove(x, y) {
    const d = this.selDown; if (d && !d.moved && Math.hypot(x - d.x, y - d.y) > 4) d.moved = true
    if (this.tf) { this.updateTransform(x, y); return }
    if (this.lasso) {
      const [wx, wy] = this.toWorld(x, y), l = this.lasso.pts, last = l[l.length - 1]
      if (Math.hypot(wx - last[0], wy - last[1]) * this.page.scale > 3) { l.push([wx, wy]); this.schedule() }
    }
  },
  selectUp(x, y) {
    const d = this.selDown; this.selDown = null
    if (this.lasso) { this.finishLasso(); return }
    if (this.tf) { const moved = this.tf.moved; this.endTransform(); if (moved) return }
    if (d && !d.moved && !d.add) this.handleTap(x, y)
  },
  tapAt(x, y) { if (this.editing) this.endEdit(); this.handleTap(x, y) }, // a finger tap on a touch screen
  handleTap(x, y) {
    const hit = this.hitTest(x, y), now = performance.now()
    if (!hit) { this.lastTap = null; this.clearSelection(); return }
    if (this.sel.size !== 1 || !this.sel.has(hit.id)) { this.sel = new Set([hit.id]); this.schedule() }
    const lt = this.lastTap
    if (lt && lt.id === hit.id && now - lt.t < 450) { this.lastTap = null; if (this.beginEdit(hit.id)) return } // double tap edits text
    else this.lastTap = { id: hit.id, t: now }
    this.emit()
  },
  finishLasso() {
    const { pts, add } = this.lasso; this.lasso = null
    if (pts.length < 4) { if (!add) this.clearSelection(); this.schedule(); return } // a tap on empty space
    const ids = add ? new Set(this.sel) : new Set()
    for (const s of this.page.strokes) if (strokeInPoly(s, pts)) ids.add(s.id)
    for (const o of this.page.objects) if (!o.locked && objectInPoly(o, pts)) ids.add(o.id)
    this.sel = ids; this.schedule(); this.emit()
  },

  beginTransform(kind, x, y, handle = -1) {
    const [wx, wy] = this.toWorld(x, y), p = this.page, orig = new Map(), idx = new Map()
    p.strokes.forEach((s, i) => { if (this.sel.has(s.id)) { orig.set(s.id, s); idx.set(s.id, ['strokes', i]) } })
    p.objects.forEach((o, i) => { if (this.sel.has(o.id)) { orig.set(o.id, o); idx.set(o.id, ['objects', i]) } })
    const b = this.selBounds(); if (!b) return
    this.tf = { kind, handle, w0: [wx, wy], before: this.docSnap(), orig, idx, moved: false, box: b, c: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], one: this.singleObj() }
    this.emit() // hides the floating action bar while dragging
  },
  updateTransform(x, y) {
    const tf = this.tf, [wx, wy] = this.toWorld(x, y), p = this.page
    tf.moved = tf.moved || !!this.selDown?.moved
    if (!tf.moved) return
    let T, s = 1, th = 0, resized = null
    if (tf.kind === 'move') T = similarity({ tx: wx - tf.w0[0], ty: wy - tf.w0[1] })
    else if (tf.kind === 'rotate') {
      th = Math.atan2(wy - tf.c[1], wx - tf.c[0]) - Math.atan2(tf.w0[1] - tf.c[1], tf.w0[0] - tf.c[0])
      if (tf.one) th = snapAngle((tf.one.rot || 0) + th) - (tf.one.rot || 0)
      T = similarity({ px: tf.c[0], py: tf.c[1], th })
    } else if (tf.one) resized = resizeObject(tf.one, tf.handle, wx, wy, LOCK_ASPECT.has(tf.one.type))
    else { // group: uniform scale about the opposite corner of the group's box
      const b = tf.box, cs = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], pv = cs[(tf.handle + 2) % 4], st = cs[tf.handle]
      const vx = st[0] - pv[0], vy = st[1] - pv[1]
      s = Math.max(0.05, Math.min(20, ((wx - pv[0]) * vx + (wy - pv[1]) * vy) / (vx * vx + vy * vy || 1)))
      T = similarity({ px: pv[0], py: pv[1], s })
    }
    for (const [id, o] of tf.orig) {
      const [arr, i] = tf.idx.get(id)
      if (resized) p.objects[i] = this.fitObject(resized)
      else if (arr === 'strokes') p.strokes[i] = transformStroke(o, T, s)
      else { const n = transformObject(o, T, s, th); p.objects[i] = tf.kind === 'move' ? n : this.fitObject(n) }
    }
    this.invalidate()
  },
  endTransform() {
    const tf = this.tf; this.tf = null
    if (tf?.moved) this.commitDoc(tf.before)
    this.emit()
  },

  // what is drawn on top of the page while selecting: the lasso loop, a shape being dragged out, the selection box and handles
  drawOverlay(ctx) {
    const d = this.dpr, p = this.page
    const draft = this.draftShape?.()
    if (draft) { this.world(ctx); ctx.globalAlpha = 0.9; drawObject(ctx, draft, { images: this.images }); ctx.globalAlpha = 1 }
    ctx.setTransform(d, 0, 0, d, 0, 0)
    if (this.lasso && this.lasso.pts.length > 1) {
      ctx.beginPath(); this.lasso.pts.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy) })
      ctx.fillStyle = 'rgba(79,70,229,0.08)'; ctx.fill(); ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#4f46e5'; ctx.stroke(); ctx.setLineDash([])
    }
    const g = this.selGeom(); if (!g) return
    ctx.beginPath(); g.sc.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath()
    ctx.setLineDash(g.locked ? [2, 4] : [6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = g.locked ? '#94a3b8' : '#4f46e5'; ctx.stroke(); ctx.setLineDash([])
    if (g.locked) return
    const top = [(g.sc[0][0] + g.sc[1][0]) / 2, (g.sc[0][1] + g.sc[1][1]) / 2]
    ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(g.rot[0], g.rot[1]); ctx.strokeStyle = '#4f46e5'; ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 2
    for (const [x, y] of g.sc) { ctx.beginPath(); ctx.rect(x - 6, y - 6, 12, 12); ctx.fill(); ctx.stroke() }
    ctx.beginPath(); ctx.arc(g.rot[0], g.rot[1], 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  },
}
