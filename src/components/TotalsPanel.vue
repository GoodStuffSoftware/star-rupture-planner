<script setup lang="ts">
import { computed } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { fmt, fmtBuildings } from '../lib/format'
import GameIcon from './GameIcon.vue'

const store = usePlannerStore()

// ─── v6: hover helpers ────────────────────────────────────────────────────
function onItemEnter(e: MouseEvent, id: string) {
  store.setHover('item', id, (e.currentTarget as HTMLElement).getBoundingClientRect())
}
function onBuildingEnter(e: MouseEvent, id: string) {
  store.setHover('building', id, (e.currentTarget as HTMLElement).getBoundingClientRect())
}
function onLeave() {
  store.clearHover()
}

// ─── v6: Construction materials aggregation ───────────────────────────────
// Only computed (and section rendered) when buildingCosts is non-empty.
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
</script>

<template>
  <div class="chamfer p-4 space-y-4">
    <h3 class="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">Totals</h3>

    <div v-if="!store.totals" class="text-[var(--muted-2)] text-sm italic">No target selected</div>

    <template v-else>
      <!-- Raw Materials -->
      <div>
        <h4 class="text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2">
          Raw materials / min
        </h4>
        <div
          v-if="store.totals.rawMaterials.length === 0"
          class="text-[var(--muted-2)] text-sm italic"
        >
          None
        </div>
        <div v-else class="space-y-1">
          <div
            v-for="mat in store.totals.rawMaterials"
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
            <span class="text-emerald-400 font-mono ml-2 shrink-0">{{ fmt(mat.ratePerMin) }}</span>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-[var(--border)]" />

      <!-- Buildings -->
      <div>
        <h4 class="text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2">
          Buildings
        </h4>
        <div
          v-if="store.totals.buildings.length === 0"
          class="text-[var(--muted-2)] text-sm italic"
        >
          None
        </div>
        <div v-else class="space-y-1">
          <div
            v-for="bld in store.totals.buildings"
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
            <span class="text-[var(--accent)] font-mono ml-2 shrink-0">
              &times;{{ bld.ceilCount }}
              <span class="text-[var(--muted-2)] text-xs">({{ fmtBuildings(bld.count) }})</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-[var(--border)]" />

      <!-- Power & Heat -->
      <div class="grid grid-cols-2 gap-3">
        <div class="chamfer-sm [--cf-fill:var(--panel-2)] p-2.5">
          <div class="text-xs text-[var(--muted-2)] mb-1">Power</div>
          <div class="text-base font-mono text-amber-400">{{ fmt(store.totals.totalPower) }} W</div>
        </div>
        <div class="chamfer-sm [--cf-fill:var(--panel-2)] p-2.5">
          <div class="text-xs text-[var(--muted-2)] mb-1">Heat</div>
          <div class="text-base font-mono text-red-400">
            {{ fmt(store.totals.totalHeat) }}
          </div>
        </div>
      </div>

      <!-- v6: Construction materials (hidden when no buildingCosts data) -->
      <template v-if="constructionMaterials && constructionMaterials.length > 0">
        <!-- Divider -->
        <div class="border-t border-[var(--border)]" />

        <div>
          <h4 class="text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2">
            Construction materials
          </h4>
          <div class="space-y-1">
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
              <span class="text-[var(--muted)] font-mono ml-2 shrink-0">×{{ mat.total }}</span>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
