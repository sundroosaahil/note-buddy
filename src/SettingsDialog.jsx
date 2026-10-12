import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Settings, X } from 'lucide-react'
import { btn } from './ui.jsx'
import { ACTIONS } from './input/actions.js'
import { comboOf } from './input/keymap.js'
import { createBarrelDetector } from './input/barrel.js'
import { settings, saveSettings, resetKeymap } from './store/settings.js'

const LABELS = { undo: 'Undo', redo: 'Redo', toggleEraser: 'Toggle pen / eraser', holdPan: 'Hold to pan', zoomIn: 'Zoom in', zoomOut: 'Zoom out', nextPage: 'Next page', prevPage: 'Previous page', cycleColor: 'Cycle color' }
const pretty = (c) => c.replace(/Key([A-Z])/, '$1').replace(/Digit(\d)/, '$1').replace('BracketLeft', '[').replace('BracketRight', ']').replace('Numpad', 'Num ').replace('Add', '+').replace('Subtract', '−')
const h = 'mb-1 mt-4 text-sm font-semibold'

function Keys() {
  const [map, setMap] = useState(settings.keymap)
  const [listening, setListening] = useState(null)
  const commit = (m) => { settings.keymap = m; saveSettings(); setMap(m) }
  useEffect(() => {
    if (!listening) return
    settings.capturing = true // tells the global key handler to stay quiet while we record a combo
    const onKey = (e) => {
      e.preventDefault(); e.stopPropagation()
      if (e.repeat) return
      if (e.code === 'Escape') { setListening(null); return }
      const combo = comboOf(e); if (!combo) return // bare modifier: keep waiting
      const next = Object.fromEntries(Object.entries(settings.keymap).filter(([c, a]) => a !== listening && c !== combo))
      next[combo] = listening; commit(next); setListening(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => { settings.capturing = false; window.removeEventListener('keydown', onKey, true) }
  }, [listening])
  return (
    <>
      <p className="text-xs text-slate-500 dark:text-slate-300">Press Assign, then press a keyboard key or a tablet Express Key. Esc cancels. A key can only do one thing, so assigning it moves it.</p>
      {ACTIONS.map((a) => {
        const combo = Object.entries(map).find(([, act]) => act === a)?.[0]
        return (
          <div key={a} className="flex items-center justify-between gap-2 py-1">
            <span className="text-sm">{LABELS[a]}</span>
            <div className="flex items-center gap-2">
              <kbd className="min-w-24 rounded bg-slate-100 px-2 py-1 text-center text-xs dark:bg-slate-700">{listening === a ? 'Press a key…' : combo ? pretty(combo) : 'Not set'}</kbd>
              <button onClick={() => setListening(listening === a ? null : a)} className="h-9 rounded-lg px-3 text-xs ring-1 ring-slate-300 dark:ring-slate-600">{listening === a ? 'Cancel' : 'Assign'}</button>
            </div>
          </div>
        )
      })}
      <button onClick={() => { resetKeymap(); setMap(settings.keymap) }} className="mt-2 h-9 rounded-lg px-3 text-xs ring-1 ring-slate-300 dark:ring-slate-600">Reset to defaults</button>
    </>
  )
}

const BARREL = [['erase', 'Hold to erase (precision eraser)'], ['pan', 'Hold to pan'], ['toggleEraser', 'Toggle eraser'], ['undo', 'Undo']]
function Barrel() {
  const [v, setV] = useState(settings.barrelAction)
  return BARREL.map(([val, label]) => (
    <label key={val} className="flex h-11 items-center gap-3 text-sm">
      <input type="radio" name="barrel" checked={v === val} onChange={() => { settings.barrelAction = val; saveSettings(); setV(val) }} className="h-5 w-5" />{label}
    </label>
  ))
}

function Diag() { // listens on window because the dialog overlay covers the canvas
  const [d, setD] = useState({ pointerType: '-', buttons: 0, pressure: 0, held: false, menu: 0 })
  useEffect(() => {
    let tip = false, menu = 0
    const det = createBarrelDetector((held) => setD((x) => ({ ...x, held })))
    const upd = (e) => setD((x) => ({ ...x, pointerType: e.pointerType, buttons: e.buttons, pressure: e.pressure, menu }))
    const move = (e) => { upd(e); det.update(e, tip) }
    const down = (e) => { if (e.button !== 2) tip = true; det.resetCount(); upd(e); det.update(e, tip) }
    const up = (e) => { tip = false; upd(e); if (e.type === 'pointercancel') det.reset(); else det.update(e, false) }
    const menuEv = (e) => { e.preventDefault(); menu++; setD((x) => ({ ...x, menu })) }
    const L = [['pointermove', move], ['pointerdown', down], ['pointerup', up], ['pointercancel', up], ['contextmenu', menuEv]]
    L.forEach(([n, f]) => window.addEventListener(n, f))
    return () => L.forEach(([n, f]) => window.removeEventListener(n, f))
  }, [])
  const row = (k, v) => <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-300">{k}</span><span className="tabular-nums">{v}</span></div>
  return (
    <div className="space-y-1 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-300">Move the pen over this screen and hold the barrel button.</p>
      {row('pointerType', d.pointerType)}{row('buttons', d.buttons)}{row('pressure', d.pressure.toFixed(3))}
      {row('contextmenu events', d.menu)}
      <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-300">barrelHeld</span><span className={`rounded px-2 font-semibold ${d.held ? 'bg-green-600 text-white' : ''}`}>{d.held ? 'YES' : 'no'}</span></div>
    </div>
  )
}

export function SettingsButton() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild><button aria-label="Settings" title="Settings" className={btn(false)}><Settings size={20} /></button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(34rem,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-4 text-slate-800 shadow-xl dark:bg-slate-800 dark:text-slate-100">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">Settings</Dialog.Title>
            <Dialog.Close className={btn(false)} aria-label="Close"><X size={20} /></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Key mapping, pen button and diagnostics</Dialog.Description>
          <h3 className={h}>Keys</h3><Keys />
          <h3 className={h}>Pen barrel button</h3><Barrel />
          <h3 className={h}>Pen diagnostics</h3><Diag />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
