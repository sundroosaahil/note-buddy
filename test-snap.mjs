// Shape snapping against realistic hand-drawn strokes: 40 random variations of each case must be recognised (or rejected) correctly.
import { recognize } from './src/engine/snap.js'
import { handRect, handEllipse, handTriangle, handStar, handSpiral, handZigzag, handS } from './handdrawn.mjs'
let bad = 0
const tally = (name, gen, want, min = 1, N = 40) => { let ok = 0; for (let i = 0; i < N; i++) { const r = recognize(gen(i + 1)); if ((want === null && r === null) || (r && r.kind === want)) ok++ } const pass = ok / N >= min; if (!pass) bad++; console.log((pass ? 'ok  ' : 'FAIL') + ' ' + name.padEnd(48), `${ok}/${N}`) }
for (const [w, h] of [[100, 100], [220, 120], [400, 250], [90, 300], [150, 150], [300, 40]]) tally(`rect ${w}x${h}`, (s) => handRect(w, h, { seed: s }), 'rect')
for (const t of [-12, -6, 3, 6, 12, 25]) tally(`rect 220x120 tilted ${t} deg`, (s) => handRect(220, 120, { seed: s, tilt: t }), 'rect')
tally('square 150 tilted -8 deg', (s) => handRect(150, 150, { seed: s, tilt: -8 }), 'rect')
tally('rect, gap 3% of outline', (s) => handRect(220, 120, { seed: s, gap: 0.03 }), 'rect')
tally('rect, gap 8% of outline', (s) => handRect(220, 120, { seed: s, gap: 0.08 }), 'rect', 0.9)
tally('rect, no overshoot', (s) => handRect(220, 120, { seed: s, overshoot: 0 }), 'rect')
tally('rect, big overshoot (12%)', (s) => handRect(220, 120, { seed: s, overshoot: 0.12 }), 'rect')
tally('rect drawn counter-clockwise', (s) => handRect(220, 120, { seed: s, ccw: true, tilt: 5 }), 'rect')
tally('rect starting mid-side', (s) => handRect(220, 120, { seed: s, startAt: 0.31 }), 'rect')
tally('rect starting on a corner, tilted', (s) => handRect(180, 180, { seed: s, startAt: 0.5, tilt: -7 }), 'rect')
tally('rect with very round corners (20%)', (s) => handRect(220, 140, { seed: s, round: 0.2 }), 'rect', 0.9)
tally('sloppy rect, wobble 4px', (s) => handRect(240, 140, { seed: s, amp: 4, tilt: 5 }), 'rect', 0.9)
tally('circle r=80', (s) => handEllipse(80, 80, { seed: s }), 'ellipse')
tally('circle, gap 5%', (s) => handEllipse(80, 80, { seed: s, gap: 0.05 }), 'ellipse')
tally('ellipse 120x50', (s) => handEllipse(120, 50, { seed: s }), 'ellipse')
tally('ellipse 120x50 tilted 20 deg', (s) => handEllipse(120, 50, { seed: s, tilt: 20 }), 'ellipse')
tally('ellipse 120x50 tilted 60 deg', (s) => handEllipse(120, 50, { seed: s, tilt: 60 }), 'ellipse')
tally('triangle must NOT snap', (s) => handTriangle({ seed: s }), null)
tally('5-point star must NOT snap', (s) => handStar({ seed: s }), null)
tally('open U (rect missing a side) must NOT snap', (s) => handRect(220, 120, { seed: s, gap: 0.3, overshoot: 0 }), null)
tally('spiral must NOT snap', (s) => handSpiral({ seed: s }), null)
tally('zigzag must NOT snap', (s) => handZigzag({ seed: s }), null)
tally('S curve must NOT snap', (s) => handS({ seed: s }), null)
if (bad) { console.log(`${bad} recognition cases FAILING`); process.exit(1) }
console.log('snap recognition (hand-drawn) ok')
