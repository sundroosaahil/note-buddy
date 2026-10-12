import { comboOf } from './keymap.js'
import { runAction } from './actions.js'

export function attachKeys(engine, getKeymap, isBlocked) {
  const held = {} // code -> action, so hold-pan releases even if modifiers changed
  const down = (e) => {
    if (isBlocked?.()) return // settings screen is recording a key combo
    const combo = comboOf(e); if (!combo) return
    const action = getKeymap()[combo]; if (!action) return
    e.preventDefault() // stop Chrome saving the page / page-zooming
    if (e.repeat) return
    held[e.code] = action; runAction(engine, action, true)
  }
  const up = (e) => { const a = held[e.code]; if (a) { delete held[e.code]; runAction(engine, a, false) } }
  window.addEventListener('keydown', down); window.addEventListener('keyup', up)
  return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
}
