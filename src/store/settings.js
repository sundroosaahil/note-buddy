import { DEFAULT_KEYMAP, migrateKeymap } from '../input/keymap.js'
import { ACTIONS } from '../input/actions.js'
// Small user settings live in localStorage (the board itself is in IndexedDB). `settings` is a plain mutable
// object so the key handler and pointer code can read it without React.
const KEY = 'whiteboard-settings'
const KEYMAP_VERSION = 2
export const settings = { keymap: { ...DEFAULT_KEYMAP }, barrelAction: 'erase', fingerDraw: false, style: {}, capturing: false, dialogOpen: false }
try {
  const d = JSON.parse(localStorage.getItem(KEY) || '{}')
  if (d.keymap && typeof d.keymap === 'object') {
    settings.keymap = Object.fromEntries(Object.entries(d.keymap).filter(([, a]) => ACTIONS.includes(a)))
    if ((d.kmv || 1) < KEYMAP_VERSION) settings.keymap = migrateKeymap(settings.keymap)
  }
  if (['erase', 'pan', 'toggleEraser', 'undo'].includes(d.barrelAction)) settings.barrelAction = d.barrelAction
  if (typeof d.fingerDraw === 'boolean') settings.fingerDraw = d.fingerDraw
  if (d.style && typeof d.style === 'object') settings.style = d.style
} catch { /* corrupt or unavailable storage: use defaults */ }
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify({ kmv: KEYMAP_VERSION, keymap: settings.keymap, barrelAction: settings.barrelAction, fingerDraw: settings.fingerDraw, style: settings.style })) } catch { /* ignore */ }
}
let t = 0
export const saveSoon = () => { clearTimeout(t); t = setTimeout(saveSettings, 500) }
export const resetKeymap = () => { settings.keymap = { ...DEFAULT_KEYMAP }; saveSettings() }
