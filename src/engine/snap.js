// Shape snapping: given the points of a freehand stroke (world coordinates), return the clean shape it was probably meant to be,
// or null when it is just handwriting. Pure, so it is tested with synthetic, realistic strokes (wobble, rounded corners, tilt).
//
// Why it fits a ROTATED box: nobody draws a rectangle perfectly level, and a circle looks the same at any angle, so an
// axis-aligned fit works for circles but rejects most hand-drawn rectangles. We try every orientation, keep the best, and snap
// small tilts (under 7 degrees) back to exactly level, which is what the teacher meant.
// Why it resamples: pens report many points where they slow down (corners) and few on fast straight sides. Equal spacing along the
// path makes every part of the outline count the same.
import { segDist } from './geom.js'

const DEG = Math.PI / 180
const FIT_OK = 0.065   // mean distance from the outline, as a fraction of sqrt(width*height); hand wobble is ~0.02-0.04

function resample(pts, n) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const L = cum[cum.length - 1], out = []
  let j = 1
  for (let k = 0; k < n; k++) {
    const d = (L * k) / (n - 1)
    while (j < pts.length - 1 && cum[j] < d) j++
    const t = (d - cum[j - 1]) / (cum[j] - cum[j - 1] || 1)
    out.push([pts[j - 1].x + (pts[j].x - pts[j - 1].x) * t, pts[j - 1].y + (pts[j].y - pts[j - 1].y) * t])
  }
  return out
}

// How well do the points fit a rectangle / an ellipse whose axes are turned by th? (the box is found in the rotated frame)
function fitAt(P, th) {
  const c = Math.cos(th), s = Math.sin(th), Q = P.map(([x, y]) => [x * c + y * s, -x * s + y * c])
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of Q) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const w = x1 - x0, h = y1 - y0; if (w < 1e-6 || h < 1e-6) return null
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = w / 2, b = h / 2, sz = Math.sqrt(w * h)
  let er = 0, ee = 0; const side = [0, 0, 0, 0] // points near the top, right, bottom, left side
  for (const [x, y] of Q) {
    er += Math.min(x - x0, x1 - x, y - y0, y1 - y)                          // distance to the nearest side of the box
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), rho = Math.hypot(dx / a, dy / b)
    ee += rho > 1e-9 ? Math.abs(r - r / rho) : Math.min(a, b)               // distance to the ellipse, measured along the ray from the centre
    const near = 0.12 * sz
    if (y - y0 < near) side[0]++; if (x1 - x < near) side[1]++; if (y1 - y < near) side[2]++; if (x - x0 < near) side[3]++
  }
  const n = Q.length
  return { th, w, h, sz, er: er / n / sz, ee: ee / n / sz, sides: side.map((k) => k / n),
    cx: cx * c - cy * s, cy: cx * s + cy * c } // box centre back in world space
}
function best(P, key) { // coarse search over orientations, then refine; a tiny bias prefers "level" when two angles fit equally
  let b = null
  const tryAt = (deg) => { const f = fitAt(P, deg * DEG); if (!f) return; f.score = f[key] + 0.0004 * Math.abs(deg); if (!b || f.score < b.score) b = f }
  for (let d = -45; d < 45; d += 3) tryAt(d)
  if (!b) return null
  const c = (b.th / DEG); for (let d = c - 3; d <= c + 3; d += 0.5) tryAt(d)
  return b
}

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
  // closed shapes: long compared with its box, and the pen finished near where it started (a small gap or overshoot is normal)
  if (len < 1.8 * Math.max(w, h)) return null
  const P = resample(pts, 96)
  const R = best(P, 'er'), E = best(P, 'ee'); if (!R || !E) return null
  const sz = Math.sqrt(R.w * R.h)
  // closed = the pen's end touches the start of the outline, or its start touches the end of it. This also accepts overshoot (the
  // end crosses over the start, so start-to-end distance is large but the end still lies ON the outline); an open U or C stays open.
  const near = (pt, from, to) => { let d = Infinity; for (let i = from; i < to; i++) d = Math.min(d, segDist(pt[0], pt[1], P[i][0], P[i][1], P[i + 1][0], P[i + 1][1])); return d }
  const closeGap = Math.min(chord, near(P[P.length - 1], 0, 28), near(P[0], P.length - 29, P.length - 1))
  if (Math.min(R.w, R.h) < 0.06 * Math.max(R.w, R.h) || closeGap > 0.4 * sz) return null

  if (R.er < E.ee) { // rectangle fits better than an ellipse
    if (R.er > FIT_OK || R.sides.some((s) => s < 0.05)) return null // a side is missing (an open "U" or "C"), or it is just too wobbly
    let { th, w: rw, h: rh, cx, cy } = R
    if (Math.abs(th) < 7 * DEG) { const f = fitAt(P, 0); if (f && f.er < FIT_OK * 1.3) ({ th, w: rw, h: rh, cx, cy } = f); else th = R.th }
    if (Math.abs(rw - rh) / Math.max(rw, rh) < 0.12) rw = rh = (rw + rh) / 2   // square
    return { kind: 'rect', cx, cy, w: rw, h: rh, rot: Math.abs(th) < 7 * DEG ? 0 : th, x: cx - rw / 2, y: cy - rh / 2 }
  }
  if (E.ee > FIT_OK) return null
  let { th, w: ew, h: eh, cx, cy } = E
  if (Math.abs(ew - eh) / Math.max(ew, eh) < 0.14) { const d = (ew + eh) / 2; return { kind: 'ellipse', cx, cy, rx: d / 2, ry: d / 2, rot: 0 } } // circle
  if (Math.abs(th) < 7 * DEG) { const f = fitAt(P, 0); if (f && f.ee < FIT_OK * 1.3) ({ th, w: ew, h: eh, cx, cy } = f); else th = E.th }
  return { kind: 'ellipse', cx, cy, rx: ew / 2, ry: eh / 2, rot: Math.abs(th) < 7 * DEG ? 0 : th }
}
// a line within ~4 degrees of horizontal or vertical becomes exactly horizontal or vertical
function straighten(l) {
  const dx = l.x2 - l.x1, dy = l.y2 - l.y1, tol = Math.tan(4 * DEG)
  if (Math.abs(dy) < Math.abs(dx) * tol) l.y2 = l.y1; else if (Math.abs(dx) < Math.abs(dy) * tol) l.x2 = l.x1
  return l
}
