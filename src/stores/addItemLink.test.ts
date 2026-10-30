/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from './plannerStore'
import { save, loadSaved, LS_KEY, type PlanState } from '../lib/persistState'
import { DEFAULT_VERSION } from '../data/versions'

// Serve the bundled game data straight from public/ in place of the HTTP fetch.
function stubFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
    try {
      const body = readFileSync(
        resolve(import.meta.dirname, '../../public', url.replace(/^\//, '')),
        'utf-8',
      )
      return { ok: true, status: 200, statusText: 'OK', json: async () => JSON.parse(body) }
    } catch {
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => null }
    }
  })
}

const prefs = {
  showExtractors: false,
  showIcons: true,
  showRowDividers: false,
  showOverages: false,
  expandLevel: 2,
  optionsCollapsed: false,
  theme: 'starrupture' as const,
  treeFontScale: 1,
  totalsPlacement: 'side' as const,
  totalsCollapsed: {},
}

/** Two targets and a recipe override: the things a stray reset would lose. */
function savedPlan(): PlanState {
  return {
    version: DEFAULT_VERSION,
    targetItemId: 'airlock',
    targetRate: 12,
    overages: {},
    targets: [
      {
        targetItemId: 'aerogel',
        targetRate: 30,
        overages: { 'aerogel>liquid_helium': 5 },
        expandLevel: 3,
        expanded: { 'aerogel>liquid_helium': false },
      },
      { targetItemId: 'airlock', targetRate: 12, overages: {}, expandLevel: 2 },
    ],
    activeTargetIndex: 1,
    tier: { fabricator: 'v2' },
    overrides: { aerogel: 'compounder' },
    recipeOverrides: { aerogel: 'some-recipe-key' },
  }
}

async function open(search: string) {
  history.replaceState(null, '', `/${search}`)
  setActivePinia(createPinia())
  const store = usePlannerStore()
  await store.init()
  await nextTick()
  vi.advanceTimersByTime(400) // flush the debounced save
  return store
}

/** A `?p=` link in the compact format the game and the share button produce. */
const pLink = (plan: object) => `?p=${encodeURIComponent(btoa(JSON.stringify(plan)))}`

const itemIds = (s: ReturnType<typeof usePlannerStore>) => s.targets.map((t) => t.targetItemId)

