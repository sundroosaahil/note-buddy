// Barrel (pen side) button detection, shared by the pointer code and the diagnostics screen. Pure logic, unit-tested.
// buttons&2 (the spec bit for the pen barrel button, also the mouse right button when a tablet driver is in mouse mode)
// is unambiguous, so it switches on instantly, whether hovering or touching, for 'pen' and 'mouse' alike.
// Extra rule for some Chrome builds: a hovering pen can instead report buttons&1 with pressure 0. A touchdown frame can
// look the same, so that variant must persist for 2 consecutive events (~30ms). Touch input is never a barrel button.
export function createBarrelDetector(onChange) {
  let held = false, count = 0
  const set = (on) => { if (on !== held) { held = on; onChange(on) } }
  return {
    update(e, tipDown) {
      if (e.pointerType === 'touch') return
      if ((e.buttons & 2) !== 0) { count = 0; set(true); return }
      const hoverQuirk = e.pointerType === 'pen' && !tipDown && (e.buttons & 1) !== 0 && e.pressure === 0
      if (hoverQuirk) { if (++count >= 2) set(true) } else { count = 0; set(false) }
    },
    resetCount() { count = 0 },
    reset() { count = 0; set(false) }, // pointercancel / lostpointercapture
  }
}
