import { useEffect, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Pen, Highlighter, Eraser, Undo2, Redo2, ZoomIn, ZoomOut, Minus, Plus, Sun, Moon, EyeOff, Crosshair, Maximize, Minimize, MousePointer2, WandSparkles, Ellipsis, Settings } from 'lucide-react'
import { Engine, PALETTE } from './engine/Engine.js'
import { attachPointer } from './input/pointer.js'
import { attachKeys } from './input/keys.js'
import { runAction } from './input/actions.js'
import { settings, saveSoon } from './store/settings.js'
import { SettingsDialog } from './SettingsDialog.jsx'
import { Slide } from './controls.jsx'
import { ShapesPopover, NotesPopover } from './ToolPopovers.jsx'
import { SelectionBar } from './SelectionBar.jsx'
import { TextEditor } from './TextEditor.jsx'
import { btn, panel, Btn } from './ui.jsx'
import { PageBar, BgPopover } from './PageBar.jsx'
import { ExportMenu } from './ExportMenu.jsx'
import { loadBoard, pruneBlobs } from './store/db.js'
import { createAutosave } from './store/autosave.js'

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
  const [more, setMore] = useState(false), [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    let dead = false, cleanup = () => {}
    navigator.storage?.persist?.() // ask Chrome not to evict the saved board under storage pressure
    ;(async () => {
      let data = null
      try { data = await loadBoard() } catch (e) { console.warn('load failed', e) }
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
      engine.save = createAutosave(engine)
      if (data) {
        engine.restore(data)
        // forget stored images no page uses any more (safe now: the undo history is empty at startup)
        pruneBlobs(new Set(engine.pages.flatMap((p) => p.objects.filter((o) => o.type === 'image').map((o) => o.blobId)))).catch(() => {})
      }
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
  return (
    <div className="fixed inset-0 bg-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {s && !presenter && (
        <>
          <div className={`${panel} absolute left-2 top-1/2 flex max-h-[96%] -translate-y-1/2 flex-col gap-1 overflow-y-auto p-1.5 [@media(max-height:520px)]:grid [@media(max-height:520px)]:grid-cols-2`} /* short phone screens: two columns */>
            <PenPopover s={s} eng={eng} />
            <Btn label="Eraser" active={s.baseTool === 'eraser'} onClick={() => act('toggleEraser')}><Eraser size={20} /></Btn>
            <Btn label="Select: tap an item, or drag a loop to lasso" active={s.baseTool === 'select'} onClick={() => eng().setTool(s.baseTool === 'select' ? s.drawTool : 'select')}><MousePointer2 size={20} /></Btn>
            <ShapesPopover s={s} eng={eng} />
            <NotesPopover s={s} eng={eng} />
            <Btn label="Shape snapping: hold the pen still at the end of a stroke to straighten it" active={s.snap} onClick={() => eng().setSnap(!s.snap)}><WandSparkles size={20} /></Btn>
            <Btn label="Laser pointer" active={s.baseTool === 'laser'} onClick={() => eng().setTool(s.baseTool === 'laser' ? s.drawTool : 'laser')}><Crosshair size={20} /></Btn>
            <BgPopover s={s} eng={eng} />
            <Btn label="Undo" disabled={!s.canUndo} onClick={() => act('undo')}><Undo2 size={20} /></Btn>
            <Btn label="Redo" disabled={!s.canRedo} onClick={() => act('redo')}><Redo2 size={20} /></Btn>
            <Popover.Root open={more} onOpenChange={setMore}>
              <Popover.Trigger asChild><button aria-label="More" title="More: zoom, export, fullscreen, settings" className={btn(false)}><Ellipsis size={20} /></button></Popover.Trigger>
              <Popover.Portal>
                <Popover.Content side="right" sideOffset={10} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} className={`${panel} z-50 grid grid-cols-4 gap-1 p-2`}>
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
          {s.baseTool === 'eraser' && (
            <div className={`${panel} absolute left-[4.5rem] top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 p-1.5 [@media(max-height:520px)]:left-[8.5rem]`}>
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
      {s?.editing && <TextEditor info={s.editing} eng={eng} />}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
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
