import { DEFAULT_KEYMAP } from '../input/keymap.js'
import { ACTIONS } from '../input/actions.js'
// Small user settings live in localStorage (the board itself is in IndexedDB). `settings` is a plain mutable
// object so the key handler and pointer code can read it without React.
const KEY = 'whiteboard-settings'
export const settings = { keymap: { ...DEFAULT_KEYMAP }, barrelAction: 'erase', style: {}, capturing: false }
try {
  const d = JSON.parse(localStorage.getItem(KEY) || '{}')
  if (d.keymap && typeof d.keymap === 'object') settings.keymap = Object.fromEntries(Object.entries(d.keymap).filter(([, a]) => ACTIONS.includes(a)))
  if (['erase', 'pan', 'toggleEraser', 'undo'].includes(d.barrelAction)) settings.barrelAction = d.barrelAction
  if (d.style && typeof d.style === 'object') settings.style = d.style
} catch { /* corrupt or unavailable storage: use defaults */ }
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify({ keymap: settings.keymap, barrelAction: settings.barrelAction, style: settings.style })) } catch { /* ignore */ }
}
let t = 0
export const saveSoon = () => { clearTimeout(t); t = setTimeout(saveSettings, 500) }
export const resetKeymap = () => { settings.keymap = { ...DEFAULT_KEYMAP }; saveSettings() }
