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
