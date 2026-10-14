import { useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Minus, ArrowUpRight, Square, SquareRoundCorner, Circle, Triangle, Diamond, Star, StickyNote, Type, ImagePlus } from 'lucide-react'
import { btn, panel, Btn } from './ui.jsx'
import { Slide, Swatches } from './controls.jsx'
import { PALETTE } from './engine/Engine.js'
import { STICKY_COLORS } from './engine/objects.js'
import { STICKER_SETS } from './engine/stickers.js'

const SHAPE_ICONS = { line: Minus, arrow: ArrowUpRight, rect: Square, round: SquareRoundCorner, ellipse: Circle, triangle: Triangle, diamond: Diamond, star: Star }
const SHAPE_NAMES = { line: 'Line', arrow: 'Arrow', rect: 'Rectangle', round: 'Rounded rectangle', ellipse: 'Ellipse', triangle: 'Triangle', diamond: 'Diamond', star: 'Star' }

export function ShapesPopover({ s, eng }) {
  const active = s.baseTool === 'shape', Icon = SHAPE_ICONS[s.shapeKind] || Square
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button aria-label="Shapes" title="Shapes: drag on the board to draw, or tap to drop one" className={btn(active)} onClick={() => !active && eng().setTool('shape')}><Icon size={20} /></button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="right" sideOffset={10} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} className={`${panel} z-50 flex w-64 flex-col gap-3 p-3`}>
          <div className="grid grid-cols-4 gap-1.5">
            {Object.keys(SHAPE_ICONS).map((k) => { const I = SHAPE_ICONS[k]; return <Btn key={k} label={SHAPE_NAMES[k]} active={active && s.shapeKind === k} onClick={() => eng().setShapeKind(k)}><I size={20} /></Btn> })}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300">Fill</div>
          <Swatches colors={PALETTE} value={s.shapeFill} none onPick={(c) => eng().setShapeFill(c)} />
          {s.shapeFill && <Slide label="Fill opacity" value={Math.round(s.shapeFillOpacity * 100)} min={5} max={100} suffix="%" onChange={(v) => eng().setShapeFill(s.shapeFill, v / 100)} />}
          <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">The outline uses the pen colour and width.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function NotesPopover({ s, eng }) {
  const [open, setOpen] = useState(false), [tab, setTab] = useState(0), file = useRef(null)
  const done = (fn) => () => { fn(); setOpen(false) }
  const chip = (on) => `h-8 rounded-lg border border-[#202124] px-2 text-xs ${on ? 'bg-[#ffeb3b] text-[#202124]' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-100'}`
  return (
    <>
      <input ref={file} type="file" accept="image/*" hidden aria-label="Choose an image" onChange={(e) => { const f = e.target.files?.[0]; if (f) eng().addImage(f); e.target.value = ''; setOpen(false) }} />
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild><button aria-label="Notes and stickers" title="Notes, text, stickers and images" className={btn(false)}><StickyNote size={20} /></button></Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="right" sideOffset={10} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} className={`${panel} z-50 flex max-h-[90vh] w-72 flex-col gap-3 overflow-y-auto p-3`}>
            <div className="text-xs text-slate-600 dark:text-slate-300">Sticky note</div>
            <div className="flex gap-2">
              {STICKY_COLORS.map((c) => <button key={c} aria-label={`Sticky note ${c}`} onClick={done(() => eng().addSticky(c))} style={{ background: c }} className="h-11 w-11 rounded-lg shadow ring-1 ring-black/10 active:scale-95" />)}
            </div>
            <div className="flex gap-2">
              <button onClick={done(() => eng().addText())} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-100"><Type size={18} />Text box</button>
              <button onClick={() => file.current?.click()} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-100"><ImagePlus size={18} />Image</button>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300">Stickers</div>
            <div className="flex flex-wrap gap-1">{STICKER_SETS.map((g, i) => <button key={g.name} onClick={() => setTab(i)} className={chip(tab === i)}>{g.name}</button>)}</div>
            <div className="grid grid-cols-6 gap-1">
              {STICKER_SETS[tab].items.map((it) => (
                <button key={it.g} aria-label={`Sticker ${it.g}`} onClick={done(() => eng().addSticker(it))} className="grid h-11 w-11 place-items-center rounded-lg text-2xl text-slate-800 hover:bg-slate-100 active:scale-95 dark:text-slate-100 dark:hover:bg-slate-700">{it.g}</button>
              ))}
            </div>
            <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">Tip: Ctrl+V pastes an image from the clipboard.</p>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  )
}
