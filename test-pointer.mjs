// Pointer/barrel behaviour with fake events, covering the ways tablet drivers report the pen button.
// Pen button = buttons&2. Hold-to-erase must work hovering or touching, and one hold = one balanced erase session.
import assert from 'node:assert'
globalThis.document = { addEventListener() {}, removeEventListener() {} }
const { attachPointer } = await import('./src/input/pointer.js')
const mk = (action = 'erase') => {
  const L = {}, canvas = { addEventListener: (n, f) => (L[n] = f), removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {} }
  const calls = []
  const engine = { override: null, holdPan: false, get effectiveTool() { return this.override || 'pen' }, emit() {}, setCursor() {}, hideCursor() {},
    beginStroke: () => calls.push('beginStroke'), extendStroke: () => calls.push('extend'), endStroke: () => calls.push('endStroke'), cancelStroke() {},
    beginErase: () => calls.push('beginErase'), eraseTo: () => calls.push('eraseTo'), endErase: () => calls.push('endErase') }
  attachPointer(canvas, engine, () => action); return { L, engine, calls }
}
const ev = (type, buttons, pressure, button = -1, x = 5, pointerType = 'pen') => ({ type, pointerType, pointerId: 7, buttons, button, pressure, clientX: x, clientY: 5, preventDefault() {}, getCoalescedEvents: () => [] })
const n = (calls, c) => calls.filter((x) => x === c).length
const balanced = (calls) => { let o = 0; for (const c of calls) { if (c === 'beginErase') { assert.equal(o, 0, 'nested erase'); o++ } if (c === 'endErase') { assert.equal(o, 1, 'unmatched end'); o-- } } assert.equal(o, 0, 'erase left open') }
const trace = (L, b, p, from = 6, to = 12) => { for (let x = from; x < to; x++) L.pointermove(ev('pointermove', b, p, -1, x)) }

{ // hover only: hold the pen button, move over drawings, release
  const { L, engine, calls } = mk()
  L.pointermove(ev('pointermove', 0, 0)); L.pointerdown(ev('pointerdown', 2, 0, 2)); trace(L, 2, 0); L.pointerup(ev('pointerup', 0, 0, 2))
  assert.ok(n(calls, 'eraseTo') >= 6); assert.equal(n(calls, 'beginErase'), 1); balanced(calls); assert.equal(engine.override, null)
}
{ // tip touching, then pen button pressed; this driver reports buttons 2 (no touch bit) with pressure > 0
  const { L, engine, calls } = mk()
  L.pointerdown(ev('pointerdown', 1, 0.5, 0)); L.pointermove(ev('pointermove', 1, 0.5, -1, 6)); trace(L, 2, 0.5, 7, 13)
  L.pointermove(ev('pointermove', 1, 0.5, -1, 15)); L.pointerup(ev('pointerup', 0, 0, 0))
  assert.ok(n(calls, 'eraseTo') >= 6); balanced(calls); assert.equal(engine.override, null)
}
{ // pen button first, then tip touches (standard chord, buttons 3), lift tip, release button
  const { L, engine, calls } = mk()
  L.pointerdown(ev('pointerdown', 2, 0, 2)); L.pointermove(ev('pointermove', 3, 0.5, -1, 6)); trace(L, 3, 0.5, 7, 12)
  L.pointermove(ev('pointermove', 2, 0, -1, 13)); L.pointerup(ev('pointerup', 0, 0, 2))
  assert.ok(n(calls, 'eraseTo') >= 6); balanced(calls); assert.equal(engine.override, null)
}
{ // mouse-mode tablet: right button = pen button
  const { L, engine, calls } = mk(), m = (t, b, btn, x) => ev(t, b, b ? 0.5 : 0, btn, x, 'mouse')
  L.pointerdown(m('pointerdown', 2, 2)); L.pointermove(m('pointermove', 3, -1, 6)); L.pointermove(m('pointermove', 3, -1, 9)); L.pointermove(m('pointermove', 2, -1, 12)); L.pointerup(m('pointerup', 0, 2, 12))
  assert.ok(n(calls, 'eraseTo') >= 4); balanced(calls); assert.equal(engine.override, null)
}
{ // normal drawing is untouched, in pen mode, in mouse mode, and with a pressure-0 touchdown frame
  let t = mk(); t.L.pointerdown(ev('pointerdown', 1, 0.5, 0)); t.L.pointermove(ev('pointermove', 1, 0.6, -1, 9)); t.L.pointerup(ev('pointerup', 0, 0, 0))
  assert.deepEqual(t.calls, ['beginStroke', 'extend', 'endStroke'])
  t = mk(); t.L.pointerdown(ev('pointerdown', 1, 0.5, 0, 5, 'mouse')); t.L.pointermove(ev('pointermove', 1, 0.5, -1, 8, 'mouse')); t.L.pointerup(ev('pointerup', 0, 0, 0, 5, 'mouse'))
  assert.deepEqual(t.calls, ['beginStroke', 'extend', 'endStroke'])
  t = mk(); t.L.pointerdown(ev('pointerdown', 1, 0, 0)); t.L.pointermove(ev('pointermove', 1, 0.4, -1, 6)); t.L.pointerup(ev('pointerup', 0, 0, 0))
  assert.equal(t.engine.override, null); assert.deepEqual(t.calls, ['beginStroke', 'extend', 'endStroke'])
}
{ // other barrel actions never erase
  const { L, calls } = mk('pan'); L.pointermove(ev('pointermove', 2, 0)); trace(L, 2, 0, 6, 10); assert.equal(n(calls, 'eraseTo'), 0)
}
{ // old Chrome quirk: hovering with buttons 1 and pressure 0 for two events = pen button
  const { L, engine, calls } = mk()
  L.pointermove(ev('pointermove', 1, 0)); assert.equal(engine.override, null)
  L.pointermove(ev('pointermove', 1, 0, -1, 6)); assert.equal(engine.override, 'eraser'); L.pointermove(ev('pointermove', 1, 0, -1, 7)); L.pointermove(ev('pointermove', 0, 0, -1, 8))
  assert.equal(engine.override, null); balanced(calls)
}
console.log('pointer + barrel simulation ok')

