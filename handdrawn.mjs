// Test support: realistic hand-drawn strokes (rounded corners, wobble, uneven point spacing, gaps/overshoot, tilt) from a seeded RNG.
// Realistic hand-drawn strokes: rounded corners, low-frequency wobble + jitter, uneven point spacing (pen slows at corners),
// start/end that don't meet (gap) or overshoot, optional tilt. Deterministic via a seeded RNG.
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
function wobble(r, amp) { const f1 = 1 + r() * 2, f2 = 3 + r() * 3, p1 = r() * 6.28, p2 = r() * 6.28; return (t) => amp * (0.7 * Math.sin(t * f1 * 6.28 + p1) + 0.3 * Math.sin(t * f2 * 6.28 + p2)) }
function densify(path, r, jitter) { // path: [[x,y]] dense polyline -> uneven samples with jitter
  const out = []; let i = 0
  while (i < path.length) { out.push(path[i]); i += 1 + Math.floor(r() * 5) }
  out.push(path[path.length - 1]); return out.map(([x, y]) => ({ x: x + (r() - 0.5) * jitter, y: y + (r() - 0.5) * jitter, p: 0.5 }))
}
function rotate(pts, th, cx, cy) { const c = Math.cos(th), s = Math.sin(th); return pts.map((p) => ({ ...p, x: cx + (p.x - cx) * c - (p.y - cy) * s, y: cy + (p.x - cx) * s + (p.y - cy) * c })) }
export function handRect(w, h, { seed = 1, round = 0.08, amp = 2, gap = 0, tilt = 0, cx = 400, cy = 300, ccw = false, startAt = 0, overshoot = 0.04 } = {}) { // gap: fraction of the outline left undrawn
  const r = rng(seed), rad = Math.max(1, round * Math.min(w, h)), x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2
  const seg = (a, b, n) => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
  const arc = (c, a0) => Array.from({ length: 8 }, (_, i) => { const a = a0 + (i / 8) * Math.PI / 2; return [c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad] })
  let base = [
    ...seg([x0 + rad, y0], [x1 - rad, y0], 40), ...arc([x1 - rad, y0 + rad], -Math.PI / 2),
    ...seg([x1, y0 + rad], [x1, y1 - rad], 30), ...arc([x1 - rad, y1 - rad], 0),
    ...seg([x1 - rad, y1], [x0 + rad, y1], 40), ...arc([x0 + rad, y1 - rad], Math.PI / 2),
    ...seg([x0, y1 - rad], [x0, y0 + rad], 30), ...arc([x0 + rad, y0 + rad], Math.PI),
  ]
  const k = Math.floor(startAt * base.length); base = [...base.slice(k), ...base.slice(0, k)]; if (ccw) base.reverse()
  let path = [...base, ...base.slice(0, Math.round(base.length * overshoot))] // keeps going past the start a little
  path = path.slice(0, Math.round(path.length * (1 - gap)))
  const wb = wobble(r, amp); path = path.map(([x, y], i) => [x + wb(i / path.length), y + wb(i / path.length + 0.37)])
  return rotate(densify(path.map(([x, y]) => [x + cx, y + cy]), r, amp * 0.6), (tilt * Math.PI) / 180, cx, cy)
}
export function handEllipse(rx, ry, { seed = 1, amp = 2, tilt = 0, gap = 0, cx = 400, cy = 300 } = {}) {
  const r = rng(seed), n = 160, wb = wobble(r, amp), a0 = r() * 6.28
  const path = Array.from({ length: Math.round(n * (1 - gap * 2)) + 6 }, (_, i) => { const a = a0 + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * (rx + wb(i / n)), cy + Math.sin(a) * (ry + wb(i / n + 0.5))] })
  return rotate(densify(path, r, amp * 0.6), (tilt * Math.PI) / 180, cx, cy)
}
export function handTriangle({ seed = 1, size = 160, amp = 2 } = {}) {
  const r = rng(seed), v = [[0, -size * 0.6], [size * 0.55, size * 0.4], [-size * 0.55, size * 0.4], [0, -size * 0.6]], pts = []
  for (let k = 0; k < 3; k++) for (let i = 0; i < 40; i++) pts.push([400 + v[k][0] + ((v[k + 1][0] - v[k][0]) * i) / 40, 300 + v[k][1] + ((v[k + 1][1] - v[k][1]) * i) / 40])
  return densify(pts, r, amp)
}

export function handStar({ seed = 1, size = 90, amp = 1.5 } = {}) {
  const r = rng(seed), v = Array.from({ length: 11 }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI * 2) / 5; return [400 + Math.cos(a) * size, 300 + Math.sin(a) * size] }), pts = []
  for (let k = 0; k < 5; k++) for (let i = 0; i < 24; i++) pts.push([v[k][0] + ((v[k + 1][0] - v[k][0]) * i) / 24, v[k][1] + ((v[k + 1][1] - v[k][1]) * i) / 24])
  return densify(pts, r, amp)
}
export function handSpiral({ seed = 1 } = {}) { const r = rng(seed); return densify(Array.from({ length: 200 }, (_, i) => { const a = (i / 200) * 4 * Math.PI, rr = 10 + i * 0.4; return [400 + Math.cos(a) * rr, 300 + Math.sin(a) * rr] }), r, 1) }
export function handZigzag({ seed = 1 } = {}) { const r = rng(seed); return densify(Array.from({ length: 120 }, (_, i) => [200 + i * 4, 300 + ((Math.floor(i / 12) % 2) ? 1 : -1) * (30 - Math.abs((i % 12) - 6) * 0)]), r, 2) }
export function handS({ seed = 1 } = {}) { const r = rng(seed); return densify(Array.from({ length: 120 }, (_, i) => { const t = i / 119; return [300 + Math.sin(t * Math.PI * 2) * 60, 150 + t * 300] }), r, 1.5) }
