import { newId } from './ids.js'

export function distToSeg(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  let t = l2 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

// Returns null if the stroke is untouched, otherwise the surviving pieces (maybe []).
export function eraseAt(s, cx, cy, r) {
  const pts = s.pts, n = pts.length
  const hit = pts.map((p) => Math.hypot(p.x - cx, p.y - cy) <= r)
  const cut = []
  for (let i = 0; i < n - 1; i++) cut[i] = distToSeg(cx, cy, pts[i], pts[i + 1]) <= r
  if (!hit.some(Boolean) && !cut.some(Boolean)) return null
  const runs = []
  let cur = []
  for (let i = 0; i < n; i++) {
    if (hit[i]) { if (cur.length) runs.push(cur); cur = []; continue }
    cur.push(pts[i])
    if (i < n - 1 && cut[i]) { runs.push(cur); cur = [] }
  }
  if (cur.length) runs.push(cur)
  return runs.filter((r) => r.length >= 2).map((run) => ({ ...s, id: newId(), pts: run }))
}

// True if the eraser circle touches the stroke anywhere (points or segments). Used by the stroke eraser.
export function touches(s, cx, cy, r) {
  const pts = s.pts
  if (pts.length === 1) return Math.hypot(pts[0].x - cx, pts[0].y - cy) <= r
  for (let i = 0; i < pts.length - 1; i++) if (distToSeg(cx, cy, pts[i], pts[i + 1]) <= r) return true
  return false
}