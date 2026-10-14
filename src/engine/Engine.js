import { getStroke } from 'perfect-freehand'
import { eraseAt, touches } from './eraser.js'
import * as H from './history.js'
import { newId } from './ids.js'
import { drawBackground, isDark, lum } from './background.js'
import { drawObject } from './objects.js'
import { selectionMethods } from './selection.js'
import { objectMethods } from './objectOps.js'

export const PALETTE = ['#0f172a', '#f8fafc', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea']
export const createPage = () => ({ id: newId(), strokes: [], objects: [], undo: [], redo: [], scale: 1, ox: 0, oy: 0, rev: 0, bg: { type: 'white', color: '#ffffff' } })

function buildPath(s) {
  const o = getStroke(s.pts.map((p) => [p.x, p.y, p.p]), {
    size: s.width, thinning: s.kind === 'hl' ? 0 : 0.6, smoothing: 0.5, streamline: 0.5,
    simulatePressure: false, last: true,
  })
  const path = new Path2D()
  if (o.length < 2) return path
  path.moveTo(o[0][0], o[0][1])
  for (let i = 1; i < o.length; i++) {
    const [x0, y0] = o[i], [x1, y1] = o[(i + 1) % o.length]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.closePath()
  return path
}

export class Engine {
  constructor(canvas, onChange = () => {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d')
    this.cache = document.createElement('canvas'); this.cctx = this.cache.getContext('2d')
    this.onChange = onChange
    this.pages = [createPage()]; this.index = 0
    this.tool = 'pen'; this.lastDraw = 'pen'; this.override = null; this.holdPan = false
    this.color = PALETTE[0]; this.width = 4; this.opacity = 1; this.eraserRadius = 18; this.eraserMode = 'precise'
    this.live = null; this.cursor = null; this.trail = []
    this.dirty = true; this.raf = 0; this.dpr = 1
    this.paths = new WeakMap()
    // object layer (Stage 6)
    this.sel = new Set(); this.tf = null; this.lasso = null; this.selDown = null; this.lastTap = null
    this.editing = null; this.editBefore = null; this.shapeDraft = null; this.snapped = null; this.clip = null
    this.shapeKind = 'rect'; this.shapeFill = null; this.shapeFillOpacity = 0.35; this.snap = false
    this.images = new Map(); this.mctx = document.createElement('canvas').getContext('2d')
  }
  get page() { return this.pages[this.index] }
  get activeEraserMode() { return this.override === 'eraser' ? 'precise' : this.eraserMode } // barrel-button erase is always precise
  get effectiveTool() { return this.override || this.tool }

  // finished strokes live on an offscreen cache; only the live stroke + cursor redraw per frame
  resize() {
    const c = this.canvas
    this.dpr = window.devicePixelRatio || 1
    this.w = c.clientWidth; this.h = c.clientHeight
    for (const el of [c, this.cache]) { el.width = Math.round(this.w * this.dpr); el.height = Math.round(this.h * this.dpr) }
    this.dirty = true; this.schedule()
  }
  schedule() { if (!this.raf) this.raf = requestAnimationFrame(() => this.draw()) }
  world(c) { const k = this.dpr * this.page.scale; c.setTransform(k, 0, 0, k, this.dpr * this.page.ox, this.dpr * this.page.oy) }
  fill(c, s, path) { c.globalAlpha = s.opacity; c.fillStyle = s.color; c.fill(path) }
  draw() {
    this.raf = 0
    const { ctx, cctx, cache, canvas } = this
    if (this.dirty) {
      cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.clearRect(0, 0, cache.width, cache.height)
      this.world(cctx)
      this.drawContent(cctx, this.page); this.dirty = false
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height)
    { const p = this.page, x0 = -p.ox / p.scale, y0 = -p.oy / p.scale
      this.world(ctx); drawBackground(ctx, p.bg, { x0, y0, x1: x0 + this.w / p.scale, y1: y0 + this.h / p.scale }, p.scale)
      ctx.setTransform(1, 0, 0, 1, 0, 0) }
    ctx.drawImage(cache, 0, 0)
    if (this.snapped) { this.world(ctx); drawObject(ctx, this.snapped, { images: this.images }) } // the clean shape replaces the wobbly stroke while the pen holds still
    else if (this.live) { this.world(ctx); this.fill(ctx, this.live, buildPath(this.live)); ctx.globalAlpha = 1 }
    const now = performance.now(); this.trail = this.trail.filter((p) => now - p.t < 900)
    if (this.trail.length) { // laser pointer: fading trail, redrawn each frame until it has faded
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.lineCap = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = '#ef4444'
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i]
        ctx.globalAlpha = Math.max(0, 1 - (now - b.t) / 900); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
      ctx.globalAlpha = 1; this.schedule()
    }
    if (this.effectiveTool === 'eraser' && this.cursor) { // radius is in screen px, so draw in screen space
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.beginPath(); ctx.arc(this.cursor.x, this.cursor.y, this.eraserRadius, 0, Math.PI * 2)
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.setLineDash(this.activeEraserMode === 'stroke' ? [6, 4] : []); ctx.stroke(); ctx.setLineDash([])
    }
    this.drawOverlay(ctx) // shape being dragged, lasso, selection box + handles
  }
  invalidate() { this.page.rev++; this.dirty = true; this.schedule() } // rev lets thumbnails know when to refresh

  // state for React: emitted on discrete events only, never per pointer move
  snapshot() {
    return { ping: this.ping, index: this.index, count: this.pages.length, bg: this.page.bg, pages: this.pages.map((p) => ({ id: p.id, thumb: this.thumbOf(p) })), tool: this.effectiveTool, baseTool: this.tool, zoom: Math.round(this.page.scale * 100),
      canUndo: this.page.undo.length > 0, canRedo: this.page.redo.length > 0,
      color: this.color, width: this.width, opacity: this.opacity, drawTool: this.lastDraw, eraserRadius: this.eraserRadius, eraserMode: this.eraserMode, holdPan: this.holdPan,
      sel: this.sel.size ? this.selInfo() : null, editing: this.editing ? this.editInfo() : null, shapeKind: this.shapeKind, shapeFill: this.shapeFill, shapeFillOpacity: this.shapeFillOpacity, snap: this.snap, hasClip: !!this.clip, hint: this.hint || null }
  }
  emit() { this.onChange(this.snapshot()); this.save?.schedule() }
  emitSoon() { clearTimeout(this.t); this.t = setTimeout(() => this.emit(), 80) }
  toWorld(x, y) { const p = this.page; return [(x - p.ox) / p.scale, (y - p.oy) / p.scale] }

  setTool(t) {
    if (this.editing) this.endEdit()
    if (t !== 'select') { this.sel = new Set(); this.tf = this.lasso = this.selDown = null } // the selection only exists while the Select tool is active
    this.ping = (this.ping || 0) + 1; this.tool = t; if (t === 'pen' || t === 'highlighter') this.lastDraw = t; this.emit() }
  toggleEraser() { this.setTool(this.tool === 'eraser' ? this.lastDraw : 'eraser') }
  toggleSelect() { this.setTool(this.tool === 'select' ? this.lastDraw : 'select') }
  toggleLaser() { this.setTool(this.tool === 'laser' ? this.lastDraw : 'laser') }
  setHint(text, ms = 0) {
    clearTimeout(this.hintT); this.hint = text; this.emit()
    if (ms) this.hintT = setTimeout(() => { this.hint = null; this.emit() }, ms)
  }
  setColor(c) { this.color = c; if (this.tool === 'eraser') this.setTool(this.lastDraw); else this.emit() }
  cycleColor() { this.setColor(PALETTE[(PALETTE.indexOf(this.color) + 1) % PALETTE.length]) }
  setWidth(w) { this.width = w; this.emit() }
  applyStyle(st = {}) { // restore saved pen style, validating every value
    if (typeof st.color === 'string' && /^#[0-9a-f]{6}$/i.test(st.color)) this.color = st.color
    if (st.width >= 1 && st.width <= 24) this.width = st.width
    if (st.opacity >= 0.1 && st.opacity <= 1) this.opacity = st.opacity
    if (st.drawTool === 'pen' || st.drawTool === 'highlighter') { this.lastDraw = st.drawTool; this.tool = st.drawTool }
    if (st.eraserRadius >= 6 && st.eraserRadius <= 80) this.eraserRadius = st.eraserRadius
    if (st.eraserMode === 'precise' || st.eraserMode === 'stroke') this.eraserMode = st.eraserMode
    if (typeof st.snap === 'boolean') this.snap = st.snap
    if (['line', 'arrow', 'rect', 'round', 'ellipse', 'triangle', 'diamond', 'star'].includes(st.shapeKind)) this.shapeKind = st.shapeKind
    if (st.shapeFill === null || (typeof st.shapeFill === 'string' && /^#[0-9a-f]{6}$/i.test(st.shapeFill))) this.shapeFill = st.shapeFill
    if (st.shapeFillOpacity >= 0.05 && st.shapeFillOpacity <= 1) this.shapeFillOpacity = st.shapeFillOpacity
  }
  setEraserMode(m) { this.eraserMode = m; this.schedule(); this.emit() }
  clearPage() { // undoable, so no confirm dialog needed
    const pg = this.page; if (!pg.strokes.length && !pg.objects.length) return
    if (this.eraseList) this.endErase()
    this.endEdit(); this.live = null; this.snapped = null
    const before = this.docSnap(); pg.strokes = []; pg.objects = []; this.sel = new Set()
    H.push(pg, { type: 'doc', before, after: { strokes: [], objects: [] } })
    this.invalidate(); this.emit(); this.save?.flush()
  }
  setOpacity(o) { this.opacity = o; this.emit() }
  laserTo(x, y) { this.trail.push({ x, y, t: performance.now() }); this.schedule() } // screen space, never saved
  adjustEraser(d) { this.eraserRadius = Math.max(6, Math.min(80, this.eraserRadius + d)); this.schedule(); this.emit() }
  setCursor(x, y) { this.cursor = { x, y }; if (this.effectiveTool === 'eraser') this.schedule() }
  hideCursor() { this.cursor = null; this.schedule() }

  beginStroke(x, y, p) {
    this.snapped = null; this.snapAnchor = null; clearTimeout(this.snapT)
    const [wx, wy] = this.toWorld(x, y), hl = this.tool === 'highlighter'
    // width stored in world units, divided by scale so the pen looks the same on screen at any zoom when drawn
    this.live = { id: newId(), kind: hl ? 'hl' : 'ink', color: this.color,
      width: (hl ? this.width * 3 : this.width) / this.page.scale, opacity: hl ? 0.35 : this.opacity, pts: [{ x: wx, y: wy, p }] }
    this.schedule()
  }
  extendStroke(x, y, p) {
    if (!this.live || this.snapped) return // once snapped, the shape is fixed until the pen lifts
    const [wx, wy] = this.toWorld(x, y); this.live.pts.push({ x: wx, y: wy, p })
    if (this.snap && this.live.kind === 'ink') { // (re)start the 600 ms hold timer whenever the pen really moves (more than 3 px; jitter is ignored)
      const a = this.snapAnchor
      if (!a || Math.hypot(x - a[0], y - a[1]) > 3) { this.snapAnchor = [x, y]; clearTimeout(this.snapT); this.snapT = setTimeout(() => this.trySnap(), 600) }
    }
    this.schedule()
  }
  endStroke() {
    clearTimeout(this.snapT)
    const s = this.live, sn = this.snapped; this.live = null; this.snapped = null
    if (!s) return
    this.page.strokes.push(s); H.push(this.page, { type: 'add', s })
    if (sn) { // two history steps: undo first returns the original stroke, undo again removes it
      this.page.strokes = this.page.strokes.filter((x) => x.id !== s.id); this.page.objects = [...this.page.objects, sn]; H.push(this.page, { type: 'snap', s, o: sn })
    }
    this.invalidate(); this.emit()
  }
  cancelStroke() { clearTimeout(this.snapT); this.live = null; this.snapped = null; this.schedule() }

  // eraser: one drag = one undoable action
  beginErase() { this.eraseList = []; this.owner = new Map(); this.lastE = null; this.eraseMode = this.activeEraserMode }
  eraseTo(x, y) {
    if (!this.eraseList) return // page was switched mid-drag
    const pts = []
    if (this.lastE) { // interpolate so fast pen moves don't skip over strokes
      const d = Math.hypot(x - this.lastE[0], y - this.lastE[1]), n = Math.max(1, Math.ceil(d / (this.eraserRadius / 2)))
      for (let i = 1; i <= n; i++) pts.push([this.lastE[0] + ((x - this.lastE[0]) * i) / n, this.lastE[1] + ((y - this.lastE[1]) * i) / n])
    } else pts.push([x, y])
    this.lastE = [x, y]
    for (const [sx, sy] of pts) this.eraseWorld(...this.toWorld(sx, sy), this.eraserRadius / this.page.scale)
  }
  eraseWorld(wx, wy, r) {
    const out = []; let changed = false
    for (const s of this.page.strokes) {
      // precise: keep the untouched runs. stroke: any touch removes the whole stroke (counted as a fully erased stroke, so undo already works)
      const pieces = this.eraseMode === 'stroke' ? (touches(s, wx, wy, r + s.width / 2) ? [] : null) : eraseAt(s, wx, wy, r)
      if (!pieces) { out.push(s); continue }
      changed = true
      let e = this.owner.get(s.id)
      if (e) e.pieces = e.pieces.flatMap((q) => (q.id === s.id ? pieces : [q])) // piece from this same drag: re-split
      else { e = { old: s, pieces, at: out.length }; this.eraseList.push(e) }
      for (const q of pieces) this.owner.set(q.id, e)
      out.push(...pieces)
    }
    if (changed) { this.page.strokes = out; this.invalidate() }
  }
  endErase() {
    if (this.eraseList?.length) { H.push(this.page, { type: 'erase', list: this.eraseList }); this.emit() }
    this.eraseList = null
  }

  drawStrokes(c, strokes, only) {
    for (const pass of only ? [only] : ['hl', 'ink']) // highlighter pass first so ink stays readable on top
      for (const s of strokes) if ((s.kind === 'hl') === (pass === 'hl')) {
        let p = this.paths.get(s); if (!p) this.paths.set(s, (p = buildPath(s)))
        this.fill(c, s, p)
      }
    c.globalAlpha = 1
  }
  // layer order: highlighter, then objects (shapes, notes, text, stickers, images in their own z-order), then ink on top,
  // so writing stays readable over everything and you can write on a sticky note
  drawContent(c, page) {
    this.drawStrokes(c, page.strokes, 'hl')
    const env = { images: this.images, hideText: this.editing }
    for (const o of page.objects) drawObject(c, o, env)
    this.drawStrokes(c, page.strokes, 'ink')
  }
  thumbOf(p) { // what the teacher last saw on this page, cached until the page changes
    if (!this.w) return ''
    if (p._t && p._tr === p.rev) return p._t
    const W = 176, H = Math.round((W * this.h) / this.w), k = W / this.w
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const x = c.getContext('2d'), x0 = -p.ox / p.scale, y0 = -p.oy / p.scale
    x.setTransform(k * p.scale, 0, 0, k * p.scale, k * p.ox, k * p.oy)
    drawBackground(x, p.bg, { x0, y0, x1: x0 + this.w / p.scale, y1: y0 + this.h / p.scale }, k * p.scale)
    this.drawContent(x, p)
    p._tr = p.rev; return (p._t = c.toDataURL())
  }
  adaptInk() { // keep ink visible: near-black ink on dark boards flips to white, near-white ink on light boards to dark
    const dark = isDark(this.page.bg), l = lum(this.color)
    if (dark && l < 0.35) this.color = '#f8fafc'; else if (!dark && l > 0.75) this.color = '#0f172a'
  }
  setBackground(bg) { this.page.bg = bg; this.adaptInk(); this.invalidate(); this.emit() }
  leavePage() {
    if (this.eraseList) this.endErase()
    this.endEdit(); clearTimeout(this.snapT)
    this.live = null; this.snapped = null; this.shapeDraft = null; this.sel = new Set(); this.tf = this.lasso = this.selDown = null
  }
  goPage(i) {
    if (i < 0 || i >= this.pages.length || i === this.index) return
    this.leavePage(); this.index = i; this.adaptInk(); this.dirty = true; this.schedule(); this.emit(); this.save?.flush()
  }
  addPage() { const pg = createPage(); pg.bg = { ...this.page.bg }; this.pages.splice(this.index + 1, 0, pg); this.goPage(this.index + 1) }
  duplicatePage() {
    const o = this.page, pg = { ...createPage(), scale: o.scale, ox: o.ox, oy: o.oy, bg: { ...o.bg }, strokes: o.strokes.map((s) => ({ ...s, id: newId() })), objects: o.objects.map((x) => ({ ...x, id: newId() })) }
    this.pages.splice(this.index + 1, 0, pg); this.goPage(this.index + 1)
  }
  nextPage() { this.index === this.pages.length - 1 ? this.addPage() : this.goPage(this.index + 1) }
  prevPage() { this.goPage(this.index - 1) }
  deletePage() {
    this.leavePage()
    if (this.pages.length === 1) { const bg = this.page.bg; this.pages = [createPage()]; this.page.bg = { ...bg } }
    else { this.pages.splice(this.index, 1); this.index = Math.min(this.index, this.pages.length - 1) }
    this.adaptInk(); this.dirty = true; this.schedule(); this.emit(); this.save?.flush()
  }
  restore({ order, index, pages }) { // rebuild pages from storage; undo history is intentionally not restored
    const byId = new Map(pages.map((p) => [p.id, p]))
    const list = order.map((id) => byId.get(id)).filter(Boolean).map((r) => ({ ...createPage(), ...r, undo: [], redo: [], rev: 0, _sv: 0 }))
    if (!list.length) return
    this.pages = list; this.index = Math.min(index ?? 0, list.length - 1); this.dirty = true; this.schedule(); this.emit()
    this.loadImages() // decode inserted images from storage in the background
  }
  newBoard() { this.leavePage(); this.pages = [createPage()]; this.index = 0; this.dirty = true; this.schedule(); this.emit(); this.save?.flush() }
  undo() { this.endEdit(); if (H.undo(this.page)) { this.pruneSel(); this.invalidate(); this.emit(); this.save?.flush() } }
  redo() { this.endEdit(); if (H.redo(this.page)) { this.pruneSel(); this.invalidate(); this.emit(); this.save?.flush() } }
  panBy(dx, dy) { this.page.ox += dx; this.page.oy += dy; this.panned = true; this.invalidate() }
  zoomAt(f, cx, cy) {
    const p = this.page, ns = Math.max(0.2, Math.min(8, p.scale * f)), k = ns / p.scale
    p.ox = cx - (cx - p.ox) * k; p.oy = cy - (cy - p.oy) * k; p.scale = ns
    this.invalidate(); this.emitSoon()
  }
  zoomBy(f) { this.zoomAt(f, this.w / 2, this.h / 2) }
  destroy() { cancelAnimationFrame(this.raf); clearTimeout(this.t); clearTimeout(this.snapT); clearTimeout(this.hintT) }
}
Object.assign(Engine.prototype, selectionMethods, objectMethods) // selection/transform + object operations live in their own files
