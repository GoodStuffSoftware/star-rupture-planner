<script setup lang="ts">
// The tab right-click menu (rendered once, by App.vue). It opens from a chip, the Σ All button or
// the + button through src/lib/tabMenu.ts, sits at the pointer (clamped inside the viewport) and
// closes on outside click, Escape, scroll, resize, window blur and after any action.
import { computed, nextTick, ref, watch, onBeforeUnmount } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { tabMenu, closeTabMenu } from '../lib/tabMenu'

const store = usePlannerStore()

interface MenuItem {
  id: string
  label: string
  disabled: boolean
  separatorBefore?: boolean
  run: () => void
}

const items = computed<MenuItem[]>(() => {
  const target = tabMenu.target
  if (!target) return []
  const reopen: MenuItem = {
    id: 'reopen',
    label: 'Reopen closed tab',
    disabled: !store.canReopen,
    separatorBefore: true,
    run: () => store.reopenClosedTab(),
  }
  if (target.kind !== 'tab') {
    // + and Σ All: a new tab at the end, and reopen.
    return [
      { id: 'new', label: 'New tab', disabled: false, run: () => store.newTab() },
      { ...reopen, separatorBefore: false },
    ]
  }
  const tid = target.tid
  const index = store.targets.findIndex((t) => t.tid === tid)
  return [
    { id: 'new', label: 'New tab', disabled: false, run: () => store.newTab(index + 1) },
    {
      id: 'pin',
      label: store.isPinned(tid) ? 'Unpin tab' : 'Pin tab',
      disabled: index === -1,
      run: () => store.togglePin(tid),
    },
    {
      id: 'close',
      label: 'Close tab',
      disabled: index === -1 || !store.canCloseTab(tid),
      separatorBefore: true,
      run: () => store.closeTarget(tid),
    },
    {
      id: 'close-others',
      label: 'Close other tabs',
      disabled: !store.canCloseOthers(tid),
      run: () => store.closeOtherTabs(tid),
    },
    {
      id: 'close-right',
      label: 'Close tabs to the right',
      disabled: !store.canCloseToRight(tid),
      run: () => store.closeTabsToRight(tid),
    },
    reopen,
  ]
})

const menuEl = ref<HTMLElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)
const pos = ref({ left: 0, top: 0 })
const MARGIN = 8

function clampIntoViewport() {
  const el = menuEl.value
  const w = el?.offsetWidth ?? 0
  const h = el?.offsetHeight ?? 0
  pos.value = {
    left: Math.max(MARGIN, Math.min(tabMenu.x, window.innerWidth - w - MARGIN)),
    top: Math.max(MARGIN, Math.min(tabMenu.y, window.innerHeight - h - MARGIN)),
  }
}

const itemEls = () =>
  Array.from(menuEl.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
const enabledEls = () => itemEls().filter((el) => el.getAttribute('aria-disabled') !== 'true')

function moveFocus(delta: number) {
  const list = enabledEls()
  if (!list.length) return
  const i = list.indexOf(document.activeElement as HTMLElement)
  const next =
    i === -1 ? (delta > 0 ? 0 : list.length - 1) : (i + delta + list.length) % list.length
  list[next].focus()
}

function activate(item: MenuItem) {
  if (item.disabled) return
  closeTabMenu() // first: the action may remove the chip the menu belongs to
  item.run()
}

function onKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      moveFocus(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveFocus(-1)
      break
    case 'Home':
      e.preventDefault()
      enabledEls()[0]?.focus()
      break
    case 'End':
      e.preventDefault()
      enabledEls().at(-1)?.focus()
      break
    case 'Escape':
      e.preventDefault()
      e.stopPropagation()
      closeTabMenu(true)
      break
    case 'Tab':
      e.preventDefault() // a menu holds focus until it closes
      break
    case 'Enter':
    case ' ': {
      e.preventDefault()
      const id = (document.activeElement as HTMLElement | null)?.dataset.itemId
      const item = items.value.find((i) => i.id === id)
      if (item) activate(item)
      break
    }
  }
}

