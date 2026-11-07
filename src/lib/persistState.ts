import type { TierSelection } from './recipeIndex'
import type { VersionOverrides, RecipeOverrides, Overages, NodeExpansion } from '../types/game'
import { DEFAULT_VERSION } from '../data/versions'
import { normalizeTargetRate } from './format'

// ─── Shared state types ───────────────────────────────────────────────────────

/** One planning target ("recipe tab"): an item + desired rate + its overages. */
export interface PlanTargetState {
  targetItemId: string | null
  targetRate: number
  overages: Overages
  expandLevel?: number // per-tab expand scope
  expanded?: NodeExpansion // per-tab manual caret toggles (deviations from expandLevel)
}

export interface PlanState {
  version: string
  // Legacy single-target fields — still written (mirroring the active tab) and read
  // for backward compatibility with saves/URLs created before multi-target tabs.
  targetItemId: string | null
  targetRate: number
  overages: Overages
  // Multi-target tabs. When present this supersedes the legacy single-target fields.
  targets?: PlanTargetState[]
  activeTargetIndex?: number
  tier: TierSelection
  overrides: VersionOverrides
  recipeOverrides?: RecipeOverrides
}

export interface ViewPrefs {
  showExtractors: boolean
  showIcons: boolean
  showRowDividers: boolean
  showOverages: boolean
  expandLevel: number // Infinity is serialised as the string 'all'
  optionsCollapsed: boolean
  theme: 'starrupture' | 'spaceage'
  treeFontScale: number // tree zoom factor (1 = 100%)
  totalsPlacement: 'side' | 'bottom'
  totalsCollapsed: Record<string, boolean> // collapsed state per Totals subsection
}

// ─── LocalStorage key ─────────────────────────────────────────────────────────

/** Exported so the planner store can match it against `storage` events. */
export const LS_KEY = 'srp:state:v1'

// ─── Revision tracking ────────────────────────────────────────────────────────
// Every tab of the app writes the same blob, so a tab that missed a sibling's
// save (its `storage` event is still queued, or it never fires) would write its
// older copy over the newer one. The blob text itself is the revision: this
// tab remembers the text it last read or wrote, and `hasNewerSave` says whether
// storage has moved on since.

/** Blob text this tab last synced with; `undefined` until it has read storage. */
let syncedRaw: string | null | undefined

function readRaw(): string | null {
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}

/** True when storage holds a save this tab has not read or written itself. */
export function hasNewerSave(): boolean {
  return syncedRaw !== undefined && readRaw() !== syncedRaw
}

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
    const text = JSON.stringify(raw)
    localStorage.setItem(LS_KEY, text)
    syncedRaw = text
  } catch {
    // Quota exceeded or private-browsing restriction — ignore silently.
  }
}

export function savePrefs(prefs: ViewPrefs): void {
  try {
    // The stored plan is kept as is, so this write must not mark a newer plan
    // as read: only an in-sync tab stays in sync.
    const inSync = !hasNewerSave()
    const saved = loadSaved()
    const raw = {
      plan: saved?.plan,
      prefs: {
        ...prefs,
        expandLevel: prefs.expandLevel === Infinity ? 'all' : prefs.expandLevel,
      },
    }
    const text = JSON.stringify(raw)
    localStorage.setItem(LS_KEY, text)
    if (inSync) syncedRaw = text
  } catch {
    // ignore
  }
}

/**
 * `loadSaved`, for a tab that is about to show the result: also records the
 * text it read as the revision this tab is in sync with.
 */
export function loadSavedForSync(): { plan?: PlanState; prefs?: ViewPrefs } | null {
  syncedRaw = readRaw()
  return parseSaved(syncedRaw)
}

/**
 * Read saved plan + prefs from localStorage.
 * Returns null if nothing is saved or if the stored data is malformed.
 * Never throws.
 */
export function loadSaved(): { plan?: PlanState; prefs?: ViewPrefs } | null {
  return parseSaved(readRaw())
}

function parseSaved(raw: string | null): { plan?: PlanState; prefs?: ViewPrefs } | null {
  try {
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
        showOverages: typeof p.showOverages === 'boolean' ? p.showOverages : false,
        expandLevel,
        optionsCollapsed: typeof p.optionsCollapsed === 'boolean' ? p.optionsCollapsed : false,
        theme: p.theme === 'spaceage' || p.theme === 'cyan' ? 'spaceage' : 'starrupture',
        treeFontScale:
          typeof p.treeFontScale === 'number' && isFinite(p.treeFontScale) && p.treeFontScale > 0
            ? p.treeFontScale
            : 1,
        totalsPlacement: p.totalsPlacement === 'bottom' ? 'bottom' : 'side',
        totalsCollapsed:
          typeof p.totalsCollapsed === 'object' && p.totalsCollapsed !== null
            ? (p.totalsCollapsed as Record<string, boolean>)
            : {},
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
          recipeOverrides:
            typeof pl.recipeOverrides === 'object' && pl.recipeOverrides !== null
              ? (pl.recipeOverrides as RecipeOverrides)
              : {},
          overages:
            typeof pl.overages === 'object' && pl.overages !== null
              ? (pl.overages as Overages)
              : {},
          targets: Array.isArray(pl.targets) ? (pl.targets as PlanTargetState[]) : undefined,
          activeTargetIndex:
            typeof pl.activeTargetIndex === 'number' ? pl.activeTargetIndex : undefined,
        }
      }
    }

    if (!result.plan && !result.prefs) return null
    return result
  } catch {
    return null
  }
}

