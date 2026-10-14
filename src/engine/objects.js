// The object layer: factories and canvas drawing for shapes, sticky notes, text boxes, stickers and images.
// Every object is { id, type, x, y, w, h, rot, locked, ...type-specific }, in WORLD units, so zoom/pan/export treat them like ink.
import { newId } from './ids.js'
import { shapePolygon, lineEnds } from './geom.js'

export const STICKY_COLORS = ['#fef08a', '#fbcfe8', '#bbf7d0', '#bfdbfe', '#fed7aa']
export const SHAPES = ['line', 'arrow', 'rect', 'round', 'ellipse', 'triangle', 'diamond', 'star']
export const LINE = 1.3 // line height as a multiple of the font size
export const TEXT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const EMOJI_FONT = `"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",${TEXT_FONT}`
export const fontStr = (px) => `${px}px ${TEXT_FONT}`
export const stickyFont = (o) => Math.max(6, Math.min(o.w, o.h) * 0.1)
export const stickyPad = (o) => Math.min(o.w, o.h) * 0.08

const base = (type, x, y, w, h) => ({ id: newId(), type, x, y, w, h, rot: 0, locked: false })
export const mkShape = (kind, x, y, w, h, st = {}) => ({ ...base('shape', x, y, w, h), shape: kind, flipX: false, flipY: false, stroke: '#0f172a', strokeWidth: 3, fill: null, fillOpacity: 0.35, ...st })
export const mkSticky = (cx, cy, size, color) => ({ ...base('sticky', cx - size / 2, cy - size / 2, size, size), color, text: '' })
export const mkText = (x, y, w, fontSize, color) => ({ ...base('text', x, y, w, fontSize * LINE), text: '', fontSize, color, align: 'left' })
export const mkSticker = (cx, cy, size, it) => ({ ...base('sticker', cx - size / 2, cy - size / 2, size, size), glyph: it.g, sym: !!it.t, color: '#0f172a' })
export const mkImage = (x, y, w, h, blobId) => ({ ...base('image', x, y, w, h), blobId })

// word wrap that also breaks a single over-long word, so text never spills out of its box
export function layoutText(ctx, text, maxW, font) {
  ctx.font = font
  const out = []
  for (const para of String(text).split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const trial = line ? `${line} ${word}` : word
      if (ctx.measureText(trial).width <= maxW) { line = trial; continue }
      if (line) { out.push(line); line = '' }
      let rest = word
      while (rest.length > 1 && ctx.measureText(rest).width > maxW) {
        let k = rest.length - 1
        while (k > 1 && ctx.measureText(rest.slice(0, k)).width > maxW) k--
        out.push(rest.slice(0, k)); rest = rest.slice(k)
      }
      line = rest
    }
    out.push(line)
  }
  return out
}
function drawLines(ctx, lines, x, y, lh, align, width) {
  ctx.textBaseline = 'top'; ctx.textAlign = align
  const ax = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x
  lines.forEach((l, i) => ctx.fillText(l, ax, y + i * lh))
}
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
function shapePath(ctx, kind, w, h) {
  if (kind === 'ellipse') { ctx.beginPath(); ctx.ellipse(w / 2, h / 2, Math.max(w / 2, 0.01), Math.max(h / 2, 0.01), 0, 0, Math.PI * 2); return }
  if (kind === 'round') { roundRectPath(ctx, 0, 0, w, h, Math.min(w, h) * 0.2); return }
  ctx.beginPath(); shapePolygon(kind, w, h).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath()
}
function drawShape(ctx, o) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = o.strokeWidth; ctx.strokeStyle = o.stroke
  if (o.shape === 'line' || o.shape === 'arrow') {
    const [x1, y1, x2, y2] = lineEnds(o)
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    if (o.shape === 'arrow' && (x1 !== x2 || y1 !== y2)) { // open arrowhead at the end point
      const a = Math.atan2(y2 - y1, x2 - x1), hl = Math.max(12, o.strokeWidth * 4.5)
      ctx.beginPath()
      for (const d of [-0.5, 0.5]) { ctx.moveTo(x2, y2); ctx.lineTo(x2 - hl * Math.cos(a - d), y2 - hl * Math.sin(a - d)) }
      ctx.stroke()
    }
    return
  }
  shapePath(ctx, o.shape, o.w, o.h)
  if (o.fill) { ctx.globalAlpha = o.fillOpacity; ctx.fillStyle = o.fill; ctx.fill(); ctx.globalAlpha = 1 }
  ctx.stroke()
}

// env: { images: Map(blobId -> bitmap|null), hideText: id } (hideText = the object whose text is being edited in a textarea)
export function drawObject(ctx, o, env = {}) {
  ctx.save()
  ctx.translate(o.x + o.w / 2, o.y + o.h / 2); if (o.rot) ctx.rotate(o.rot); ctx.translate(-o.w / 2, -o.h / 2)
  if (o.type === 'shape') drawShape(ctx, o)
  else if (o.type === 'sticky') {
    ctx.save(); ctx.shadowColor = 'rgba(15,23,42,0.28)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3
    ctx.fillStyle = o.color; roundRectPath(ctx, 0, 0, o.w, o.h, Math.min(o.w, o.h) * 0.04); ctx.fill(); ctx.restore()
    if (o.text && env.hideText !== o.id) {
      const fs = stickyFont(o), pad = stickyPad(o)
      ctx.save(); roundRectPath(ctx, 0, 0, o.w, o.h, 0); ctx.clip()
      ctx.fillStyle = '#1f2937'; ctx.font = fontStr(fs)
      drawLines(ctx, layoutText(ctx, o.text, o.w - pad * 2, fontStr(fs)), pad, pad, fs * LINE, 'left', o.w - pad * 2); ctx.restore()
    }
  } else if (o.type === 'text') {
    if (o.text && env.hideText !== o.id) { ctx.fillStyle = o.color; ctx.font = fontStr(o.fontSize); drawLines(ctx, layoutText(ctx, o.text, o.w, fontStr(o.fontSize)), 0, 0, o.fontSize * LINE, o.align, o.w) }
  } else if (o.type === 'sticker') {
    const size = Math.min(o.w, o.h) * 0.82
    ctx.font = `${size}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = o.sym ? o.color : '#000'; ctx.fillText(o.glyph, o.w / 2, o.h / 2 + size * 0.04)
  } else if (o.type === 'image') {
    const bmp = env.images?.get(o.blobId)
    if (bmp) ctx.drawImage(bmp, 0, 0, o.w, o.h)
    else { // still loading, or the file is gone from storage
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, 0, o.w, o.h); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = Math.max(1, o.w / 150)
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(o.w, o.h); ctx.moveTo(o.w, 0); ctx.lineTo(0, o.h); ctx.stroke()
    }
  }
  ctx.restore()
}
