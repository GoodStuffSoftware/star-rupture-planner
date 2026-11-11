/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from './plannerStore'
import {
  save,
  loadSaved,
  isSamePlan,
  LS_KEY,
  MAX_CLOSED_TABS,
  type PlanState,
  type PlanTargetState,
  type ClosedTabState,
} from '../lib/persistState'
import { DEFAULT_VERSION } from '../data/versions'
import { DEFAULT_TARGET_PREF } from '../lib/format'

// Tab model: new/empty tabs, pins, bulk closes and the closed-tab stack.

function stubFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
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

type Tab = string | null | (PlanTargetState & { targetItemId: string | null })

/** A plan with one recipe tab per entry; `null` is an empty tab. */
function planOf(tabs: Tab[], extra: Partial<PlanState> = {}): PlanState {
  const targets: PlanTargetState[] = tabs.map((t) =>
    typeof t === 'object' && t !== null
      ? t
      : { targetItemId: t, targetRate: 30, overages: {}, expandLevel: 2 },
  )
  return {
    version: DEFAULT_VERSION,
    targetItemId: targets[0].targetItemId,
    targetRate: 30,
    overages: {},
    targets,
    activeTargetIndex: 0,
    tier: {},
    overrides: {},
    recipeOverrides: {},
    ...extra,
  }
}

const closedOf = (id: string, index: number, pinned = false): ClosedTabState => ({
  targetItemId: id,
  targetRate: 30,
  overages: {},
  expandLevel: 2,
  expanded: {},
  pinned,
  index,
})

type Store = ReturnType<typeof usePlannerStore>
const ids = (s: Store) => s.targets.map((t) => t.targetItemId)
const activeIdx = (s: Store) => s.targets.findIndex((t) => t.tid === s.activeTargetId)
const tid = (s: Store, i: number) => s.targets[i].tid
const closedIds = (s: Store) => s.closedTabs.map((c) => c.targetItemId)
const stored = () => loadSaved()?.plan

async function flush() {
  await nextTick()
  vi.advanceTimersByTime(400)
}

/** A page load of the planner with `plan` saved. */
async function openTab(plan: PlanState | null, search = '') {
  if (plan) {
    localStorage.clear()
    save(plan, prefs)
  }
  history.replaceState(null, '', `/${search}`)
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('new tab', () => {
  it('opens an empty, active tab at the end and asks the search box to focus', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock']))
    const before = s.searchFocusTick
    const id = s.newTab()
    expect(ids(s)).toEqual(['aerogel', 'airlock', null])
    expect(s.activeTargetId).toBe(id)
    expect(s.activeTarget.targetItemId).toBeNull()
    expect(s.isEmptyTab(id)).toBe(true)
    expect(s.searchFocusTick).toBe(before + 1)
  })

  it('goes at the given index, but never into the pinned part', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    s.newTab(1)
    expect(ids(s)).toEqual(['aerogel', null, 'airlock', 'rotor'])

    const p = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    p.togglePin(tid(p, 0))
    p.togglePin(tid(p, 1)) // aerogel, airlock pinned
    p.newTab(0)
    expect(ids(p)).toEqual(['aerogel', 'airlock', null, 'rotor'])
    p.closeTarget(p.activeTargetId)
    p.newTab(99)
    expect(ids(p)).toEqual(['aerogel', 'airlock', 'rotor', null])
  })

  it('reuses an existing empty tab instead of making a second one', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock']))
    const first = s.newTab()
    s.setActiveTarget(tid(s, 0))
    const ticks = s.searchFocusTick
    const again = s.newTab()
    expect(again).toBe(first)
    expect(s.targets).toHaveLength(3)
    expect(s.activeTargetId).toBe(first)
    expect(s.searchFocusTick).toBe(ticks + 1) // still refocuses the search box
  })

  it('picking an item while the active tab is empty fills that tab at the default rate', async () => {
    const s = await openTab(planOf(['aerogel']))
    const id = s.newTab()
    s.selectTargetItem('rotor')
    expect(s.targets).toHaveLength(2)
    expect(s.activeTargetId).toBe(id)
    expect(s.activeTarget.targetItemId).toBe('rotor')
    expect(s.activeTarget.targetRate).toBe(s.defaultTargetRate('rotor'))
    expect(s.hasEmptyTab).toBe(false)
  })

  it('an empty tab persists across a reload', async () => {
    const s = await openTab(planOf(['aerogel']))
    s.newTab()
    await flush()
    expect(stored()?.targets?.map((t) => t.targetItemId)).toEqual(['aerogel', null])
    const again = await openTab(null) // same storage, a fresh page
    expect(ids(again)).toEqual(['aerogel', null])
    expect(activeIdx(again)).toBe(1)
  })

  it('?add= fills an empty active tab rather than opening another', async () => {
    const s = await openTab(planOf(['aerogel', null], { activeTargetIndex: 1 }), '?add=rotor')
    expect(ids(s)).toEqual(['aerogel', 'rotor'])
    expect(activeIdx(s)).toBe(1)
  })

  it('?add= opens a new tab when the active tab has an item', async () => {
    const s = await openTab(planOf(['aerogel', null], { activeTargetIndex: 0 }), '?add=rotor')
    expect(ids(s)).toEqual(['aerogel', null, 'rotor'])
  })

  it('last close leaves one empty tab', async () => {
    const s = await openTab(planOf(['aerogel']))
    s.closeTarget(tid(s, 0))
    expect(ids(s)).toEqual([null])
    expect(s.canCloseTab(tid(s, 0))).toBe(false)
    s.closeTarget(tid(s, 0)) // nothing left to close
    expect(ids(s)).toEqual([null])
    expect(closedIds(s)).toEqual(['aerogel'])
  })
})

