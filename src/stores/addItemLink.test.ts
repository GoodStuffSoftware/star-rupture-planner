/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from './plannerStore'
import App from '../App.vue'
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

const nameOf = (s: ReturnType<typeof usePlannerStore>, id: string) =>
  s.items.find((i) => i.id === id)!.name

const itemIds = (s: ReturnType<typeof usePlannerStore>) => s.targets.map((t) => t.targetItemId)

/** Mount the real App on a fresh pinia (a page load at `search`). */
async function mountApp(search: string) {
  history.replaceState(null, '', `/${search}`)
  const pinia = createPinia()
  setActivePinia(pinia)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(App).use(pinia)
  app.mount(host)
  return {
    store: usePlannerStore(),
    host,
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

// Hand-off needs a real round trip, which the fake-timer suites below cannot
// give it. They exercise the local path, as in a browser without BroadcastChannel;
// the 'hand-off' suite puts the real one back.
beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined)
})

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
    expect(s.notice).toBe(`Added ${nameOf(s, 'aerogel')} to your plan.`)
  })

  it('on an existing plan, confirms the added item by its display name', async () => {
    save(savedPlan(), prefs)
    const s = await open('?add=accumulator')
    expect(s.notice).toBe(`Added ${nameOf(s, 'accumulator')} to your plan.`)
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
    expect(s.notice).toBe(`${nameOf(s, 'aerogel')} is already in your plan.`)
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

  it('add to my plan: several recipes raise one summary notice', async () => {
    save(savedPlan(), prefs)
    const s = await open(
      pLink({
        m: [
          { i: 'accumulator', r: 7 },
          { i: 'battery', r: 7 },
        ],
      }),
    )
    await s.resolveShare('add')
    expect(s.notice).toBe('Added 2 recipes to your plan.')
  })

  it('add to my plan: counts only the tabs actually created', async () => {
    save(savedPlan(), prefs)
    const s = await open(
      pLink({
        m: [
          { i: 'aerogel', r: 7 },
          { i: 'accumulator', r: 7 },
        ],
      }),
    )
    await s.resolveShare('add')
    expect(s.notice).toBe(`Added ${nameOf(s, 'accumulator')} to your plan.`)
  })

  it('add to my plan: recipes already in the plan are not reported as added', async () => {
    save(savedPlan(), prefs)
    const s = await open(
      pLink({
        m: [
          { i: 'aerogel', r: 7 },
          { i: 'airlock', r: 7 },
        ],
      }),
    )
    await s.resolveShare('add')
    expect(s.notice).toBe('Those recipes are already in your plan.')
  })

  it('add to my plan: a single recipe is named in the notice', async () => {
    save(savedPlan(), prefs)
    const s = await open(pLink(shared))
    await s.resolveShare('add')
    expect(s.notice).toBe(`Added ${nameOf(s, 'accumulator')} to your plan.`)
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

  it('with a saved plan equal to the shared one, no prompt and its view state survives', async () => {
    const equal = {
      ...savedPlan(),
      tier: {},
      overrides: {},
      recipeOverrides: {},
      targets: [
        {
          targetItemId: 'accumulator',
          targetRate: 6,
          overages: {},
          expandLevel: 4,
          expanded: { 'accumulator>aerogel': true },
        },
      ],
      activeTargetIndex: 0,
    }
    save(equal, prefs)
    const s = await open(pLink(shared)) // differs only in view state (expand level) and all-v1 tiers
    expect(s.pendingShare).toBeNull()
    expect(s.targets[0].expandLevel).toBe(4)
    expect(s.targets[0].expanded).toEqual({ 'accumulator>aerogel': true })
    expect(loadSaved()?.plan?.targets?.[0].expandLevel).toBe(4)
    expect(location.search).toBe('')
  })

  it('prompts when the saved plan differs by rate or by an extra tab', async () => {
    const one = (rate: number) => [{ targetItemId: 'accumulator', targetRate: rate, overages: {} }]
    for (const targets of [
      one(7),
      [...one(6), { targetItemId: 'aerogel', targetRate: 30, overages: {} }],
    ]) {
      save({ ...savedPlan(), tier: {}, overrides: {}, recipeOverrides: {}, targets }, prefs)
      const s = await open(pLink(shared))
      expect(s.pendingShare).not.toBeNull()
    }
  })

  it('does not crash on a link whose targets list holds junk entries', async () => {
    save(savedPlan(), prefs)
    const junk = { version: DEFAULT_VERSION, targetItemId: null, targetRate: 1, targets: [null] }
    const s = await open(pLink(junk))
    expect(itemIds(s)).toEqual(['aerogel', 'airlock'])
    expect(s.pendingShare).not.toBeNull()
  })

  it('treats the legacy ?plan= param the same way', async () => {
    save(savedPlan(), prefs)
    const s = await open(pLink(shared).replace('?p=', '?plan='))
    expect(s.pendingShare).not.toBeNull()
    await s.resolveShare('keep')
    expect(location.search).toBe('')
  })

  /** What another open tab would have saved: the saved plan plus one more recipe. */
  const siblingSave = () => {
    const plan = savedPlan()
    save(
      {
        ...plan,
        targets: [...plan.targets!, { targetItemId: 'accumulator', targetRate: 9, overages: {} }],
      },
      prefs,
    )
    window.dispatchEvent(
      new StorageEvent('storage', { key: LS_KEY, newValue: localStorage.getItem(LS_KEY) }),
    )
  }

  it('a sibling save adopted while the prompt is pending is shown but never written back', async () => {
    save(savedPlan(), prefs)
    const s = await open(pLink(shared))
    siblingSave() // the sibling's own write lands before the spy, ours would land after
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await nextTick()
    await nextTick()
    vi.advanceTimersByTime(5000)
    expect(itemIds(s)).toEqual(['aerogel', 'airlock', 'accumulator'])
    expect(s.pendingShare?.targetItemId).toBe('accumulator') // the prompt is still waiting
    expect(setItem).not.toHaveBeenCalled()
    // The adoption guard is back down: the user's own edits save again.
    s.setTier('fabricator', 'v1')
    await nextTick()
    vi.advanceTimersByTime(400)
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('a sibling save adopted while the plan loads does not release the load hold early', async () => {
    save(savedPlan(), prefs)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const fetchData = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string) => {
      await gate
      return fetchData(url)
    })
    history.replaceState(null, '', `/${pLink(shared)}`)
    setActivePinia(createPinia())
    const s = usePlannerStore()
    const initDone = s.init() // holds saves (depth 1) while the game data loads
    siblingSave() // a second guard holder comes and goes (depth 2 -> 1)
    await nextTick()
    await nextTick()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    s.setTier('fabricator', 'v2') // a change that would schedule a save if the hold were gone
    await nextTick()
    vi.advanceTimersByTime(5000)
    expect(setItem).not.toHaveBeenCalled()
    release()
    await initDone
    await nextTick()
    vi.advanceTimersByTime(5000)
    expect(s.pendingShare).not.toBeNull()
    expect(setItem).not.toHaveBeenCalled()
  })
})

// Real timers and real BroadcastChannels: several stores in one process stand in
// for several browser tabs (each owns its pinia; they share localStorage, and
// the `storage` event a real sibling would get is dispatched by hand).
describe('?add= hand-off to an open planner tab', () => {
  const RealChannel = BroadcastChannel
  const channels: BroadcastChannel[] = []
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const settle = () => sleep(350) // lets the 300 ms debounced saves land

  beforeEach(() => {
    localStorage.clear()
    stubFetch()
    // Close every channel a store opened, or old stores keep answering asks.
    vi.stubGlobal(
      'BroadcastChannel',
      class extends RealChannel {
        constructor(name: string) {
          super(name)
          channels.push(this)
        }
      },
    )
  })
  afterEach(() => {
    channels.splice(0).forEach((c) => c.close())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  /** A browser tab: its own pinia and store, opened on `search`. */
  async function tab(search = '') {
    history.replaceState(null, '', `/${search}`)
    setActivePinia(createPinia())
    const store = usePlannerStore()
    await store.init()
    return store
  }
  /** What the browser does for every other tab when one of them saves. */
  const syncOtherTabs = () => {
    window.dispatchEvent(
      new StorageEvent('storage', { key: LS_KEY, newValue: localStorage.getItem(LS_KEY) }),
    )
    return sleep(20)
  }
  const watchWrites = () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    return () => setItem.mock.calls.filter(([k]) => k === LS_KEY).length
  }
  const storedIds = () => loadSaved()?.plan?.targets?.map((t) => t.targetItemId)
  const withAccumulator = ['aerogel', 'airlock', 'accumulator']

  it('one open tab takes the item once; the new tab writes nothing and closes', async () => {
    save(savedPlan(), prefs)
    const receiver = await tab()
    await settle()
    const writes = watchWrites()
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})

    const asker = await tab('?add=accumulator&r=20')
    await settle()

    expect(close).toHaveBeenCalledTimes(1)
    expect(itemIds(receiver)).toEqual(withAccumulator)
    expect(receiver.targets[2].targetRate).toBe(20)
    expect(storedIds()).toEqual(withAccumulator)
    expect(writes()).toBe(1) // the receiver's save; the handing-off tab made none
    expect(asker.items).toHaveLength(0) // it never even loaded the game data
    expect(location.search).toBe('')
  })

  it('two open tabs: the item is added exactly once', async () => {
    save(savedPlan(), prefs)
    const a = await tab()
    const b = await tab()
    await settle()
    const writes = watchWrites()
    vi.spyOn(window, 'close').mockImplementation(() => {})

    await tab('?add=accumulator')
    await settle()

    expect([a, b].filter((s) => itemIds(s).includes('accumulator'))).toHaveLength(1)
    expect(storedIds()).toEqual(withAccumulator)
    expect(writes()).toBe(1)
    await syncOtherTabs() // the other tab picks it up through the storage sync
    expect(itemIds(a)).toEqual(withAccumulator)
    expect(itemIds(b)).toEqual(withAccumulator)
    expect(storedIds()).toEqual(withAccumulator)
  })

  it('a sibling save right after the hand-off cannot drop the item', async () => {
    save(savedPlan(), prefs)
    const receiver = await tab()
    await settle()
    vi.spyOn(window, 'close').mockImplementation(() => {})

    await tab('?add=accumulator&r=20')
    // The asking tab has closed; a third tab saves before the receiver's debounce would fire.
    expect(storedIds()).toEqual(withAccumulator)
    await syncOtherTabs()
    expect(itemIds(receiver)).toEqual(withAccumulator)
    await settle()
    expect(storedIds()).toEqual(withAccumulator)
  })

  it('the receiving tab confirms the item it took', async () => {
    save(savedPlan(), prefs)
    const receiver = await tab()
    await settle()
    vi.spyOn(window, 'close').mockImplementation(() => {})

    await tab('?add=accumulator&r=20')
    await settle()

    expect(receiver.notice).toBe(`Added ${nameOf(receiver, 'accumulator')} to your plan.`)
  })

  it('no open tab: adds the item locally after the timeout and strips the param', async () => {
    save(savedPlan(), prefs)
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})

    const asker = await tab('?add=accumulator&r=20')
    await settle()

    expect(asker.handOff).toBeNull()
    expect(close).not.toHaveBeenCalled()
    expect(itemIds(asker)).toEqual(withAccumulator)
    expect(storedIds()).toEqual(withAccumulator)
    expect(asker.notice).toBe(`Added ${nameOf(asker, 'accumulator')} to your plan.`)
    expect(location.search).toBe('')
  })

  it('confirmed but the browser refuses to close the tab: shows the fallback state', async () => {
    save(savedPlan(), prefs)
    await tab()
    await settle()
    const writes = watchWrites()
    const close = vi.spyOn(window, 'close').mockImplementation(() => {}) // refused: still here

    const asker = await tab('?add=accumulator')

    expect(close).toHaveBeenCalled()
    expect(asker.handOff).toBe('done') // App.vue: "Added to your open planner tab — you can close this one."
    expect(location.search).toBe('') // a reload of this tab starts a plain planner

    // The tab that stays open still never saves or adopts: it holds no plan.
    await settle()
    await syncOtherTabs()
    asker.setTier('fabricator', 'v2')
    await settle()
    expect(asker.items).toHaveLength(0)
    expect(writes()).toBe(1) // only the receiver's
  })

  it('without BroadcastChannel: the local path, no hand-off', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    save(savedPlan(), prefs)
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})

    const asker = await tab('?add=accumulator')
    await settle()

    expect(asker.handOff).toBeNull()
    expect(close).not.toHaveBeenCalled()
    expect(storedIds()).toEqual(withAccumulator)
    expect(location.search).toBe('')
  })

  it('an unknown item: the receiving tab shows the notice and keeps its plan', async () => {
    save(savedPlan(), prefs)
    const receiver = await tab()
    await settle()
    vi.spyOn(window, 'close').mockImplementation(() => {})

    const asker = await tab('?add=not-a-real-item')
    await settle()

    expect(asker.handOff).toBe('done')
    expect(receiver.notice).toContain('not-a-real-item')
    expect(itemIds(receiver)).toEqual(['aerogel', 'airlock'])
    expect(storedIds()).toEqual(['aerogel', 'airlock'])
  })

  // Either tab may be the one whose offer arrives first; neither order may matter.
  it.each([
    ['before', true],
    ['after', false],
  ])(
    'a tab with a share prompt open (opened %s the other) stays out of it: the other tab takes the item',
    async (_order, promptFirst) => {
      save(savedPlan(), prefs)
      const openPrompt = () => tab(pLink({ i: 'accumulator', r: 6 }))
      let pending, ready
      if (promptFirst) {
        pending = await openPrompt()
        ready = await tab()
      } else {
        ready = await tab()
        pending = await openPrompt()
      }
      await settle()
      const writes = watchWrites()
      vi.spyOn(window, 'close').mockImplementation(() => {})
      expect(pending.pendingShare).not.toBeNull()

      await tab('?add=accumulator')
      await settle()

      expect(itemIds(ready)).toEqual(withAccumulator)
      expect(itemIds(pending)).toEqual(['aerogel', 'airlock']) // untouched until it syncs
      expect(writes()).toBe(1)
      await syncOtherTabs()
      expect(itemIds(pending)).toEqual(withAccumulator)
      expect(pending.pendingShare).not.toBeNull() // still waiting for its choice
    },
  )

  it('a share prompt alone cannot take it: the new tab adds locally and the prompt tab adopts it', async () => {
    save(savedPlan(), prefs)
    const pending = await tab(pLink({ i: 'accumulator', r: 6 }))
    const writes = watchWrites()
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})

    const asker = await tab('?add=accumulator')
    await settle()

    expect(close).not.toHaveBeenCalled()
    expect(itemIds(asker)).toEqual(withAccumulator)
    expect(writes()).toBe(1)
    await syncOtherTabs()
    expect(itemIds(pending)).toEqual(withAccumulator)
    expect(pending.pendingShare).not.toBeNull()
    expect(writes()).toBe(1) // adopting is not saving
  })

  it('the real App shows the fallback message instead of the planner', async () => {
    save(savedPlan(), prefs)
    await tab()
    await settle()
    vi.spyOn(window, 'close').mockImplementation(() => {})

    const { store, host, unmount } = await mountApp('?add=accumulator')
    await vi.waitFor(() => expect(store.handOff).toBe('done'))
    await nextTick()

    expect(host.textContent).toContain('Added to your open planner tab — you can close this one.')
    expect(host.querySelector('header')).toBeNull() // no planner UI
    unmount()
  })
})

describe('App notice', () => {
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

  const setVisibility = (state: 'visible' | 'hidden') => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('raised in a hidden tab, it is still there when the tab is shown, then expires', async () => {
    setVisibility('hidden')
    const { store, host, unmount } = await mountApp('?add=not-a-real-item')
    await vi.advanceTimersByTimeAsync(100)
    expect(store.notice).toContain('not-a-real-item')
    await vi.advanceTimersByTimeAsync(60_000) // far past the 8 s a visible notice lives
    expect(store.notice).not.toBeNull()
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(7_000)
    expect(host.textContent).toContain('not-a-real-item')
    await vi.advanceTimersByTimeAsync(1_500)
    expect(store.notice).toBeNull()
    unmount()
  })
})
