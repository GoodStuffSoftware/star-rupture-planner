<script setup lang="ts">
// Recipe tabs: one chip per planning target. Click to switch, × to close,
// drag to reorder.
import { ref, computed } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { fmt } from '../lib/format'
import GameIcon from './GameIcon.vue'
import AddRecipeButton from './AddRecipeButton.vue'

const store = usePlannerStore()

function labelFor(itemId: string | null): string {
  if (!itemId) return 'New recipe'
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
</script>

<template>
  <div class="flex items-center gap-2 min-w-0">
    <!-- Tab chips (scroll horizontally when they overflow). Extra bottom padding
         leaves room for the slim scrollbar below the chips. -->
    <div class="flex items-center gap-1.5 overflow-x-auto pt-0.5 pb-2 min-w-0">
      <div
        v-for="t in store.targets"
        :key="t.tid"
        role="tab"
        draggable="true"
        :aria-selected="t.tid === store.activeTargetId"
        :title="`${labelFor(t.targetItemId)} — ${fmt(t.targetRate)}/min`"
        class="chamfer-sm group flex items-center gap-1.5 pl-2 pr-1.5 py-1.5 shrink-0 cursor-grab active:cursor-grabbing transition-colors select-none"
        :class="[
          t.tid === store.activeTargetId
            ? '[--cf-fill:var(--accent)] text-[var(--accent-on)]'
            : '[--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] text-[var(--muted)] hover:text-[var(--text)]',
          dragTid === t.tid ? 'opacity-50' : '',
          overTid === t.tid ? 'ring-2 ring-[var(--accent)]' : '',
        ]"
        @click="store.setActiveTarget(t.tid)"
        @dragstart="onDragStart(t.tid, $event)"
        @dragover.prevent="onDragOver(t.tid)"
        @drop="onDrop(t.tid)"
        @dragend="onDragEnd"
      >
        <GameIcon
          v-if="t.targetItemId"
          :id="t.targetItemId"
          kind="item"
          :name="labelFor(t.targetItemId)"
          :size="20"
        />
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
          class="text-xs font-mono whitespace-nowrap"
          :class="t.tid === store.activeTargetId ? 'opacity-80' : 'opacity-60'"
        >
          {{ fmt(t.targetRate) }}/min
        </span>
        <!-- Close (only when more than one tab) -->
        <button
          v-if="store.targets.length > 1"
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

      <!-- Add recipe — sticky to the right edge so it shares the chips' line
           (aligned) and stays visible when the strip scrolls. Desktop only;
           on mobile the + lives next to the per-minute amount. -->
      <div class="hidden sm:flex items-center sticky right-0 z-10 pl-1.5 bg-[var(--panel)]">
        <AddRecipeButton />
      </div>
    </div>
  </div>
</template>
