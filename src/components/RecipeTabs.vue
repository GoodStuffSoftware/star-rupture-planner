<script setup lang="ts">
// Recipe tabs: one chip per planning target. Click to switch, × to close, + to add.
import { usePlannerStore } from '../stores/plannerStore'
import { fmt } from '../lib/format'
import GameIcon from './GameIcon.vue'

const store = usePlannerStore()

function labelFor(itemId: string | null): string {
  if (!itemId) return 'New recipe'
  return store.itemsById.get(itemId)?.name ?? itemId
}
</script>

<template>
  <div class="flex items-center gap-2 min-w-0">
    <!-- Tab chips (scroll horizontally when they overflow) -->
    <div class="flex items-center gap-1.5 overflow-x-auto py-0.5 min-w-0">
      <div
        v-for="t in store.targets"
        :key="t.tid"
        role="tab"
        :aria-selected="t.tid === store.activeTargetId"
        :title="`${labelFor(t.targetItemId)} — ${fmt(t.targetRate)}/min`"
        class="chamfer-sm group flex items-center gap-1.5 pl-2 pr-1.5 py-1.5 shrink-0 cursor-pointer transition-colors select-none"
        :class="
          t.tid === store.activeTargetId
            ? '[--cf-fill:var(--accent)] text-[var(--accent-on)]'
            : '[--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
        "
        @click="store.setActiveTarget(t.tid)"
      >
        <GameIcon
          v-if="t.targetItemId"
          :id="t.targetItemId"
          kind="item"
          :name="labelFor(t.targetItemId)"
          :size="20"
        />
        <span class="text-sm font-medium whitespace-nowrap max-w-40 truncate">
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
    </div>
  </div>
</template>
