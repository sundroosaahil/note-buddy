import { drawBackground } from '../engine/background.js'
import { objectBounds } from '../engine/geom.js'

export function contentBounds(strokes, objects = []) { // everything on the page: ink and objects (rotated boxes included)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of strokes) {
    const h = s.width / 2 + 1
    for (const p of s.pts) { x0 = Math.min(x0, p.x - h); y0 = Math.min(y0, p.y - h); x1 = Math.max(x1, p.x + h); y1 = Math.max(y1, p.y + h) }
  }
  for (const o of objects) { const b = objectBounds(o); x0 = Math.min(x0, b.x0 - 1); y0 = Math.min(y0, b.y0 - 1); x1 = Math.max(x1, b.x1 + 1); y1 = Math.max(y1, b.y1 + 1) }
  return x0 === Infinity ? null : { x0, y0, x1, y1 }
}

// Crop to content + 40px padding (min 400x300), render at up to 3x, longest side capped at 1800px. Null if page is empty.
export function renderPage(engine, page) {
  const b = contentBounds(page.strokes, page.objects); if (!b) return null
  let { x0, y0, x1, y1 } = b
  x0 -= 40; y0 -= 40; x1 += 40; y1 += 40
  if (x1 - x0 < 400) { const c = (x0 + x1) / 2; x0 = c - 200; x1 = c + 200 }
  if (y1 - y0 < 300) { const c = (y0 + y1) / 2; y0 = c - 150; y1 = c + 150 }
  const w = x1 - x0, h = y1 - y0, k = Math.min(3, 1800 / Math.max(w, h))
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k)
  const ctx = c.getContext('2d')
  ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k)
  drawBackground(ctx, page.bg, { x0, y0, x1, y1 }, k) // background baked in
  engine.drawContent(ctx, page) // ink and objects, same layer order as the screen
  return c
}
