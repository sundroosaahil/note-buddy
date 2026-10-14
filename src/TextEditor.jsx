import { useEffect, useRef } from 'react'

// A real <textarea> laid exactly over the sticky note / text box while it is being edited. The canvas hides that object's own
// text meanwhile, so what you see is the textarea. Escape or Ctrl+Enter or tapping elsewhere finishes (one undo step).
export function TextEditor({ info, eng }) {
  const ref = useRef(null)
  useEffect(() => { const t = ref.current; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length) } }, [info.id])
  const sticky = info.type === 'sticky'
  return (
    <textarea ref={ref} value={info.text} aria-label="Edit text" spellCheck={false}
      onChange={(e) => eng().setEditText(e.target.value)} onBlur={() => eng().endEdit()}
      onKeyDown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); eng().endEdit() } e.stopPropagation() }}
      className="absolute z-30 resize-none overflow-hidden bg-transparent outline-none"
      style={{ left: info.x, top: info.y, width: info.w, height: Math.max(info.h, info.fontPx * 1.3), transform: `rotate(${info.rot}rad)`, transformOrigin: `${info.w / 2}px ${info.h / 2}px`,
        font: `${info.fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, lineHeight: 1.3, color: info.color, textAlign: info.align, padding: info.padPx, boxSizing: 'border-box',
        border: sticky ? 'none' : '1px dashed #4f46e5', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} />
  )
}
