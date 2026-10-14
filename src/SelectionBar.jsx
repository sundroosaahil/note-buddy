import * as Popover from '@radix-ui/react-popover'
import { Palette, CopyPlus, Copy, BringToFront, SendToBack, Lock, LockOpen, Trash2, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { btn, panel, Btn, useCompact } from './ui.jsx'
import { Slide, Swatches } from './controls.jsx'
import { PALETTE } from './engine/Engine.js'
import { STICKY_COLORS } from './engine/objects.js'

const ALIGN = [['left', AlignLeft, 'Align left'], ['center', AlignCenter, 'Align centre'], ['right', AlignRight, 'Align right']]

// What can be restyled depends on what is selected: one shape, one text box, one sticky note, a symbol sticker, or only ink.
function hasStyle(sel) { const o = sel.one; return !sel.locked && (o ? o.type === 'shape' || o.type === 'text' || o.type === 'sticky' || (o.type === 'sticker' && o.sym) : sel.types.length === 1 && sel.types[0] === 'stroke') }

function StyleControls({ sel, eng }) {
  const o = sel.one
  if (!o) return <Swatches colors={PALETTE} value={sel.strokeColor} onPick={(c) => eng().setProps({ stroke: c })} />
  if (o.type === 'shape') return (
    <>
      <div className="text-xs text-slate-600 dark:text-slate-300">Outline</div>
      <Swatches colors={PALETTE} value={o.stroke} onPick={(c) => eng().setProps({ stroke: c })} />
      <Slide label="Width" value={o.strokeWidthPx} min={1} max={24} onChange={(v) => eng().setProps({ strokeWidthPx: v }, 'sw')} />
      {o.shape !== 'line' && o.shape !== 'arrow' && (
        <>
          <div className="text-xs text-slate-600 dark:text-slate-300">Fill</div>
          <Swatches colors={PALETTE} value={o.fill} none onPick={(c) => eng().setProps({ fill: c })} />
          {o.fill && <Slide label="Opacity" value={Math.round(o.fillOpacity * 100)} min={5} max={100} suffix="%" onChange={(v) => eng().setProps({ fillOpacity: v / 100 }, 'fo')} />}
        </>
      )}
    </>
  )
  if (o.type === 'text') return (
    <>
      <Slide label="Size" value={o.fontSizePx} min={12} max={96} onChange={(v) => eng().setProps({ fontSizePx: v }, 'fs')} />
      <Swatches colors={PALETTE} value={o.color} onPick={(c) => eng().setProps({ color: c })} />
      <div className="flex gap-1.5">{ALIGN.map(([a, I, n]) => <Btn key={a} label={n} active={o.align === a} onClick={() => eng().setProps({ align: a })}><I size={20} /></Btn>)}</div>
    </>
  )
  if (o.type === 'sticky') return <Swatches colors={STICKY_COLORS} value={o.color} custom={false} onPick={(c) => eng().setProps({ color: c })} />
  return <Swatches colors={PALETTE} value={o.color} onPick={(c) => eng().setProps({ color: c })} />
}

// Floating action bar ("context menu") above the selection; below it when there is no room, hidden while dragging or typing.
export function SelectionBar({ s, eng }) {
  const sel = s.sel, compact = useCompact()
  if (!sel || sel.busy || s.editing) return null
  const W = 7 * (compact ? 38 : 46) + 12, vw = window.innerWidth, vh = window.innerHeight, r = sel.rect
  const left = Math.max(8, Math.min(vw - W - 8, r.x + r.w / 2 - W / 2))
  const top = r.y > 110 ? r.y - 104 : Math.min(vh - 64, r.y + r.h + 16)
  return (
    <div className={`${panel} absolute z-30 flex items-center gap-0.5 p-1`} style={{ left, top }}>
      {hasStyle(sel) ? (
        <Popover.Root>
          <Popover.Trigger asChild><button aria-label="Style" title="Style" className={btn(false)}><Palette size={20} /></button></Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="bottom" sideOffset={8} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} className={`${panel} z-50 flex w-64 flex-col gap-3 p-3`}><StyleControls sel={sel} eng={eng} /></Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ) : <span className="w-11" />}
      <Btn label="Duplicate" onClick={() => eng().duplicateSelected()}><CopyPlus size={20} /></Btn>
      <Btn label="Copy" onClick={() => eng().copySelected()}><Copy size={20} /></Btn>
      <Btn label="Bring to front" disabled={!sel.types.some((t) => t !== 'stroke')} onClick={() => eng().bringToFront()}><BringToFront size={20} /></Btn>
      <Btn label="Send to back" disabled={!sel.types.some((t) => t !== 'stroke')} onClick={() => eng().sendToBack()}><SendToBack size={20} /></Btn>
      <Btn label={sel.locked ? 'Unlock' : 'Lock'} active={sel.locked} disabled={!sel.types.some((t) => t !== 'stroke')} onClick={() => eng().toggleLock()}>{sel.locked ? <LockOpen size={20} /> : <Lock size={20} />}</Btn>
      <Btn label="Delete" disabled={sel.locked && sel.types.length === 1} onClick={() => eng().deleteSelected()}><Trash2 size={20} /></Btn>
    </div>
  )
}
