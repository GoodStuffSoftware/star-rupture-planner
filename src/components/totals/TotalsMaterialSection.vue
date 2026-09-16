<script setup lang="ts">
import { computed } from 'vue'
import { usePlannerStore } from '../../stores/plannerStore'
import { fmt } from '../../lib/format'
import { itemTypeTextClass } from '../../lib/itemTypeChip'
import GameIcon from '../GameIcon.vue'

const props = defineProps<{
  sectionKey: string
}>()

const store = usePlannerStore()

const collapsed = computed(() => store.totalsCollapsed)
function toggle() {
  store.toggleTotalsSection(props.sectionKey)
}

function valueColor(itemId: string): string {
  return itemTypeTextClass(store.itemsById.get(itemId)?.type)
}

const rawTotal = computed(() =>
  (store.totals?.rawMaterials ?? []).reduce((s, m) => s + m.ratePerMin, 0),
)

function onItemEnter(e: MouseEvent, id: string) {
  store.setHover('item', id, (e.currentTarget as HTMLElement).getBoundingClientRect())
}

function onLeave() {
  store.clearHover()
}
</script>

<template>
  <div>
    <button
      type="button"
      class="group flex items-center gap-1 w-full text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2 hover:text-[var(--text)] transition-colors"
      :aria-expanded="!collapsed[sectionKey]"
      @click="toggle"
    >
      <svg
        class="w-3 h-3 shrink-0 transition-transform"
        :class="collapsed[sectionKey] ? '-rotate-90' : ''"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
      Raw materials / min
      <span class="ml-auto font-mono normal-case tracking-normal text-amber-400">
        {{ fmt(rawTotal) }}
      </span>
    </button>
    <div
      v-if="!collapsed[sectionKey] && (store.totals?.rawMaterials ?? []).length === 0"
      class="text-[var(--muted-2)] text-sm italic"
    >
      None
    </div>
    <div v-else-if="!collapsed[sectionKey]" class="space-y-1">
      <div
        v-for="mat in store.totals?.rawMaterials"
        :key="mat.itemId"
        class="flex justify-between items-center text-base cursor-pointer hover:bg-[var(--panel-2)] rounded px-1 -mx-1 transition-colors"
        @click="store.openItemDetail(mat.itemId)"
        @mouseenter="(e) => onItemEnter(e, mat.itemId)"
        @mouseleave="onLeave"
      >
        <span class="flex items-center gap-1.5 text-[var(--text)] truncate">
          <GameIcon :id="mat.itemId" kind="item" :name="mat.itemName" :size="22" />
          {{ mat.itemName }}
        </span>
        <span class="font-mono ml-2 shrink-0" :class="valueColor(mat.itemId)">
          {{ fmt(mat.ratePerMin) }}
        </span>
      </div>
    </div>
  </div>
</template>
