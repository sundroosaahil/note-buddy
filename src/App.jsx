import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Pen, Highlighter, Eraser, Undo2, Redo2, ZoomIn, ZoomOut, Minus, Plus, Sun, Moon, EyeOff, Crosshair, Maximize, Minimize, MousePointer2, WandSparkles, Ellipsis, Settings, House, Smartphone, Hand } from 'lucide-react'
import { Engine, PALETTE } from './engine/Engine.js'
import { attachPointer } from './input/pointer.js'
import { attachKeys } from './input/keys.js'
import { runAction } from './input/actions.js'
import { settings, saveSoon, saveSettings } from './store/settings.js'
import { SettingsDialog } from './SettingsDialog.jsx'
import { Slide } from './controls.jsx'
import { ShapesPopover, NotesPopover } from './ToolPopovers.jsx'
import { SelectionBar } from './SelectionBar.jsx'
import { TextEditor } from './TextEditor.jsx'
import { btn, panel, Btn, useCompact } from './ui.jsx'
import { PageBar, BgPopover } from './PageBar.jsx'
import { ExportMenu } from './ExportMenu.jsx'
import { loadBoard as loadLegacyBoard, pruneBlobs } from './store/db.js'
import { loadBoard as loadNotebookBoard } from './lib/notebooks.js'
import { createAutosave } from './store/autosave.js'
import HomePage from './components/HomePage.jsx'

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
                className={`h-9 w-9 rounded-full border border-[#202124] ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 ${s.color === c ? 'ring-[#2196f3]' : 'ring-transparent'}`} />
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
  const [activeNotebookId, setActiveNotebookId] = useState(null)
  const [s, setS] = useState(null)
  const [dark, setDark] = useState(() => localStorage.getItem('ui-dark') === '1')
  const [presenter, setPresenter] = useState(false)
  const [hudOn, setHudOn] = useState(false)
  const [fs, setFs] = useState(false)
  const [more, setMore] = useState(false), [settingsOpen, setSettingsOpen] = useState(false)
  const compact = useCompact()
  const [drawing, setDrawing] = useState(false) // a finger/pen is down on the board: phones fade the bars so they never hide the writing
  const [fingerDraw, setFingerDraw] = useState(settings.fingerDraw)
  const toggleFingerDraw = () => { settings.fingerDraw = !settings.fingerDraw; saveSettings(); setFingerDraw(settings.fingerDraw) }
  const [starting, setStarting] = useState(true)
  const [portraitBoard, setPortraitBoard] = useState(false)

  useEffect(() => { const timer = setTimeout(() => setStarting(false), 850); return () => clearTimeout(timer) }, [])
  useEffect(() => {
    const update = () => setPortraitBoard(Boolean(activeNotebookId) && window.matchMedia('(max-width: 640px)').matches && window.innerHeight > window.innerWidth)
    update(); window.addEventListener('resize', update); window.addEventListener('orientationchange', update)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('orientationchange', update) }
  }, [activeNotebookId])

  useEffect(() => {
    if (!activeNotebookId) { setS(null); return }
    let dead = false, cleanup = () => {}
    navigator.storage?.persist?.() // ask Chrome not to evict the saved board under storage pressure
    ;(async () => {
      let data = null
      try { data = await loadNotebookBoard(activeNotebookId) } catch (e) { console.warn('load failed', e) }
      if (dead) return // StrictMode / fast unmount
      const onChange = (snap) => {
        setS(snap)
        settings.style = { color: snap.color, width: snap.width, opacity: snap.opacity, drawTool: snap.drawTool, eraserRadius: snap.eraserRadius, eraserMode: snap.eraserMode,
          snap: snap.snap, shapeKind: snap.shapeKind, shapeFill: snap.shapeFill, shapeFillOpacity: snap.shapeFillOpacity }
        saveSoon()
      }
      const canvas = canvasRef.current, engine = new Engine(canvas, onChange)
      engine.applyStyle(settings.style)
      engineRef.current = engine; engine.resize()
      engine.save = createAutosave(engine, activeNotebookId)
      if (data) {
        engine.restore(data)
        // forget stored images no page uses any more (safe now: the undo history is empty at startup)
        pruneBlobs(new Set(engine.pages.flatMap((p) => p.objects.filter((o) => o.type === 'image').map((o) => o.blobId)))).catch(() => {})
      }
      const ro = new ResizeObserver(() => engine.resize()); ro.observe(canvas)
      const offP = attachPointer(canvas, engine, () => settings.barrelAction, () => settings.fingerDraw)
      const offK = attachKeys(engine, () => settings.keymap, () => settings.capturing || settings.dialogOpen)
      const down = new Set(), onDown = (e) => { down.add(e.pointerId); setDrawing(true) }, onUp = (e) => { down.delete(e.pointerId); if (!down.size) setDrawing(false) }
      canvas.addEventListener('pointerdown', onDown); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp)
      engine.emit()
      cleanup = () => { ro.disconnect(); offP(); offK(); canvas.removeEventListener('pointerdown', onDown); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); setDrawing(false); engine.save.destroy(); engine.destroy() }
    })()
    return () => { dead = true; cleanup() }
  }, [activeNotebookId])
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
  // Ctrl+V: a picture from the clipboard becomes an image object; otherwise paste whatever was copied inside the app
  useEffect(() => {
    const onPaste = (e) => {
      const t = e.target; if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return
      const en = engineRef.current; if (!en) return
      const img = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
      if (img) { const f = img.getAsFile(); if (f) { e.preventDefault(); en.addImage(f) } return }
      if (en.hasClip()) { e.preventDefault(); en.paste() }
    }
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste)
  }, [])
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}) }

  const eng = () => engineRef.current, act = (n) => runAction(eng(), n)
  const snapBtn = s && <Btn label="Shape snapping: hold the pen still at the end of a stroke to straighten it" active={s.snap} onClick={() => eng().setSnap(!s.snap)}><WandSparkles size={20} /></Btn>
  const laserBtn = s && <Btn label="Laser pointer" active={s.baseTool === 'laser'} onClick={() => eng().setTool(s.baseTool === 'laser' ? s.drawTool : 'laser')}><Crosshair size={20} /></Btn>
  const fade = compact && drawing ? 'opacity-25' : ''
  const openNotebook = async (id) => {
    if (window.matchMedia('(max-width: 640px)').matches) {
      try { await screen.orientation?.lock?.('landscape') } catch { /* Unsupported in some mobile browsers; the board shows a rotate prompt. */ }
    }
    setActiveNotebookId(id)
  }
  const goHome = async () => { await engineRef.current?.save?.flush(); setActiveNotebookId(null) }
  if (starting) return <div className="app-splash" role="status" aria-label="Loading Notebook Buddy"><svg className="splash-pen" viewBox="0 0 100 130" aria-hidden="true"><path d="M36 18a8 8 0 0 1 8-8h12a8 8 0 0 1 8 8v8H36zM34 26h32v70H34zM34 81h32v15H34zM34 96h32l-16 28z" fill="#202124" /></svg><span className="splash-write" /><strong>Notebook Buddy</strong></div>
  if (!activeNotebookId) return <HomePage onOpen={openNotebook} />
  return (
    <div className="fixed inset-0 bg-white">
      {portraitBoard && <div className="rotate-prompt"><div className="rotate-card"><Smartphone size={38} strokeWidth={1.7} /><strong>Turn your phone sideways</strong><span>The notebook works best in landscape.</span></div></div>}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {s && !presenter && (
        <>
          {!compact && <button aria-label="All notebooks" title="All notebooks" onClick={goHome}
            className={`${btn(false)} absolute right-3 top-3 z-20`}><House size={20} /></button>}
          <div className={`${panel} absolute top-1/2 flex max-h-[96%] -translate-y-1/2 flex-col overflow-y-auto transition-opacity duration-200 ${compact ? 'gap-0.5 p-1' : 'left-2 gap-1 p-1.5'} ${fade}`}
            style={compact ? { left: 'max(0.5rem, env(safe-area-inset-left))' } : undefined} /* phones: one slim column, secondary tools live in More */>
            <PenPopover s={s} eng={eng} />
            <Btn label="Eraser" active={s.baseTool === 'eraser'} onClick={() => act('toggleEraser')}><Eraser size={20} /></Btn>
            <Btn label="Select: tap an item, or drag a loop to lasso" active={s.baseTool === 'select'} onClick={() => eng().setTool(s.baseTool === 'select' ? s.drawTool : 'select')}><MousePointer2 size={20} /></Btn>
            {!compact && <ShapesPopover s={s} eng={eng} />}
            {!compact && <NotesPopover s={s} eng={eng} />}
            {!compact && snapBtn}
            {!compact && laserBtn}
            {!compact && <BgPopover s={s} eng={eng} />}
            <Btn label="Undo" disabled={!s.canUndo} onClick={() => act('undo')}><Undo2 size={20} /></Btn>
            <Btn label="Redo" disabled={!s.canRedo} onClick={() => act('redo')}><Redo2 size={20} /></Btn>
            <Popover.Root open={more} onOpenChange={setMore}>
              <Popover.Trigger asChild><button aria-label="More" title="More tools, export and settings" className={btn(false)}><Ellipsis size={20} /></button></Popover.Trigger>
              <Popover.Portal>
                <Popover.Content side="right" sideOffset={10} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} className={`${panel} z-50 grid grid-cols-4 gap-1 p-2`}>
                  {compact && <><ShapesPopover s={s} eng={eng} /><NotesPopover s={s} eng={eng} />{snapBtn}{laserBtn}<BgPopover s={s} eng={eng} /></>}
                  <Btn label={fingerDraw ? 'Finger drawing is on (tap to turn off)' : 'Draw with finger (for phones without a pen)'} active={fingerDraw} onClick={toggleFingerDraw}><Hand size={20} /></Btn>
                  <Btn label="Zoom out" onClick={() => act('zoomOut')}><ZoomOut size={20} /></Btn>
                  <Btn label="Zoom in" onClick={() => act('zoomIn')}><ZoomIn size={20} /></Btn>
                  <ExportMenu eng={eng} />
                  <Btn label="Fullscreen" active={fs} onClick={toggleFs}>{fs ? <Minimize size={20} /> : <Maximize size={20} />}</Btn>
                  <Btn label="Dark UI" onClick={() => setDark(!dark)}>{dark ? <Sun size={20} /> : <Moon size={20} />}</Btn>
                  <Btn label="Settings" onClick={() => { setMore(false); setSettingsOpen(true) }}><Settings size={20} /></Btn>
                  <Btn label="Presenter mode (hide toolbar)" onClick={() => { setMore(false); setPresenter(true) }}><EyeOff size={20} /></Btn>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
          <SelectionBar s={s} eng={eng} />
          {s.baseTool === 'eraser' && compact && (
            <div className={`${panel} absolute top-2 flex items-center gap-0.5 p-1 transition-opacity duration-200 ${fade}`} style={{ left: 'calc(max(0.5rem, env(safe-area-inset-left)) + 3.25rem)' }}>
              <Btn label="Precision eraser: erases only the part you touch" active={s.eraserMode === 'precise'} onClick={() => eng().setEraserMode('precise')}><span className="text-[9px]">Precise</span></Btn>
              <Btn label="Stroke eraser: removes every stroke you touch" active={s.eraserMode === 'stroke'} onClick={() => eng().setEraserMode('stroke')}><span className="text-[9px]">Stroke</span></Btn>
              <Btn label="Smaller eraser" onClick={() => eng().adjustEraser(-6)}><Minus size={18} /></Btn>
              <span className="w-9 text-center text-xs text-slate-600 dark:text-slate-300">{s.eraserRadius}px</span>
              <Btn label="Bigger eraser" onClick={() => eng().adjustEraser(6)}><Plus size={18} /></Btn>
            </div>
          )}
          {s.baseTool === 'eraser' && !compact && (
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
      {s && !presenter && <PageBar s={s} eng={eng} compact={compact} fade={fade} onHome={goHome} />}
      {s?.editing && <TextEditor info={s.editing} eng={eng} />}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      {s?.hint && <div role="status" className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full bg-slate-900/85 px-4 py-2 text-sm font-medium text-white shadow-lg">{s.hint}</div>}
      {presenter && (
        <button aria-label="Show toolbar" onClick={() => setPresenter(false)}
          className="absolute left-0 top-1/2 h-16 w-4 -translate-y-1/2 rounded-r-lg bg-slate-500/25 active:w-6 active:bg-slate-500/60" />
      )}
      {s && !presenter && (
        <div className={`pointer-events-none absolute bottom-2 right-3 rounded-lg bg-slate-900/60 px-2 py-1 text-xs text-white transition-opacity duration-500 ${hudOn ? 'opacity-100' : 'opacity-0'}`}>{s.holdPan ? 'pan' : s.tool} · {s.zoom}%</div>
      )}
    </div>
  )
}
