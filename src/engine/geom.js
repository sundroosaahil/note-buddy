// Pure geometry for the object layer (no DOM, no canvas), so every rule here is unit-tested in Node.
// An object is a box { x, y, w, h, rot } in WORLD space; rot turns it around its own centre. Everything else (shape kind,
// colours, text) rides along, so selection / move / resize / rotate treat every object type the same way.

export const MIN_SIZE = 4
export const rotPt = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c] }
export const centerOf = (o) => [o.x + o.w / 2, o.y + o.h / 2]
export function cornersOf(o) { // tl, tr, br, bl in world space
  const [cx, cy] = centerOf(o), a = o.rot || 0
  return [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]].map(([x, y]) => rotPt(x, y, cx, cy, a))
}
export function toLocal(o, x, y) { // world point -> coordinates inside the unrotated box (0..w, 0..h)
  const [cx, cy] = centerOf(o), [lx, ly] = rotPt(x, y, cx, cy, -(o.rot || 0)); return [lx - o.x, ly - o.y]
}
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
export function pointInPoly(x, y, poly) { // ray casting
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// Outline vertices (local coordinates) of the polygon-like shapes. rect/round share the rectangle for hit tests.
export function shapePolygon(kind, w, h) {
  if (kind === 'triangle') return [[w / 2, 0], [w, h], [0, h]]
  if (kind === 'diamond') return [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]
  if (kind === 'star') {
    const pts = []
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? 0.42 : 1
      pts.push([w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k])
    }
    return pts
  }
  return [[0, 0], [w, 0], [w, h], [0, h]]
}
export const isLine = (o) => o.type === 'shape' && (o.shape === 'line' || o.shape === 'arrow')
export const lineEnds = (o) => [o.flipX ? o.w : 0, o.flipY ? o.h : 0, o.flipX ? 0 : o.w, o.flipY ? 0 : o.h] // local x1,y1,x2,y2

// Does the world point (x, y) touch object o? tol is extra slack in world units (fingertip size / zoom).
export function hitObject(o, x, y, tol = 0) {
  const [lx, ly] = toLocal(o, x, y)
  if (o.type !== 'shape') return lx >= -tol && ly >= -tol && lx <= o.w + tol && ly <= o.h + tol
  const band = tol + (o.strokeWidth || 1) / 2, filled = o.fill && (o.fillOpacity ?? 1) > 0.02
  if (isLine(o)) { const [x1, y1, x2, y2] = lineEnds(o); return segDist(lx, ly, x1, y1, x2, y2) <= band }
  if (o.shape === 'ellipse') {
    const a = Math.max(o.w / 2, 0.5), b = Math.max(o.h / 2, 0.5), r = Math.hypot((lx - o.w / 2) / a, (ly - o.h / 2) / b)
    return (filled && r <= 1) || Math.abs(r - 1) * Math.min(a, b) <= band
  }
  const poly = shapePolygon(o.shape, o.w, o.h)
  if (filled && pointInPoly(lx, ly, poly)) return true
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; if (segDist(lx, ly, p[0], p[1], q[0], q[1]) <= band) return true }
  return false
}

const sbCache = new WeakMap() // strokes are never edited in place (a transform makes a new one), so bounds can be cached
export function strokeBounds(s) {
  let b = sbCache.get(s); if (b) return b
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of s.pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y }
  const h = s.width / 2; b = { x0: x0 - h, y0: y0 - h, x1: x1 + h, y1: y1 + h }; sbCache.set(s, b); return b
}
export function objectBounds(o) {
  const cs = cornersOf(o), pad = o.type === 'shape' ? (o.strokeWidth || 0) / 2 : 0
  const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1])
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad }
}
export function unionBounds(list) {
  let r = null
  for (const b of list) r = r ? { x0: Math.min(r.x0, b.x0), y0: Math.min(r.y0, b.y0), x1: Math.max(r.x1, b.x1), y1: Math.max(r.y1, b.y1) } : { ...b }
  return r
}
export function strokeHit(s, x, y, tol = 0) {
  const b = strokeBounds(s), r = tol + s.width / 2
  if (x < b.x0 - tol || x > b.x1 + tol || y < b.y0 - tol || y > b.y1 + tol) return false
  const p = s.pts
  if (p.length === 1) return Math.hypot(x - p[0].x, y - p[0].y) <= r
  for (let i = 1; i < p.length; i++) if (segDist(x, y, p[i - 1].x, p[i - 1].y, p[i].x, p[i].y) <= r) return true
  return false
}