// Optional finger drawing stays off by default and a second touch cancels a stroke for gestures.
{
  const mkF = (on) => {
    const L = {}, canvas = { addEventListener: (n, f) => (L[n] = f), removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {} }
    const calls = []
    const engine = { override: null, holdPan: false, tool: 'pen', get effectiveTool() { return this.override || 'pen' }, emit() {}, setCursor() {}, hideCursor() {}, editing: false,
      beginStroke: () => calls.push('beginStroke'), extendStroke: () => calls.push('extend'), endStroke: () => calls.push('endStroke'), cancelStroke: () => calls.push('cancelStroke'),
      panBy: () => calls.push('pan'), zoomAt: () => calls.push('zoom') }
    attachPointer(canvas, engine, () => 'erase', () => on); return { L, calls }
  }
  const f = (type, id, x, b = 1) => ({ type, pointerType: 'touch', pointerId: id, buttons: b, button: 0, pressure: 0.5, clientX: x, clientY: 5, preventDefault() {}, getCoalescedEvents: () => [] })
  let t = mkF(false); t.L.pointerdown(f('pointerdown', 1, 5)); t.L.pointermove(f('pointermove', 1, 9)); t.L.pointerup(f('pointerup', 1, 9, 0))
  assert.deepEqual(t.calls, [], 'touch must not draw while finger drawing is off')
  t = mkF(true); t.L.pointerdown(f('pointerdown', 1, 5)); t.L.pointermove(f('pointermove', 1, 9)); t.L.pointerup(f('pointerup', 1, 9, 0))
  assert.deepEqual(t.calls, ['beginStroke', 'extend', 'endStroke'], 'one finger draws when finger drawing is on')
  t = mkF(true); t.L.pointerdown(f('pointerdown', 1, 5)); t.L.pointermove(f('pointermove', 1, 8)); t.L.pointerdown(f('pointerdown', 2, 40)); t.L.pointermove(f('pointermove', 2, 60)); t.L.pointermove(f('pointermove', 1, 20))
  assert.ok(t.calls.includes('cancelStroke') && !t.calls.includes('endStroke'), 'second finger cancels the stroke'); assert.ok(t.calls.includes('pan') || t.calls.includes('zoom'), 'two fingers continue to pan or zoom')
  const before = t.calls.filter((c) => c === 'extend').length; t.L.pointermove(f('pointermove', 1, 25)); assert.equal(t.calls.filter((c) => c === 'extend').length, before, 'no ink after a two-finger gesture starts')
}
console.log('finger draw ok')
