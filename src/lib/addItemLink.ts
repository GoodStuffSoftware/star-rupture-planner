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

// ─── Single-instance hand-off ─────────────────────────────────────────────────
// The in-game Codex opens `?add=` through the OS, so every click is a brand-new
// top-level tab. Before such a tab loads anything it asks the planner tabs that
// are already open (same origin, over a BroadcastChannel) to take the item:
//   new tab -> `ask`   every ready tab -> `offer`   (any number may answer)
//   new tab -> `take`  to the first offer only      chosen tab adds + persists
//   chosen tab -> `done`                            new tab closes itself
// Taking from a single offerer is what keeps the add exactly-once with several
// tabs open. Without a `done` inside the timeout the new tab adds locally.

export const HANDOFF_CHANNEL = 'srp:add-item-handoff'

/**
 * Longest the new tab waits for the whole ask/offer/take/done round trip. Replies
 * are message events, not timers, so a throttled background tab answers as soon
 * as its main thread is free: the delay is only a busy render (tens to a few
 * hundred ms). A frozen or discarded tab never answers, and then this is the
 * full price of the local fallback, paid again on every cold launch with no
 * planner open, so it stays under the ~1 s where a wait starts to feel broken.
 */
export const HANDOFF_TIMEOUT_MS = 800

type HandOffMessage =
  | { type: 'ask'; id: string }
  | { type: 'offer'; id: string; from: string }
  | { type: 'take'; id: string; to: string; itemId: string; rate: number }
  | { type: 'done'; id: string }

export function hasHandOffSupport(): boolean {
  return typeof BroadcastChannel !== 'undefined'
}

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

/** Narrow an incoming message; anything malformed is dropped. */
function readMessage(data: unknown): HandOffMessage | null {
  if (!data || typeof data !== 'object') return null
  const m = data as Record<string, unknown>
  if (typeof m.id !== 'string') return null
  switch (m.type) {
    case 'ask':
    case 'done':
      return { type: m.type, id: m.id }
    case 'offer':
      return typeof m.from === 'string' ? { type: 'offer', id: m.id, from: m.from } : null
    case 'take':
      return typeof m.to === 'string' && typeof m.itemId === 'string' && m.itemId.trim()
        ? {
            type: 'take',
            id: m.id,
            to: m.to,
            itemId: m.itemId.trim(),
            rate: sanitizeAddRate(Number(m.rate)),
          }
        : null
    default:
      return null
  }
}

/**
 * Ask the other open planner tabs to add `req`. Resolves true only once one of
 * them confirmed it (the caller may then drop its own add), false on timeout or
 * when the channel is unavailable (the caller adds locally). Never rejects.
 */
export function requestHandOff(req: AddItemRequest): Promise<boolean> {
  return new Promise((resolve) => {
    let channel: BroadcastChannel
    try {
      channel = new BroadcastChannel(HANDOFF_CHANNEL)
    } catch {
      resolve(false)
      return
    }
    const id = newId()
    let taken = false
    const finish = (confirmed: boolean) => {
      clearTimeout(timer)
      channel.close()
      resolve(confirmed)
    }
    const timer = setTimeout(() => finish(false), HANDOFF_TIMEOUT_MS)
    channel.onmessage = (e: MessageEvent) => {
      const m = readMessage(e.data)
      if (!m || m.id !== id) return
      if (m.type === 'offer' && !taken) {
        taken = true // later offers are ignored: one taker, one add
        channel.postMessage({ type: 'take', id, to: m.from, itemId: req.itemId, rate: req.rate })
      } else if (m.type === 'done' && taken) {
        finish(true)
      }
    }
    try {
      channel.postMessage({ type: 'ask', id })
    } catch {
      finish(false)
    }
  })
}

/**
 * Answer other tabs' hand-off requests from this tab. `canServe` is asked both
 * when offering and again when taking, since state can change in between;
 * `accept` must apply the item synchronously. Returns a function that stops
 * serving.
 */
export function serveHandOff(
  canServe: () => boolean,
  accept: (req: AddItemRequest) => void,
): () => void {
  if (!hasHandOffSupport()) return () => {}
  let channel: BroadcastChannel
  try {
    channel = new BroadcastChannel(HANDOFF_CHANNEL)
  } catch {
    return () => {}
  }
  const me = newId()
  channel.onmessage = (e: MessageEvent) => {
    const m = readMessage(e.data)
    if (!m || !canServe()) return
    if (m.type === 'ask') {
      channel.postMessage({ type: 'offer', id: m.id, from: me })
    } else if (m.type === 'take' && m.to === me) {
      try {
        accept({ itemId: m.itemId, rate: m.rate })
      } catch {
        return // no `done`: the asking tab times out and adds the item itself
      }
      channel.postMessage({ type: 'done', id: m.id })
    }
  }
  return () => channel.close()
}
