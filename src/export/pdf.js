import { renderPage, renderViewport } from './render.js'

const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type })
  if (isIOS() && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return } // iOS has no reliable download
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000)
}

export async function exportPDF(engine) {
  const { jsPDF } = await import('jspdf') // loaded on demand, still bundled locally (no CDN)
  await engine.ensureImages() // inserted pictures must be decoded before pages are rendered
  let pdf = null, n = 0
  for (const page of engine.pages) { // one page at a time so we never hold many big canvases in memory
    const c = renderPage(engine, page); if (!c) continue
    const w = c.width, h = c.height, o = w >= h ? 'l' : 'p'
    if (!pdf) pdf = new jsPDF({ orientation: o, unit: 'px', format: [w, h], compress: true, hotfixes: ['px_scaling'] })
    else pdf.addPage([w, h], o)
    pdf.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, w, h); n++
    c.width = c.height = 0
  }
  if (!pdf) return 'Nothing to export: every page is empty'
  const name = `class-${stamp()}.pdf`
  await saveFile(pdf.output('blob'), name)
  return `Saved ${name} (${n} page${n > 1 ? 's' : ''})`
}

export async function exportPNG(engine) {
  await engine.ensureImages()
  const c = renderPage(engine, engine.page); if (!c) return 'This page is empty'
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const name = `class-${stamp()}-page${engine.index + 1}.png`
  await saveFile(blob, name); return `Saved ${name}`
}

export async function exportViewportPNG(engine) {
  await engine.ensureImages()
  const c = renderViewport(engine); if (!c) return 'The board is not ready yet'
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const name = `class-${stamp()}-page${engine.index + 1}-screen.png`
  await saveFile(blob, name); return `Saved full board view as ${name}`
}