// Lasso: a stroke is picked when at least half its points are inside the loop, an object when its centre is.
export function strokeInPoly(s, poly) { let n = 0; for (const p of s.pts) if (pointInPoly(p.x, p.y, poly)) n++; return n * 2 >= s.pts.length }
export function objectInPoly(o, poly) { const [cx, cy] = centerOf(o); return pointInPoly(cx, cy, poly) }

// A similarity transform (move + uniform scale + rotation about a pivot) as a function. Group edits use only these, which
// keeps every object a rotated box and every stroke a point list.
export function similarity({ px = 0, py = 0, s = 1, th = 0, tx = 0, ty = 0 }) {
  const c = Math.cos(th) * s, sn = Math.sin(th) * s
  return (x, y) => { const dx = x - px, dy = y - py; return [px + dx * c - dy * sn + tx, py + dx * sn + dy * c + ty] }
}
export function transformStroke(st, T, s) { return { ...st, pts: st.pts.map((p) => { const [x, y] = T(p.x, p.y); return { x, y, p: p.p } }), width: st.width * s } }
export function transformObject(o, T, s, th) {
  const [cx, cy] = centerOf(o), [nx, ny] = T(cx, cy), w = o.w * s, h = o.h * s
  const n = { ...o, x: nx - w / 2, y: ny - h / 2, w, h, rot: (o.rot || 0) + th }
  if (o.type === 'text') n.fontSize = o.fontSize * s
  if (o.type === 'shape') n.strokeWidth = o.strokeWidth * s
  return n
}

// Drag corner i (0 tl, 1 tr, 2 br, 3 bl) of one object to world point (px, py). The opposite corner stays fixed in the world even
// when the object is rotated, and dragging past it flips lines. lock keeps the proportions (stickers, images, text).
export function resizeObject(o, i, px, py, lock) {
  const th = o.rot || 0, A = cornersOf(o)[(i + 2) % 4]
  const ux = Math.cos(th), uy = Math.sin(th), vx = -Math.sin(th), vy = Math.cos(th)
  const dx = (px - A[0]) * ux + (py - A[1]) * uy, dy = (px - A[0]) * vx + (py - A[1]) * vy
  const sx0 = i === 1 || i === 2 ? 1 : -1, sy0 = i === 2 || i === 3 ? 1 : -1
  let w = Math.abs(dx), h = Math.abs(dy)
  if (lock) { const k = Math.max(w / Math.max(o.w, 1e-6), h / Math.max(o.h, 1e-6), 0.02); w = o.w * k; h = o.h * k }
  w = Math.max(w, MIN_SIZE); h = Math.max(h, MIN_SIZE)
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1
  const cx = A[0] + ((sx * w) / 2) * ux + ((sy * h) / 2) * vx, cy = A[1] + ((sx * w) / 2) * uy + ((sy * h) / 2) * vy
  const n = { ...o, x: cx - w / 2, y: cy - h / 2, w, h }
  if (isLine(o)) { n.flipX = sx !== sx0 ? !o.flipX : !!o.flipX; n.flipY = sy !== sy0 ? !o.flipY : !!o.flipY }
  if (o.type === 'text') n.fontSize = o.fontSize * (w / o.w)
  return n
}
// Rotation snaps to quarter turns and 15 degree steps when the pen is within ~4 degrees of one, so upright is easy to hit.
export function snapAngle(a) {
  const step = Math.PI / 12, k = Math.round(a / step), d = Math.abs(a - k * step)
  return d < (4 * Math.PI) / 180 ? k * step : a
}
