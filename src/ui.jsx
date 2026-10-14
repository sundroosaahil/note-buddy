import { useEffect, useState } from 'react'

// Phones in landscape (short) or portrait (narrow). Keep in sync with the --btn media query in index.css.
const COMPACT = '(max-height: 520px), (max-width: 640px)'
export function useCompact() {
  const [c, setC] = useState(() => window.matchMedia(COMPACT).matches)
  useEffect(() => {
    const m = window.matchMedia(COMPACT), f = () => setC(m.matches)
    f(); m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [])
  return c
}

export const btn = (active) => `grid h-[var(--btn)] w-[var(--btn)] shrink-0 place-items-center rounded-xl border border-[#202124] transition active:scale-95 disabled:opacity-30 ${active ? 'bg-[#ffeb3b] text-[#202124] shadow-[1px_2px_0_#202124]' : 'bg-white text-slate-800 hover:bg-blue-50 dark:border-black dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'}`
export const panel = 'rounded-[18px] border-2 border-[#202124] bg-white/95 shadow-[2px_3px_0_#202124] backdrop-blur dark:border-black dark:bg-slate-800/95 dark:shadow-[2px_3px_0_#000]'

export function Btn({ label, active, disabled, onClick, children }) {
  return <button aria-label={label} title={label} disabled={disabled} onClick={onClick} className={btn(active)}>{children}</button>
}
