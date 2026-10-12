import assert from 'node:assert'
import { eraseAt } from './src/engine/eraser.js'
import * as H from './src/engine/history.js'
const mk = (id, xs) => ({ id, pts: xs.map((x) => ({ x, y: 0, p: .5 })), width: 2 })
const s = mk('s', [0, 10, 20, 30, 40])
const pcs = eraseAt(s, 20, 0, 4)
assert.equal(pcs.length, 2); assert.deepEqual(pcs.map((p) => p.pts.length), [2, 2])
assert.equal(eraseAt(s, 20, 50, 4), null)
assert.equal(eraseAt(mk('t', [0, 5]), 2, 0, 9).length, 0) // fully erased
const pg = { strokes: [mk('a', [0, 1]), s, mk('b', [0, 1])], undo: [], redo: [] }
H.push(pg, { type: 'erase', list: [{ old: s, pieces: pcs, at: 1 }] }); pg.strokes = [pg.strokes[0], ...pcs, pg.strokes[2]]
H.undo(pg); assert.deepEqual(pg.strokes.map((x) => x.id), ['a', 's', 'b'])
H.redo(pg); assert.equal(pg.strokes.length, 4)
console.log('engine tests ok')
import { contentBounds } from './src/export/render.js'
assert.equal(contentBounds([]), null)
const b = contentBounds([{ width: 4, pts: [{ x: 10, y: 20 }, { x: 110, y: 70 }] }])
assert.deepEqual(b, { x0: 7, y0: 17, x1: 113, y1: 73 })
console.log('export bounds ok')
import { touches } from './src/engine/eraser.js'
assert.ok(touches(mk('u', [0, 100]), 50, 3, 4)); assert.ok(!touches(mk('u', [0, 100]), 50, 30, 4))
const pc = { strokes: [mk('a', [0, 1]), mk('b', [0, 1])], undo: [], redo: [] }
const before = pc.strokes; H.push(pc, { type: 'clear', old: pc.strokes }); pc.strokes = []
H.undo(pc); assert.deepEqual(pc.strokes.map((x) => x.id), ['a', 'b']); assert.notEqual(pc.strokes, before)
H.redo(pc); assert.equal(pc.strokes.length, 0)
console.log('stroke eraser + clear ok')
import { createBarrelDetector } from './src/input/barrel.js'
const log = [], bd = createBarrelDetector((v) => log.push(v)), ev = (b, p, t = 'pen') => ({ pointerType: t, buttons: b, pressure: p })
bd.update(ev(1, 0), false); assert.deepEqual(log, [])                    // one frame is debounced
bd.update(ev(1, 0), false); assert.deepEqual(log, [true])                // second consecutive frame activates
bd.update(ev(0, 0), false); assert.deepEqual(log, [true, false])         // release
bd.update(ev(1, 0), false); bd.update(ev(0, 0), false); bd.update(ev(1, 0), false); assert.deepEqual(log, [true, false]) // flicker ignored
bd.update(ev(1, 0.4), false); bd.update(ev(1, 0.4), false); bd.update(ev(1, 0, 'touch'), false); assert.deepEqual(log, [true, false]) // tip contact / touch are not barrel
console.log('barrel detector ok')

// tablet driver in mouse mode: pen button = right mouse button (buttons&2), instant on/off, tip alone (buttons 1) is not barrel
const log2 = [], bm = createBarrelDetector((v) => log2.push(v))
bm.update(ev(0, 0, 'mouse'), false); assert.deepEqual(log2, [])          // hover, no button
bm.update(ev(1, 0.5, 'mouse'), false); assert.deepEqual(log2, [])        // tip down (left button)
bm.update(ev(2, 0.5, 'mouse'), false); assert.deepEqual(log2, [true])    // pen button: immediate, no debounce
bm.update(ev(3, 0.5, 'mouse'), false); assert.deepEqual(log2, [true])    // pen button + tip: still held, no extra event
bm.update(ev(0, 0, 'mouse'), false); assert.deepEqual(log2, [true, false]) // everything released
console.log('mouse-mode barrel ok')

// pen mode on the Huion (verified on device): barrel = buttons 2, hovering or touching, instant. Tip alone = buttons 1 with pressure.
const log3 = [], bp = createBarrelDetector((v) => log3.push(v))
bp.update(ev(0, 0), false); bp.update(ev(1, 0.6), true); assert.deepEqual(log3, [])      // hover, then tip drawing
bp.update(ev(2, 0), false); assert.deepEqual(log3, [true])                              // pen button while hovering: one event is enough
bp.update(ev(3, 0.6), true); assert.deepEqual(log3, [true])                             // pen button + tip down: still held
bp.update(ev(1, 0.6), true); assert.deepEqual(log3, [true, false])                      // pen button released, tip still down
bp.update(ev(2, 0), false); bp.update(ev(0, 0), false); assert.deepEqual(log3, [true, false, true, false])
console.log('pen-mode barrel ok')
