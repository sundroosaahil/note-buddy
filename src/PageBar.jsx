import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { ChevronLeft, ChevronRight, FilePlus, Copy, Trash2, LayoutGrid, Grid3x3, BrushCleaning, House } from 'lucide-react'
import { btn, panel, Btn } from './ui.jsx'
import Confirm from './Confirm.jsx'

function Thumbs({ s, eng, onPick }) {
  return (
    <div className="flex max-w-full gap-2 overflow-x-auto">
      {s.pages.map((p, i) => (
        <button key={p.id} aria-label={`Page ${i + 1}`} onClick={() => { eng().goPage(i); onPick?.() }}
          className={`relative shrink-0 overflow-hidden rounded-lg border-2 ${i === s.index ? 'border-indigo-600' : 'border-slate-300 dark:border-slate-600'}`}>
          <img src={p.thumb} alt="" className="h-16 w-auto" draggable={false} />
          <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
        </button>
      ))}
    </div>
  )
}

// Phones: a small capsule in the top-right corner (prev / n of m / next / page menu). Everything else lives in the menu.
function CompactPageBar({ s, eng, fade, onHome }) {
  const [menu, setMenu] = useState(false), [del, setDel] = useState(false)
  const row = 'flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-100 dark:hover:bg-slate-700'
  const run = (fn) => () => { fn(); setMenu(false) }
  return (
    <>
      <div className={`${panel} absolute flex items-center gap-0.5 p-1 transition-opacity duration-200 ${fade}`}
        style={{ right: 'max(0.5rem, env(safe-area-inset-right))', top: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <Btn label="Previous page" disabled={s.index === 0} onClick={() => eng().prevPage()}><ChevronLeft size={20} /></Btn>
        <span className="min-w-9 text-center text-xs tabular-nums text-slate-700 dark:text-slate-200">{s.index + 1}/{s.count}</span>
        <Btn label="Next page (new page after the last)" onClick={() => eng().nextPage()}><ChevronRight size={20} /></Btn>
        <Popover.Root open={menu} onOpenChange={setMenu}>
          <Popover.Trigger asChild><button aria-label="Pages" title="Pages" className={btn(menu)}><LayoutGrid size={18} /></button></Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="bottom" align="end" sideOffset={8} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()}
              className={`${panel} z-50 flex max-w-[calc(100vw-1rem)] flex-col gap-2 p-2`}>
              <div className="flex flex-wrap gap-1">
                <button className={row} onClick={run(() => eng().addPage())}><FilePlus size={16} />Add</button>
                <button className={row} onClick={run(() => eng().duplicatePage())}><Copy size={16} />Duplicate</button>
                <button className={row} onClick={run(() => eng().clearPage())}><BrushCleaning size={16} />Clear</button>
                <button className={`${row} text-red-600 dark:text-red-400`} disabled={s.count === 1} onClick={() => { setMenu(false); setDel(true) }}><Trash2 size={16} />Delete</button>
              </div>
              <Thumbs s={s} eng={eng} onPick={() => setMenu(false)} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Btn label="Back to notebooks" onClick={onHome}><House size={18} /></Btn>
      </div>
      {/* outside the popover: the popover unmounts the moment you tap the dialog, which would swallow the confirm tap */}
      <Confirm open={del} onOpenChange={setDel} title="Delete this page?" text="This can't be undone." action="Delete" onConfirm={() => eng().deletePage()} />
    </>
  )
}

export function PageBar({ s, eng, compact, fade = '', onHome }) {
  const [open, setOpen] = useState(false)
  if (compact) return <CompactPageBar s={s} eng={eng} fade={fade} onHome={onHome} />
  return (
    <div className="absolute bottom-2 left-1/2 flex max-w-[calc(100%-10rem)] -translate-x-1/2 flex-col items-center gap-1">
      {open && <div className={`${panel} flex max-w-full p-2`}><Thumbs s={s} eng={eng} /></div>}
      <div className={`${panel} flex items-center gap-1 p-1`}>
        <Btn label="Previous page" disabled={s.index === 0} onClick={() => eng().prevPage()}><ChevronLeft size={20} /></Btn>
        <span className="w-12 text-center text-sm tabular-nums text-slate-700 dark:text-slate-200">{s.index + 1}/{s.count}</span>
        <Btn label="Next page (new page after the last)" onClick={() => eng().nextPage()}><ChevronRight size={20} /></Btn>
        <Btn label="Add page" onClick={() => eng().addPage()}><FilePlus size={20} /></Btn>
        <Btn label="Duplicate page" onClick={() => eng().duplicatePage()}><Copy size={20} /></Btn>
        <Btn label="Clear page (undoable)" onClick={() => eng().clearPage()}><BrushCleaning size={20} /></Btn>
        <Confirm title="Delete this page?" text="This can't be undone." action="Delete" onConfirm={() => eng().deletePage()}
          trigger={<button aria-label="Delete page" title="Delete page" disabled={s.count === 1} className={btn(false)}><Trash2 size={20} /></button>} />
        <Btn label="Page strip" active={open} onClick={() => setOpen(!open)}><LayoutGrid size={20} /></Btn>
      </div>
    </div>
  )
}

const BGS = [['white', 'White'], ['board', 'Blackboard'], ['grid', 'Grid'], ['dots', 'Dots'], ['ruled', 'Ruled'], ['graph', 'Graph']]
export function BgPopover({ s, eng }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild><button aria-label="Background" title="Background" className={btn(false)}><Grid3x3 size={20} /></button></Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="right" sideOffset={10} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} className={`${panel} z-50 grid grid-cols-3 gap-2 p-3`}>
          {BGS.map(([type, name]) => (
            <button key={type} onClick={() => eng().setBackground({ type, color: s.bg.color })}
              className={`h-11 rounded-xl px-2 text-xs ${s.bg.type === type ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100'}`}>{name}</button>
          ))}
          <label className="col-span-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">Custom color
            <input type="color" value={s.bg.color} onChange={(ev) => eng().setBackground({ type: 'custom', color: ev.target.value })} className="h-9 w-12 cursor-pointer border-0 bg-transparent p-0" />
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
