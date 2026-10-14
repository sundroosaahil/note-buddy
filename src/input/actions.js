// One place mapping action names to engine calls, shared by keys, barrel button and on-screen buttons.
export const ACTIONS = ['undo', 'redo', 'toggleEraser', 'holdPan', 'zoomIn', 'zoomOut', 'nextPage', 'prevPage', 'cycleColor', 'laser']
export function runAction(engine, name, down = true) {
  if (name === 'holdPan') { engine.holdPan = down; engine.emit(); return }
  if (!down) return
  switch (name) {
    case 'undo': return engine.undo()
    case 'redo': return engine.redo()
    case 'toggleEraser': return engine.toggleEraser()
    case 'zoomIn': return engine.zoomBy(1.25)
    case 'zoomOut': return engine.zoomBy(0.8)
    case 'nextPage': return engine.nextPage()
    case 'prevPage': return engine.prevPage()
    case 'cycleColor': return engine.cycleColor()
    case 'laser': return engine.toggleLaser()
    default: return
  }
}
