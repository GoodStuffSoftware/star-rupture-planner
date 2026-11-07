<script setup lang="ts">
// Recipe tabs: one chip per planning target. Click to switch, × to close (pinned tabs
// have none), drag to reorder within the pinned or the unpinned group. A tab with no item
// yet is a "New tab" chip. Right-click, a long-press or the menu key opens the tab menu.
import { ref, computed } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { fmt } from '../lib/format'
import GameIcon from './GameIcon.vue'
import AddRecipeButton from './AddRecipeButton.vue'
import {
  onTabContextMenu,
  onTabMenuKey,
  onTabTouchStart,
  onTabTouchMove,
  clearLongPress,
  consumeLongPressClick,
} from '../lib/tabMenu'

const store = usePlannerStore()

function labelFor(itemId: string | null): string {
  if (!itemId) return 'New tab'
  return store.itemsById.get(itemId)?.name ?? itemId
}

// Desktop: names truncate more aggressively the more tabs there are, so they
// stay readable when there's room and tighten up as the strip fills.
const nameMaxWidth = computed(() => {
  const n = store.targets.length
  if (n <= 2) return 160
  if (n <= 3) return 130
  if (n <= 5) return 100
  if (n <= 7) return 78
  if (n <= 10) return 60
  if (n <= 14) return 48
  return 38
})

// Pinned tabs always show an icon (a glyph when empty); others when there is an item and icons are on.
const hasIcon = (t: { pinned?: boolean; targetItemId: string | null }) =>
  !!t.pinned || (!!t.targetItemId && store.showIcons)

// ─── Drag-to-reorder ────────────────────────────────────────────────────────
const dragTid = ref<string | null>(null)
const overTid = ref<string | null>(null)

function onDragStart(tid: string, e: DragEvent) {
  dragTid.value = tid
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tid)
  }
}
function onDragOver(tid: string) {
  if (dragTid.value && dragTid.value !== tid) overTid.value = tid
}
function onDrop(tid: string) {
  if (dragTid.value && dragTid.value !== tid) store.moveTarget(dragTid.value, tid)
  dragTid.value = null
  overTid.value = null
}
function onDragEnd() {
  dragTid.value = null
  overTid.value = null
}

// A chip is focusable: Enter or Space selects it (when the chip itself has focus, not its ×);
// the ContextMenu key or Shift+F10 opens its menu.
function onChipKey(tid: string, e: KeyboardEvent) {
  onTabMenuKey(e, { kind: 'tab', tid })
  if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
    e.preventDefault()
    store.setActiveTarget(tid)
  }
}
function onChipClick(tid: string) {
  if (consumeLongPressClick()) return
  store.setActiveTarget(tid)
}
</script>

