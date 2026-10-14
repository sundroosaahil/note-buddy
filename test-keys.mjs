// Express-key behaviour: tap vs hold per key, the laser key, window-blur safety, and the saved key-map migration.
import assert from 'node:assert'
const listeners = {}
globalThis.window = { addEventListener: (n, f) => (listeners[n] = f), removeEventListener: (n) => delete listeners[n] }
const { attachKeys } = await import('./src/input/keys.js')
const { DEFAULT_KEYMAP, migrateKeymap } = await import('./src/input/keymap.js')
const { ACTIONS } = await import('./src/input/actions.js')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const mkEngine = () => {
  const log = []; const e = { log, holdPan: false, panned: false, hint: null, sel: new Set(), page: { strokes: [1, 2], objects: [] },
    emit() {}, toggleEraser: () => log.push('toggleEraser'), toggleSelect: () => log.push('toggleSelect'), toggleLaser: () => log.push('toggleLaser'),
    clearPage() { log.push('clearPage'); this.page.strokes = [] }, undo: () => log.push('undo'), redo: () => log.push('redo'), setHint(t, ms) { this.hint = t; log.push('hint:' + t) } }
  return e
}
const key = (code, o = {}) => ({ code, key: o.key ?? '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, repeat: false, defaultPrevented: false, preventDefault() {}, target: {}, ...o })
const setup = () => { const e = mkEngine(); const off = attachKeys(e, () => DEFAULT_KEYMAP, () => false); return { e, off, down: (c, o) => listeners.keydown(key(c, o)), up: (c, o) => listeners.keyup(key(c, o)) } }

{ // key 2: a quick tap toggles the eraser on release; nothing is cleared
  const { e, off, down, up } = setup(); down('BracketRight'); assert.deepEqual(e.log, [], 'nothing happens until release'); await wait(80); up('BracketRight')
  assert.deepEqual(e.log, ['toggleEraser']); await wait(800); assert.ok(!e.log.includes('clearPage'), 'timer was cancelled on release'); off()
}
{ // key 2: held 0.7 s clears the page (hint first), and releasing afterwards does NOT also toggle the tool
  const { e, off, down, up } = setup(); down('BracketRight'); await wait(400); assert.ok(e.log.includes('hint:Keep holding to clear the page…'), 'warning shown while holding')
  assert.ok(!e.log.includes('clearPage')); await wait(450); assert.ok(e.log.includes('clearPage'), 'cleared after 0.7 s'); assert.ok(e.log.some((l) => l.startsWith('hint:Page cleared')))
  up('BracketRight'); assert.ok(!e.log.includes('toggleEraser'), 'a hold is not also a tap'); assert.equal(e.log.filter((l) => l === 'clearPage').length, 1); off()
}
{ // key 2: let go at 0.5 s (warning showing, before the clear) = changed your mind: nothing is cleared, the tool does not flip, the warning goes away
  const { e, off, down, up } = setup(); down('BracketRight'); await wait(500); up('BracketRight'); assert.ok(!e.log.includes('clearPage')); assert.ok(!e.log.includes('toggleEraser')); assert.equal(e.hint, null, 'warning removed'); await wait(400); assert.ok(!e.log.includes('clearPage'), 'timer cancelled'); off()
}
{ // key 2 on an empty page says so and clears nothing harmful
  const { e, off, down, up } = setup(); e.page.strokes = []; down('BracketRight'); await wait(800); assert.ok(e.log.includes('hint:Page is already empty')); up('BracketRight'); off()
}
{ // key 2 auto-repeat (holding generates repeat keydowns) must not restart or double-fire anything
  const { e, off, down, up } = setup(); down('BracketRight'); for (let i = 0; i < 5; i++) { await wait(30); down('BracketRight', { repeat: true }) } up('BracketRight'); assert.deepEqual(e.log.filter((l) => !l.startsWith('hint')), ['toggleEraser']); off()
}
{ // key 3: pan starts at once; a quick tap that did not pan opens Select
  const { e, off, down, up } = setup(); down('BracketLeft'); assert.equal(e.holdPan, true, 'pan is on while held'); await wait(60); up('BracketLeft')
  assert.equal(e.holdPan, false); assert.deepEqual(e.log, ['toggleSelect']); off()
}
{ // key 3: hold and drag the pen (panned) = pan only, no Select, even if the hold was short
  const { e, off, down, up } = setup(); down('BracketLeft'); e.panned = true; await wait(60); up('BracketLeft'); assert.equal(e.holdPan, false); assert.deepEqual(e.log, []); off()
}
{ // key 3: a long hold without dragging is still just a (non-)pan, not a tap
  const { e, off, down, up } = setup(); down('BracketLeft'); await wait(450); up('BracketLeft'); assert.deepEqual(e.log, []); assert.equal(e.holdPan, false); off()
}
{ // key 3 pressed again after panning starts fresh (the dragged flag resets on every press)
  const { e, off, down, up } = setup(); down('BracketLeft'); e.panned = true; up('BracketLeft'); down('BracketLeft'); await wait(40); up('BracketLeft'); assert.deepEqual(e.log, ['toggleSelect']); off()
}
{ // key 6 (Ctrl+Alt+Z) is the laser pointer now; keys 1, 4, 5 and the page keys are unchanged; plain keyboard undo/redo exist
  const { e, off, down, up } = setup()
  down('KeyZ', { ctrlKey: true, altKey: true }); up('KeyZ', { ctrlKey: true, altKey: true }); down('KeyS', { ctrlKey: true }); up('KeyS', { ctrlKey: true })
  down('KeyZ', { ctrlKey: true }); up('KeyZ', { ctrlKey: true }); down('KeyY', { ctrlKey: true }); up('KeyY', { ctrlKey: true }); down('KeyZ', { ctrlKey: true, shiftKey: true }); up('KeyZ', { ctrlKey: true, shiftKey: true })
  assert.deepEqual(e.log, ['toggleLaser', 'undo', 'undo', 'redo', 'redo']); off()
}
{ // the window loses focus mid-hold: pan is released, and the page is NOT cleared by a timer that never saw the keyup
  const { e, off, down } = setup(); down('BracketLeft'); down('BracketRight'); listeners.blur(); assert.equal(e.holdPan, false); await wait(900); assert.ok(!e.log.includes('clearPage')); assert.ok(!e.log.includes('toggleSelect')); assert.ok(!e.log.includes('toggleEraser')); off()
}
{ // with the Settings window open (isBlocked), no key does anything, so a key test can never clear the page
  const e = mkEngine(), off = attachKeys(e, () => DEFAULT_KEYMAP, () => true); listeners.keydown(key('BracketRight')); await wait(800); listeners.keyup(key('BracketRight')); listeners.keydown(key('BracketLeft')); listeners.keyup(key('BracketLeft')); assert.deepEqual(e.log, []); off()
}
{ // keys typed into a text field are never taken
  const e = mkEngine(), off = attachKeys(e, () => DEFAULT_KEYMAP, () => false); listeners.keydown(key('BracketRight', { target: { tagName: 'TEXTAREA' } })); listeners.keyup(key('BracketRight')); assert.deepEqual(e.log, []); off()
}

// saved key maps: express key 6 moves from redo to laser once; custom assignments are untouched; every action name is known
assert.ok(ACTIONS.includes('laser')); for (const a of Object.values(DEFAULT_KEYMAP)) assert.ok(ACTIONS.includes(a), a)
const OLD = { 'Ctrl+KeyS': 'undo', BracketRight: 'toggleEraser', BracketLeft: 'holdPan', 'Ctrl+NumpadAdd': 'zoomIn', 'Ctrl+NumpadSubtract': 'zoomOut', 'Ctrl+Alt+KeyZ': 'redo', PageDown: 'nextPage', PageUp: 'prevPage' }
let m = migrateKeymap(OLD); assert.equal(m['Ctrl+Alt+KeyZ'], 'laser'); assert.equal(m['Ctrl+KeyY'], 'redo'); assert.equal(m.BracketRight, 'toggleEraser'); assert.equal(Object.keys(m).length, 10)
m = migrateKeymap({ ...OLD, 'Ctrl+Alt+KeyZ': 'cycleColor', F2: 'redo' }); assert.equal(m['Ctrl+Alt+KeyZ'], 'cycleColor', 'a key the teacher reassigned is left alone'); assert.equal(m.F2, 'redo'); assert.ok(!('Ctrl+KeyY' in m), 'redo already has a key')
m = migrateKeymap(migrateKeymap(OLD)); assert.deepEqual(m, migrateKeymap(OLD), 'migrating twice changes nothing')
console.log('keys ok')

// the saved settings in the browser (old key map + other settings) load migrated, once, and keep everything else
const store = { 'whiteboard-settings': JSON.stringify({ keymap: OLD, barrelAction: 'pan', fingerDraw: true, style: { color: '#dc2626' } }) }
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) }
const { settings, saveSettings } = await import('./src/store/settings.js')
assert.equal(settings.keymap['Ctrl+Alt+KeyZ'], 'laser'); assert.equal(settings.barrelAction, 'pan'); assert.equal(settings.fingerDraw, true); assert.equal(settings.style.color, '#dc2626')
saveSettings(); assert.equal(JSON.parse(store['whiteboard-settings']).kmv, 2, 'version stored so the migration never runs again')
console.log('settings migration ok')
process.exit(0)
