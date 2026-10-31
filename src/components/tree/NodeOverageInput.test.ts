/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from '../../stores/plannerStore'
import NodeOverageInput from './NodeOverageInput.vue'
import TargetSelector from '../TargetSelector.vue'

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
  // The header rate field, bound to the same store value.
  const headerHost = document.createElement('div')
  document.body.appendChild(headerHost)
  const headerApp = createApp(TargetSelector).use(pinia)
  headerApp.mount(headerHost)
  const header = headerHost.querySelector<HTMLInputElement>('input[type="number"]')!
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
    header,
    typeHeader: (v: string) => {
      header.value = v
      header.dispatchEvent(new Event('input', { bubbles: true }))
      return nextTick()
    },
    wheel,
    key,
    type,
    blur,
    unmount: () => {
      app.unmount()
      host.remove()
      headerApp.unmount()
      headerHost.remove()
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
    vi.useRealTimers()
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

  it('rounds a typed decimal to the nearest whole number', async () => {
    const t = await setup()
    cleanup = t.unmount
    await t.type('12.6')
    await t.blur()
    expect(t.store.targetRate).toBe(13)
    expect(t.input.value).toBe('13')
    await t.type('12.4')
    await t.blur()
    expect(t.store.targetRate).toBe(12)
    expect(t.input.value).toBe('12')
  })

  it('reads a decimal comma (rounded) and thousands commas', async () => {
    const t = await setup()
    cleanup = t.unmount
    await t.type('7,5')
    await t.blur()
    expect(t.store.targetRate).toBe(8)
    await t.type('1,200')
    await t.blur()
    expect(t.store.targetRate).toBe(1200)
    await t.type('1,000')
    await t.blur()
    expect(t.store.targetRate).toBe(1000)
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

  it.each(['', 'abc', '0', '-5', '0.4'])('reverts invalid input %j', async (bad) => {
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

  it('header: typed decimals round, and empty, zero or sub-1 values revert', async () => {
    const t = await setup()
    cleanup = t.unmount
    t.header.focus()
    await t.typeHeader('12.6')
    t.header.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(t.store.targetRate).toBe(13)
    expect(t.header.value).toBe('13')
    for (const bad of ['', '0.4', '0']) {
      await t.typeHeader(bad)
      t.header.dispatchEvent(new Event('change', { bubbles: true }))
      await nextTick()
      expect(t.store.targetRate).toBe(13)
      expect(t.header.value).toBe('13')
    }
  })

  describe('a machine with a fractional output', () => {
    async function laser() {
      const t = await setup()
      t.store.selectTargetItem('laser_emitter')
      await nextTick()
      expect(t.store.defaultRateForItem('laser_emitter')).toBe(7.5)
      return t
    }

    it('starts whole, then steps by exact machine multiples', async () => {
      const t = await laser()
      cleanup = t.unmount
      expect(t.store.targetRate).toBe(8) // one machine's 7.5, as a whole number
      const seen: number[] = []
      for (let i = 0; i < 4; i++) {
        await t.key('ArrowUp')
        seen.push(t.store.targetRate)
      }
      expect(seen).toEqual([15, 22.5, 30, 37.5]) // snapped from 8, then one machine at a time
      expect(t.input.value).toBe('37.5')
      for (let i = 0; i < 4; i++) await t.key('ArrowDown')
      expect(t.store.targetRate).toBe(7.5)
      await t.key('ArrowDown') // would reach 0: no-op
      expect(t.store.targetRate).toBe(7.5)
    })

    it('typing still rounds to a whole number', async () => {
      const t = await laser()
      cleanup = t.unmount
      await t.type('22.5')
      await t.blur()
      expect(t.store.targetRate).toBe(23)
    })
  })

  describe('debounced commit while typing', () => {
    it('commits once after typing stops, keeping the focused draft as typed', async () => {
      const t = await setup()
      cleanup = t.unmount
      vi.useFakeTimers()
      const spy = vi.spyOn(t.store, 'setTarget')
      await t.type('1')
      await t.type('12')
      await t.type('12.6')
      vi.advanceTimersByTime(399)
      expect(spy).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      await nextTick()
      expect(spy).toHaveBeenCalledTimes(1)
      expect(t.store.targetRate).toBe(13)
      expect(t.header.value).toBe('13') // the other field follows live
      expect(t.input.value).toBe('12.6') // still what the user typed, under the cursor
      await t.blur()
      expect(t.input.value).toBe('13')
      expect(t.store.targetRate).toBe(13)
    })

    it('commits nothing for an invalid draft, and reverts it on blur', async () => {
      const t = await setup()
      cleanup = t.unmount
      vi.useFakeTimers()
      for (const bad of ['', 'abc', '0.4']) {
        await t.type(bad)
        vi.advanceTimersByTime(1000)
        expect(t.store.targetRate).toBe(45)
      }
      await t.blur()
      expect(t.input.value).toBe('45')
    })

    it('Enter commits immediately and cancels the pending debounce', async () => {
      const t = await setup()
      cleanup = t.unmount
      vi.useFakeTimers()
      const spy = vi.spyOn(t.store, 'setTarget')
      await t.type('70')
      await t.key('Enter')
      expect(t.store.targetRate).toBe(70)
      const calls = spy.mock.calls.length
      vi.advanceTimersByTime(1000)
      expect(spy.mock.calls.length).toBe(calls)
    })

    it('Escape restores the rate from focus time, undoing debounced commits', async () => {
      const t = await setup()
      cleanup = t.unmount
      vi.useFakeTimers()
      await t.type('80')
      vi.advanceTimersByTime(400)
      expect(t.store.targetRate).toBe(80)
      await t.type('90') // pending, not yet committed
      await t.key('Escape')
      vi.advanceTimersByTime(1000)
      await nextTick()
      expect(t.store.targetRate).toBe(45)
      expect(t.input.value).toBe('45')
      expect(t.header.value).toBe('45')
    })

    it('a stepper commits immediately and drops the pending typing', async () => {
      const t = await setup()
      cleanup = t.unmount
      vi.useFakeTimers()
      const step = t.store.defaultRateForItem(t.store.targetItemId!)
      await t.type('500')
      await t.key('ArrowUp')
      expect(t.store.targetRate).toBe(45 + step)
      vi.advanceTimersByTime(1000)
      expect(t.store.targetRate).toBe(45 + step)
    })

    it('header typing updates the root number live, without blurring', async () => {
      const t = await setup()
      cleanup = t.unmount
      vi.useFakeTimers()
      t.header.focus()
      await t.typeHeader('25.4')
      vi.advanceTimersByTime(400)
      await nextTick()
      expect(t.store.targetRate).toBe(25)
      expect(t.input.value).toBe('25')
      expect(t.header.value).toBe('25.4') // header keeps the draft while focused
      t.header.blur()
      await nextTick()
      expect(t.header.value).toBe('25')
    })

    it('Escape in the header restores the rate from focus time', async () => {
      const t = await setup()
      cleanup = t.unmount
      vi.useFakeTimers()
      t.header.focus()
      await t.typeHeader('99')
      vi.advanceTimersByTime(400)
      await nextTick()
      expect(t.store.targetRate).toBe(99)
      t.header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      expect(t.store.targetRate).toBe(45)
      expect(t.header.value).toBe('45')
      expect(t.input.value).toBe('45')
    })

    it('root typing updates the header, and an untouched focused field follows other changes', async () => {
      const t = await setup()
      cleanup = t.unmount
      vi.useFakeTimers()
      await t.type('33')
      vi.advanceTimersByTime(400)
      await nextTick()
      expect(t.header.value).toBe('33')
      // Focused but untouched: a change from elsewhere shows up in the field.
      t.input.blur()
      t.input.focus()
      t.store.setTarget(t.store.targetItemId!, 50)
      await nextTick()
      expect(t.input.value).toBe('50')
    })

    it('does not write storage per keystroke', async () => {
      const t = await setup()
      cleanup = t.unmount
      vi.useFakeTimers()
      const setItem = vi.spyOn(Storage.prototype, 'setItem')
      for (const v of ['1', '12', '123', '1234']) {
        await t.type(v)
        vi.advanceTimersByTime(100)
      }
      expect(setItem).not.toHaveBeenCalled()
      vi.advanceTimersByTime(400) // debounced commit, then the store's own save debounce
      await nextTick()
      vi.advanceTimersByTime(400)
      expect(setItem.mock.calls.filter(([k]) => k === 'srp:state:v1').length).toBe(1)
      setItem.mockRestore()
    })
  })
})
