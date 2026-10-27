// ─── "Add item" link ──────────────────────────────────────────────────────────
// `?add=<itemId>[&r=<perMinute>]` appends an item to the visitor's EXISTING plan
// (unlike `?p=`, which replaces it). Used by in-game launchers that only know
// "I want this item" and must never overwrite what the user has saved.

export const ADD_PARAM = 'add'
export const ADD_RATE_PARAM = 'r'
export const DEFAULT_ADD_RATE = 60
const MAX_ADD_RATE = 1_000_000

export interface AddItemRequest {
  itemId: string
  /** Items per minute; falls back to DEFAULT_ADD_RATE when missing or invalid. */
  rate: number
}

/** Parse `?add=` / `&r=` from a query string. Returns null when no usable `add` is present. */
export function readAddItemRequest(search: string): AddItemRequest | null {
  const params = new URLSearchParams(search)
  const itemId = params.get(ADD_PARAM)?.trim()
  if (!itemId) return null
  const rate = Number(params.get(ADD_RATE_PARAM))
  return {
    itemId,
    rate: Number.isFinite(rate) && rate > 0 && rate <= MAX_ADD_RATE ? rate : DEFAULT_ADD_RATE,
  }
}

/**
 * Drop `add` (and its `r`) from the address bar so a reload or back-navigation
 * doesn't add the item again. Other params (`p`, `support`, …) and the hash stay.
 */
export function stripAddItemParams(): void {
  try {
    const url = new URL(location.href)
    if (!url.searchParams.has(ADD_PARAM)) return
    url.searchParams.delete(ADD_PARAM)
    url.searchParams.delete(ADD_RATE_PARAM)
    history.replaceState(history.state, '', url.pathname + url.search + url.hash)
  } catch {
    // History API unavailable — leave the URL as is.
  }
}
