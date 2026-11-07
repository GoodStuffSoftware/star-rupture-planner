/// <reference types="node" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from '../stores/plannerStore'
import { save, type PlanState } from '../lib/persistState'
import { DEFAULT_VERSION } from '../data/versions'
import { DEFAULT_TARGET_PREF } from '../lib/format'
import { tabMenu, DOUBLE_RIGHT_CLICK_MS, LONG_PRESS_MS } from '../lib/tabMenu'
import RecipeTabs from './RecipeTabs.vue'
import TabContextMenu from './TabContextMenu.vue'
import TargetSelector from './TargetSelector.vue'

// The tab right-click menu: opening, double right-click, items, keyboard, strip visibility and the
// header rate field's width.

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

function planOf(ids: (string | null)[], rate = 30): PlanState {
  return {
    version: DEFAULT_VERSION,
    targetItemId: ids[0],
    targetRate: rate,
    overages: {},
    targets: ids.map((id) => ({
      targetItemId: id,
      targetRate: rate,
      overages: {},
      expandLevel: 2,
    })),
    activeTargetIndex: 0,
    tier: {},
    overrides: {},
    recipeOverrides: {},
  }
}

let app: App | null = null
let host: HTMLElement | null = null
type Store = ReturnType<typeof usePlannerStore>

async function mountTabs(ids: (string | null)[], rate = 30): Promise<Store> {
  localStorage.clear()
  save(planOf(ids, rate), prefs)
  history.replaceState(null, '', '/')
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = usePlannerStore()
  await store.init()
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => [h(RecipeTabs), h(TabContextMenu)] }).use(pinia)
  app.mount(host)
  await nextTick()
  return store
}

const chips = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'))
const addBtn = () => document.querySelector<HTMLElement>('button[aria-label="New tab"]')!
const menu = () => document.querySelector<HTMLElement>('[role="menu"]')
const menuItems = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
const itemLabels = () => menuItems().map((i) => i.textContent?.trim())
const item = (label: string) => menuItems().find((i) => i.textContent?.trim() === label)!
const disabled = (label: string) => item(label).getAttribute('aria-disabled') === 'true'

/** Dispatch a right-click; returns whether the browser's own menu would be suppressed. */
async function rightClick(el: Element, x = 40, y = 30): Promise<boolean> {
  const e = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: x,
    clientY: y,
  })
  el.dispatchEvent(e)
  await nextTick()
  await nextTick()
  await nextTick()
  return e.defaultPrevented
}

async function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  el.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
  )
  await nextTick()
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.stubGlobal('BroadcastChannel', undefined)
  stubFetch()
})
afterEach(() => {
  tabMenu.open = false
  app?.unmount()
  host?.remove()
  app = null
  host = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('opening the menu', () => {
  it('opens on contextmenu, suppresses the browser menu and lists the actions', async () => {
    await mountTabs(['aerogel', 'airlock', 'rotor'])
    vi.advanceTimersByTime(2000)
    const prevented = await rightClick(chips()[1])
    expect(prevented).toBe(true)
    expect(menu()).not.toBeNull()
    expect(menu()!.getAttribute('aria-label')).toBe('Tab actions')
    expect(itemLabels()).toEqual([
      'New tab',
      'Pin tab',
      'Close tab',
      'Close other tabs',
      'Close tabs to the right',
      'Reopen closed tab',
    ])
    expect(menu()!.textContent).toContain('Right-click again for the browser menu')
  })

  it('positions at the pointer and clamps inside the viewport', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    const w = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(180)
    const h2 = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200)
    await rightClick(chips()[0], 100, 50)
    const box = () => menu()!.parentElement!
    expect(box().style.left).toBe('100px')
    expect(box().style.top).toBe('50px')
    tabMenu.open = false
    await nextTick()
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[1], window.innerWidth - 5, window.innerHeight - 5)
    expect(box().style.left).toBe(`${window.innerWidth - 180 - 8}px`)
    expect(box().style.top).toBe(`${window.innerHeight - 200 - 8}px`)
    w.mockRestore()
    h2.mockRestore()
  })

  it('a right-click on another chip moves the menu there', async () => {
    const s = await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[0])
    expect(tabMenu.target).toEqual({ kind: 'tab', tid: s.targets[0].tid })
    const prevented = await rightClick(chips()[1])
    expect(prevented).toBe(true)
    expect(tabMenu.target).toEqual({ kind: 'tab', tid: s.targets[1].tid })
    expect(menu()).not.toBeNull()
  })
})

