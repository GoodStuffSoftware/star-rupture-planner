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
      { targetItemId: 'aerogel', targetRate: 30, overages: {}, expandLevel: 3 },
      { targetItemId: 'airlock', targetRate: 12, overages: {}, expandLevel: 2 },
    ],
    activeTargetIndex: 1,
    tier: {},
    overrides: {},
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
    expect(s.targetItemId).toBe('accumulator') // new tab is focused
    const persisted = loadSaved()?.plan
    expect(persisted?.targets?.map((t) => t.targetItemId)).toEqual([
      'aerogel',
      'airlock',
      'accumulator',
    ])
    expect(persisted?.recipeOverrides).toEqual({ aerogel: 'some-recipe-key' })
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

  it('merges on top of a ?p= plan without changing ?p= semantics', async () => {
    save(savedPlan(), prefs)
    const p = btoa(JSON.stringify({ i: 'airlock', r: 6 }))
    const s = await open(`?p=${p}&add=aerogel`)
    expect(itemIds(s)).toEqual(['airlock', 'aerogel'])
    expect(location.search).toBe(`?p=${p}`)
  })

  it('leaves saved state alone when there is no add param', async () => {
    save(savedPlan(), prefs)
    const s = await open('')
    expect(itemIds(s)).toEqual(['aerogel', 'airlock'])
    expect(JSON.parse(localStorage.getItem(LS_KEY)!).plan.targets).toHaveLength(2)
  })
})
