// Creating and editing objects, mixed into Engine.prototype: sticky notes, text boxes, stickers, images, shapes (tool + snapping),
// text editing, style changes, ordering, lock, delete, duplicate and copy/paste. Every change is one undoable 'doc' action.
import * as H from './history.js'
import { newId } from './ids.js'
import { recognize } from './snap.js'
import { mkShape, mkSticky, mkText, mkSticker, mkImage, layoutText, fontStr, stickyFont, stickyPad, STICKY_COLORS, LINE } from './objects.js'
import { putBlob, getBlob } from '../store/db.js'

const PROPS = { shape: ['stroke', 'strokeWidth', 'fill', 'fillOpacity'], text: ['fontSize', 'color', 'align'], sticky: ['color'], sticker: ['color'], image: [] }
const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)))

export const objectMethods = {
  viewCenter() { return this.toWorld(this.w / 2, this.h / 2) },
  fitObject(o) { // text boxes grow in height to fit their wrapped text
    if (o.type !== 'text') return o
    const n = Math.max(1, layoutText(this.mctx, o.text, o.w, fontStr(o.fontSize)).length)
    return { ...o, h: n * o.fontSize * LINE }
  },
  addObject(o, { edit = false } = {}) { // new objects are selected, and the tool switches to Select so they can be adjusted at once
    if (this.editing) this.endEdit()
    const before = this.docSnap()
    this.page.objects = [...this.page.objects, o]
    this.sel = new Set([o.id]); this.tool = 'select'; this.ping = (this.ping || 0) + 1
    if (edit) { this.editing = o.id; this.editBefore = before; this.invalidate(); this.emit() } // creation + typing = one undo step
    else this.commitDoc(before)
    return o
  },
  addSticky(color = STICKY_COLORS[0]) { const [cx, cy] = this.viewCenter(); return this.addObject(mkSticky(cx, cy, 210 / this.page.scale, color), { edit: true }) },
  addText() { const [cx, cy] = this.viewCenter(), k = this.page.scale, w = 300 / k, fs = 28 / k; return this.addObject(mkText(cx - w / 2, cy - fs, w, fs, this.color), { edit: true }) },
  addSticker(item) {
    const [cx, cy] = this.viewCenter(), o = mkSticker(cx, cy, 120 / this.page.scale, item); if (item.t) o.color = this.color
    return this.addObject(o)
  },
  async addImage(file) { // from the gallery or the clipboard; big photos are shrunk so the board stays light
    let bmp; try { bmp = await createImageBitmap(file) } catch { return false }
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); let blob = file, img = bmp
    if (k < 1 || !/^image\/(png|jpeg|webp)$/.test(file.type || '')) {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k))
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
      blob = (await new Promise((r) => c.toBlob(r, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9))) || file
      img = await createImageBitmap(c)
    }
    const id = newId(); this.images.set(id, img)
    try { await putBlob(id, blob) } catch (e) { console.warn('image not saved', e) }
    const sc = this.page.scale, f = Math.min(1, 420 / Math.max(img.width, img.height)), ww = (img.width * f) / sc, hh = (img.height * f) / sc, [cx, cy] = this.viewCenter()
    this.addObject(mkImage(cx - ww / 2, cy - hh / 2, ww, hh, id)); return true
  },
  async loadImages() { // decode every image the pages mention (restore, export); a missing blob shows a placeholder
    const need = new Set()
    for (const p of this.pages) for (const o of p.objects) if (o.type === 'image' && !this.images.has(o.blobId)) need.add(o.blobId)
    for (const id of need) {
      try { const b = await getBlob(id); this.images.set(id, b ? await createImageBitmap(b) : null) } catch { this.images.set(id, null) }
      for (const p of this.pages) if (p.objects.some((o) => o.blobId === id)) p.rev++ // thumbnails refresh
      this.dirty = true; this.schedule(); this.emitSoon()
    }
  },
  ensureImages() { return this.loadImages() },

  // --- text editing: a textarea (React) sits on top of the object while editing; the canvas hides that object's own text ---
  beginEdit(id) {
    const o = this.page.objects.find((x) => x.id === id)
    if (!o || o.locked || (o.type !== 'text' && o.type !== 'sticky')) return false
    if (this.editing === id) return true
    if (this.editing) this.endEdit()
    if (!this.editBefore) this.editBefore = this.docSnap()
    this.editing = id; this.sel = new Set([id]); this.dirty = true; this.schedule(); this.emit(); return true
  },
  setEditText(text) {
    const p = this.page, i = p.objects.findIndex((o) => o.id === this.editing); if (i < 0) return
    p.objects[i] = this.fitObject({ ...p.objects[i], text }); this.invalidate(); this.emit()
  },
  endEdit() {
    const id = this.editing; if (!id) return
    const before = this.editBefore; this.editing = null; this.editBefore = null
    const p = this.page, o = p.objects.find((x) => x.id === id)
    if (o && o.type === 'text' && !o.text.trim()) { p.objects = p.objects.filter((x) => x.id !== id); this.sel.delete(id) } // empty text box: nothing to keep
    if (before) this.commitDoc(before)
    this.dirty = true; this.invalidate(); this.emit()
  },

  // --- style of the selection ---
  setProps(patch, key) { // key coalesces a slider drag into one undo step
    const k = this.page.scale, pt = { ...patch }
    if ('strokeWidthPx' in pt) { pt.strokeWidth = pt.strokeWidthPx / k; delete pt.strokeWidthPx }
    if ('fontSizePx' in pt) { pt.fontSize = pt.fontSizePx / k; delete pt.fontSizePx }
    const before = this.docSnap(), p = this.page; let changed = false
    p.objects = p.objects.map((o) => {
      if (!this.sel.has(o.id) || o.locked) return o
      const n = { ...o }; for (const f of PROPS[o.type] || []) if (f in pt) n[f] = pt[f]
      const out = this.fitObject(n); if (Object.keys(pt).some((f) => out[f] !== o[f])) changed = true; return out
    })
    if ('stroke' in pt) p.strokes = p.strokes.map((s) => (this.sel.has(s.id) && s.color !== pt.stroke ? ((changed = true), { ...s, color: pt.stroke }) : s))
    if (!changed) return
    const last = p.undo[p.undo.length - 1], now = performance.now()
    if (key && last && last.type === 'doc' && last.key === key && now - last.t < 1200) { last.after = this.docSnap(); last.t = now; this.invalidate(); this.emit(); return }
    H.push(p, { type: 'doc', before, after: this.docSnap(), key, t: now }); this.invalidate(); this.emit()
  },
  bringToFront() { this.reorder(true) },
  sendToBack() { this.reorder(false) },
  reorder(front) {
    const before = this.docSnap(), p = this.page, mine = p.objects.filter((o) => this.sel.has(o.id)), rest = p.objects.filter((o) => !this.sel.has(o.id))
    if (!mine.length) return; p.objects = front ? [...rest, ...mine] : [...mine, ...rest]; this.commitDoc(before)
  },
  toggleLock() {
    const before = this.docSnap(), p = this.page, mine = p.objects.filter((o) => this.sel.has(o.id)); if (!mine.length) return
    const lock = !mine.every((o) => o.locked)
    p.objects = p.objects.map((o) => (this.sel.has(o.id) ? { ...o, locked: lock } : o)); this.commitDoc(before)
  },
  deleteSelected() {
    if (!this.sel.size) return
    const before = this.docSnap(), p = this.page
    p.strokes = p.strokes.filter((s) => !this.sel.has(s.id)); p.objects = p.objects.filter((o) => !(this.sel.has(o.id) && !o.locked)) // locked objects survive a delete
    this.pruneSel(); if (!this.commitDoc(before)) this.emit()
  },
  cloneSel(dx, dy) { // copies of the selection with fresh ids, shifted by (dx, dy)
    const { ss, os } = this.selectedItems()
    return {
      strokes: ss.map((s) => ({ ...s, id: newId(), pts: s.pts.map((q) => ({ x: q.x + dx, y: q.y + dy, p: q.p })) })),
      objects: os.map((o) => ({ ...o, id: newId(), x: o.x + dx, y: o.y + dy, locked: false })),
    }
  },
  addClones(c) {
    const before = this.docSnap(), p = this.page
    p.strokes = [...p.strokes, ...c.strokes]; p.objects = [...p.objects, ...c.objects]
    this.sel = new Set([...c.strokes, ...c.objects].map((x) => x.id)); this.tool = 'select'; this.ping = (this.ping || 0) + 1
    this.commitDoc(before)
  },
  duplicateSelected() { if (!this.sel.size) return; const o = 24 / this.page.scale; this.addClones(this.cloneSel(o, o)) },
  copySelected() { if (!this.sel.size) return false; const { ss, os } = this.selectedItems(); this.clip = clone({ strokes: ss, objects: os }); this.pasteN = 0; this.emit(); return true },
  hasClip() { return !!this.clip },
  paste() { // works across pages: everything is in world units, and images are shared by id
    if (!this.clip) return false
    this.pasteN = (this.pasteN || 0) + 1; const o = (24 * this.pasteN) / this.page.scale, c = clone(this.clip)
    this.addClones({
      strokes: c.strokes.map((s) => ({ ...s, id: newId(), pts: s.pts.map((q) => ({ x: q.x + o, y: q.y + o, p: q.p })) })),
      objects: c.objects.map((x) => ({ ...x, id: newId(), x: x.x + o, y: x.y + o, locked: false })),
    }); return true
  },

  // --- shape tool: drag out a shape; a plain tap drops a default-sized one ---
  shapeStyle() { return { stroke: this.color, strokeWidth: Math.max(1, this.width) / this.page.scale, fill: this.shapeFill, fillOpacity: this.shapeFillOpacity } },
  setShapeKind(k) { this.shapeKind = k; this.setTool('shape') },
  setShapeFill(fill, opacity) { this.shapeFill = fill; if (opacity != null) this.shapeFillOpacity = opacity; this.emit() },
  beginShape(x, y) { const [wx, wy] = this.toWorld(x, y); this.shapeDraft = { x0: wx, y0: wy, x1: wx, y1: wy }; this.schedule() },
  shapeTo(x, y) { const d = this.shapeDraft; if (!d) return; [d.x1, d.y1] = this.toWorld(x, y); this.schedule() },
  cancelShape() { this.shapeDraft = null; this.schedule() },
  shapeFromDraft(d) { // a line/arrow runs from where the pen went down to where it is now; flips remember the direction
    return mkShape(this.shapeKind, Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0), { flipX: d.x1 < d.x0, flipY: d.y1 < d.y0, ...this.shapeStyle() })
  },
  draftShape() { return this.shapeDraft ? this.shapeFromDraft(this.shapeDraft) : null },
  endShape() {
    const d = this.shapeDraft; this.shapeDraft = null; if (!d) return
    const k = this.page.scale, line = this.shapeKind === 'line' || this.shapeKind === 'arrow'
    let o = this.shapeFromDraft(d)
    if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) * k < 8) { // a tap: default size centred on the tap
      const w = (line ? 170 : 150) / k, h = (line ? 0 : 110) / k
      o = mkShape(this.shapeKind, d.x0 - w / 2, d.y0 - h / 2, w, h, this.shapeStyle())
    }
    this.addObject(o)
  },

  // --- shape snapping: hold the pen still at the end of a stroke and it becomes the clean shape (undo gives the stroke back) ---
  setSnap(on) { this.snap = !!on; this.emit() },
  trySnap() {
    const s = this.live; if (!s || this.snapped || !this.snap || s.kind !== 'ink') return
    const r = recognize(s.pts); if (!r) return
    const st = { stroke: s.color, strokeWidth: s.width }
    if (r.kind === 'line') this.snapped = mkShape('line', Math.min(r.x1, r.x2), Math.min(r.y1, r.y2), Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1), { flipX: r.x1 > r.x2, flipY: r.y1 > r.y2, ...st })
    else if (r.kind === 'ellipse') this.snapped = mkShape('ellipse', r.cx - r.rx, r.cy - r.ry, r.rx * 2, r.ry * 2, st)
    else this.snapped = mkShape('rect', r.x, r.y, r.w, r.h, st)
    this.schedule()
  },

  // --- what React shows: the floating action bar and the text editor overlay ---
  selInfo() {
    const g = this.selGeom(); if (!g) return null
    const { ss, os } = this.selectedItems(), k = this.page.scale, xs = g.sc.map((c) => c[0]), ys = g.sc.map((c) => c[1])
    const one = os.length === 1 && !ss.length ? os[0] : null
    return {
      n: ss.length + os.length, types: [...new Set([...(ss.length ? ['stroke'] : []), ...os.map((o) => o.type)])],
      locked: os.some((o) => o.locked), busy: !!this.tf || !!this.lasso,
      rect: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) },
      strokeColor: ss.length ? ss[0].color : null,
      one: one && { type: one.type, shape: one.shape, stroke: one.stroke, strokeWidthPx: Math.round((one.strokeWidth || 0) * k), fill: one.fill, fillOpacity: one.fillOpacity,
        fontSizePx: Math.round((one.fontSize || 0) * k), color: one.color, align: one.align, sym: one.sym },
    }
  },
  editInfo() {
    const o = this.page.objects.find((x) => x.id === this.editing); if (!o) return null
    const k = this.page.scale, [sx, sy] = this.toScreen(o.x, o.y), sticky = o.type === 'sticky'
    return { id: o.id, type: o.type, text: o.text, x: sx, y: sy, w: o.w * k, h: o.h * k, rot: o.rot || 0,
      fontPx: (sticky ? stickyFont(o) : o.fontSize) * k, padPx: (sticky ? stickyPad(o) : 0) * k,
      color: sticky ? '#1f2937' : o.color, align: sticky ? 'left' : o.align, bg: sticky ? o.color : null }
  },
}
