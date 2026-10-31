/**
 * fmt(n): if integer show as-is, else up to 2 decimals, strip trailing zeros, group thousands.
 */
export function fmt(n: number): string {
  if (Number.isInteger(n)) {
    return n.toLocaleString('en-US')
  }
  // Up to 2 decimals, strip trailing zeros
  const s = n.toFixed(2).replace(/\.?0+$/, '')
  // Add thousands separator if needed
  const parts = s.split('.')
  parts[0] = Number(parts[0]).toLocaleString('en-US')
  return parts.join('.')
}

/**
 * fmtBuildings(n): show exactly 2 decimals (e.g. 2.50, 1.00, 0.33),
 * but strip trailing zeros for cleanliness (e.g. 2.5, 1, 0.33).
 */
export function fmtBuildings(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '')
}

// ─── Target rate: whole numbers, unless stepped by whole machines ────────────
// The top item of a plan is requested in whole items per minute; only the rates
// derived below it (child rows, totals) keep their decimals. The one exception is
// a rate reached by stepping whole machines whose output is fractional (3.75, 7.5):
// that exact multiple is kept, not rounded.

/** Pause after the last keystroke before a typed target rate commits (root and header fields). */
export const RATE_DEBOUNCE_MS = 400

/**
 * THE normalizer for a target rate: every path that sets one goes through here
 * (typed input, links, saves, adoption, add, steppers).
 * Default: round to the nearest whole number, never below 1; non-finite gives 1.
 * `exactMachineMultiple`: the caller guarantees the value is a whole number of machines'
 * output, so a positive fractional value is kept (to 3 decimals, against float drift).
 */
export function normalizeTargetRate(n: number, exactMachineMultiple = false): number {
  if (!Number.isFinite(n)) return 1
  if (exactMachineMultiple && n > 0) return Math.round(n * 1000) / 1000
  return Math.max(1, Math.round(n))
}

/** Is `rate` a positive whole number of machines of `machineRate` (7.5, 15, 22.5 for 7.5)? */
export function isMachineMultiple(rate: number, machineRate: number): boolean {
  if (!(machineRate > 0) || !(rate > 0)) return false
  const q = rate / machineRate
  return Math.round(q) >= 1 && Math.abs(q - Math.round(q)) < 1e-6
}

/**
 * Parse typed or linked input as a whole target rate, or null when it is unusable
 * (empty, not a number, or rounding to less than 1). Rounds to the nearest whole.
 * Commas: "1,200" drops the thousands comma; a comma with 1-2 digits after it
 * ("7,5") is a decimal comma and rounds like a dot.
 */
export function parseWholeRate(input: string | number): number | null {
  const text =
    typeof input === 'number'
      ? String(input)
      : input
          .replace(/,(?=\d{3}(?!\d))/g, '')
          .replace(',', '.')
          .trim()
  if (text === '') return null
  const v = Number(text)
  if (!Number.isFinite(v)) return null
  const whole = Math.round(v)
  return whole >= 1 ? whole : null
}

/**
 * The target rate one machine-step from `current`, or null when that would reach 0 or below.
 * A whole-number machine output adds or subtracts exactly that. A fractional one (7.5) keeps
 * the result an exact machine multiple: from a multiple it steps by one machine; from a
 * rate between multiples (a typed whole number) it snaps to the next multiple in that direction.
 */
export function stepTargetRateBy(current: number, machineRate: number, dir: number): number | null {
  const m = Number.isFinite(machineRate) && machineRate > 0 ? machineRate : 1
  const d = dir < 0 ? -1 : 1
  const eps = 1e-6
  let next: number
  if (Number.isInteger(m)) {
    next = current + d * m
  } else {
    const q = current / m
    const onGrid = Math.abs(q - Math.round(q)) < eps
    const k = onGrid ? Math.round(q) + d : d > 0 ? Math.ceil(q) : Math.floor(q)
    next = k * m
  }
  next = Math.round(next * 1000) / 1000
  return next > 0 ? next : null
}
