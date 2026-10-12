import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as Slider from '@radix-ui/react-slider'
import { Pen, Highlighter, Eraser, Undo2, Redo2, ZoomIn, ZoomOut, Minus, Plus, Sun, Moon, EyeOff, Crosshair, Maximize, Minimize } from 'lucide-react'
import { Engine, PALETTE } from './engine/Engine.js'
import { attachPointer } from './input/pointer.js'
import { attachKeys } from './input/keys.js'
import { runAction } from './input/actions.js'
import { settings, saveSoon } from './store/settings.js'
import { SettingsButton } from './SettingsDialog.jsx'
import { btn, panel, Btn } from './ui.jsx'
import { PageBar, BgPopover } from './PageBar.jsx'
import { ExportMenu } from './ExportMenu.jsx'
import { loadBoard } from './store/db.js'
import { createAutosave } from './store/autosave.js'

function Slide({ label, value, min, max, onChange }) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
      <span className="w-14">{label}</span>
      <Slider.Root className="relative flex h-8 w-40 touch-none items-center" value={[value]} min={min} max={max} step={1} onValueChange={(v) => onChange(v[0])}>
        <Slider.Track className="relative h-1.5 grow rounded-full bg-slate-300 dark:bg-slate-600"><Slider.Range className="absolute h-full rounded-full bg-indigo-600" /></Slider.Track>
        <Slider.Thumb aria-label={label} className="block h-6 w-6 rounded-full bg-white shadow ring-2 ring-indigo-600" />
      </Slider.Root>
      <span className="w-8 text-right">{value}</span>
    </div>
  )
}

