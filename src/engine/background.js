// Backgrounds are drawn in WORLD space (ctx must already carry the world transform), so grids pan and zoom
// with the ink, and the same function serves the screen, thumbnails and (Stage 4) PDF export.
export const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 }
export const bgBase = (bg) => (bg.type === 'board' ? '#1f2937' : bg.type === 'custom' ? bg.color : '#ffffff')
export const isDark = (bg) => lum(bgBase(bg)) < 0.45

export function drawBackground(ctx, bg, r, scale) {
  ctx.fillStyle = bgBase(bg); ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
  const rgb = isDark(bg) ? '255,255,255' : '15,23,42'
  const lines = (step, alpha, vert, horiz) => {
    if (step * scale < 5) return
    ctx.strokeStyle = `rgba(${rgb},${alpha})`; ctx.lineWidth = 1 / scale; ctx.beginPath()
    if (vert) for (let x = Math.floor(r.x0 / step) * step; x <= r.x1; x += step) { ctx.moveTo(x, r.y0); ctx.lineTo(x, r.y1) }
    if (horiz) for (let y = Math.floor(r.y0 / step) * step; y <= r.y1; y += step) { ctx.moveTo(r.x0, y); ctx.lineTo(r.x1, y) }
    ctx.stroke()
  }
  if (bg.type === 'grid') lines(40, 0.16, true, true)
  else if (bg.type === 'ruled') lines(44, 0.2, false, true)
  else if (bg.type === 'graph') { lines(10, 0.08, true, true); lines(50, 0.22, true, true) }
  else if (bg.type === 'dots' && 40 * scale >= 6) {
    ctx.fillStyle = `rgba(${rgb},0.35)`; const d = 2 / scale
    for (let x = Math.floor(r.x0 / 40) * 40; x <= r.x1; x += 40)
      for (let y = Math.floor(r.y0 / 40) * 40; y <= r.y1; y += 40) ctx.fillRect(x - d / 2, y - d / 2, d, d)
  }
}