// ─── Closing ────────────────────────────────────────────────────────────────
const inMenu = (n: EventTarget | null) =>
  !!menuEl.value && n instanceof Node && menuEl.value.contains(n)
const onOutsidePointer = (e: Event) => {
  // A right-button press is the start of a (possibly second) right-click: the chip decides.
  if ((e as PointerEvent).button === 2) return
  if (!inMenu(e.target)) closeTabMenu()
}
// A right-click elsewhere (one that no chip claimed with preventDefault) shows the browser's menu,
// so ours goes.
const onOtherContextMenu = (e: Event) => {
  if (!e.defaultPrevented && !inMenu(e.target)) closeTabMenu()
}
const onScroll = (e: Event) => {
  if (!inMenu(e.target)) closeTabMenu()
}
const onClose = () => closeTabMenu()
const onResize = () => closeTabMenu()
const onDocKey = (e: Event) => {
  if ((e as KeyboardEvent).key === 'Escape') closeTabMenu(true)
}

function listen(on: boolean) {
  const act = on ? 'addEventListener' : 'removeEventListener'
  document[act]('pointerdown', onOutsidePointer, true)
  document[act]('contextmenu', onOtherContextMenu)
  document[act]('keydown', onDocKey)
  window[act]('scroll', onScroll, true)
  window[act]('resize', onResize)
  window[act]('blur', onClose)
}

watch(
  () => [tabMenu.open, tabMenu.x, tabMenu.y, tabMenu.target] as const,
  async ([open]) => {
    listen(open)
    if (!open) return
    pos.value = { left: tabMenu.x, top: tabMenu.y }
    await nextTick()
    clampIntoViewport()
    if (tabMenu.viaKeyboard) enabledEls()[0]?.focus({ preventScroll: true })
    else rootEl.value?.focus({ preventScroll: true })
  },
  { flush: 'post' },
)

onBeforeUnmount(() => listen(false))
</script>

<template>
  <Teleport to="body">
    <!-- The fixed positioning lives on this wrapper: .chamfer-sm sets position: relative. -->
    <div
      v-if="tabMenu.open && tabMenu.target"
      ref="menuEl"
      class="fixed z-[110]"
      :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
    >
      <div
        ref="rootEl"
        role="menu"
        aria-label="Tab actions"
        data-testid="tab-menu"
        tabindex="-1"
        class="chamfer-sm min-w-44 max-w-[calc(100vw-16px)] text-[var(--text)] outline-none"
        @keydown="onKeydown"
        @contextmenu.prevent
      >
        <!-- Text size follows Options → Text size, like the rest of the app -->
        <div
          class="py-1"
          :style="store.treeFontScale !== 1 ? { zoom: store.treeFontScale } : undefined"
        >
          <template v-for="item in items" :key="item.id">
            <div
              v-if="item.separatorBefore"
              role="separator"
              class="my-1 h-px bg-[var(--border)]"
            />
            <button
              type="button"
              role="menuitem"
              tabindex="-1"
              :data-item-id="item.id"
              :aria-disabled="item.disabled ? 'true' : undefined"
              class="w-full text-left whitespace-nowrap px-3 py-1.5 text-sm outline-none transition-colors"
              :class="
                item.disabled
                  ? 'text-[var(--muted-2)] cursor-not-allowed'
                  : 'text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus:bg-[var(--accent-soft)] focus:text-[var(--accent)] cursor-pointer'
              "
              @click="activate(item)"
            >
              {{ item.label }}
            </button>
          </template>
          <div
            role="presentation"
            class="mt-1 border-t border-[var(--border)] px-3 pt-1.5 pb-1 text-[11px] leading-tight text-[var(--muted-2)]"
          >
            Right-click again for the browser menu
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
