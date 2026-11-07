/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from './plannerStore'
import { save, loadSaved, type PlanState, type ClosedTabState } from '../lib/persistState'
import { DEFAULT_VERSION } from '../data/versions'
import { DEFAULT_TARGET_PREF } from '../lib/format'

// Switching the game version keeps the plan: every tab, the closed-tab stack and the finer choices
// that are still valid. Picking the current version changes nothing.
//
// A machine of laser_emitter makes 7.5/min in update2_QoL and 10 in earlyaccess, so 22.5 stays as set.
// In the bundled data: `aerogel` and `airlock` exist in update1 and later but not in earlyaccess;
// `laser_emitter`, `rotor` and `glass` exist in all of them. `glass_v2` is a recipe only update2_QoL has.

let fetchCount = 0
function stubFetch() {
  fetchCount = 0
  vi.stubGlobal('fetch', async (url: string) => {
    fetchCount++
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
  defaultTarget: { ...DEFAULT_TARGET_PREF },
}

const closedOf = (id: string, index: number): ClosedTabState => ({
  targetItemId: id,
  targetRate: 30,
  overages: {},
  expandLevel: 2,
  expanded: {},
  pinned: false,
  index,
})

/** Four tabs (one pinned, one empty), the third active, with finer choices and a closed stack. */
function bigPlan(): PlanState {
  return {
    version: DEFAULT_VERSION,
    targetItemId: 'rotor',
    targetRate: 60,
    overages: {},
    targets: [
      {
        targetItemId: 'aerogel',
        targetRate: 45,
        overages: { 'aerogel>electronics': 5 },
        expandLevel: 3,
        expanded: { 'aerogel>electronics': true },
        pinned: true,
      },
      { targetItemId: 'laser_emitter', targetRate: 22.5, overages: {}, expandLevel: 2 },
      { targetItemId: 'rotor', targetRate: 60, overages: {}, expandLevel: 2 },
      { targetItemId: null, targetRate: 60, overages: {}, expandLevel: 2 },
    ],
    activeTargetIndex: 2,
    tier: {},
    overrides: { rotor: 'craftertier2' },
    recipeOverrides: { glass: 'glass_v2' },
    closedTabs: [closedOf('airlock', 1), closedOf('rotor', 0)],
  }
}

type Store = ReturnType<typeof usePlannerStore>
const ids = (s: Store) => s.targets.map((t) => t.targetItemId)
const rates = (s: Store) => s.targets.map((t) => t.targetRate)
const activeIdx = (s: Store) => s.targets.findIndex((t) => t.tid === s.activeTargetId)
const stored = () => loadSaved()?.plan

async function flush() {
  await nextTick()
  vi.advanceTimersByTime(400)
}

async function openTab(plan: PlanState): Promise<Store> {
  localStorage.clear()
  save(plan, prefs)
  history.replaceState(null, '', '/')
  setActivePinia(createPinia())
  const store = usePlannerStore()
  await store.init()
  await flush()
  return store
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.stubGlobal('BroadcastChannel', undefined)
  stubFetch()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('picking the version that is already loaded', () => {
  it('changes nothing: no reload, no reset, no save', async () => {
    const s = await openTab(bigPlan())
    const before = JSON.stringify(s.targets)
    const tids = s.targets.map((t) => t.tid)
    const raw = localStorage.getItem('srp:state:v1')
    const fetchesBefore = fetchCount
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    await s.setVersion(DEFAULT_VERSION)
    await flush()

    expect(fetchCount).toBe(fetchesBefore)
    expect(s.targets.map((t) => t.tid)).toEqual(tids) // the very same tabs, not rebuilt
    expect(JSON.stringify(s.targets)).toBe(before)
    expect(s.closedTabs).toHaveLength(2)
    expect(s.overrides).toEqual({ rotor: 'craftertier2' })
    expect(vi.getTimerCount()).toBe(0)
    expect(setItem).not.toHaveBeenCalled()
    expect(localStorage.getItem('srp:state:v1')).toBe(raw)
  })
})

describe('switching to another version', () => {
  it('keeps every tab with its order, active tab, pin, item and rate, and the closed stack', async () => {
    const s = await openTab(bigPlan())
    await s.setVersion('earlyaccess')
    await flush()

    expect(s.version).toBe('earlyaccess')
    expect(ids(s)).toEqual(['aerogel', 'laser_emitter', 'rotor', null])
    expect(rates(s)).toEqual([45, 22.5, 60, 60])
    expect(s.targets.map((t) => t.pinned)).toEqual([true, false, false, false])
    expect(activeIdx(s)).toBe(2)
    expect(s.targets[0].expandLevel).toBe(3)
    expect(s.closedTabs.map((c) => c.targetItemId)).toEqual(['airlock', 'rotor'])

    // and the same is what was written out
    expect(stored()?.version).toBe('earlyaccess')
    expect(stored()?.targets?.map((t) => t.targetItemId)).toEqual([
      'aerogel',
      'laser_emitter',
      'rotor',
      null,
    ])
    expect(stored()?.closedTabs).toHaveLength(2)
  })

  it('keeps the All view active', async () => {
    const plan = bigPlan()
    plan.activeTargetIndex = -1
    const s = await openTab(plan)
    await s.setVersion('update1')
    expect(s.isAllView).toBe(true)
  })

  it('drops overrides that are not valid in the new version, keeps the ones that are', async () => {
    const s = await openTab(bigPlan())
    expect(s.overrides).toEqual({ rotor: 'craftertier2' })
    expect(s.recipeOverrides).toEqual({ glass: 'glass_v2' })

    // update1 has craftertier2 for rotor but no glass_v2 recipe
    await s.setVersion('update1')
    expect(s.overrides).toEqual({ rotor: 'craftertier2' })
    expect(s.recipeOverrides).toEqual({})

    // earlyaccess has no craftertier2 at all
    await s.setVersion('earlyaccess')
    expect(s.overrides).toEqual({})
  })

  it('resolves a tree when a recipe key matches nothing (it falls back to the default recipe)', async () => {
    const s = await openTab(bigPlan())
    s.recipeOverrides = { glass: 'no_such_recipe', rotor: 'no_such_recipe' }
    expect(s.tree).not.toBeNull()
    expect(s.tree?.itemId).toBe('rotor')
  })
})

describe('a tab whose item the new version lacks', () => {
  it('is kept and shown as not in this version, without a tree', async () => {
    const s = await openTab(bigPlan())
    await s.setVersion('earlyaccess')

    expect(s.isMissingItem('aerogel')).toBe(true)
    expect(s.isMissingItem('rotor')).toBe(false)
    expect(s.isMissingItem(null)).toBe(false)

    s.setActiveTarget(s.targets[0].tid)
    expect(s.activeTargetMissing).toBe(true)
    expect(s.tree).toBeNull()
    expect(s.totals).toBeNull()
    expect(s.notice).toMatch(/1 tab isn't in Early Access/)

    // the All view tallies only the tabs that exist in this version
    s.showAllTotals()
    expect(s.allTotals).not.toBeNull()
    expect(s.allTotals?.rawMaterials.some((r) => r.itemId === 'aerogel')).toBe(false)
  })

  it('survives a round trip there and back, with its rate, pin and per-node choices', async () => {
    const s = await openTab(bigPlan())
    await s.setVersion('earlyaccess')
    await flush()
    await s.setVersion(DEFAULT_VERSION)
    await flush()

    expect(ids(s)).toEqual(['aerogel', 'laser_emitter', 'rotor', null])
    expect(rates(s)).toEqual([45, 22.5, 60, 60])
    expect(s.targets[0].pinned).toBe(true)
    expect(s.targets[0].overages).toEqual({ 'aerogel>electronics': 5 })
    expect(s.targets[0].expanded).toEqual({ 'aerogel>electronics': true })
    expect(activeIdx(s)).toBe(2)
    expect(s.closedTabs.map((c) => c.targetItemId)).toEqual(['airlock', 'rotor'])

    s.setActiveTarget(s.targets[0].tid)
    expect(s.activeTargetMissing).toBe(false)
    expect(s.tree?.itemId).toBe('aerogel')
  })

  it('stays after a page reload in the version that lacks it', async () => {
    const s = await openTab(bigPlan())
    await s.setVersion('earlyaccess')
    await flush()

    setActivePinia(createPinia())
    const again = usePlannerStore()
    await again.init()
    await flush()
    expect(again.version).toBe('earlyaccess')
    expect(ids(again)).toEqual(['aerogel', 'laser_emitter', 'rotor', null])
    expect(rates(again)).toEqual([45, 22.5, 60, 60])
  })

  it('is replaced by a default item when it comes from a link, as before', async () => {
    localStorage.clear()
    const plan = bigPlan()
    plan.version = 'earlyaccess'
    const { encodePlan } = await import('../lib/persistState')
    const url = new URL(encodePlan(plan))
    history.replaceState(null, '', `/${url.search}`)
    setActivePinia(createPinia())
    const s = usePlannerStore()
    await s.init()
    await flush()
    expect(s.targets.some((t) => t.targetItemId === 'aerogel')).toBe(false)
    expect(s.targets.every((t) => !s.isMissingItem(t.targetItemId))).toBe(true)
  })
})
