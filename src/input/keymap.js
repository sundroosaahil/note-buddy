// Combos look like "Ctrl+Alt+KeyZ": modifiers + event.code, matching the verified Huion express-key output.
export const DEFAULT_KEYMAP = {
  'Ctrl+KeyS': 'undo', BracketRight: 'toggleEraser', BracketLeft: 'holdPan',
  'Ctrl+NumpadAdd': 'zoomIn', 'Ctrl+NumpadSubtract': 'zoomOut', 'Ctrl+Alt+KeyZ': 'laser', // express key 6 = laser pointer
  PageDown: 'nextPage', PageUp: 'prevPage',
  'Ctrl+KeyZ': 'undo', 'Ctrl+KeyY': 'redo', 'Ctrl+Shift+KeyZ': 'redo', // ordinary keyboard shortcuts (express key 6 is no longer redo)
}
// Older saved key maps still have express key 6 = redo. Move it to the laser and make sure redo keeps a key, without touching
// anything the teacher assigned themselves.
export function migrateKeymap(map) {
  const k = { ...map }
  if (k['Ctrl+Alt+KeyZ'] === 'redo') k['Ctrl+Alt+KeyZ'] = 'laser'
  else if (!('Ctrl+Alt+KeyZ' in k) && !Object.values(k).includes('laser')) k['Ctrl+Alt+KeyZ'] = 'laser'
  if (!Object.values(k).includes('redo')) for (const c of ['Ctrl+KeyY', 'Ctrl+Shift+KeyZ']) if (!(c in k)) k[c] = 'redo'
  return k
}
export function comboOf(e) {
  if (/^(Control|Alt|Shift|Meta)(Left|Right)$/.test(e.code)) return null // bare modifiers
  const m = []
  if (e.ctrlKey) m.push('Ctrl'); if (e.altKey) m.push('Alt'); if (e.shiftKey) m.push('Shift'); if (e.metaKey) m.push('Meta')
  return [...m, e.code].join('+')
}