describe('double right-click', () => {
  it('a second right-click on the same chip while open closes the menu and keeps the browser menu', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    expect(await rightClick(chips()[0])).toBe(true)
    // Slower than the window: it is the open menu that counts.
    vi.advanceTimersByTime(DOUBLE_RIGHT_CLICK_MS * 5)
    expect(await rightClick(chips()[0])).toBe(false)
    expect(menu()).toBeNull()
  })

  it('a second right-click within the window after the menu closed also goes to the browser', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    expect(await rightClick(chips()[0])).toBe(true)
    tabMenu.open = false // e.g. closed by Escape
    await nextTick()
    vi.advanceTimersByTime(DOUBLE_RIGHT_CLICK_MS - 100)
    expect(await rightClick(chips()[0])).toBe(false)
    expect(menu()).toBeNull()
  })

  it('a right-click after the window, with the menu closed, opens it again', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[0])
    tabMenu.open = false
    await nextTick()
    vi.advanceTimersByTime(DOUBLE_RIGHT_CLICK_MS + 100)
    expect(await rightClick(chips()[0])).toBe(true)
    expect(menu()).not.toBeNull()
  })
})

describe('menu surface', () => {
  it('a right-click on the menu itself (a second click at the same spot) closes it, browser menu kept', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[0])
    expect(await rightClick(menu()!.firstElementChild!)).toBe(false)
    expect(menu()).toBeNull()
  })

  it('a right-click elsewhere closes the menu even if that element prevents the default', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[0])
    const other = document.createElement('div')
    other.addEventListener('contextmenu', (e) => e.preventDefault())
    document.body.appendChild(other)
    await rightClick(other)
    other.remove()
    expect(menu()).toBeNull()
  })

  it('takes focus once placed (the menu itself after a mouse open)', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[0])
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(menu())
  })
})

describe('items', () => {
  it('Pin tab toggles to Unpin tab and pins the chip', async () => {
    const s = await mountTabs(['aerogel', 'airlock', 'rotor'])
    vi.advanceTimersByTime(2000)
    const tid = s.targets[1].tid
    await rightClick(chips()[1])
    item('Pin tab').click()
    await nextTick()
    expect(s.isPinned(tid)).toBe(true)
    expect(s.targets[0].tid).toBe(tid) // pinned tabs lead
    expect(menu()).toBeNull() // closes after an action
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[0])
    expect(itemLabels()).toContain('Unpin tab')
  })

  it('New tab opens an empty tab to the right of the clicked one', async () => {
    const s = await mountTabs(['aerogel', 'airlock', 'rotor'])
    vi.advanceTimersByTime(2000)
    const spy = vi.spyOn(s, 'newTab')
    await rightClick(chips()[0])
    item('New tab').click()
    await nextTick()
    expect(spy).toHaveBeenCalledWith(1)
    expect(s.targets.map((t) => t.targetItemId)).toEqual(['aerogel', null, 'airlock', 'rotor'])
  })

  it('Close tab, Close other tabs and Close tabs to the right call their actions', async () => {
    const s = await mountTabs(['aerogel', 'airlock', 'rotor', 'plate'])
    vi.advanceTimersByTime(2000)
    const close = vi.spyOn(s, 'closeTarget')
    const others = vi.spyOn(s, 'closeOtherTabs')
    const right = vi.spyOn(s, 'closeTabsToRight')
    const tids = s.targets.map((t) => t.tid)

    await rightClick(chips()[3])
    item('Close tab').click()
    await nextTick()
    expect(close).toHaveBeenCalledWith(tids[3])
    expect(s.targets).toHaveLength(3)

    vi.advanceTimersByTime(2000)
    await rightClick(chips()[0])
    item('Close tabs to the right').click()
    await nextTick()
    expect(right).toHaveBeenCalledWith(tids[0])
    expect(s.targets.map((t) => t.tid)).toEqual([tids[0]])

    s.reopenClosedTab()
    s.reopenClosedTab()
    await nextTick()
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[1])
    item('Close other tabs').click()
    await nextTick()
    expect(others).toHaveBeenCalledWith(s.targets[0].tid)
    expect(s.targets).toHaveLength(1)
  })

  it('Close other tabs keeps pinned tabs', async () => {
    const s = await mountTabs(['aerogel', 'airlock', 'rotor'])
    vi.advanceTimersByTime(2000)
    s.togglePin(s.targets[2].tid)
    await nextTick()
    await rightClick(chips()[1]) // aerogel (rotor is pinned and first)
    item('Close other tabs').click()
    await nextTick()
    expect(s.targets.map((t) => t.targetItemId)).toEqual(['rotor', 'aerogel'])
  })

  it('Reopen closed tab brings the last closed tab back at its place', async () => {
    const s = await mountTabs(['aerogel', 'airlock', 'rotor'])
    vi.advanceTimersByTime(2000)
    s.closeTarget(s.targets[1].tid)
    await nextTick()
    const spy = vi.spyOn(s, 'reopenClosedTab')
    await rightClick(chips()[0])
    expect(disabled('Reopen closed tab')).toBe(false)
    item('Reopen closed tab').click()
    await nextTick()
    expect(spy).toHaveBeenCalled()
    expect(s.targets.map((t) => t.targetItemId)).toEqual(['aerogel', 'airlock', 'rotor'])
  })
})