describe('empty tabs are ignored', () => {
  it('by the combined totals', async () => {
    const solo = await openTab(planOf(['aerogel', 'airlock']))
    solo.showAllTotals()
    const expected = JSON.stringify(solo.allTotals)

    const s = await openTab(planOf(['aerogel', null, 'airlock']))
    s.showAllTotals()
    expect(JSON.stringify(s.allTotals)).toBe(expected)

    const empty = await openTab(planOf([null]))
    expect(empty.allTotals).toBeNull()
    expect(empty.totals).toBeNull()
    expect(empty.tree).toBeNull()
  })

  it('by the share link', async () => {
    const s = await openTab(planOf(['aerogel', null]))
    const url = new URL(s.buildShareUrl())
    const p = url.searchParams.get('p') ?? ''
    const json = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')))
    expect(json.i).toBe('aerogel')
    expect(json.m).toBeUndefined()
  })

  it('by the share-link comparison', () => {
    expect(isSamePlan(planOf(['aerogel', null]), planOf(['aerogel']))).toBe(true)
    expect(isSamePlan(planOf(['aerogel', 'airlock']), planOf(['aerogel']))).toBe(false)
  })
})

describe('pin', () => {
  it('moves a pinned tab to the left, in pin order', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor', 'accumulator']))
    s.togglePin(tid(s, 2)) // rotor
    expect(ids(s)).toEqual(['rotor', 'aerogel', 'airlock', 'accumulator'])
    s.togglePin(tid(s, 3)) // accumulator
    expect(ids(s)).toEqual(['rotor', 'accumulator', 'aerogel', 'airlock'])
    expect(s.pinnedCount).toBe(2)
    expect(s.isPinned(tid(s, 0))).toBe(true)
  })

  it('unpinning moves the tab to the first unpinned position', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor', 'accumulator']))
    s.togglePin(tid(s, 2))
    s.togglePin(tid(s, 3)) // rotor, accumulator pinned
    s.togglePin(tid(s, 0)) // unpin rotor
    expect(ids(s)).toEqual(['accumulator', 'rotor', 'aerogel', 'airlock'])
    expect(s.targets.map((t) => t.pinned)).toEqual([true, false, false, false])
  })

  it('keeps the active tab active', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    s.setActiveTarget(tid(s, 2))
    const active = s.activeTargetId
    s.togglePin(active)
    expect(s.activeTargetId).toBe(active)
    expect(activeIdx(s)).toBe(0)
  })

  it('drag-reorder stays inside the pinned or the unpinned group', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor', 'accumulator']))
    s.togglePin(tid(s, 0))
    s.moveTarget(tid(s, 0), tid(s, 2)) // pinned onto unpinned: refused
    expect(ids(s)).toEqual(['aerogel', 'airlock', 'rotor', 'accumulator'])
    s.moveTarget(tid(s, 1), tid(s, 3)) // within the unpinned
    expect(ids(s)).toEqual(['aerogel', 'rotor', 'accumulator', 'airlock'])
  })

  it('persists pins and the order across a reload', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    s.togglePin(tid(s, 2))
    await flush()
    const again = await openTab(null)
    expect(ids(again)).toEqual(['rotor', 'aerogel', 'airlock'])
    expect(again.targets.map((t) => t.pinned)).toEqual([true, false, false])
  })
})

