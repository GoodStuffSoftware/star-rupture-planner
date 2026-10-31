/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from '../../stores/plannerStore'
import NodeOverageInput from './NodeOverageInput.vue'

function stubFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
    try {
      const body = readFileSync(
        resolve(import.meta.dirname, '../../../public', url.replace(/^\//, '')),
        'utf-8',
      )
      return { ok: true, status: 200, statusText: 'OK', json: async () => JSON.parse(body) }
    } catch {
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => null }
    }
  })
}

/** Store with one 45/min aerogel target, and the root row mounted against its tree. */
async function setup() {
  history.replaceState(null, '', '/?add=aerogel&r=45')
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePlannerStore()
  await store.init()
  await nextTick()
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(NodeOverageInput, { node: store.tree!, depth: 0 }),
  }).use(pinia)
  app.mount(host)
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="Target output per minute"]',
  )!
  const key = (k: string) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
    return nextTick()
  }
  const type = (v: string) => {
    input.value = v
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return nextTick()
  }
  const blur = () => {
    input.dispatchEvent(new FocusEvent('blur'))
    return nextTick()
  }
  return {
    store,
    input,
    key,
    type,
    blur,
    unmount: () => {
      app.unmount()
      host.remove()
    },
  }
}

describe('root rate inline edit', () => {
  let cleanup: (() => void) | undefined
  beforeEach(() => {
    localStorage.clear()
    stubFetch()
    vi.stubGlobal('BroadcastChannel', undefined)
  })
  afterEach(() => {
    cleanup?.()
    vi.unstubAllGlobals()
  })

  it('shows the current rate and commits a typed value on Enter', async () => {
    const t = await setup()
    cleanup = t.unmount
    expect(t.input.value).toBe('45')
    await t.type('120')
    await t.key('Enter')
    expect(t.store.targetRate).toBe(120)
    expect(t.store.activeTarget?.targetRate).toBe(120)
  })

  it('commits on blur', async () => {
    const t = await setup()
    cleanup = t.unmount
    await t.type('30')
    await t.blur()
    expect(t.store.targetRate).toBe(30)
  })

  it('reverts on Escape', async () => {
    const t = await setup()
    cleanup = t.unmount
    await t.type('999')
    await t.key('Escape')
    expect(t.store.targetRate).toBe(45)
    expect(t.input.value).toBe('45')
  })

  it.each(['', 'abc', '0', '-5'])('reverts invalid input %j', async (bad) => {
    const t = await setup()
    cleanup = t.unmount
    await t.type(bad)
    await t.blur()
    expect(t.store.targetRate).toBe(45)
    expect(t.input.value).toBe('45')
  })

  it('ArrowUp / ArrowDown step by one machine, like the header stepper', async () => {
    const t = await setup()
    cleanup = t.unmount
    const step = t.store.defaultRateForItem(t.store.targetItemId!)
    await t.key('ArrowUp')
    expect(t.store.targetRate).toBe(45 + step)
    await t.key('ArrowDown')
    await t.key('ArrowDown')
    expect(t.store.targetRate).toBe(Math.max(0, 45 - step))
  })
})
