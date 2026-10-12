// Combos look like "Ctrl+Alt+KeyZ": modifiers + event.code, matching the verified Huion express-key output.
export const DEFAULT_KEYMAP = {
  'Ctrl+KeyS': 'undo', BracketRight: 'toggleEraser', BracketLeft: 'holdPan',
  'Ctrl+NumpadAdd': 'zoomIn', 'Ctrl+NumpadSubtract': 'zoomOut', 'Ctrl+Alt+KeyZ': 'redo',
  PageDown: 'nextPage', PageUp: 'prevPage',
}
export function comboOf(e) {
  if (/^(Control|Alt|Shift|Meta)(Left|Right)$/.test(e.code)) return null // bare modifiers
  const m = []
  if (e.ctrlKey) m.push('Ctrl'); if (e.altKey) m.push('Alt'); if (e.shiftKey) m.push('Shift'); if (e.metaKey) m.push('Meta')
  return [...m, e.code].join('+')
}
