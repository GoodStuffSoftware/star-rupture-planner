<script setup lang="ts">
import { computed } from 'vue'
import { usePlannerStore } from '../../stores/plannerStore'
import { fmt, fmtBuildings } from '../../lib/format'
import { itemTypeTextClass } from '../../lib/itemTypeChip'
import GameIcon from '../GameIcon.vue'

const props = defineProps<{
  sectionKey: (name: string) => string
}>()

const store = usePlannerStore()

const collapsed = computed(() => store.totalsCollapsed)
function toggle(key: string) {
  store.toggleTotalsSection(key)
}

function valueColor(itemId: string): string {
  return itemTypeTextClass(store.itemsById.get(itemId)?.type)
}

const buildingsTotal = computed(() =>
  (store.totals?.buildings ?? []).reduce((s, b) => s + b.ceilCount, 0),
)

const constructionMaterials = computed(() => {
  if (store.buildingCosts.size === 0) return null
  if (!store.totals || store.totals.buildings.length === 0) return null

  const matMap = new Map<string, { name: string; total: number }>()

  for (const bld of store.totals.buildings) {
    const costs = store.buildingCosts.get(bld.buildingId)
    if (!costs) continue
    for (const cost of costs) {
      const key = cost.id
      const name = store.itemsById.get(key)?.name ?? key
      const existing = matMap.get(key)
      if (existing) {
        existing.total += cost.amount * bld.ceilCount
      } else {
        matMap.set(key, { name, total: cost.amount * bld.ceilCount })
      }
    }
  }

  if (matMap.size === 0) return null
  return [...matMap.entries()]
    .map(([id, v]) => ({ id, name: v.name, total: v.total }))
    .sort((a, b) => b.total - a.total)
})

const constructionTotal = computed(() =>
  (constructionMaterials.value ?? []).reduce((s, m) => s + m.total, 0),
)

function onItemEnter(e: MouseEvent, id: string) {
  store.setHover('item', id, (e.currentTarget as HTMLElement).getBoundingClientRect())
}

function onBuildingEnter(e: MouseEvent, id: string) {
  store.setHover('building', id, (e.currentTarget as HTMLElement).getBoundingClientRect())
}

function onLeave() {
  store.clearHover()
}
</script>

<template>
  <div>
    <!-- Buildings Section -->
    <button
      type="button"
      class="group flex items-center gap-1 w-full text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2 hover:text-[var(--text)] transition-colors"
      :aria-expanded="!collapsed[props.sectionKey('buildings')]"
      @click="toggle(props.sectionKey('buildings'))"
    >
      <svg
        class="w-3 h-3 shrink-0 transition-transform"
        :class="collapsed[sectionKey('buildings')] ? '-rotate-90' : ''"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
      Buildings
      <span class="ml-auto font-mono normal-case tracking-normal text-[var(--accent-2)]">
        &times;{{ buildingsTotal }}
      </span>
    </button>
    <div
      v-if="
        !collapsed[props.sectionKey('buildings')] && (store.totals?.buildings ?? []).length === 0
      "
      class="text-[var(--muted-2)] text-sm italic"
    >
      None
    </div>
    <div v-else-if="!collapsed[props.sectionKey('buildings')]" class="space-y-1 mb-4">
      <div
        v-for="bld in store.totals?.buildings"
        :key="bld.buildingId"
        class="flex justify-between items-center text-base cursor-pointer hover:bg-[var(--panel-2)] rounded px-1 -mx-1 transition-colors"
        @click="store.openBuildingDetail(bld.buildingId)"
        @mouseenter="(e) => onBuildingEnter(e, bld.buildingId)"
        @mouseleave="onLeave"
      >
        <span class="flex items-center gap-1.5 text-[var(--text)] truncate">
          <GameIcon :id="bld.buildingId" kind="building" :name="bld.buildingName" :size="22" />
          {{ bld.buildingName }}
        </span>
        <span class="text-[var(--accent-2)] font-mono ml-2 shrink-0">
          &times;{{ bld.ceilCount }}
          <span class="text-[var(--muted-2)] text-xs">({{ fmtBuildings(bld.count) }})</span>
        </span>
      </div>
    </div>

    <!-- Construction Materials Section -->
    <div v-if="constructionMaterials && constructionMaterials.length > 0" class="mt-4">
      <button
        type="button"
        class="group flex items-center gap-1 w-full text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2 hover:text-[var(--text)] transition-colors"
        :aria-expanded="!collapsed[props.sectionKey('construction')]"
        @click="toggle(props.sectionKey('construction'))"
      >
        <svg
          class="w-3 h-3 shrink-0 transition-transform"
          :class="collapsed[sectionKey('construction')] ? '-rotate-90' : ''"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
        Construction materials
        <span class="ml-auto font-mono normal-case tracking-normal text-purple-400">
          {{ fmt(constructionTotal) }}
        </span>
      </button>
      <div v-show="!collapsed[props.sectionKey('construction')]" class="space-y-1">
        <div
          v-for="mat in constructionMaterials"
          :key="mat.id"
          class="flex justify-between items-center text-sm cursor-pointer hover:bg-[var(--panel-2)] rounded px-1 -mx-1 transition-colors"
          @click="store.openItemDetail(mat.id)"
          @mouseenter="(e) => onItemEnter(e, mat.id)"
          @mouseleave="onLeave"
        >
          <span class="flex items-center gap-1.5 text-[var(--text)] truncate">
            <GameIcon :id="mat.id" kind="item" :name="mat.name" :size="18" />
            {{ mat.name }}
          </span>
          <span class="font-mono ml-2 shrink-0" :class="valueColor(mat.id)">
            ×{{ mat.total }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
