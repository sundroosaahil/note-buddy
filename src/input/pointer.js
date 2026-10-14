import { runAction } from './actions.js'
import { createBarrelDetector } from './barrel.js'

// Finger drawing is optional: by default touches retain the existing selection and gesture behavior.
export function attachPointer(canvas, engine, getBarrelAction, getFingerDraw = () => false) {
  const touches = new Map()
  let tipId = null, mode = null, last = null, gest = null, lx = 0, ly = 0, touchTap = null // lx/ly: last tip position, touchTap: a finger that might be a tap
  let fingerTip = null
  let barrelOn = false, holdErase = false // holdErase: erasing by moving the pen while the barrel button is held (hovering or touching)
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const pressure = (e) => (e.pointerType === 'pen' ? Math.max(e.pressure, 0.05) : 0.5)
  engine.diag = { pointerType: '', buttons: 0, pressure: 0, barrelHeld: false } // read by the Stage 5 diagnostics screen

  // Hold-to-erase: the eraser follows the pen for as long as the barrel button is held. Drivers disagree on what they report
  // while the tip touches (buttons 3, or just 2), so contact is not required. One hold (or one touching drag) = one undo step.
  function beginHoldErase(e) {
    if (holdErase || tipId !== null) return
    holdErase = true; engine.beginErase()
    if (e) { const [x, y] = pos(e); engine.eraseTo(x, y) }
  }
  function endHoldErase() { if (holdErase) { holdErase = false; engine.endErase() } }

  function applyBarrel(on, e) {
    barrelOn = on; engine.diag.barrelHeld = on
    const a = getBarrelAction() // 'erase' (hold, always precision eraser) | 'pan' (hold) | 'toggleEraser' | 'undo'
    if (a === 'erase') { engine.override = on ? 'eraser' : null; engine.emit(); if (on) beginHoldErase(e); else endHoldErase() }
    else if (a === 'pan') runAction(engine, 'holdPan', on)
    else if (on) runAction(engine, a)
    if (e && tipId === e.pointerId) syncTipMode(e)
  }
  const det = createBarrelDetector(applyBarrel)
  const clearBarrel = () => det.reset()

  function gestureState() { const [a, b] = [...touches.values()]; return { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 } }
  const modeFor = () => { const t = engine.effectiveTool; return t === 'laser' ? 'laser' : engine.holdPan ? 'pan' : t === 'eraser' ? 'erase' : t === 'select' ? 'select' : t === 'shape' ? 'shape' : 'draw' }
  function leave(cancel) { // finish whatever the tip was doing
    if (mode === 'draw') engine.endStroke(); else if (mode === 'erase') engine.endErase()
    else if (mode === 'select') engine.selectUp(lx, ly)
    else if (mode === 'shape') { if (cancel) engine.cancelShape(); else engine.endShape() }
  }
  function enter(next, x, y, e) {
    mode = next
    if (next === 'erase') { engine.beginErase(); engine.eraseTo(x, y) }
    else if (next === 'draw') engine.beginStroke(x, y, pressure(e))
    else if (next === 'pan') last = [x, y]
    else if (next === 'select') engine.selectDown(x, y, e.shiftKey || e.ctrlKey) // shift/ctrl adds to the selection (desktop)
    else if (next === 'shape') engine.beginShape(x, y)
  }
  function endTip() {
    leave(false)
    tipId = null; mode = null
    if (barrelOn && getBarrelAction() === 'erase') beginHoldErase() // tip lifted but the button is still held: keep erasing
  }

  function syncTipMode(e) {
    const next = modeFor()
    if (next === mode) return
    const [x, y] = pos(e)
    leave(true); enter(next, x, y, e) // e.g. the pen button flipped the tool to eraser mid-drag
  }

  function startTip(e) {
    endHoldErase() // the touching drag becomes its own erase action
    tipId = e.pointerId; det.resetCount()
    try { canvas.setPointerCapture(e.pointerId) } catch { /* pointer no longer active */ }
    if (engine.editing) engine.endEdit() // touching the board finishes text editing
    const [x, y] = pos(e); lx = x; ly = y
    enter(modeFor(), x, y, e)
  }
  function drive(e) {
    const list = e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]
    for (const ev of list) {
      const [px, py] = pos(ev); lx = px; ly = py
      if (mode === 'draw') engine.extendStroke(px, py, pressure(ev))
      else if (mode === 'erase') engine.eraseTo(px, py)
      else if (mode === 'pan') { engine.panBy(px - last[0], py - last[1]); last = [px, py] }
      else if (mode === 'select') engine.selectMove(px, py)
      else if (mode === 'shape') engine.shapeTo(px, py)
    }
  }
  function dropFingerTip() {
    if (fingerTip === null) return
    if (mode === 'draw') engine.cancelStroke(); else leave(true)
    tipId = null; mode = null; fingerTip = null
  }
  const onDown = (e) => {
    e.preventDefault()
    if (e.pointerType === 'touch') { // palm rejection: fingers never draw
      if (engine.editing) engine.endEdit()
      const [tx, ty] = pos(e); touches.set(e.pointerId, [tx, ty])
      if (getFingerDraw() && touches.size === 1 && tipId === null && !engine.holdPan) {
        touchTap = null; fingerTip = e.pointerId; startTip(e); return
      }
      touchTap = touches.size === 1 ? { id: e.pointerId, x: tx, y: ty, t: performance.now(), moved: false } : null
      if (touches.size === 2) { dropFingerTip(); if (mode === 'draw') engine.cancelStroke(); gest = gestureState() }
      return
    }
    // the pen button (button 2: right mouse button in mouse mode, barrel button in pen mode) is never a drawing tip
    if (e.button === 2) { det.update(e, false); return }
    if (tipId !== null) return
    startTip(e)
  }
  const onMove = (e) => {
    if (e.pointerType === 'touch') {
      if (!touches.has(e.pointerId)) return
      touches.set(e.pointerId, pos(e))
      if (e.pointerId === fingerTip) { drive(e); return }
      if (touchTap) { const [tx, ty] = pos(e); if (touches.size > 1 || Math.hypot(tx - touchTap.x, ty - touchTap.y) > 8) touchTap = null } // moved: it is a pan, not a tap
      if (touches.size === 2 && gest) { const g = gestureState(); engine.panBy(g.cx - gest.cx, g.cy - gest.cy); engine.zoomAt(g.d / gest.d, g.cx, g.cy); gest = g }
      return
    }
    engine.diag.pointerType = e.pointerType; engine.diag.buttons = e.buttons; engine.diag.pressure = e.pressure
    det.update(e, e.pointerId === tipId) // barrel presses and releases arrive as moves, hovering or touching
    let started = false
    // holding the pen button, then touching down (or lifting the tip while still holding it) arrives as a move, not down/up
    if (tipId === null && (e.buttons & 1) && e.pressure > 0) { startTip(e); started = true }
    else if (tipId === e.pointerId && !(e.buttons & 1)) endTip()
    const [x, y] = pos(e); engine.setCursor(x, y)
    if (engine.effectiveTool === 'laser') engine.laserTo(x, y) // laser follows hover too
    if (holdErase && tipId === null) { // pen button held, tip not touching (or driver dropped the touch bit): erase along the path
      const list = e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]
      for (const ev of list) { const [px, py] = pos(ev); engine.eraseTo(px, py) }
      return
    }
    if (started || e.pointerId !== tipId || e.buttons === 0) return // hover only (or the tip just started on this event)
    drive(e)
  }
  const onUp = (e) => {
    if (e.pointerType === 'touch') {
      if (e.pointerId === fingerTip) { touches.delete(e.pointerId); touchTap = null; if (e.type === 'pointercancel') dropFingerTip(); else { fingerTip = null; endTip() } return }
      const tt = touchTap; touchTap = null; touches.delete(e.pointerId); if (touches.size < 2) gest = null
      // a quick finger tap selects (Select tool): fingers never draw, but they can pick things up
      if (tt && tt.id === e.pointerId && e.type !== 'pointercancel' && performance.now() - tt.t < 350 && engine.tool === 'select') engine.tapAt(tt.x, tt.y)
      return
    }
    // pointerup also fires for the barrel button; keep the tip interaction alive
    // while its primary button is still held.
    if (e.pointerId === tipId && (e.type === 'pointercancel' || !(e.buttons & 1))) endTip()
    if (e.type === 'pointercancel') clearBarrel()
    else det.update(e, e.pointerId === tipId) // release of the barrel button can leave the tip down
  }
  const onLost = (e) => { if (e.pointerType !== 'touch') { if (e.pointerId === tipId) endTip(); clearBarrel() } }
  const onWheel = (e) => { e.preventDefault(); const [x, y] = pos(e); engine.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y) }
  const noMenu = (e) => e.preventDefault() // barrel press fires contextmenu
  const onLeave = (e) => { engine.hideCursor(); if (e.pointerType !== 'touch' && tipId === null) clearBarrel() } // pen left the screen: drop a stuck barrel state

  const L = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp], ['lostpointercapture', onLost], ['pointerleave', onLeave], ['contextmenu', noMenu]]
  L.forEach(([n, f]) => canvas.addEventListener(n, f))
  canvas.addEventListener('wheel', onWheel, { passive: false })
  document.addEventListener('contextmenu', noMenu)
  return () => {
    L.forEach(([n, f]) => canvas.removeEventListener(n, f))
    canvas.removeEventListener('wheel', onWheel); document.removeEventListener('contextmenu', noMenu)
  }
}