describe('bulk closes', () => {
  const five = () => planOf(['aerogel', 'airlock', 'rotor', 'accumulator', 'battery'])

  it('closeOtherTabs keeps the tab and the pinned ones, and makes it active', async () => {
    const s = await openTab(five())
    s.togglePin(tid(s, 4)) // battery pinned: battery aerogel airlock rotor accumulator
    s.setActiveTarget(tid(s, 4)) // accumulator active
    s.closeOtherTabs(tid(s, 2)) // airlock
    expect(ids(s)).toEqual(['battery', 'airlock'])
    expect(s.activeTarget.targetItemId).toBe('airlock')
  })

  it('closeOtherTabs leaves the active tab alone when it survives', async () => {
    const s = await openTab(five())
    s.togglePin(tid(s, 3))
    s.setActiveTarget(tid(s, 0)) // the pinned one
    s.closeOtherTabs(tid(s, 3))
    expect(ids(s)).toEqual(['accumulator', 'rotor'])
    expect(s.activeTarget.targetItemId).toBe('accumulator')
  })

  it('closeTabsToRight closes only the unpinned tabs to the right', async () => {
    const s = await openTab(five())
    s.togglePin(tid(s, 4)) // battery aerogel airlock rotor accumulator
    s.setActiveTarget(tid(s, 4))
    s.closeTabsToRight(tid(s, 1)) // aerogel
    expect(ids(s)).toEqual(['battery', 'aerogel'])
    expect(s.activeTarget.targetItemId).toBe('aerogel')
  })

  it('closeTabsToRight from a pinned tab closes every unpinned tab', async () => {
    const s = await openTab(five())
    s.togglePin(tid(s, 0))
    s.togglePin(tid(s, 1)) // aerogel airlock pinned
    s.closeTabsToRight(tid(s, 0))
    expect(ids(s)).toEqual(['aerogel', 'airlock'])
  })

  it('the can-flags say when a bulk close has nothing to do', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    expect(s.canCloseOthers(tid(s, 0))).toBe(true)
    expect(s.canCloseToRight(tid(s, 2))).toBe(false)
    expect(s.canCloseToRight(tid(s, 1))).toBe(true)
    s.togglePin(tid(s, 1))
    s.togglePin(tid(s, 2)) // pins: airlock rotor | aerogel
    expect(s.canCloseOthers(tid(s, 0))).toBe(true) // aerogel is still open
    expect(s.canCloseOthers(tid(s, 2))).toBe(false) // only pinned tabs besides it
    expect(s.canCloseToRight(tid(s, 1))).toBe(true)
    expect(s.canCloseToRight(tid(s, 2))).toBe(false)
  })

  it('a pinned tab can still be closed one at a time', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock']))
    s.togglePin(tid(s, 0))
    s.closeTarget(tid(s, 0))
    expect(ids(s)).toEqual(['airlock'])
  })

  it('closing everything else down to one tab is fine; Σ All view falls back to that tab', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    s.showAllTotals()
    s.closeOtherTabs(tid(s, 1))
    expect(ids(s)).toEqual(['airlock'])
    expect(s.isAllView).toBe(false)
    expect(s.activeTargetId).toBe(tid(s, 0))
  })
})