describe('?add= link', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    stubFetch()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('on an empty plan, sets the added item as the only target', async () => {
    const s = await open('?add=aerogel&r=45')
    expect(itemIds(s)).toEqual(['aerogel'])
    expect(s.targets[0].targetRate).toBe(45)
    expect(loadSaved()?.plan?.targets?.map((t) => t.targetItemId)).toEqual(['aerogel'])
    expect(s.notice).toBeNull()
  })

  it('adds to an existing plan without losing targets, rates or recipes', async () => {
    save(savedPlan(), prefs)
    const s = await open('?add=accumulator&r=20')
    expect(itemIds(s)).toEqual(['aerogel', 'airlock', 'accumulator'])
    expect(s.targets.map((t) => t.targetRate)).toEqual([30, 12, 20])
    expect(s.targets[0].expandLevel).toBe(3)
    expect(s.recipeOverrides).toEqual({ aerogel: 'some-recipe-key' })
    expect(s.overrides).toEqual({ aerogel: 'compounder' })
    expect(s.tier.fabricator).toBe('v2')
    expect(s.targets[0].overages).toEqual({ 'aerogel>liquid_helium': 5 })
    expect(s.targets[0].expanded).toEqual({ 'aerogel>liquid_helium': false })
    expect(s.targetItemId).toBe('accumulator') // new tab is focused
    const persisted = loadSaved()?.plan
    expect(persisted?.targets?.map((t) => t.targetItemId)).toEqual([
      'aerogel',
      'airlock',
      'accumulator',
    ])
    expect(persisted?.recipeOverrides).toEqual({ aerogel: 'some-recipe-key' })
    expect(persisted?.overrides).toEqual({ aerogel: 'compounder' })
    expect(persisted?.tier?.fabricator).toBe('v2')
    expect(persisted?.targets?.[0].overages).toEqual({ 'aerogel>liquid_helium': 5 })
  })

  it('keeps every target when the plan was in the all-totals view', async () => {
    save({ ...savedPlan(), activeTargetIndex: -1 }, prefs)
    const s = await open('?add=accumulator')
    expect(itemIds(s)).toEqual(['aerogel', 'airlock', 'accumulator'])
    expect(s.targets.map((t) => t.targetRate)).toEqual([30, 12, 60])
  })

  it('on an empty plan, honours the rate even for the placeholder default item', async () => {
    const s = await open('?add=accumulator&r=45')
    expect(itemIds(s)).toEqual(['accumulator'])
    expect(s.targets[0].targetRate).toBe(45)
  })

  it('leaves saved state untouched when the game data cannot be fetched', async () => {
    save(savedPlan(), prefs)
    const before = localStorage.getItem(LS_KEY)
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 500,
      statusText: 'x',
      json: async () => null,
    }))
    await open('?add=accumulator')
    expect(localStorage.getItem(LS_KEY)).toBe(before)
  })

  it('focuses an item that is already a target instead of duplicating it', async () => {
    save(savedPlan(), prefs)
    const s = await open('?add=aerogel&r=999')
    expect(itemIds(s)).toEqual(['aerogel', 'airlock'])
    expect(s.targets[0].targetRate).toBe(30) // rate untouched
    expect(s.targetItemId).toBe('aerogel')
  })

  it('ignores an unknown item with a notice and keeps the plan intact', async () => {
    save(savedPlan(), prefs)
    const s = await open('?add=not-a-real-item')
    expect(itemIds(s)).toEqual(['aerogel', 'airlock'])
    expect(s.targets.map((t) => t.targetRate)).toEqual([30, 12])
    expect(s.notice).toContain('not-a-real-item')
    expect(loadSaved()?.plan?.targets).toHaveLength(2)
  })

  it('strips add and r from the URL so a reload cannot add it again', async () => {
    save(savedPlan(), prefs)
    await open('?add=accumulator&r=20')
    expect(location.search).toBe('')
    // Reloading the stripped URL changes nothing further.
    const again = await open('')
    expect(itemIds(again)).toEqual(['aerogel', 'airlock', 'accumulator'])
  })

  it('strips the URL for an unknown item too', async () => {
    await open('?add=not-a-real-item&r=5')
    expect(location.search).toBe('')
  })

  it('applies a deferred ?add= on top of the ?p= plan the user chose', async () => {
    save(savedPlan(), prefs)
    const s = await open(`${pLink({ i: 'airlock', r: 6 })}&add=aerogel`)
    expect(itemIds(s)).toEqual(['aerogel', 'airlock']) // saved plan on screen, add not applied yet
    await s.resolveShare('use')
    vi.advanceTimersByTime(400)
    expect(itemIds(s)).toEqual(['airlock', 'aerogel'])
    expect(location.search).toBe('')
  })

  it('leaves saved state alone when there is no add param', async () => {
    save(savedPlan(), prefs)
    const s = await open('')
    expect(itemIds(s)).toEqual(['aerogel', 'airlock'])
    expect(JSON.parse(localStorage.getItem(LS_KEY)!).plan.targets).toHaveLength(2)
  })
})

