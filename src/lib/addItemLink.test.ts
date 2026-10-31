import { describe, it, expect, beforeEach } from 'vitest'
import { isSamePlan, type PlanState } from './persistState'
import { readAddItemRequest, stripHandledParams } from './addItemLink'

describe('readAddItemRequest', () => {
  it('reads the item and rate', () => {
    expect(readAddItemRequest('?add=aerogel&r=30')).toEqual({ itemId: 'aerogel', rate: 30 })
  })

  it('has no rate when r is missing or invalid, so the default for new targets applies', () => {
    for (const q of [
      '?add=aerogel',
      '?add=aerogel&r=',
      '?add=aerogel&r=abc',
      '?add=aerogel&r=-5',
      '?add=aerogel&r=1e308',
    ]) {
      expect(readAddItemRequest(q)).toEqual({ itemId: 'aerogel', rate: null })
    }
  })

  it('returns null without a usable add param', () => {
    expect(readAddItemRequest('')).toBeNull()
    expect(readAddItemRequest('?add=')).toBeNull()
    expect(readAddItemRequest('?r=30')).toBeNull()
    expect(readAddItemRequest('?p=abc')).toBeNull()
  })
})

describe('stripHandledParams', () => {
  beforeEach(() => history.replaceState(null, '', '/'))

  it('removes add and r but keeps other params and the hash', () => {
    history.replaceState(null, '', '/planner?add=aerogel&r=30&support=1#x')
    stripHandledParams()
    expect(location.pathname + location.search + location.hash).toBe('/planner?support=1#x')
  })

  it('keeps an unrelated r when only a share-plan param is stripped', () => {
    history.replaceState(null, '', '/?p=abc&r=5')
    stripHandledParams()
    expect(location.search).toBe('?r=5')
  })

  it('removes the share-plan params p and plan too', () => {
    history.replaceState(null, '', '/?p=abc&plan=def&support=1')
    stripHandledParams()
    expect(location.search).toBe('?support=1')
  })

  it('leaves a URL without add untouched, including an unrelated r', () => {
    history.replaceState(null, '', '/?r=5')
    stripHandledParams()
    expect(location.search).toBe('?r=5')
  })
})

describe('isSamePlan', () => {
  const base = (): PlanState => ({
    version: 'update2_QoL',
    targetItemId: 'aerogel',
    targetRate: 30,
    overages: {},
    targets: [
      { targetItemId: 'aerogel', targetRate: 30, overages: { 'aerogel>x': 2 } },
      { targetItemId: 'airlock', targetRate: 12, overages: {} },
    ],
    activeTargetIndex: 0,
    tier: { fabricator: 'v2', furnace: 'v1' },
    overrides: { aerogel: 'compounder' },
    recipeOverrides: { aerogel: 'k' },
  })
  const changed = (edit: (p: PlanState) => void) => {
    const p = base()
    edit(p)
    return p
  }

  it('ignores view state, all-v1 tiers and empty-vs-absent maps', () => {
    for (const p of [
      changed((p) => (p.activeTargetIndex = 1)),
      changed((p) => (p.targets![0].expandLevel = 4)),
      changed((p) => (p.targets![0].expanded = { 'aerogel>x': true })),
      changed((p) => (p.tier = { fabricator: 'v2' })),
      changed((p) => (p.tier = { fabricator: 'v2', furnace: 'v1', compounder: 'v1' })),
      changed((p) => (p.targets![1].overages = undefined as never)),
    ]) {
      expect(isSamePlan(base(), p)).toBe(true)
    }
  })

  it('sees every meaningful difference', () => {
    for (const p of [
      changed((p) => (p.version = 'earlyaccess')),
      changed((p) => (p.targets![0].targetRate = 31)),
      changed((p) => (p.targets![1].targetItemId = 'accumulator')),
      changed((p) => (p.targets![0].overages = { 'aerogel>x': 3 })),
      changed((p) => p.targets!.pop()),
      changed((p) => p.targets!.reverse()),
      changed((p) => (p.tier = { fabricator: 'v1' })),
      changed((p) => (p.overrides = {})),
      changed((p) => (p.recipeOverrides = { aerogel: 'other' })),
    ]) {
      expect(isSamePlan(base(), p)).toBe(false)
    }
  })

  it('treats a legacy single-target plan as one tab', () => {
    const legacy = changed((p) => (p.targets = undefined))
    const tabbed = changed(
      (p) => (p.targets = [{ targetItemId: 'aerogel', targetRate: 30, overages: {} }]),
    )
    expect(isSamePlan(legacy, tabbed)).toBe(true)
  })
})