function PenPopover({ s, eng }) {
  const isDraw = s.baseTool === 'pen' || s.baseTool === 'highlighter'
  const Icon = s.drawTool === 'highlighter' ? Highlighter : Pen
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button aria-label="Pen options" title="Pen options" className={btn(isDraw)} onClick={() => !isDraw && eng().setTool(s.drawTool)}><Icon size={20} /></button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="right" sideOffset={10} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} className={`${panel} z-50 flex flex-col gap-3 p-3`}>
          <div className="flex gap-1.5">
            <Btn label="Pen" active={s.drawTool === 'pen'} onClick={() => eng().setTool('pen')}><Pen size={20} /></Btn>
            <Btn label="Highlighter" active={s.drawTool === 'highlighter'} onClick={() => eng().setTool('highlighter')}><Highlighter size={20} /></Btn>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PALETTE.map((c) => (
              <button key={c} aria-label={`Color ${c}`} onClick={() => eng().setColor(c)} style={{ background: c }}
                className={`h-9 w-9 rounded-full border border-slate-300 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 ${s.color === c ? 'ring-indigo-600' : 'ring-transparent'}`} />
            ))}
            <input type="color" aria-label="Custom color" value={s.color} onChange={(ev) => eng().setColor(ev.target.value)} className="h-9 w-9 cursor-pointer rounded-full border-0 bg-transparent p-0" />
          </div>
          <Slide label="Width" value={s.width} min={1} max={24} onChange={(v) => eng().setWidth(v)} />
          {s.drawTool === 'pen' && <Slide label="Opacity" value={Math.round(s.opacity * 100)} min={10} max={100} onChange={(v) => eng().setOpacity(v / 100)} />}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export default function App() {
  const canvasRef = useRef(null), engineRef = useRef(null)
  const [s, setS] = useState(null)
  const [dark, setDark] = useState(() => localStorage.getItem('ui-dark') === '1')
  const [presenter, setPresenter] = useState(false)
  const [hudOn, setHudOn] = useState(false)
  const [fs, setFs] = useState(false)

  useEffect(() => {
    let dead = false, cleanup = () => {}
    navigator.storage?.persist?.() // ask Chrome not to evict the saved board under storage pressure
    ;(async () => {
      let data = null
      try { data = await loadBoard() } catch (e) { console.warn('load failed', e) }
      if (dead) return // StrictMode / fast unmount
      const onChange = (snap) => {
        setS(snap)
        settings.style = { color: snap.color, width: snap.width, opacity: snap.opacity, drawTool: snap.drawTool, eraserRadius: snap.eraserRadius, eraserMode: snap.eraserMode }
        saveSoon()
      }
      const canvas = canvasRef.current, engine = new Engine(canvas, onChange)
      engine.applyStyle(settings.style)
      engineRef.current = engine; engine.resize()
      engine.save = createAutosave(engine)
      if (data) engine.restore(data)
      const ro = new ResizeObserver(() => engine.resize()); ro.observe(canvas)
      const offP = attachPointer(canvas, engine, () => settings.barrelAction)
      const offK = attachKeys(engine, () => settings.keymap, () => settings.capturing)
      engine.emit()
      cleanup = () => { ro.disconnect(); offP(); offK(); engine.save.destroy(); engine.destroy() }
    })()
    return () => { dead = true; cleanup() }
  }, [])
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('ui-dark', dark ? '1' : '0') }, [dark])

  // HUD: appears for 3 seconds whenever a tool is chosen or the zoom changes, then fades out
  useEffect(() => {
    if (!s) return
    setHudOn(true); const t = setTimeout(() => setHudOn(false), 3000)
    return () => clearTimeout(t)
  }, [s?.tool, s?.zoom, s?.ping])
  // Keep the screen awake while the board is open (the lock is released when the tab hides, so re-acquire on return)
  useEffect(() => {
    let lock = null
    const acquire = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen') } catch { /* denied */ } }
    const onVis = () => { if (document.visibilityState === 'visible') acquire() }
    acquire(); document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release?.() }
  }, [])
  useEffect(() => {
    const f = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}) }

  const eng = () => engineRef.current, act = (n) => runAction(eng(), n)
  return (
    <div className="fixed inset-0 bg-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {s && !presenter && (
        <>
          <div className={`${panel} absolute left-2 top-1/2 flex max-h-[96%] -translate-y-1/2 flex-col gap-1 overflow-y-auto p-1.5`}>
            <PenPopover s={s} eng={eng} />
            <Btn label="Eraser" active={s.baseTool === 'eraser'} onClick={() => act('toggleEraser')}><Eraser size={20} /></Btn>
            <Btn label="Laser pointer" active={s.baseTool === 'laser'} onClick={() => eng().setTool(s.baseTool === 'laser' ? s.drawTool : 'laser')}><Crosshair size={20} /></Btn>
            <BgPopover s={s} eng={eng} />
            <Btn label="Undo" disabled={!s.canUndo} onClick={() => act('undo')}><Undo2 size={20} /></Btn>
            <Btn label="Redo" disabled={!s.canRedo} onClick={() => act('redo')}><Redo2 size={20} /></Btn>
            <Btn label="Zoom in" onClick={() => act('zoomIn')}><ZoomIn size={20} /></Btn>
            <Btn label="Zoom out" onClick={() => act('zoomOut')}><ZoomOut size={20} /></Btn>
            <ExportMenu eng={eng} />
            <Btn label="Fullscreen" active={fs} onClick={toggleFs}>{fs ? <Minimize size={20} /> : <Maximize size={20} />}</Btn>
            <SettingsButton />
            <Btn label="Dark UI" onClick={() => setDark(!dark)}>{dark ? <Sun size={20} /> : <Moon size={20} />}</Btn>
            <Btn label="Presenter mode (hide toolbar)" onClick={() => setPresenter(true)}><EyeOff size={20} /></Btn>
          </div>
          {s.baseTool === 'eraser' && (
            <div className={`${panel} absolute left-[4.5rem] top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 p-1.5`}>
              <Btn label="Precision eraser: erases only the part you touch" active={s.eraserMode === 'precise'} onClick={() => eng().setEraserMode('precise')}><span className="text-[10px]">Precise</span></Btn>
              <Btn label="Stroke eraser: removes every stroke you touch" active={s.eraserMode === 'stroke'} onClick={() => eng().setEraserMode('stroke')}><span className="text-[10px]">Stroke</span></Btn>
              <Btn label="Bigger eraser" onClick={() => eng().adjustEraser(6)}><Plus size={20} /></Btn>
              <span className="text-xs text-slate-600 dark:text-slate-300">{s.eraserRadius}px</span>
              <Btn label="Smaller eraser" onClick={() => eng().adjustEraser(-6)}><Minus size={20} /></Btn>
            </div>
          )}
        </>
      )}
      {s && !presenter && <PageBar s={s} eng={eng} />}
      {presenter && (
        <button aria-label="Show toolbar" onClick={() => setPresenter(false)}
          className="absolute left-0 top-1/2 h-14 w-3 -translate-y-1/2 rounded-r-lg bg-slate-500/30 hover:w-6 hover:bg-slate-500/60" />
      )}
      {s && !presenter && (
        <div className={`pointer-events-none absolute bottom-2 right-3 rounded-lg bg-slate-900/60 px-2 py-1 text-xs text-white transition-opacity duration-500 ${hudOn ? 'opacity-100' : 'opacity-0'}`}>{s.holdPan ? 'pan' : s.tool} · {s.zoom}%</div>
      )}
    </div>
  )
}
