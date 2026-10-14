// Shape snapping: given the points of a freehand stroke (world coordinates), return the clean shape it was probably meant to be,
// or null when it is just handwriting. Pure, so it is tested with synthetic strokes. Order: straight line, then closed shapes
// (ellipse/circle vs rectangle/square, whichever fits the outline better and well enough).
import { segDist } from './geom.js'

export function recognize(pts) {
  const n = pts.length; if (n < 8) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0
  for (let i = 0; i < n; i++) {
    const p = pts[i]; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
    if (i) len += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)
  }
  const w = x1 - x0, h = y1 - y0, diag = Math.hypot(w, h)
  if (diag < 1e-6 || len < 1e-6) return null
  const a = pts[0], b = pts[n - 1], chord = Math.hypot(b.x - a.x, b.y - a.y)

  // line: nearly all of the path length is the straight distance, and no point strays far from the chord
  if (chord > 0.5 * diag && chord / len > 0.9) {
    let dev = 0; for (const p of pts) dev = Math.max(dev, segDist(p.x, p.y, a.x, a.y, b.x, b.y))
    if (dev <= 0.07 * chord) return straighten({ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  // closed shapes: the pen came back near where it started, and the stroke is long compared with its box
  if (chord > 0.3 * diag || len < 1.8 * Math.max(w, h)) return null
  if (w < 1e-6 || h < 1e-6) return null
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ra = w / 2, rb = h / 2
  let ee = 0, er = 0
  for (const p of pts) {
    ee += Math.abs(Math.hypot((p.x - cx) / ra, (p.y - cy) / rb) - 1)           // distance from the fitted ellipse, in radii
    er += Math.min(p.x - x0, x1 - p.x, p.y - y0, y1 - p.y) / Math.min(w, h)    // distance from the nearest side of the box
  }
  ee /= n; er /= n
  if (ee < 0.09 && ee <= er * 1.5) {
    const circle = Math.abs(w - h) / Math.max(w, h) < 0.14, d = (w + h) / 2
    return circle ? { kind: 'ellipse', cx, cy, rx: d / 2, ry: d / 2 } : { kind: 'ellipse', cx, cy, rx: ra, ry: rb }
  }
  if (er < 0.045) {
    const square = Math.abs(w - h) / Math.max(w, h) < 0.08, d = (w + h) / 2
    return square ? { kind: 'rect', x: cx - d / 2, y: cy - d / 2, w: d, h: d } : { kind: 'rect', x: x0, y: y0, w, h }
  }
  return null
}
// a line within ~4 degrees of horizontal or vertical becomes exactly horizontal or vertical
function straighten(l) {
  const dx = l.x2 - l.x1, dy = l.y2 - l.y1, tol = Math.tan((4 * Math.PI) / 180)
  if (Math.abs(dy) < Math.abs(dx) * tol) l.y2 = l.y1; else if (Math.abs(dx) < Math.abs(dy) * tol) l.x2 = l.x1
  return l
}
