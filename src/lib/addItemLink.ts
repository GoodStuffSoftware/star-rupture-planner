// ─── "Add item" link ──────────────────────────────────────────────────────────
// `?add=<itemId>[&r=<perMinute>]` appends an item to the visitor's EXISTING plan
// (unlike `?p=`, which replaces it). Used by in-game launchers that only know
// "I want this item" and must never overwrite what the user has saved.

import { SHARE_PARAMS } from './persistState'

export const ADD_PARAM = 'add'
export const ADD_RATE_PARAM = 'r'
export const DEFAULT_ADD_RATE = 60
const MAX_ADD_RATE = 1_000_000

export interface AddItemRequest {
  itemId: string
  /** Items per minute; falls back to DEFAULT_ADD_RATE when missing or invalid. */
  rate: number
}

/** A usable items-per-minute rate, or the default when it is missing, non-numeric or absurd. */
export function sanitizeAddRate(rate: number): number {
  return Number.isFinite(rate) && rate > 0 && rate <= MAX_ADD_RATE ? rate : DEFAULT_ADD_RATE
}

/** Parse `?add=` / `&r=` from a query string. Returns null when no usable `add` is present. */
export function readAddItemRequest(search: string): AddItemRequest | null {
  const params = new URLSearchParams(search)
  const itemId = params.get(ADD_PARAM)?.trim()
  if (!itemId) return null
  return { itemId, rate: sanitizeAddRate(Number(params.get(ADD_RATE_PARAM))) }
}

/**
 * Drop the link params we act on from the address bar once they are handled
 * (applied, kept or declined), so a reload or back-navigation doesn't run them
 * again: the share-plan params (`p`, legacy `plan`) and `add` with its `r`
 * (`r` alone is not ours). Other params (`support`, etc.) and the hash stay.
 */
export function stripHandledParams(): void {
  try {
    const url = new URL(location.href)
    const had = [...SHARE_PARAMS, ADD_PARAM].some((k) => url.searchParams.has(k))
    if (!had) return
    for (const k of SHARE_PARAMS) url.searchParams.delete(k)
    if (url.searchParams.has(ADD_PARAM)) {
      url.searchParams.delete(ADD_PARAM)
      url.searchParams.delete(ADD_RATE_PARAM)
    }
    history.replaceState(history.state, '', url.pathname + url.search + url.hash)
  } catch {
    // History API unavailable, leave the URL as is.
  }
}
