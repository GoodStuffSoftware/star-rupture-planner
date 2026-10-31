/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from './plannerStore'
import {
  save,
  savePrefs,
  loadSaved,
  hasNewerSave,
  LS_KEY,
  type PlanState,
} from '../lib/persistState'
import { DEFAULT_VERSION } from '../data/versions'

// Several tabs cannot be told apart inside one jsdom window: they share the module state
// that tracks the revision. The two-tab behaviour is checked by scripts/e2e-tab-sync.mjs.

// Serve the bundled game data straight from public/ in place of the HTTP fetch.
// `gate`, when set, holds every fetch until it resolves.
let gate: Promise<void> | null = null
function stubFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
    await gate
    const body = readFileSync(
      resolve(import.meta.dirname, '../../public', url.replace(/^\//, '')),
      'utf-8',
    )
    return { ok: true, status: 200, statusText: 'OK', json: async () => JSON.parse(body) }
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

/** A plan with one recipe tab per item id. */
function planOf(...ids: string[]): PlanState {
  return {
    version: DEFAULT_VERSION,
    targetItemId: ids[0],
    targetRate: 30,
    overages: {},
    targets: ids.map((id) => ({ targetItemId: id, targetRate: 30, overages: {}, expandLevel: 2 })),
    activeTargetIndex: 0,
    tier: {},
    overrides: {},
    recipeOverrides: {},
  }
}

const storedIds = () => loadSaved()?.plan?.targets?.map((t) => t.targetItemId)
const itemIds = (s: ReturnType<typeof usePlannerStore>) => s.targets.map((t) => t.targetItemId)

/** Another browser tab saving the plan: a write, and the `storage` event this tab would get. */
function siblingSaves(plan: PlanState, { notify }: { notify: boolean }) {
  // Written to storage directly: the module that tracks this tab's revision
  // must not mistake a sibling's write for its own.
  localStorage.setItem(LS_KEY, JSON.stringify({ plan, prefs }))
  if (notify) {
    window.dispatchEvent(
      new StorageEvent('storage', { key: LS_KEY, newValue: localStorage.getItem(LS_KEY) }),
    )
  }
}

/** Open the planner as a page load at `search`; vitest's module state stands in for the tab. */
async function openTab(search = '') {
  history.replaceState(null, '', `/${search}`)
  setActivePinia(createPinia())
  const store = usePlannerStore()
  await store.init()
  await nextTick()
  vi.advanceTimersByTime(400) // flush the debounced save
  return store
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.stubGlobal('BroadcastChannel', undefined) // no hand-off: the plain storage path
  stubFetch()
})
afterEach(() => {
  gate = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('cross-tab sync', () => {
  it('a tab shows what a sibling saved, without a reload', async () => {
    save(planOf('aerogel', 'airlock'), prefs)
    const tab = await openTab()

    siblingSaves(planOf('aerogel', 'airlock', 'rotor'), { notify: true })
    await nextTick()

    expect(itemIds(tab)).toEqual(['aerogel', 'airlock', 'rotor'])
  })

  it('a tab that missed the sibling event does not overwrite its save', async () => {
    save(planOf('aerogel', 'airlock'), prefs)
    const tab = await openTab()

    siblingSaves(planOf('aerogel', 'airlock', 'rotor'), { notify: false })
    expect(hasNewerSave()).toBe(true)
    tab.setTarget('aerogel', 77) // an edit in the stale tab
    await nextTick()
    vi.advanceTimersByTime(400)
    await nextTick()

    expect(storedIds()).toEqual(['aerogel', 'airlock', 'rotor'])
    expect(itemIds(tab)).toEqual(['aerogel', 'airlock', 'rotor']) // and the tab caught up
    expect(hasNewerSave()).toBe(false)
  })

  it('an in-sync tab saves its edits as before', async () => {
    save(planOf('aerogel', 'airlock'), prefs)
    const tab = await openTab()
    expect(hasNewerSave()).toBe(false)

    tab.setTarget('aerogel', 77)
    await nextTick()
    vi.advanceTimersByTime(400)

    expect(loadSaved()?.plan?.targets?.[0].targetRate).toBe(77)
    expect(hasNewerSave()).toBe(false)
  })

  it('keeps saving after a sibling emptied storage', async () => {
    save(planOf('aerogel', 'airlock'), prefs)
    const tab = await openTab()

    localStorage.clear()
    tab.setTarget('aerogel', 77)
    await nextTick()
    vi.advanceTimersByTime(400)

    expect(storedIds()).toEqual(['aerogel', 'airlock'])
  })

  it('an ?add= tab that opens while a sibling saves during its load adds on top of it', async () => {
    save(planOf('aerogel', 'airlock'), prefs)
    let release!: () => void
    gate = new Promise((r) => (release = r))

    history.replaceState(null, '', '/?add=rotor')
    setActivePinia(createPinia())
    const tab = usePlannerStore()
    const init = tab.init()
    // The plan was read; while the game data is still loading a sibling saves a
    // change. (Its event is left out: tabs from earlier tests in this window would
    // also hear it, and they share the revision tracking.)
    await vi.advanceTimersByTimeAsync(0)
    siblingSaves(planOf('aerogel', 'airlock', 'accumulator'), { notify: false })
    release()
    await init
    await nextTick()
    vi.advanceTimersByTime(400)

    expect(storedIds()).toEqual(['aerogel', 'airlock', 'accumulator', 'rotor'])
    expect(itemIds(tab)).toEqual(['aerogel', 'airlock', 'accumulator', 'rotor'])
  })
})

describe('revision tracking', () => {
  it('is in sync after its own save, behind after a sibling write', () => {
    save(planOf('aerogel'), prefs)
    expect(hasNewerSave()).toBe(false)
    localStorage.setItem(LS_KEY, JSON.stringify({ plan: planOf('airlock') }))
    expect(hasNewerSave()).toBe(true)
  })

  it('a prefs-only save does not hide a plan this tab has not read', () => {
    save(planOf('aerogel'), prefs)
    localStorage.setItem(LS_KEY, JSON.stringify({ plan: planOf('airlock'), prefs }))
    savePrefs({ ...prefs, showIcons: false })
    expect(hasNewerSave()).toBe(true)
  })

  it('a prefs-only save by an in-sync tab keeps it in sync', () => {
    save(planOf('aerogel'), prefs)
    savePrefs({ ...prefs, showIcons: false })
    expect(hasNewerSave()).toBe(false)
  })
})