describe('closed-tab stack', () => {
  it('every close pushes a snapshot: item, rate, expansion, pinned, index', async () => {
    const s = await openTab(
      planOf([
        'aerogel',
        {
          targetItemId: 'airlock',
          targetRate: 45,
          overages: { airlock: 5 },
          expandLevel: 3,
          expanded: { airlock: false },
        },
        'rotor',
      ]),
    )
    s.closeTarget(tid(s, 1))
    expect(s.closedTabs).toEqual([
      {
        targetItemId: 'airlock',
        targetRate: 45,
        overages: { airlock: 5 },
        expandLevel: 3,
        expanded: { airlock: false },
        pinned: false,
        index: 1,
      },
    ])
    expect(s.canReopen).toBe(true)
  })

  it('does not record empty tabs', async () => {
    const s = await openTab(planOf(['aerogel', null]))
    s.closeTarget(tid(s, 1))
    expect(s.closedTabs).toEqual([])
    expect(s.canReopen).toBe(false)
  })

  it('reopens newest first, each at its former index, and activates it', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor', 'accumulator']))
    s.closeTarget(tid(s, 3)) // accumulator (index 3)
    s.closeTarget(tid(s, 1)) // airlock (index 1)
    expect(closedIds(s)).toEqual(['airlock', 'accumulator'])
    expect(s.reopenClosedTab()).not.toBeNull()
    expect(ids(s)).toEqual(['aerogel', 'airlock', 'rotor'])
    expect(s.activeTarget.targetItemId).toBe('airlock')
    s.reopenClosedTab()
    expect(ids(s)).toEqual(['aerogel', 'airlock', 'rotor', 'accumulator'])
    expect(s.activeTarget.targetItemId).toBe('accumulator')
    expect(s.canReopen).toBe(false)
    expect(s.reopenClosedTab()).toBeNull()
  })

  it('restores rate, expansion and overages', async () => {
    const s = await openTab(
      planOf([
        'aerogel',
        {
          targetItemId: 'airlock',
          targetRate: 45,
          overages: { airlock: 5 },
          expandLevel: 3,
          expanded: { airlock: false },
        },
      ]),
    )
    s.closeTarget(tid(s, 1))
    s.reopenClosedTab()
    expect(s.activeTarget).toMatchObject({
      targetItemId: 'airlock',
      targetRate: 45,
      overages: { airlock: 5 },
      expandLevel: 3,
      expanded: { airlock: false },
    })
  })

  it('clamps a former index that is now past the end', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor', 'accumulator']))
    s.closeTarget(tid(s, 3))
    s.closeTarget(tid(s, 2))
    s.closeTarget(tid(s, 1))
    s.reopenClosedTab() // airlock, index 1
    s.reopenClosedTab() // rotor, index 2 -> clamped to the end
    s.reopenClosedTab() // accumulator, index 3
    expect(ids(s)).toEqual(['aerogel', 'airlock', 'rotor', 'accumulator'])
    const t = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    t.closeTarget(tid(t, 2))
    t.closeTarget(tid(t, 1))
    t.closeTarget(tid(t, 0)) // leaves one empty tab; the stack holds all three
    expect(ids(t)).toEqual([null])
    t.closeOtherTabs(tid(t, 0))
    t.reopenClosedTab() // aerogel replaces the lone empty tab
    expect(ids(t)).toEqual(['aerogel'])
  })

  it('a bulk close reopens left to right, rebuilding the original layout', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor', 'accumulator', 'battery']))
    s.togglePin(tid(s, 4)) // battery | aerogel airlock rotor accumulator
    s.closeOtherTabs(tid(s, 2)) // keeps battery and airlock
    expect(ids(s)).toEqual(['battery', 'airlock'])
    expect(closedIds(s)).toEqual(['aerogel', 'rotor', 'accumulator'])
    s.reopenClosedTab()
    s.reopenClosedTab()
    s.reopenClosedTab()
    expect(ids(s)).toEqual(['battery', 'aerogel', 'airlock', 'rotor', 'accumulator'])
  })

  it('reopens a pinned tab pinned, inside the pinned part', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    s.togglePin(tid(s, 1))
    s.togglePin(tid(s, 2)) // airlock rotor | aerogel (rotor pinned second)
    s.closeTarget(tid(s, 0)) // airlock, pinned, index 0
    s.reopenClosedTab()
    expect(ids(s)).toEqual(['airlock', 'rotor', 'aerogel'])
    expect(s.targets.map((t) => t.pinned)).toEqual([true, true, false])
  })

  it('an unpinned tab never reopens into the pinned part', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    s.closeTarget(tid(s, 0)) // aerogel, index 0
    s.togglePin(tid(s, 0)) // airlock pinned
    s.reopenClosedTab()
    expect(ids(s)).toEqual(['airlock', 'aerogel', 'rotor'])
    expect(s.targets.map((t) => t.pinned)).toEqual([true, false, false])
  })

  it('keeps at most ten, dropping the oldest', async () => {
    const probe = await openTab(planOf(['aerogel']))
    const all = probe.items.slice(0, 13).map((i) => i.id)
    const s = await openTab(planOf(all))
    const valid = s.targets.map((t) => t.targetItemId)
    expect(valid.length).toBeGreaterThan(MAX_CLOSED_TABS)
    for (let i = 0; i < valid.length - 1; i++) s.closeTarget(tid(s, 0))
    expect(s.closedTabs).toHaveLength(MAX_CLOSED_TABS)
    // newest first: the last closed is on top, the oldest ones are gone
    expect(closedIds(s)[0]).toBe(valid[valid.length - 2])
    expect(closedIds(s)).not.toContain(valid[0])
  })

  it('persists across a reload', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    s.closeTarget(tid(s, 1))
    await flush()
    expect(stored()?.closedTabs?.map((c) => c.targetItemId)).toEqual(['airlock'])
    const again = await openTab(null)
    expect(closedIds(again)).toEqual(['airlock'])
    again.reopenClosedTab()
    expect(ids(again)).toEqual(['aerogel', 'airlock', 'rotor'])
  })

  it('loading a version without a plan starts with an empty stack', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock']))
    s.closeTarget(tid(s, 1))
    await s.load('update1')
    expect(s.closedTabs).toEqual([])
  })
})

