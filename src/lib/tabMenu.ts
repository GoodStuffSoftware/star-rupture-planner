// Shared state and trigger helpers for the tab right-click menu. One menu exists at a time (it is
// rendered once, by TabContextMenu.vue); the chips, the Σ All button and the + button open it
// through the helpers below.
import { reactive } from 'vue'

export type TabMenuTarget =
  | { kind: 'tab'; tid: string }
  | { kind: 'add' } // the + button
  | { kind: 'all' } // the Σ All button

/** A second right-click on the same spot within this long goes to the browser's own menu. */
export const DOUBLE_RIGHT_CLICK_MS = 600
/** A touch held this long opens the menu. */
export const LONG_PRESS_MS = 500
/** Movement (px) that turns a long-press into a scroll or drag. */
export const LONG_PRESS_SLOP = 8

export const tabMenu = reactive({
  open: false,
  x: 0,
  y: 0,
  target: null as TabMenuTarget | null,
  /** The element that opened the menu; Escape returns focus to it. */
  anchor: null as HTMLElement | null,
  /** Opened from the keyboard: focus the first item straight away. */
  viaKeyboard: false,
})

const keyOf = (t: TabMenuTarget) => (t.kind === 'tab' ? `tab:${t.tid}` : t.kind)

let lastRightClick = { key: '', time: 0 }
// The contextmenu event a chip last claimed, so the document-level listener can tell it from one
// that landed elsewhere (even when an icon there called preventDefault).
let claimedEvent: Event | null = null
export const isClaimedByTabMenu = (e: Event) => e === claimedEvent
/** Forget the last right-click (after an action ran), so the next one is a fresh first click. */
export function forgetRightClick(): void {
  lastRightClick = { key: '', time: 0 }
}

export function openTabMenu(
  target: TabMenuTarget,
  anchor: HTMLElement | null,
  x: number,
  y: number,
  viaKeyboard = false,
): void {
  tabMenu.target = target
  tabMenu.anchor = anchor
  tabMenu.x = x
  tabMenu.y = y
  tabMenu.viaKeyboard = viaKeyboard
  tabMenu.open = true
}

export function closeTabMenu(returnFocus = false): void {
  if (!tabMenu.open) return
  tabMenu.open = false
  const anchor = tabMenu.anchor
  tabMenu.anchor = null
  if (returnFocus && anchor?.isConnected) anchor.focus()
}

function openAtElement(target: TabMenuTarget, el: HTMLElement): void {
  const r = el.getBoundingClientRect()
  openTabMenu(target, el, r.left + 4, r.bottom, true)
}

/**
 * `contextmenu` handler for a chip or button. The first right-click opens the custom menu and
 * suppresses the browser's. A second one on the same target while the menu is open, or within
 * DOUBLE_RIGHT_CLICK_MS of the first, closes it and leaves the event alone so the browser's own
 * menu appears.
 */
export function onTabContextMenu(e: MouseEvent, target: TabMenuTarget): void {
  const el = e.currentTarget as HTMLElement | null
  const key = keyOf(target)
  claimedEvent = e
  // A touch long-press or the keyboard's menu key is not a "right-click" (ctrl+click on a Mac is).
  const mouse = (e.button === 2 || e.ctrlKey) && (e as PointerEvent).pointerType !== 'touch'
  if (!mouse) {
    e.preventDefault()
    // A touch long-press on the icon belongs to the icon's own zoom.
    if ((e.target as Element | null)?.closest?.('[data-game-icon]') && (e.clientX || e.clientY))
      return
    if (!tabMenu.open && el) {
      if (e.clientX || e.clientY) openTabMenu(target, el, e.clientX, e.clientY, false)
      else openAtElement(target, el)
    }
    return
  }
  const now = Date.now()
  const again =
    lastRightClick.key === key &&
    (tabMenu.open || now - lastRightClick.time < DOUBLE_RIGHT_CLICK_MS)
  if (again) {
    lastRightClick = { key: '', time: 0 }
    closeTabMenu()
    return // no preventDefault: the browser's menu appears
  }
  e.preventDefault()
  lastRightClick = { key, time: now }
  openTabMenu(target, el, e.clientX, e.clientY, false)
}

/** `keydown` handler: the ContextMenu key or Shift+F10 on a focused chip or button. */
export function onTabMenuKey(e: KeyboardEvent, target: TabMenuTarget): void {
  if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return
  const el = e.currentTarget as HTMLElement | null
  if (!el || e.target !== el) return
  e.preventDefault()
  lastRightClick = { key: '', time: 0 }
  openAtElement(target, el)
}

// ─── Touch long-press ───────────────────────────────────────────────────────
let pressTimer: ReturnType<typeof setTimeout> | null = null
let pressX = 0
let pressY = 0
let swallowClickUntil = 0

export function clearLongPress(): void {
  if (pressTimer !== null) clearTimeout(pressTimer)
  pressTimer = null
}

/**
 * Start a long-press timer for a touch on a chip. A touch that starts on the item icon is left
 * to the icon's own press-and-hold zoom (also 500 ms), which would otherwise fire at the same
 * moment.
 */
export function onTabTouchStart(e: TouchEvent, target: TabMenuTarget): void {
  clearLongPress()
  const el = e.currentTarget as HTMLElement | null
  const t = e.touches[0]
  if (!el || !t) return
  if ((e.target as Element | null)?.closest?.('[data-game-icon]')) return
  pressX = t.clientX
  pressY = t.clientY
  pressTimer = setTimeout(() => {
    pressTimer = null
    swallowClickUntil = Date.now() + 800
    openTabMenu(target, el, pressX, pressY, false)
  }, LONG_PRESS_MS)
}

export function onTabTouchMove(e: TouchEvent): void {
  const t = e.touches[0]
  if (t && Math.hypot(t.clientX - pressX, t.clientY - pressY) > LONG_PRESS_SLOP) clearLongPress()
}

/** True (once) if a click just followed a long-press that opened the menu. */
export function consumeLongPressClick(): boolean {
  if (Date.now() < swallowClickUntil) {
    swallowClickUntil = 0
    return true
  }
  return false
}