describe('disabled items', () => {
  it('disables what cannot act and ignores clicks on it', async () => {
    const s = await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[1]) // the last tab
    expect(disabled('Close tabs to the right')).toBe(true) // nothing to the right
    expect(disabled('Reopen closed tab')).toBe(true) // nothing closed yet
    expect(disabled('Close other tabs')).toBe(false)
    expect(disabled('Close tab')).toBe(false)
    expect(disabled('New tab')).toBe(false)
    const spy = vi.spyOn(s, 'reopenClosedTab')
    item('Reopen closed tab').click()
    await nextTick()
    expect(spy).not.toHaveBeenCalled()
    expect(menu()).not.toBeNull() // a disabled item does not close the menu
  })

  it('Close other tabs is disabled when the rest are pinned; Close tabs to the right skips pins', async () => {
    const s = await mountTabs(['aerogel', 'airlock', 'rotor'])
    vi.advanceTimersByTime(2000)
    s.togglePin(s.targets[0].tid)
    s.togglePin(s.targets[2].tid) // aerogel and rotor pinned, airlock last
    await nextTick()
    await rightClick(chips()[2]) // airlock
    expect(disabled('Close other tabs')).toBe(true)
    expect(disabled('Close tabs to the right')).toBe(true)
  })

  it('the + menu has New tab and Reopen closed tab only', async () => {
    const s = await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    await rightClick(addBtn())
    expect(itemLabels()).toEqual(['New tab', 'Reopen closed tab'])
    expect(disabled('Reopen closed tab')).toBe(true)
    item('New tab').click()
    await nextTick()
    expect(s.targets.map((t) => t.targetItemId)).toEqual(['aerogel', 'airlock', null])
  })
})