describe('loading saved state', () => {
  it('a save without pins or a closed stack loads unchanged', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor'], { activeTargetIndex: 1 }))
    expect(ids(s)).toEqual(['aerogel', 'airlock', 'rotor'])
    expect(s.targets.every((t) => !t.pinned)).toBe(true)
    expect(s.closedTabs).toEqual([])
    expect(activeIdx(s)).toBe(1)
    expect(s.hasEmptyTab).toBe(false)
  })

  it('an old single-target save (no tab list) still falls back to a real item', async () => {
    const plan = planOf(['aerogel'])
    delete plan.targets
    plan.targetItemId = null
    const s = await openTab(plan)
    expect(s.targets).toHaveLength(1)
    expect(s.targets[0].targetItemId).not.toBeNull()
  })

  it('an unknown item in a tab list still falls back to a real item, not an empty tab', async () => {
    const s = await openTab(planOf(['aerogel', 'no-such-item']))
    expect(s.targets[1].targetItemId).not.toBeNull()
    expect(s.targets[1].targetItemId).not.toBe('no-such-item')
  })

  it('restores a broken pin order into a pinned prefix, keeping the active tab', async () => {
    const plan = planOf(
      [
        { targetItemId: 'aerogel', targetRate: 30, overages: {}, expandLevel: 2 },
        { targetItemId: 'airlock', targetRate: 30, overages: {}, expandLevel: 2, pinned: true },
        { targetItemId: 'rotor', targetRate: 30, overages: {}, expandLevel: 2 },
      ],
      { activeTargetIndex: 2 },
    )
    const s = await openTab(plan)
    expect(ids(s)).toEqual(['airlock', 'aerogel', 'rotor'])
    expect(s.activeTarget.targetItemId).toBe('rotor')
  })

  it('validates the closed stack: bad entries dropped, unknown items dropped, capped', async () => {
    const junk = [
      null,
      'x',
      { targetItemId: 'no-such-item', targetRate: 30, index: 0 },
      { targetItemId: 'airlock', targetRate: -5, index: 0 },
      { targetItemId: 'airlock', targetRate: 'fast', index: 0 },
      { targetItemId: 'airlock', targetRate: 30, index: -3, overages: 'no', expanded: 7 },
    ] as unknown as ClosedTabState[]
    const many = Array.from({ length: 15 }, () => closedOf('rotor', 1))
    const s = await openTab(planOf(['aerogel'], { closedTabs: [...junk, ...many] }))
    expect(s.closedTabs).toHaveLength(MAX_CLOSED_TABS)
    expect(s.closedTabs[0]).toMatchObject({
      targetItemId: 'airlock',
      targetRate: 30,
      index: 0,
      pinned: false,
      overages: {},
      expanded: {},
    })
    const t = await openTab(planOf(['aerogel'], { closedTabs: 'nope' as never }))
    expect(t.closedTabs).toEqual([])
  })
})

