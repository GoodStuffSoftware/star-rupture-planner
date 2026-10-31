/** Wheel distance (px-equivalent) that counts as one notch: one notch = one step. */
const WHEEL_THRESHOLD = 40
const LINE_PX = 16
const PAGE_PX = 400

/**
 * Wheel-to-step helper for a focusable rate input. While the input has focus, wheel up steps +1
 * and wheel down steps -1 (and the page doesn't scroll); unfocused, the wheel scrolls as usual.
 * deltaY accumulates so a trackpad swipe of many tiny deltas steps once per notch's worth of travel
 * instead of running away; reversing direction restarts the count.
 */
export function createWheelStepper(step: (dir: 1 | -1) => void) {
  let acc = 0
  return (e: WheelEvent) => {
    if (document.activeElement !== e.currentTarget) {
      acc = 0
      return
    }
    e.preventDefault()
    const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1
    const d = e.deltaY * scale
    if (d === 0) return
    if (acc !== 0 && Math.sign(acc) !== Math.sign(d)) acc = 0
    acc += d
    if (Math.abs(acc) >= WHEEL_THRESHOLD) {
      step(acc < 0 ? 1 : -1) // wheel up (negative deltaY) steps up
      acc = 0
    }
  }
}
