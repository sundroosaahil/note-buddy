import { runAction } from './actions.js'
import { createBarrelDetector } from './barrel.js'

export function attachPointer(canvas, engine, getBarrelAction) {
  const touches = new Map()
  let tipId = null, mode = null, last = null, gest = null
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const pressure = (e) => (e.pointerType === 'pen' ? Math.max(e.pressure, 0.05) : 0.5)
  engine.diag = { pointerType: '', buttons: 0, pressure: 0, barrelHeld: false } // read by the Stage 5 diagnostics screen

  function applyBarrel(on, e) {
    engine.diag.barrelHeld = on
    const a = getBarrelAction() // 'erase' (hold, always precision eraser) | 'pan' (hold) | 'toggleEraser' | 'undo'
    if (a === 'erase') { engine.override = on ? 'eraser' : null; engine.emit() }
    else if (a === 'pan') runAction(engine, 'holdPan', on)
    else if (on) runAction(engine, a)
    if (e && tipId === e.pointerId) syncTipMode(e)
  }
  const det = createBarrelDetector(applyBarrel)
  const clearBarrel = () => det.reset()

  function gestureState() { const [a, b] = [...touches.values()]; return { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 } }
  function endTip() {
    if (mode === 'draw') engine.endStroke(); else if (mode === 'erase') engine.endErase()
    tipId = null; mode = null
  }

  function syncTipMode(e) {
    const next = engine.effectiveTool === 'laser' ? 'laser' : engine.holdPan ? 'pan' : engine.effectiveTool === 'eraser' ? 'erase' : 'draw'
    if (next === mode) return
    const [x, y] = pos(e)
    if (mode === 'draw') engine.endStroke()
    else if (mode === 'erase') engine.endErase()
    mode = next
    if (next === 'erase') { engine.beginErase(); engine.eraseTo(x, y) }
    else if (next === 'draw') engine.beginStroke(x, y, pressure(e))
    else if (next === 'pan') last = [x, y]
  }

  function startTip(e) {
    tipId = e.pointerId; det.resetCount()
    try { canvas.setPointerCapture(e.pointerId) } catch { /* pointer no longer active */ }
    const [x, y] = pos(e), t = engine.effectiveTool
    if (t === 'laser') mode = 'laser'
    else if (engine.holdPan) { mode = 'pan'; last = [x, y] }
    else if (t === 'eraser') { mode = 'erase'; engine.beginErase(); engine.eraseTo(x, y) }
    else { mode = 'draw'; engine.beginStroke(x, y, pressure(e)) }
  }
  const onDown = (e) => {
    e.preventDefault()
    if (e.pointerType === 'touch') { // palm rejection: fingers never draw
      touches.set(e.pointerId, pos(e))
      if (touches.size === 2) { if (mode === 'draw') engine.cancelStroke(); gest = gestureState() }
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
    if (started || e.pointerId !== tipId || e.buttons === 0) return // hover only (or the tip just started on this event)
    const list = e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]
    for (const ev of list) {
      const [px, py] = pos(ev)
      if (mode === 'draw') engine.extendStroke(px, py, pressure(ev))
      else if (mode === 'erase') engine.eraseTo(px, py)
      else if (mode === 'pan') { engine.panBy(px - last[0], py - last[1]); last = [px, py] }
    }
  }
  const onUp = (e) => {
    if (e.pointerType === 'touch') { touches.delete(e.pointerId); if (touches.size < 2) gest = null; return }
    // pointerup also fires for the barrel button; keep the tip interaction alive
    // while its primary button is still held.
    if (e.pointerId === tipId && (e.type === 'pointercancel' || !(e.buttons & 1))) endTip()
    if (e.type === 'pointercancel') clearBarrel()
    else det.update(e, e.pointerId === tipId) // release of the barrel button can leave the tip down
  }
  const onLost = (e) => { if (e.pointerType !== 'touch') { if (e.pointerId === tipId) endTip(); clearBarrel() } }
  const onWheel = (e) => { e.preventDefault(); const [x, y] = pos(e); engine.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y) }
  const noMenu = (e) => e.preventDefault() // barrel press fires contextmenu
  const onLeave = () => engine.hideCursor()

  const L = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp], ['lostpointercapture', onLost], ['pointerleave', onLeave], ['contextmenu', noMenu]]
  L.forEach(([n, f]) => canvas.addEventListener(n, f))
  canvas.addEventListener('wheel', onWheel, { passive: false })
  document.addEventListener('contextmenu', noMenu)
  return () => {
    L.forEach(([n, f]) => canvas.removeEventListener(n, f))
    canvas.removeEventListener('wheel', onWheel); document.removeEventListener('contextmenu', noMenu)
  }
}