// ─── Plan comparison ──────────────────────────────────────────────────────────

/** A plan's recipe tabs; a legacy single-target plan counts as one tab. */
export function planTargetList(plan: PlanState): PlanTargetState[] {
  const tabs = plan.targets?.filter((t) => t && typeof t === 'object')
  return tabs?.length ? tabs : [plan]
}

const sortedEntries = (o: Record<string, unknown> | undefined) =>
  Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

/**
 * Do two plans mean the same thing? Used to decide whether a share link needs
 * the user's say-so. Compared: game version, the ordered tabs (item, rate,
 * overages), tier upgrades, building overrides and recipe overrides. Ignored,
 * because a share link doesn't reliably carry them or they are only view state:
 * which tab is active, expand levels and caret toggles, the all-v1 tier entries
 * (a link lists only v2 upgrades), and empty maps vs absent ones.
 */
export function isSamePlan(a: PlanState, b: PlanState): boolean {
  const key = (p: PlanState) =>
    JSON.stringify([
      p.version,
      // Rates compare as the whole numbers they load as, so a link holding 12.5 matches a save of 13.
      planTargetList(p).map((t) => [
        t.targetItemId,
        typeof t.targetRate === 'number' ? normalizeTargetRate(t.targetRate) : t.targetRate,
        sortedEntries(t.overages),
      ]),
      sortedEntries(p.tier).filter(([, v]) => v === 'v2'),
      sortedEntries(p.overrides),
      sortedEntries(p.recipeOverrides),
    ])
  return key(a) === key(b)
}

// ─── URL encode / decode ──────────────────────────────────────────────────────

/** Query params that carry a whole plan: current name first, legacy `plan` second. */
export const SHARE_PARAMS = ['p', 'plan'] as const

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
  const min: Record<string, unknown> = {}
  const targets = plan.targets && plan.targets.length ? plan.targets : null

  if (targets && targets.length > 1) {
    // Multi-target: `m` = array of { i, r, g? }, `a` = active index.
    min.m = targets.map((t) => {
      const e: Record<string, unknown> = { i: t.targetItemId, r: t.targetRate }
      if (t.overages && Object.keys(t.overages).length) e.g = t.overages
      if (typeof t.expandLevel === 'number') e.e = t.expandLevel
      return e
    })
    if (plan.activeTargetIndex) min.a = plan.activeTargetIndex
  } else {
    // Single target — keep the original compact i/r/g keys (shorter, back-compatible).
    const t = targets ? targets[0] : plan
    min.i = t.targetItemId
    min.r = t.targetRate
    if (t.overages && Object.keys(t.overages).length) min.g = t.overages
  }

  if (plan.version !== DEFAULT_VERSION) min.v = plan.version
  const v2 = Object.entries(plan.tier)
    .filter(([, val]) => val === 'v2')
    .map(([k]) => k)
  if (v2.length) min.t = v2
  if (Object.keys(plan.overrides).length) min.o = plan.overrides
  if (plan.recipeOverrides && Object.keys(plan.recipeOverrides).length) min.R = plan.recipeOverrides
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
    const encoded = params.get(SHARE_PARAMS[0]) ?? params.get(SHARE_PARAMS[1])
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
        overages: (typeof o.overages === 'object' && o.overages ? o.overages : {}) as Overages,
        targets: Array.isArray(o.targets)
          ? (o.targets.filter((t) => t && typeof t === 'object') as PlanTargetState[])
          : undefined,
        activeTargetIndex:
          typeof o.activeTargetIndex === 'number' ? o.activeTargetIndex : undefined,
      }
    }

    // Compact format ({ i, r, g?, m?, a?, v?, t?, o? })
    const tier: TierSelection = {}
    if (Array.isArray(o.t)) {
      for (const baseId of o.t) if (typeof baseId === 'string') tier[baseId] = 'v2'
    }
    const overrides = (typeof o.o === 'object' && o.o ? o.o : {}) as VersionOverrides
    const recipeOv = (typeof o.R === 'object' && o.R ? o.R : {}) as RecipeOverrides
    const version = typeof o.v === 'string' ? o.v : DEFAULT_VERSION

    // Multi-target (`m`)
    if (Array.isArray(o.m)) {
      const targets: PlanTargetState[] = o.m.map((raw) => {
        const e = (raw ?? {}) as Record<string, unknown>
        return {
          targetItemId: typeof e.i === 'string' ? e.i : null,
          targetRate: typeof e.r === 'number' ? e.r : 60,
          overages: (typeof e.g === 'object' && e.g ? e.g : {}) as Overages,
          expandLevel: typeof e.e === 'number' ? e.e : undefined,
        }
      })
      const first = targets[0] ?? { targetItemId: null, targetRate: 60, overages: {} }
      return {
        version,
        targetItemId: first.targetItemId,
        targetRate: first.targetRate,
        overages: first.overages,
        targets,
        activeTargetIndex: typeof o.a === 'number' ? o.a : 0,
        tier,
        overrides,
        recipeOverrides: recipeOv,
      }
    }

    // Single target
    if (typeof o.i !== 'string' && o.i !== null) return null
    return {
      version,
      targetItemId: (o.i as string | null) ?? null,
      targetRate: typeof o.r === 'number' ? o.r : 60,
      tier,
      overrides,
      recipeOverrides: recipeOv,
      overages: (typeof o.g === 'object' && o.g ? o.g : {}) as Overages,
    }
  } catch {
    return null
  }
}