<template>
  <div class="flex items-center gap-2 min-w-0">
    <!-- Tab chips (scroll horizontally when they overflow). No bottom padding so
         there's no dead space without a scrollbar; the header's bottom padding
         gives the scrollbar even room below it when it does appear. -->
    <div class="flex items-center gap-1.5 overflow-x-auto pt-0.5 pb-0 min-w-0">
      <div
        v-for="t in store.targets"
        :key="t.tid"
        role="tab"
        draggable="true"
        tabindex="0"
        aria-haspopup="menu"
        :aria-selected="t.tid === store.activeTargetId"
        :title="
          t.targetItemId ? `${labelFor(t.targetItemId)} — ${fmt(t.targetRate)}/min` : 'New tab'
        "
        :aria-label="
          t.pinned
            ? `${t.targetItemId ? `${labelFor(t.targetItemId)}, ${fmt(t.targetRate)}/min` : 'New tab'}, pinned`
            : undefined
        "
        class="chamfer-sm group flex items-center gap-1.5 h-[calc(1lh+0.75rem)] text-sm shrink-0 cursor-grab active:cursor-grabbing transition-colors select-none"
        :class="[
          t.tid === store.activeTargetId
            ? '[--cf-fill:var(--accent)] text-[var(--accent-on)]'
            : '[--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] text-[var(--muted)] hover:text-[var(--text)]',
          t.pinned ? 'px-0' : [hasIcon(t) ? 'pl-0' : 'pl-2', 'pr-2'],
          dragTid === t.tid ? 'opacity-50' : '',
          overTid === t.tid ? 'ring-2 ring-[var(--accent)]' : '',
        ]"
        @click="onChipClick(t.tid)"
        @keydown="onChipKey(t.tid, $event)"
        @contextmenu="onTabContextMenu($event, { kind: 'tab', tid: t.tid })"
        @touchstart.passive="onTabTouchStart($event, { kind: 'tab', tid: t.tid })"
        @touchmove.passive="onTabTouchMove"
        @touchend.passive="clearLongPress"
        @touchcancel.passive="clearLongPress"
        @dragstart="onDragStart(t.tid, $event)"
        @dragover.prevent="onDragOver(t.tid)"
        @drop="onDrop(t.tid)"
        @dragend="onDragEnd"
      >
        <!-- The chip's height comes from its text (one line of text plus the usual padding). The
             icon takes its size only from that box: full height, square, an even 3px of padding
             inside, object-contain. Nothing on it is a px/em size or tied to the text size. -->
        <span
          v-if="hasIcon(t)"
          class="relative h-full aspect-square shrink-0"
          data-testid="tab-icon"
        >
          <span class="absolute inset-[3px]">
            <GameIcon
              v-if="t.targetItemId && store.showIcons"
              :id="t.targetItemId"
              kind="item"
              :name="labelFor(t.targetItemId)"
              fill
              native-context-menu
            />
            <!-- Icons off: the name's first letters stand in -->
            <span
              v-else-if="t.targetItemId"
              class="flex w-full h-full items-center justify-center text-[10px] font-bold"
              >{{ labelFor(t.targetItemId).slice(0, 2) }}</span
            >
            <!-- A pinned tab with nothing in it yet: a generic "new tab" glyph -->
            <svg
              v-else
              class="w-full h-full"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              data-testid="empty-tab-icon"
              aria-hidden="true"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M12 8.5v7M8.5 12h7" />
            </svg>
          </span>
        </span>
        <!-- Pinned: the icon alone, nothing else -->
        <template v-if="!t.pinned">
          <!-- Mobile: only the first 3 letters -->
          <span class="sm:hidden text-sm font-medium whitespace-nowrap">
            {{ labelFor(t.targetItemId).slice(0, 3) }}
          </span>
          <!-- Desktop: truncate, width tightens as the tab count grows -->
          <span
            class="hidden sm:inline-block text-sm font-medium truncate align-middle"
            :style="{ maxWidth: nameMaxWidth + 'px' }"
          >
            {{ labelFor(t.targetItemId) }}
          </span>
          <span
            v-if="t.targetItemId"
            class="text-xs font-mono whitespace-nowrap"
            :class="t.tid === store.activeTargetId ? 'opacity-80' : 'opacity-60'"
          >
            {{ fmt(t.targetRate) }}/min
          </span>
        </template>
        <!-- Close (only when more than one tab; pinned tabs have none) -->
        <button
          v-if="store.targets.length > 1 && !t.pinned"
          type="button"
          aria-label="Close recipe"
          title="Close recipe"
          class="ml-0.5 w-4 h-4 flex items-center justify-center rounded-sm opacity-60 hover:opacity-100 hover:bg-black/20 transition"
          @click.stop="store.closeTarget(t.tid)"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Combined "all totals" pseudo-tab — at the end of the recipe tabs -->
      <button
        type="button"
        title="Combined totals across all recipes"
        aria-haspopup="menu"
        class="chamfer-sm shrink-0 flex items-center px-2.5 py-1.5 text-sm font-semibold transition-colors select-none"
        :class="
          store.isAllView
            ? '[--cf-fill:var(--accent)] text-[var(--accent-on)]'
            : '[--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
        "
        @click="store.showAllTotals()"
        @contextmenu="onTabContextMenu($event, { kind: 'all' })"
        @keydown="onTabMenuKey($event, { kind: 'all' })"
      >
        &Sigma; All
      </button>

      <!-- Add recipe — sticky to the right edge so it shares the chips' line
           (aligned) and stays visible when the strip scrolls. Desktop only;
           on mobile the + lives next to the per-minute amount. -->
      <div class="hidden sm:flex items-center sticky right-0 z-10 pl-1.5 bg-[var(--panel)]">
        <AddRecipeButton />
      </div>
    </div>
  </div>
</template>
