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

export function attachKeys(engine, getKeymap, isBlocked) {
  const held = {} // code -> action, so hold-pan releases even if modifiers changed
  const down = (e) => {
    if (e.defaultPrevented || isBlocked?.() || typing(e.target)) return // already handled (Esc that just closed a popover), recording a key combo, or typing
    const combo = comboOf(e); if (combo === null) return // a bare modifier
    const action = combo ? getKeymap()[combo] : null // virtual keyboards often send an empty e.code; the fixed shortcuts only need e.key
    if (!action) { fixedShortcut(engine, e); return }
    e.preventDefault() // stop Chrome saving the page / page-zooming
    if (e.repeat) return
    held[e.code] = action; runAction(engine, action, true)
  }
  const up = (e) => { const a = held[e.code]; if (a) { delete held[e.code]; runAction(engine, a, false) } }
  window.addEventListener('keydown', down); window.addEventListener('keyup', up)
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
}
