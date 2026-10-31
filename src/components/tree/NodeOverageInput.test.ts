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
  input.focus() // blur-driven commits need a real focus
  const key = (k: string) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
    return nextTick()
  }
  const type = (v: string) => {
    input.value = v
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return nextTick()
  }
  const wheel = (deltaY: number) => {
    const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
    input.dispatchEvent(e)
    return e
  }
  const blur = () => {
    input.dispatchEvent(new FocusEvent('blur'))
    return nextTick()
  }
  return {
    store,
    host,
    input,
    wheel,
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

  it('does not rewrite a finer rate when focused and left untouched', async () => {
    const t = await setup()
    cleanup = t.unmount
    t.store.setTarget(t.store.targetItemId!, 33.333)
    await nextTick()
    await t.blur()
    expect(t.store.targetRate).toBe(33.333)
  })

  it('reads a decimal comma and thousands commas', async () => {
    const t = await setup()
    cleanup = t.unmount
    await t.type('7,5')
    await t.blur()
    expect(t.store.targetRate).toBe(7.5)
    await t.type('1,200')
    await t.blur()
    expect(t.store.targetRate).toBe(1200)
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
    expect(t.store.targetRate).toBe(45)
    expect(t.input.value).toBe('45')
  })

  it('the root +/- buttons step one machine, with matching labels', async () => {
    const t = await setup()
    cleanup = t.unmount
    const step = t.store.defaultRateForItem(t.store.targetItemId!)
    const plus = t.host.querySelector<HTMLButtonElement>(
      `button[aria-label="+${step}/min (one machine)"]`,
    )!
    const minus = t.host.querySelector<HTMLButtonElement>(
      `button[aria-label="−${step}/min (one machine)"]`,
    )!
    expect(plus).toBeTruthy()
    expect(minus).toBeTruthy()
    plus.click()
    plus.click()
    await nextTick()
    expect(t.store.targetRate).toBe(45 + 2 * step)
    expect(t.input.value).toBe(String(45 + 2 * step))
    minus.click()
    await nextTick()
    expect(t.store.targetRate).toBe(45 + step)
  })

  it('never steps the target to zero or below', async () => {
    const t = await setup()
    cleanup = t.unmount
    const step = t.store.defaultRateForItem(t.store.targetItemId!)
    const minus = t.host.querySelector<HTMLButtonElement>('button[aria-label^="−"]')!
    t.store.setTarget(t.store.targetItemId!, step) // one machine: a step down would reach 0
    await nextTick()
    expect(minus.disabled).toBe(true)
    minus.click()
    await t.key('ArrowDown')
    t.wheel(100)
    expect(t.store.targetRate).toBe(step)
    t.store.setTarget(t.store.targetItemId!, step / 2) // below one machine
    await nextTick()
    await t.key('ArrowDown')
    expect(t.store.targetRate).toBe(step / 2)
    t.store.setTarget(t.store.targetItemId!, 2 * step)
    await nextTick()
    expect(minus.disabled).toBe(false)
    minus.click()
    await nextTick()
    expect(t.store.targetRate).toBe(step)
  })

  it('wheel steps one machine per notch while focused, and leaves the page alone otherwise', async () => {
    const t = await setup()
    cleanup = t.unmount
    const step = t.store.defaultRateForItem(t.store.targetItemId!)
    expect(t.wheel(-100).defaultPrevented).toBe(true) // wheel up
    await nextTick()
    expect(t.store.targetRate).toBe(45 + step)
    expect(t.wheel(100).defaultPrevented).toBe(true) // wheel down
    await nextTick()
    expect(t.store.targetRate).toBe(45)
    // A trackpad swipe of small deltas accumulates to one step, not many.
    for (let i = 0; i < 3; i++) t.wheel(-10)
    expect(t.store.targetRate).toBe(45)
    t.wheel(-10)
    t.wheel(-10)
    await nextTick()
    expect(t.store.targetRate).toBe(45 + step)
    // Unfocused: no preventDefault, no step.
    t.input.blur()
    expect(t.wheel(-100).defaultPrevented).toBe(false)
    expect(t.store.targetRate).toBe(45 + step)
  })
})