describe('cross-tab sync of the new fields', () => {
  /** Another browser tab saving the plan: a write, and the `storage` event this tab would get. */
  function siblingSaves(plan: PlanState) {
    localStorage.setItem(LS_KEY, JSON.stringify({ plan, prefs }))
    window.dispatchEvent(
      new StorageEvent('storage', { key: LS_KEY, newValue: localStorage.getItem(LS_KEY) }),
    )
  }

  it('adopts pins, empty tabs and the closed stack without writing them back', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock']))
    const sibling = planOf(
      [
        { targetItemId: 'rotor', targetRate: 30, overages: {}, expandLevel: 2, pinned: true },
        { targetItemId: 'aerogel', targetRate: 30, overages: {}, expandLevel: 2 },
        { targetItemId: null, targetRate: 60, overages: {}, expandLevel: 2 },
      ],
      { activeTargetIndex: 2, closedTabs: [closedOf('airlock', 1), closedOf('battery', 0)] },
    )
    siblingSaves(sibling)
    const raw = localStorage.getItem(LS_KEY)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await nextTick()
    await nextTick()
    vi.advanceTimersByTime(1000)

    expect(ids(s)).toEqual(['rotor', 'aerogel', null])
    expect(s.targets.map((t) => t.pinned)).toEqual([true, false, false])
    expect(activeIdx(s)).toBe(2)
    expect(closedIds(s)).toEqual(['airlock', 'battery'])
    expect(setItem).not.toHaveBeenCalled() // no echo back to the sibling
    expect(localStorage.getItem(LS_KEY)).toBe(raw)
    setItem.mockRestore()
  })

  it('a tab action here is saved once and adopted by the sibling the same way', async () => {
    const s = await openTab(planOf(['aerogel', 'airlock', 'rotor']))
    s.closeTarget(tid(s, 1))
    s.togglePin(tid(s, 1))
    await flush()
    const saved = stored()
    expect(saved?.targets?.map((t) => [t.targetItemId, t.pinned])).toEqual([
      ['rotor', true],
      ['aerogel', false],
    ])
    expect(saved?.closedTabs?.map((c) => c.targetItemId)).toEqual(['airlock'])

    // Another tab loading that save lands in the same state and leaves storage as it was.
    const raw = localStorage.getItem(LS_KEY)
    const other = await openTab(null)
    expect(ids(other)).toEqual(['rotor', 'aerogel'])
    expect(closedIds(other)).toEqual(['airlock'])
    expect(localStorage.getItem(LS_KEY)).toBe(raw)
  })

  it('an adopted closed stack can be reopened and syncs back', async () => {
    const s = await openTab(planOf(['aerogel']))
    siblingSaves(planOf(['aerogel'], { closedTabs: [closedOf('airlock', 1)] }))
    await nextTick()
    await nextTick()
    expect(s.canReopen).toBe(true)
    s.reopenClosedTab()
    await flush()
    expect(stored()?.targets?.map((t) => t.targetItemId)).toEqual(['aerogel', 'airlock'])
    expect(stored()?.closedTabs).toEqual([])
  })
})
