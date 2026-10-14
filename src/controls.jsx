import * as Slider from '@radix-ui/react-slider'

export function Slide({ label, value, min, max, onChange, suffix = '' }) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
      <span className="w-14">{label}</span>
      <Slider.Root className="relative flex h-8 w-40 touch-none items-center" value={[value]} min={min} max={max} step={1} onValueChange={(v) => onChange(v[0])}>
        <Slider.Track className="relative h-1.5 grow rounded-full bg-slate-300 dark:bg-slate-600"><Slider.Range className="absolute h-full rounded-full bg-[#2196f3]" /></Slider.Track>
        <Slider.Thumb aria-label={label} className="block h-6 w-6 rounded-full border border-[#202124] bg-white shadow ring-2 ring-[#2196f3]" />
      </Slider.Root>
      <span className="w-9 text-right">{value}{suffix}</span>
    </div>
  )
}

// A row of colour dots. none = also offer "no colour" (used for shape fill); custom = a free colour picker at the end.
export function Swatches({ colors, value, onPick, none = false, custom = true }) {
  const ring = (on) => `h-9 w-9 rounded-full border border-[#202124] ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 ${on ? 'ring-[#2196f3]' : 'ring-transparent'}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      {none && (
        <button aria-label="No fill" title="No fill" onClick={() => onPick(null)} className={`${ring(value == null)} overflow-hidden bg-white`}>
          <svg viewBox="0 0 24 24" className="h-full w-full"><line x1="5" y1="19" x2="19" y2="5" stroke="#ef4444" strokeWidth="2" /></svg>
        </button>
      )}
      {colors.map((c) => <button key={c} aria-label={`Color ${c}`} onClick={() => onPick(c)} style={{ background: c }} className={ring(value === c)} />)}
      {custom && <input type="color" aria-label="Custom color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000'} onChange={(e) => onPick(e.target.value)} className="h-9 w-9 cursor-pointer rounded-full border-0 bg-transparent p-0" />}
    </div>
  )
}
