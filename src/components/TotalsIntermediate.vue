<script setup lang="ts">
// Intermediate-products totals section. Extracted so the aggregate ("All")
// view can place it in its own column on desktop while keeping the normal
// single-column order on mobile. keyPrefix namespaces its collapse state.
import { computed } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { fmt } from '../lib/format'
import { itemTypeTextClass } from '../lib/itemTypeChip'
import GameIcon from './GameIcon.vue'

const props = defineProps<{ keyPrefix?: string }>()
const store = usePlannerStore()

const sectionKey = computed(() => (props.keyPrefix ?? '') + 'intermediates')
const collapsed = computed(() => !!store.totalsCollapsed[sectionKey.value])
function toggle() {
  store.toggleTotalsSection(sectionKey.value)
}

const items = computed(() => store.totals?.intermediates ?? [])
const total = computed(() => items.value.reduce((s, m) => s + m.ratePerMin, 0))

function valueColor(id: string): string {
  return itemTypeTextClass(store.itemsById.get(id)?.type)
}
function onEnter(e: MouseEvent, id: string) {
  store.setHover('item', id, (e.currentTarget as HTMLElement).getBoundingClientRect())
}
function onLeave() {
  store.clearHover()
}
</script>

<template>
  <div v-if="items.length > 0">
    <button
      type="button"
      class="group flex items-center gap-1 w-full text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2 hover:text-[var(--text)] transition-colors"
      :aria-expanded="!collapsed"
      @click="toggle"
    >
      <svg
        class="w-3 h-3 shrink-0 transition-transform"
        :class="collapsed ? '-rotate-90' : ''"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
      Intermediate products / min
      <span class="ml-auto font-mono normal-case tracking-normal text-emerald-400">
        {{ fmt(total) }}
      </span>
    </button>
    <div v-show="!collapsed" class="space-y-1">
      <div
        v-for="item in items"
        :key="item.itemId"
        class="flex justify-between items-center text-base cursor-pointer hover:bg-[var(--panel-2)] rounded px-1 -mx-1 transition-colors"
        @click="store.openItemDetail(item.itemId)"
        @mouseenter="(e) => onEnter(e, item.itemId)"
        @mouseleave="onLeave"
      >
        <span class="flex items-center gap-1.5 text-[var(--text)] truncate">
          <GameIcon :id="item.itemId" kind="item" :name="item.itemName" :size="22" />
          {{ item.itemName }}
        </span>
        <span class="font-mono ml-2 shrink-0" :class="valueColor(item.itemId)">{{
          fmt(item.ratePerMin)
        }}</span>
      </div>
    </div>
  </div>
</template>