describe('keyboard', () => {
  it('Shift+F10 opens the menu, arrows skip disabled items, Escape closes and refocuses the chip', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    const chip = chips()[1]
    chip.focus()
    await key(chip, 'F10', { shiftKey: true })
    expect(menu()).not.toBeNull()
    expect(document.activeElement).toBe(item('New tab'))
    await key(menu()!, 'ArrowDown')
    expect(document.activeElement).toBe(item('Pin tab'))
    await key(menu()!, 'ArrowDown')
    await key(menu()!, 'ArrowDown')
    expect(document.activeElement).toBe(item('Close other tabs'))
    // last tab: "Close tabs to the right" and "Reopen closed tab" are disabled, so wrap to the top
    await key(menu()!, 'ArrowDown')
    expect(document.activeElement).toBe(item('New tab'))
    await key(menu()!, 'ArrowUp')
    expect(document.activeElement).toBe(item('Close other tabs'))
    await key(menu()!, 'Escape')
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(chip)
  })

  it('the ContextMenu key opens it, and Enter and Space activate the focused item', async () => {
    const s = await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    const chip = chips()[0]
    chip.focus()
    await key(chip, 'ContextMenu')
    expect(menu()).not.toBeNull()
    await key(menu()!, 'ArrowDown') // Pin tab
    await key(menu()!, 'Enter')
    expect(s.pinnedCount).toBe(1)
    expect(menu()).toBeNull()

    chips()[0].focus()
    await key(chips()[0], 'ContextMenu')
    await key(menu()!, 'ArrowDown') // Unpin tab
    await key(menu()!, ' ')
    expect(s.pinnedCount).toBe(0)
  })

  it('the menu key keeps the menu open: its contextmenu event lands on the focused item', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    const chip = chips()[0]
    chip.focus()
    await key(chip, 'ContextMenu')
    expect(menu()).not.toBeNull()
    // What the browser fires after the Menu key: no button, at the focused element
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: -1 })
    menuItems()[0].dispatchEvent(e)
    await nextTick()
    expect(e.defaultPrevented).toBe(true)
    expect(menu()).not.toBeNull()
  })

  it('Escape on the document closes a pointer-opened menu', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[0])
    await key(document.body, 'Escape')
    expect(menu()).toBeNull()
  })
})

describe('closing', () => {
  it.each([
    [
      'an outside click',
      () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })),
    ],
    ['a scroll', () => window.dispatchEvent(new Event('scroll'))],
    ['a resize', () => window.dispatchEvent(new Event('resize'))],
    ['the window losing focus', () => window.dispatchEvent(new Event('blur'))],
  ])('closes on %s', async (_name, fire) => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[0])
    expect(menu()).not.toBeNull()
    fire()
    await nextTick()
    expect(menu()).toBeNull()
  })

  it('a click inside the menu does not count as outside', async () => {
    await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    await rightClick(chips()[0])
    menu()!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(menu()).not.toBeNull()
  })
})

describe('touch long-press', () => {
  const touch = (el: Element, type: string, x = 20, y = 20) => {
    const e = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'touches', { value: [{ clientX: x, clientY: y }] })
    el.dispatchEvent(e)
  }

  it('a long-press on a chip opens the menu; moving away cancels it', async () => {
    await mountTabs(['aerogel', 'airlock'])
    const chip = chips()[0]
    touch(chip, 'touchstart')
    vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    await nextTick()
    expect(menu()).not.toBeNull()

    tabMenu.open = false
    await nextTick()
    touch(chip, 'touchstart')
    touch(chip, 'touchmove', 60, 20)
    vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    await nextTick()
    expect(menu()).toBeNull()
  })

  it('leaves a press that starts on the icon to the icon zoom', async () => {
    await mountTabs(['aerogel', 'airlock'])
    const icon = chips()[0].querySelector('[data-game-icon]')
    expect(icon).not.toBeNull()
    touch(icon!, 'touchstart')
    vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    await nextTick()
    expect(menu()).toBeNull()
  })
})