describe('?p= share link', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    stubFetch()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const shared = { i: 'accumulator', r: 6 }

  it('with a differing saved plan, writes nothing and changes nothing until a choice', async () => {
    save(savedPlan(), prefs)
    const before = localStorage.getItem(LS_KEY)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const s = await open(pLink(shared))
    vi.advanceTimersByTime(5000)
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem(LS_KEY)).toBe(before)
    expect(s.pendingShare?.targetItemId).toBe('accumulator')
    expect(itemIds(s)).toEqual(['aerogel', 'airlock']) // the saved plan is what's on screen
    expect(location.search).toContain('p=') // not stripped until handled
  })

  it('keep mine: saved plan byte-identical, param removed, prompt gone', async () => {
    save(savedPlan(), prefs)
    const before = localStorage.getItem(LS_KEY)
    const s = await open(`${pLink(shared)}&support=1#top`)
    await s.resolveShare('keep')
    vi.advanceTimersByTime(5000)
    expect(localStorage.getItem(LS_KEY)).toBe(before)
    expect(s.pendingShare).toBeNull()
    expect(location.search).toBe('?support=1') // unrelated params and the hash survive
    expect(location.hash).toBe('#top')
  })

  it('use shared: replaces the plan, persists it, removes the param', async () => {
    save(savedPlan(), prefs)
    const s = await open(pLink(shared))
    await s.resolveShare('use')
    vi.advanceTimersByTime(400)
    expect(itemIds(s)).toEqual(['accumulator'])
    expect(s.targets[0].targetRate).toBe(6)
    expect(loadSaved()?.plan?.targets?.map((t) => t.targetItemId)).toEqual(['accumulator'])
    expect(s.pendingShare).toBeNull()
    expect(location.search).toBe('')
  })

  it('add to my plan: a single-item link adds exactly one tab, nothing else changes', async () => {
    save(savedPlan(), prefs)
    const s = await open(pLink(shared))
    const before = loadSaved()!.plan!
    await s.resolveShare('add')
    vi.advanceTimersByTime(400)
    const after = loadSaved()!.plan!
    expect(after.targets).toHaveLength(3)
    expect(after.targets!.slice(0, 2)).toMatchObject(before.targets!) // overages, expanded, rates intact
    expect(after.targets![2]).toMatchObject({ targetItemId: 'accumulator', targetRate: 6 })
    expect(after.version).toBe(before.version)
    for (const k of ['tier', 'overrides', 'recipeOverrides'] as const) {
      expect(after[k]).toMatchObject(before[k]!) // re-save only fills in default tiers
    }
    expect(s.pendingShare).toBeNull()
    expect(location.search).toBe('')
  })

  it('add to my plan: unknown items are skipped with the ?add= notice', async () => {
    save(savedPlan(), prefs)
    const s = await open(
      pLink({
        m: [
          { i: 'not-a-real-item', r: 5 },
          { i: 'accumulator', r: 7 },
        ],
      }),
    )
    await s.resolveShare('add')
    expect(itemIds(s)).toEqual(['aerogel', 'airlock', 'accumulator'])
    expect(s.notice).toContain('not-a-real-item')
  })

  it('with no saved plan, applies directly without a prompt and strips the param', async () => {
    const s = await open(pLink(shared))
    expect(s.pendingShare).toBeNull()
    expect(itemIds(s)).toEqual(['accumulator'])
    expect(s.targets[0].targetRate).toBe(6)
    expect(loadSaved()?.plan?.targets?.map((t) => t.targetItemId)).toEqual(['accumulator'])
    expect(location.search).toBe('')
  })

  it('with a saved plan equal to the shared one, applies without a prompt', async () => {
    const equal = {
      ...savedPlan(),
      tier: {},
      overrides: {},
      recipeOverrides: {},
      targets: [{ targetItemId: 'accumulator', targetRate: 6, overages: {}, expandLevel: 4 }],
      activeTargetIndex: 0,
    }
    save(equal, prefs)
    const s = await open(pLink(shared)) // differs only in view state (expand level) and all-v1 tiers
    expect(s.pendingShare).toBeNull()
    expect(location.search).toBe('')
  })

  it('treats the legacy ?plan= param the same way', async () => {
    save(savedPlan(), prefs)
    const s = await open(pLink(shared).replace('?p=', '?plan='))
    expect(s.pendingShare).not.toBeNull()
    await s.resolveShare('keep')
    expect(location.search).toBe('')
  })
})
