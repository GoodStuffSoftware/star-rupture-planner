import { describe, it, expect, beforeEach } from 'vitest'
import { readAddItemRequest, stripHandledParams, DEFAULT_ADD_RATE } from './addItemLink'

describe('readAddItemRequest', () => {
  it('reads the item and rate', () => {
    expect(readAddItemRequest('?add=aerogel&r=30')).toEqual({ itemId: 'aerogel', rate: 30 })
  })

  it('defaults the rate to 60 when missing or invalid', () => {
    for (const q of [
      '?add=aerogel',
      '?add=aerogel&r=',
      '?add=aerogel&r=abc',
      '?add=aerogel&r=-5',
      '?add=aerogel&r=1e308',
    ]) {
      expect(readAddItemRequest(q)).toEqual({ itemId: 'aerogel', rate: DEFAULT_ADD_RATE })
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
