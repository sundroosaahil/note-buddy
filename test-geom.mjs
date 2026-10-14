// Pure geometry (hit tests, rotate/resize math, lasso) and shape-snap recognition, with synthetic wobbly strokes.
import assert from 'node:assert'
import * as G from './src/engine/geom.js'
import { recognize } from './src/engine/snap.js'
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`)
const box = (o = {}) => ({ id: 'b', type: 'sticky', x: 100, y: 50, w: 80, h: 40, rot: 0, ...o })
// hit test, rotated 90deg about the centre (140,70): the box becomes 40 wide x 80 tall
let o = box({ rot: Math.PI / 2 })
assert.ok(G.hitObject(o, 140, 70)); assert.ok(G.hitObject(o, 140, 105)); assert.ok(!G.hitObject(o, 175, 70)); assert.ok(G.hitObject(o, 175, 70, 20))
// corners follow rotation
const cs = G.cornersOf(o); near(cs[0][0], 160); near(cs[0][1], 30)
// unfilled shape is hit on its outline only; filled inside too
const sh = { type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 100, rot: 0, strokeWidth: 4, fill: null }
assert.ok(G.hitObject(sh, 0, 50)); assert.ok(!G.hitObject(sh, 50, 50)); assert.ok(G.hitObject({ ...sh, fill: '#f00', fillOpacity: 0.3 }, 50, 50))
const el = { ...sh, shape: 'ellipse' }; assert.ok(G.hitObject(el, 0, 50)); assert.ok(!G.hitObject(el, 50, 50)); assert.ok(!G.hitObject(el, 2, 2))
const tri = { ...sh, shape: 'triangle', fill: '#0f0', fillOpacity: 1 }; assert.ok(G.hitObject(tri, 50, 80)); assert.ok(!G.hitObject(tri, 5, 5))
const ln = { type: 'shape', shape: 'line', x: 0, y: 0, w: 100, h: 100, rot: 0, strokeWidth: 2, flipX: true }; assert.ok(G.hitObject(ln, 90, 10, 3)); assert.ok(!G.hitObject(ln, 10, 10, 3))
// lasso
const poly = [[0, 0], [100, 0], [100, 100], [0, 100]]
assert.ok(G.objectInPoly(box({ x: 10, y: 10, w: 20, h: 20 }), poly)); assert.ok(!G.objectInPoly(box({ x: 200, y: 10, w: 20, h: 20 }), poly))
const st = (xs) => ({ id: 's', width: 2, pts: xs.map(([x, y]) => ({ x, y, p: 0.5 })) })
assert.ok(G.strokeInPoly(st([[10, 10], [20, 20], [30, 30], [500, 500]]), poly)); assert.ok(!G.strokeInPoly(st([[10, 10], [300, 300], [400, 400], [500, 500]]), poly))
assert.ok(G.strokeHit(st([[0, 0], [100, 0]]), 50, 3, 2)); assert.ok(!G.strokeHit(st([[0, 0], [100, 0]]), 50, 30, 2))
// transforms
const T = G.similarity({ px: 0, py: 0, s: 2, th: Math.PI / 2, tx: 10, ty: 0 }); const [tx, ty] = T(1, 0); near(tx, 10); near(ty, 2)
const t2 = G.transformObject(box({ x: 0, y: 0, w: 10, h: 10 }), G.similarity({ s: 2 }), 2, 0); near(t2.w, 20); near(t2.x, 0)
const ts = G.transformStroke(st([[1, 1], [2, 2]]), G.similarity({ tx: 5 }), 1); near(ts.pts[0].x, 6)
// resize: drag bottom-right of an unrotated box; opposite (top-left) corner stays put
let r = G.resizeObject(box(), 2, 220, 120, false); near(r.x, 100); near(r.y, 50); near(r.w, 120); near(r.h, 70)
// rotated 90deg: anchor stays fixed in the world
o = box({ rot: Math.PI / 2 }); const anchor = G.cornersOf(o)[0]; r = G.resizeObject(o, 2, 100, 200, false); const a2 = G.cornersOf(r)[0], d2 = G.cornersOf(r)[2]; near(anchor[0], a2[0], 1e-6); near(anchor[1], a2[1], 1e-6); near(d2[0], 100, 1e-6); near(d2[1], 200, 1e-6); near(r.rot, Math.PI / 2)
// aspect lock keeps proportions; dragging a line corner past the anchor flips it
r = G.resizeObject(box({ type: 'sticker' }), 2, 260, 100, true); near(r.w / r.h, 2, 1e-6)
const l2 = G.resizeObject({ type: 'shape', shape: 'line', x: 0, y: 0, w: 100, h: 50, rot: 0, flipX: false, flipY: false }, 2, -40, 20, false); assert.equal(l2.flipX, true); assert.equal(l2.flipY, false)
near(G.snapAngle(0.03), 0); near(G.snapAngle(Math.PI / 2 + 0.02), Math.PI / 2); assert.ok(G.snapAngle(0.13) === 0.13); near(G.snapAngle(0.2), Math.PI / 12)
console.log('geom ok')

// shape recognition on synthetic, slightly wobbly strokes
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5)
const P = (x, y) => ({ x: x + rnd() * 2, y: y + rnd() * 2, p: 0.5 })
const line = Array.from({ length: 40 }, (_, i) => P(10 + i * 5, 20 + i * 1.2)); let rec = recognize(line); assert.equal(rec.kind, 'line')
const flat = Array.from({ length: 40 }, (_, i) => P(10 + i * 5, 100)); rec = recognize(flat); assert.equal(rec.kind, 'line'); assert.equal(rec.y1, rec.y2) // straightened
const circle = Array.from({ length: 60 }, (_, i) => { const a = (i / 58) * Math.PI * 2; return P(200 + Math.cos(a) * 80, 200 + Math.sin(a) * 80) }); rec = recognize(circle); assert.equal(rec.kind, 'ellipse'); near(rec.rx, rec.ry, 1e-9)
const ell = Array.from({ length: 60 }, (_, i) => { const a = (i / 58) * Math.PI * 2; return P(200 + Math.cos(a) * 120, 200 + Math.sin(a) * 50) }); rec = recognize(ell); assert.equal(rec.kind, 'ellipse'); assert.ok(rec.rx > rec.ry * 2)
const side = (x0, y0, x1, y1, n) => Array.from({ length: n }, (_, i) => P(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n))
const rect = [...side(0, 0, 200, 0, 20), ...side(200, 0, 200, 100, 12), ...side(200, 100, 0, 100, 20), ...side(0, 100, 3, 6, 12)]; rec = recognize(rect); assert.equal(rec.kind, 'rect'); assert.ok(rec.w > rec.h * 1.8)
const sq = [...side(0, 0, 100, 0, 15), ...side(100, 0, 100, 100, 15), ...side(100, 100, 0, 100, 15), ...side(0, 100, 2, 4, 15)]; rec = recognize(sq); assert.equal(rec.kind, 'rect'); near(rec.w, rec.h, 1e-9)
const triStroke = [...side(100, 0, 200, 150, 20), ...side(200, 150, 0, 150, 25), ...side(0, 150, 98, 4, 20)]; assert.equal(recognize(triStroke), null)
const zig = Array.from({ length: 40 }, (_, i) => P(i * 6, i % 2 ? 40 : 0)); assert.equal(recognize(zig), null)
const arc = Array.from({ length: 40 }, (_, i) => { const a = (i / 39) * Math.PI; return P(100 + Math.cos(a) * 80, 100 + Math.sin(a) * 80) }); assert.equal(recognize(arc), null)
assert.equal(recognize(line.slice(0, 5)), null)
console.log('snap ok')
