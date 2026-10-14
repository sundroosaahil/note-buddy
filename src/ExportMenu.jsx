import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Download, FileDown, Image, FileX, Maximize } from 'lucide-react'
import { btn, panel } from './ui.jsx'
import Confirm from './Confirm.jsx'
import { exportPDF, exportPNG, exportViewportPNG } from './export/pdf.js'

export function ExportMenu({ eng }) {
  const [msg, setMsg] = useState('')
  const run = async (fn) => { setMsg('Working…'); try { setMsg(await fn(eng())) } catch (e) { setMsg(`Failed: ${e.message}`) } }
  const row = 'flex h-11 items-center gap-2 rounded-xl px-3 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700'
  return (
    <Popover.Root onOpenChange={() => setMsg('')}>
      <Popover.Trigger asChild><button aria-label="Export" title="Export" className={btn(false)}><Download size={20} /></button></Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="right" sideOffset={10} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} className={`${panel} z-50 flex w-56 flex-col p-2`}>
          <button className={row} onClick={() => run(exportPDF)}><FileDown size={18} />Save all pages as PDF</button>
          <button className={row} onClick={() => run(exportPNG)}><Image size={18} />Save cropped content as PNG</button>
          <button className={row} onClick={() => run(exportViewportPNG)}><Maximize size={18} />Save full board view as PNG</button>
          {msg && <p className="px-3 pt-1 text-xs text-slate-500 dark:text-slate-300">{msg}</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function NewBoard({ eng }) {
  return (
    <Confirm title="Start a new board?" text="This removes every page from this device. Save the PDF first if you want to keep it." action="New board"
      onConfirm={() => eng().newBoard()}
      trigger={<button aria-label="New board" title="New board" className={btn(false)}><FileX size={20} /></button>} />
  )
}
