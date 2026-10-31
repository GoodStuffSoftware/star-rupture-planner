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

// ─── Default rate for new targets (Options) ──────────────────────────────────

export type DefaultTargetMode = 'machines' | 'perMin'

/** What a target added without an explicit rate starts at. */
export interface DefaultTargetPref {
  mode: DefaultTargetMode
  /** Machines mode: how many whole machines' output (>= 1). */
  machines: number
  /** Items-per-minute mode: a whole rate (>= 1). */
  perMin: number
}

/** The shipped setting: one machine, which is what new targets always started at. */
export const DEFAULT_TARGET_PREF: Readonly<DefaultTargetPref> = {
  mode: 'machines',
  machines: 1,
  perMin: 60,
}

export const MAX_DEFAULT_MACHINES = 1000
export const MAX_DEFAULT_PER_MIN = 1_000_000

/** The rate for an item nothing produces (a raw resource): what new targets always got. */
export const DEFAULT_TARGET_FALLBACK_RATE = 60

/** A whole number clamped to 1..max; anything that is not a finite number gives `fallback`. */
function clampWhole(v: unknown, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(1, Math.round(v)))
}

/** Validate a stored or edited setting: a bad mode gives Machines, counts are whole and in range. */
export function sanitizeDefaultTarget(raw: unknown): DefaultTargetPref {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    mode: o.mode === 'perMin' ? 'perMin' : 'machines',
    machines: clampWhole(o.machines, MAX_DEFAULT_MACHINES, DEFAULT_TARGET_PREF.machines),
    perMin: clampWhole(o.perMin, MAX_DEFAULT_PER_MIN, DEFAULT_TARGET_PREF.perMin),
  }
}

/** True for the shipped setting (Machines, 1), under which every add path behaves as it always did. */
export function isDefaultTargetUntouched(p: DefaultTargetPref): boolean {
  return p.mode === 'machines' && p.machines === DEFAULT_TARGET_PREF.machines
}

/**
 * The rate a target added without an explicit rate starts at, given the setting and one
 * machine's output for the item (undefined when nothing produces it).
 * - Items/min: that whole rate.
 * - Machines, 1: one machine's output as a whole number (the original behaviour: 7.5 gives 8).
 * - Machines, N >= 2: N x one machine's output, an exact multiple even when fractional (22.5).
 * - No producer: 60, as before.
 * `exact` says the value is a machine multiple, for normalizeTargetRate.
 */
export function newTargetRate(
  p: DefaultTargetPref,
  machineRate: number | undefined,
): { rate: number; exact: boolean } {
  if (p.mode === 'perMin') return { rate: normalizeTargetRate(p.perMin), exact: false }
  const m = machineRate && machineRate > 0 ? machineRate : undefined
  if (m === undefined) return { rate: DEFAULT_TARGET_FALLBACK_RATE, exact: false }
  if (p.machines <= 1) return { rate: normalizeTargetRate(m), exact: false }
  return { rate: normalizeTargetRate(p.machines * m, true), exact: true }
}