describe('chip layout', () => {
  it('a pinned chip is the icon alone, with a tooltip and an aria-label that says pinned', async () => {
    const s = await mountTabs(['aerogel', 'airlock'], 12)
    vi.advanceTimersByTime(2000)
    const chip = () => chips()[0]
    expect(chip().textContent).toMatch(/Aerogel/) // unpinned: the full chip
    s.togglePin(s.targets[0].tid)
    await nextTick()
    const pinned = chip()
    expect(pinned.textContent?.replace(/\u200b/g, '').trim()).toBe('')
    expect(pinned.querySelector('img')).not.toBeNull()
    expect(pinned.querySelector('button')).toBeNull() // no ×
    expect(pinned.querySelector('[data-testid="pin-indicator"]')).toBeNull() // no badge
    expect(pinned.getAttribute('title')).toMatch(/Aerogel.*12\/min/)
    expect(pinned.getAttribute('aria-label')).toMatch(/Aerogel, 12\/min, pinned/)
    expect(pinned.getAttribute('aria-selected')).toBe('true')
    // the right-click menu still works and offers Unpin tab
    await rightClick(pinned)
    expect(itemLabels()).toContain('Unpin tab')
    item('Unpin tab').click()
    await nextTick()
    // unpinning restores the full chip
    expect(chips()[0].textContent).toMatch(/Aerogel/)
    expect(chips()[0].textContent).toMatch(/\/min/)
    expect(chips()[0].getAttribute('aria-label')).toBeNull()
  })

  it('a pinned empty tab shows a generic icon', async () => {
    const s = await mountTabs([null, 'airlock'])
    vi.advanceTimersByTime(2000)
    expect(chips()[0].querySelector('[data-testid="empty-tab-icon"]')).toBeNull()
    s.togglePin(s.targets[0].tid)
    await nextTick()
    expect(chips()[0].querySelector('[data-testid="empty-tab-icon"]')).not.toBeNull()
    expect(chips()[0].getAttribute('aria-label')).toBe('New tab, pinned')
  })

  it('the icon takes its size from the chip, not from a px or em value', async () => {
    const s = await mountTabs(['aerogel', 'airlock'])
    vi.advanceTimersByTime(2000)
    s.togglePin(s.targets[1].tid)
    await nextTick()
    for (const chip of chips()) {
      const box = chip.querySelector<HTMLElement>('[data-testid="tab-icon"]')!
      expect(box.className).toMatch(/self-stretch/)
      expect(box.className).toMatch(/aspect-square/)
      const img = box.querySelector<HTMLElement>('img')!
      expect(img.className).toMatch(/object-contain/)
      expect(img.className).toMatch(/w-full/)
      expect(img.className).toMatch(/h-full/)
      expect(img.getAttribute('width')).toBeNull()
      expect(img.getAttribute('height')).toBeNull()
      expect((box.firstElementChild as HTMLElement).style.width).toBe('')
    }
  })
})

describe('tab strip visibility', () => {
  it('shows with 2+ tabs, a pinned tab or something to reopen, and not otherwise', async () => {
    const s = await mountTabs(['aerogel', 'airlock'])
    expect(s.showTabStrip).toBe(true)
    s.closeTarget(s.targets[1].tid)
    expect(s.targets).toHaveLength(1)
    expect(s.canReopen).toBe(true)
    expect(s.showTabStrip).toBe(true) // one tab left, but there is one to reopen
    s.reopenClosedTab()
    s.closeOtherTabs(s.targets[0].tid)
    expect(s.showTabStrip).toBe(true)

    const lone = await mountTabs(['aerogel'])
    expect(lone.showTabStrip).toBe(false)
    lone.togglePin(lone.targets[0].tid)
    expect(lone.showTabStrip).toBe(true)
    lone.togglePin(lone.targets[0].tid)
    expect(lone.showTabStrip).toBe(false)
  })
})

describe('header rate field', () => {
  async function mountSelector(rate: number) {
    localStorage.clear()
    save(planOf(['aerogel'], rate), prefs)
    history.replaceState(null, '', '/')
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = usePlannerStore()
    await store.init()
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(TargetSelector).use(pinia)
    app.mount(host)
    await nextTick()
    return host.querySelector<HTMLInputElement>('input[type="number"]')!
  }

  it('is wide enough for a 4-digit rate (and at least 5 digits)', async () => {
    const input = await mountSelector(3001)
    expect(input.value).toBe('3001')
    expect(input.style.width).toBe('calc(5ch + 0.75rem)')
    expect(input.className).toContain('min-w-[calc(5ch+0.75rem)]')
    expect(input.className).toContain('max-w-[calc(9ch+0.75rem)]')
  })

  it('grows with a longer number, up to a cap', async () => {
    const input = await mountSelector(1234567)
    expect(input.style.width).toBe('calc(8ch + 0.75rem)')
  })
})
