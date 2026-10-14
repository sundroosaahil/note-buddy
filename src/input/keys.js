import { comboOf } from './keymap.js'
import { runAction } from './actions.js'

const typing = (t) => t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'color')) // never steal keys from a text field

// Fixed shortcuts for the object layer (not remappable): Delete, Esc, Ctrl+C copy, Ctrl+D duplicate, Ctrl+A select all.
// Ctrl+V is handled by the browser's paste event (App.jsx), so it can also bring in images from the clipboard.
function fixedShortcut(engine, e) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod && !e.altKey) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && engine.sel.size) { e.preventDefault(); engine.deleteSelected() }
    else if (e.key === 'Escape' && engine.sel.size) engine.clearSelection()
    return
  }
  if (!mod || e.altKey || e.shiftKey) return
  const k = e.key.toLowerCase()
  if (k === 'c' && engine.sel.size) { e.preventDefault(); engine.copySelected() }
  else if (k === 'd' && engine.sel.size) { e.preventDefault(); engine.duplicateSelected() }
  else if (k === 'a') { e.preventDefault(); engine.selectAll() }
}

// Some keys do two things depending on how long they are held:
//   toggleEraser: tap = switch pen/eraser, hold 0.7 s = clear the page (a warning appears after 0.25 s; letting go before 0.7 s cancels; one undo step)
//   holdPan:      hold = pan (starts at once), a quick tap that did not pan = switch the Select tool
// A tap therefore acts when the key is RELEASED, so holding to clear never flips the tool first.
const HOLD_CLEAR_MS = 700, TAP_MS = 300, HINT_AFTER_MS = 250

export function attachKeys(engine, getKeymap, isBlocked) {
  const held = {} // code -> { action, t, timer, hintT, hinted, cleared }, so releases work even if modifiers changed
  const clearPage = () => {
    const had = engine.page.strokes.length + engine.page.objects.length > 0
    engine.clearPage(); engine.setHint?.(had ? 'Page cleared · Undo brings it back' : 'Page is already empty', 2500)
  }
  const release = (e, cancel) => { // cancel: the window lost focus, so never treat it as a tap
    const h = held[e.code]; if (!h) return
    delete held[e.code]; clearTimeout(h.timer); clearTimeout(h.hintT)
    if (h.action === 'toggleEraser') {
      if (h.hinted && !h.cleared) engine.setHint?.(null)
      if (!h.cleared && !h.hinted && !cancel) runAction(engine, 'toggleEraser') // a tap; letting go after the warning appeared = changed your mind, nothing happens
    } else if (h.action === 'holdPan') {
      runAction(engine, 'holdPan', false)
      if (!cancel && performance.now() - h.t < TAP_MS && !engine.panned) engine.toggleSelect()
    } else runAction(engine, h.action, false)
  }
  const down = (e) => {
    if (e.defaultPrevented || isBlocked?.() || typing(e.target)) return // already handled (Esc that just closed a popover), recording a key combo, or typing
    const combo = comboOf(e); if (combo === null) return // a bare modifier
    const action = combo ? getKeymap()[combo] : null // virtual keyboards often send an empty e.code; the fixed shortcuts only need e.key
    if (!action) { fixedShortcut(engine, e); return }
    e.preventDefault() // stop Chrome saving the page / page-zooming
    if (e.repeat) return
    const h = (held[e.code] = { action, t: performance.now() })
    if (action === 'toggleEraser') {
      h.hintT = setTimeout(() => { h.hinted = true; engine.setHint?.('Keep holding to clear the page…') }, HINT_AFTER_MS)
      h.timer = setTimeout(() => { h.cleared = true; clearPage() }, HOLD_CLEAR_MS)
    } else if (action === 'holdPan') { engine.panned = false; runAction(engine, 'holdPan', true) }
    else runAction(engine, action, true)
  }
  const up = (e) => release(e, false)
  const blur = () => { for (const code of Object.keys(held)) release({ code }, true) } // a key released while the window was away never sends keyup
  window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); blur() }
}
