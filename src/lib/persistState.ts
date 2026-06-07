import type { TierSelection } from './recipeIndex'
import type { VersionOverrides } from '../types/game'
import { DEFAULT_VERSION } from '../data/versions'

// ─── Shared state types ───────────────────────────────────────────────────────

export interface PlanState {
  version: string
  targetItemId: string | null
  targetRate: number
  tier: TierSelection
  overrides: VersionOverrides
}

export interface ViewPrefs {
  showExtractors: boolean
  showIcons: boolean
  showRowDividers: boolean
  expandLevel: number // Infinity is serialised as the string 'all'
  optionsCollapsed: boolean
  theme: 'starrupture' | 'spaceage'
}

// ─── LocalStorage key ─────────────────────────────────────────────────────────

const LS_KEY = 'srp:state:v1'

// ─── save / loadSaved ─────────────────────────────────────────────────────────

/** Persist plan + prefs to localStorage. Converts Infinity → 'all'. Never throws. */
export function save(plan: PlanState, prefs: ViewPrefs): void {
  try {
    const raw = {
      plan,
      prefs: {
        ...prefs,
        expandLevel: prefs.expandLevel === Infinity ? 'all' : prefs.expandLevel,
      },
    }
    localStorage.setItem(LS_KEY, JSON.stringify(raw))
  } catch {
    // Quota exceeded or private-browsing restriction — ignore silently.
  }
}

/**
 * Read saved plan + prefs from localStorage.
 * Returns null if nothing is saved or if the stored data is malformed.
 * Never throws.
 */
export function loadSaved(): { plan?: PlanState; prefs?: ViewPrefs } | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>

    const result: { plan?: PlanState; prefs?: ViewPrefs } = {}

    // ── prefs ──
    if (parsed.prefs && typeof parsed.prefs === 'object') {
      const p = parsed.prefs as Record<string, unknown>
      // Deserialise 'all' → Infinity
      const rawLevel = p.expandLevel
      const expandLevel =
        rawLevel === 'all'
          ? Infinity
          : typeof rawLevel === 'number' && isFinite(rawLevel)
            ? rawLevel
            : 2
      result.prefs = {
        showExtractors: typeof p.showExtractors === 'boolean' ? p.showExtractors : false,
        showIcons: typeof p.showIcons === 'boolean' ? p.showIcons : true,
        showRowDividers: typeof p.showRowDividers === 'boolean' ? p.showRowDividers : false,
        expandLevel,
        optionsCollapsed: typeof p.optionsCollapsed === 'boolean' ? p.optionsCollapsed : false,
        theme: p.theme === 'spaceage' || p.theme === 'cyan' ? 'spaceage' : 'starrupture',
      }
    }

    // ── plan ──
    if (parsed.plan && typeof parsed.plan === 'object') {
      const pl = parsed.plan as Record<string, unknown>
      if (
        typeof pl.version === 'string' &&
        (typeof pl.targetItemId === 'string' || pl.targetItemId === null) &&
        typeof pl.targetRate === 'number' &&
        typeof pl.tier === 'object' &&
        pl.tier !== null &&
        typeof pl.overrides === 'object' &&
        pl.overrides !== null
      ) {
        result.plan = {
          version: pl.version,
          targetItemId: pl.targetItemId as string | null,
          targetRate: pl.targetRate,
          tier: pl.tier as TierSelection,
          overrides: pl.overrides as VersionOverrides,
        }
      }
    }

    if (!result.plan && !result.prefs) return null
    return result
  } catch {
    return null
  }
}

// ─── URL encode / decode ──────────────────────────────────────────────────────

/** Unicode-safe base64url encode. + / = → - _ (stripped). */
function toBase64Url(str: string): string {
  const b64 = btoa(unescape(encodeURIComponent(str)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** Reverse of toBase64Url. Never throws — returns null on error. */
function fromBase64Url(encoded: string): string | null {
  try {
    // Restore standard base64 padding
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4)
    return decodeURIComponent(escape(atob(padded)))
  } catch {
    return null
  }
}

/**
 * Encode the current plan into a COMPACT shareable URL. Only non-default fields
 * are included — default version, all-v1 tiers, and empty overrides are omitted —
 * with short keys (i/r/v/t/o), to keep the URL short.
 * Format: {origin}{pathname}?p=<base64url(JSON)>
 */
export function encodePlan(plan: PlanState): string {
  const min: Record<string, unknown> = { i: plan.targetItemId, r: plan.targetRate }
  if (plan.version !== DEFAULT_VERSION) min.v = plan.version
  const v2 = Object.entries(plan.tier)
    .filter(([, val]) => val === 'v2')
    .map(([k]) => k)
  if (v2.length) min.t = v2
  if (Object.keys(plan.overrides).length) min.o = plan.overrides
  const encoded = toBase64Url(JSON.stringify(min))
  return `${location.origin}${location.pathname}?p=${encoded}`
}

/**
 * Read + validate a PlanState from the current URL's `plan` query param.
 * Returns null if absent, malformed, or missing required keys. Never throws.
 */
export function decodePlanFromUrl(): PlanState | null {
  try {
    const params = new URLSearchParams(location.search)
    const encoded = params.get('p') ?? params.get('plan')
    if (!encoded) return null

    const json = fromBase64Url(encoded)
    if (!json) return null

    const o = JSON.parse(json) as Record<string, unknown>

    // Legacy full format ({ version, targetItemId, ... })
    if ('version' in o || 'targetItemId' in o) {
      if (
        (typeof o.targetItemId !== 'string' && o.targetItemId !== null) ||
        typeof o.targetRate !== 'number'
      )
        return null
      return {
        version: typeof o.version === 'string' ? o.version : DEFAULT_VERSION,
        targetItemId: (o.targetItemId as string | null) ?? null,
        targetRate: o.targetRate as number,
        tier: (typeof o.tier === 'object' && o.tier ? o.tier : {}) as TierSelection,
        overrides: (typeof o.overrides === 'object' && o.overrides
          ? o.overrides
          : {}) as VersionOverrides,
      }
    }

    // Compact format ({ i, r, v?, t?, o? })
    if (typeof o.i !== 'string' && o.i !== null) return null
    const tier: TierSelection = {}
    if (Array.isArray(o.t)) {
      for (const baseId of o.t) if (typeof baseId === 'string') tier[baseId] = 'v2'
    }
    return {
      version: typeof o.v === 'string' ? o.v : DEFAULT_VERSION,
      targetItemId: (o.i as string | null) ?? null,
      targetRate: typeof o.r === 'number' ? o.r : 60,
      tier,
      overrides: (typeof o.o === 'object' && o.o ? o.o : {}) as VersionOverrides,
    }
  } catch {
    return null
  }
}
