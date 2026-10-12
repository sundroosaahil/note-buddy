export const btn = (active) => `grid h-11 w-11 shrink-0 place-items-center rounded-xl transition active:scale-95 disabled:opacity-30 ${active ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-700'}`
export const panel = 'rounded-2xl bg-white/95 shadow-lg ring-1 ring-black/5 backdrop-blur dark:bg-slate-800/95 dark:ring-white/10'

export function Btn({ label, active, disabled, onClick, children }) {
  return <button aria-label={label} title={label} disabled={disabled} onClick={onClick} className={btn(active)}>{children}</button>
}
