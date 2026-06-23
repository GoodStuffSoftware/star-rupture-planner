<script setup lang="ts">
import { computed } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { fmt, fmtBuildings } from '../lib/format'
import { itemTypeTextClass } from '../lib/itemTypeChip'
import GameIcon from './GameIcon.vue'
import TotalsIntermediate from './TotalsIntermediate.vue'

// `aggregate` switches to the combined "All" layout (two columns on desktop,
// no layout toggle) and namespaces the collapse state so it's independent.
const props = defineProps<{ aggregate?: boolean }>()
const store = usePlannerStore()

function sectionKey(s: string): string {
  return props.aggregate ? 'all:' + s : s
}

// Value colour for an item, derived from its type (consistent with the row chips).
function valueColor(itemId: string): string {
  return itemTypeTextClass(store.itemsById.get(itemId)?.type)
}

// ─── Collapsible section state ────────────────────────────────────────────
// Each totals subsection can be collapsed by clicking its header. Persisted in
// the store (view prefs), keyed by section id. Read through a computed so it
// stays correct even after the store reassigns the object (e.g. on restore).
const collapsed = computed(() => store.totalsCollapsed)
function toggle(section: string) {
  store.toggleTotalsSection(section)
}

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

// ─── Per-section header totals ────────────────────────────────────────────
const rawTotal = computed(() =>
  (store.totals?.rawMaterials ?? []).reduce((s, m) => s + m.ratePerMin, 0),
)
const buildingsTotal = computed(() =>
  (store.totals?.buildings ?? []).reduce((s, b) => s + b.ceilCount, 0),
)
const constructionTotal = computed(() =>
  (constructionMaterials.value ?? []).reduce((s, m) => s + m.total, 0),
)
</script>

<template>
  <div class="chamfer p-4 space-y-4">
    <!-- Header + layout toggle (hidden in the aggregate "All" view) -->
    <div v-if="!aggregate" class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">Totals</h3>
      <div
        class="chamfer-sm [--cf-fill:var(--panel-2)] hidden md:flex shrink-0 p-px gap-px overflow-hidden"
      >
        <button
          type="button"
          title="Totals on the side"
          aria-label="Totals on the side"
          class="px-1.5 py-1 transition-colors"
          :class="
            store.totalsPlacement === 'side'
              ? 'bg-[var(--accent)] text-[var(--accent-on)]'
              : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
          "
          @click="store.setTotalsPlacement('side')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="1" stroke-width="2" />
            <line x1="14" y1="4" x2="14" y2="20" stroke-width="2" />
          </svg>
        </button>
        <button
          type="button"
          title="Totals on the bottom"
          aria-label="Totals on the bottom"
          class="px-1.5 py-1 transition-colors"
          :class="
            store.totalsPlacement === 'bottom'
              ? 'bg-[var(--accent)] text-[var(--accent-on)]'
              : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
          "
          @click="store.setTotalsPlacement('bottom')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="1" stroke-width="2" />
            <line x1="3" y1="14" x2="21" y2="14" stroke-width="2" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="!store.totals" class="text-[var(--muted-2)] text-sm italic">No target selected</div>

    <template v-else>
      <!-- Power & Heat — at the top -->
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

      <!-- Sections. Aggregate view: two columns on desktop (col 1: raw / buildings /
           construction, col 2: intermediates), single normal-order column on mobile. -->
      <div
        :class="
          aggregate
            ? 'space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-6 md:items-start'
            : 'space-y-4'
        "
      >
        <!-- Column 1 (and the single mobile/normal column) -->
        <div class="space-y-4">
          <!-- Raw materials -->
          <div>
            <button
              type="button"
              class="group flex items-center gap-1 w-full text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2 hover:text-[var(--text)] transition-colors"
              :aria-expanded="!collapsed[sectionKey('raw')]"
              @click="toggle(sectionKey('raw'))"
            >
              <svg
                class="w-3 h-3 shrink-0 transition-transform"
                :class="collapsed[sectionKey('raw')] ? '-rotate-90' : ''"
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
              Raw materials / min
              <span class="ml-auto font-mono normal-case tracking-normal text-amber-400">
                {{ fmt(rawTotal) }}
              </span>
            </button>
            <div
              v-if="!collapsed[sectionKey('raw')] && store.totals.rawMaterials.length === 0"
              class="text-[var(--muted-2)] text-sm italic"
            >
              None
            </div>
            <div v-else-if="!collapsed[sectionKey('raw')]" class="space-y-1">
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
                <span class="font-mono ml-2 shrink-0" :class="valueColor(mat.itemId)">{{
                  fmt(mat.ratePerMin)
                }}</span>
              </div>
            </div>
          </div>

          <!-- Intermediates — normal view here; aggregate shows it here only on mobile -->
          <TotalsIntermediate v-if="!aggregate" />
          <TotalsIntermediate v-else key-prefix="all:" class="md:hidden" />

          <!-- Buildings -->
          <div>
            <button
              type="button"
              class="group flex items-center gap-1 w-full text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2 hover:text-[var(--text)] transition-colors"
              :aria-expanded="!collapsed[sectionKey('buildings')]"
              @click="toggle(sectionKey('buildings'))"
            >
              <svg
                class="w-3 h-3 shrink-0 transition-transform"
                :class="collapsed[sectionKey('buildings')] ? '-rotate-90' : ''"
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
              Buildings
              <span class="ml-auto font-mono normal-case tracking-normal text-[var(--accent-2)]">
                &times;{{ buildingsTotal }}
              </span>
            </button>
            <div
              v-if="!collapsed[sectionKey('buildings')] && store.totals.buildings.length === 0"
              class="text-[var(--muted-2)] text-sm italic"
            >
              None
            </div>
            <div v-else-if="!collapsed[sectionKey('buildings')]" class="space-y-1">
              <div
                v-for="bld in store.totals.buildings"
                :key="bld.buildingId"
                class="flex justify-between items-center text-base cursor-pointer hover:bg-[var(--panel-2)] rounded px-1 -mx-1 transition-colors"
                @click="store.openBuildingDetail(bld.buildingId)"
                @mouseenter="(e) => onBuildingEnter(e, bld.buildingId)"
                @mouseleave="onLeave"
              >
                <span class="flex items-center gap-1.5 text-[var(--text)] truncate">
                  <GameIcon
                    :id="bld.buildingId"
                    kind="building"
                    :name="bld.buildingName"
                    :size="22"
                  />
                  {{ bld.buildingName }}
                </span>
                <span class="text-[var(--accent-2)] font-mono ml-2 shrink-0">
                  &times;{{ bld.ceilCount }}
                  <span class="text-[var(--muted-2)] text-xs">({{ fmtBuildings(bld.count) }})</span>
                </span>
              </div>
            </div>
          </div>

          <!-- Construction materials (hidden when no buildingCosts data) -->
          <div v-if="constructionMaterials && constructionMaterials.length > 0">
            <button
              type="button"
              class="group flex items-center gap-1 w-full text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider mb-2 hover:text-[var(--text)] transition-colors"
              :aria-expanded="!collapsed[sectionKey('construction')]"
              @click="toggle(sectionKey('construction'))"
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
            <div v-show="!collapsed[sectionKey('construction')]" class="space-y-1">
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
                <span class="font-mono ml-2 shrink-0" :class="valueColor(mat.id)"
                  >×{{ mat.total }}</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Column 2 (aggregate, desktop only): intermediates -->
        <div v-if="aggregate" class="hidden md:block">
          <TotalsIntermediate key-prefix="all:" />
        </div>
      </div>
    </template>
  </div>
</template>
