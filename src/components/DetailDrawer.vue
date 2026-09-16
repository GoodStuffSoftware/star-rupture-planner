<script setup lang="ts">
/**
 * DetailDrawer — single app-level bottom drawer, teleported to body.
 * Driven by store.detail. Slides up from bottom, ~65vh max (expandable to full).
 * Close on ✕ button, Esc, and backdrop click.
 * Header navigation logic encapsulated in DrawerHeaderNav.
 */
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { recipeKey, type ProducerEntry } from '../lib/recipeIndex'
import type { Building } from '../types/game'
import type { UsedInEntry } from '../lib/derived'
import DrawerHeaderNav from './drawer/DrawerHeaderNav.vue'
import ItemIndexView from './drawer/ItemIndexView.vue'
import ItemDetailView from './drawer/ItemDetailView.vue'
import BuildingDetailView from './drawer/BuildingDetailView.vue'

const store = usePlannerStore()

// Full-screen toggle
const isExpanded = ref(false)

// Blur zone measurements
const headerBottom = ref(48)
const row1Bottom = ref(48)
const versionBottom = ref(48)
const blurStartLeft = ref(0)
const isDesktop = ref(window.innerWidth >= 640)

const zone1Top = computed(() => row1Bottom.value + 6)

function measureBlurZones() {
  const header = document.querySelector('header')
  const row = document.getElementById('header-row1')
  const blurDiv = document.getElementById('blur-start')
  const verWrap = document.getElementById('version-selector-wrap')
  if (header) {
    headerBottom.value = header.getBoundingClientRect().bottom
  }
  if (row) {
    row1Bottom.value = row.getBoundingClientRect().bottom
  }
  if (blurDiv) {
    blurStartLeft.value = blurDiv.getBoundingClientRect().left
  }
  if (verWrap) {
    versionBottom.value = verWrap.getBoundingClientRect().bottom
  }
  isDesktop.value = window.innerWidth >= 640
}

// Item index search filter
const indexSearch = ref('')

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && store.detail) {
    store.closeDetail()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  measureBlurZones()
  window.addEventListener('resize', measureBlurZones)
  window.addEventListener('scroll', measureBlurZones, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', measureBlurZones)
  window.removeEventListener('scroll', measureBlurZones)
})

// Re-measure when drawer opens
watch(
  () => store.detail,
  (v) => {
    if (v) nextTick(measureBlurZones)
  },
)

const isIndex = computed(() => store.detail?.id === '__index__')
const isSearching = computed(() => indexSearch.value.trim().length > 0)

// Collapsed section tracking for Item Index
const ALL_SECTION_KEYS = [
  'item-component',
  'item-processed',
  'item-raw',
  'item-material',
  'item-ammo',
  'bld-production',
  'bld-generator',
  'bld-transport',
  'bld-storage',
  'bld-temperature',
  'bld-defense',
  'bld-habitat',
  'bld-core',
]
const collapsedSections = ref<Set<string>>(new Set(ALL_SECTION_KEYS))
const expandedOrder = ref<string[]>([])

function toggleSection(key: string) {
  const s = new Set(collapsedSections.value)
  if (s.has(key)) {
    s.delete(key)
    expandedOrder.value = [key, ...expandedOrder.value.filter((k) => k !== key)]
  } else {
    s.add(key)
    expandedOrder.value = expandedOrder.value.filter((k) => k !== key)
  }
  collapsedSections.value = s
}

function isSectionOpen(key: string) {
  return !collapsedSections.value.has(key)
}

const allExpanded = computed(() => collapsedSections.value.size === 0)

function expandAll() {
  collapsedSections.value = new Set()
  expandedOrder.value = [...ALL_SECTION_KEYS]
}

function collapseAll() {
  collapsedSections.value = new Set(ALL_SECTION_KEYS)
  expandedOrder.value = []
}

const ITEM_CATEGORIES = [
  { type: 'component', label: 'Components' },
  { type: 'processed', label: 'Processed' },
  { type: 'raw', label: 'Raw Materials' },
  { type: 'material', label: 'Materials' },
  { type: 'ammo', label: 'Ammo' },
]

const BUILDING_CATEGORIES = [
  { type: 'production', label: 'Production' },
  { type: 'generator', label: 'Generators' },
  { type: 'transport', label: 'Transport' },
  { type: 'storage', label: 'Storage' },
  { type: 'temperature', label: 'Temperature' },
  { type: 'defense', label: 'Defense' },
  { type: 'habitat', label: 'Habitat' },
  { type: 'core', label: 'Core' },
]

const categorizedItems = computed(() => {
  return ITEM_CATEGORIES.map((cat) => ({
    ...cat,
    items: store.items.filter((i) => i.type === cat.type),
  })).filter((cat) => cat.items.length > 0)
})

const categorizedBuildings = computed(() => {
  return BUILDING_CATEGORIES.map((cat) => ({
    ...cat,
    buildings: store.buildings.filter((b: { type?: string }) => b.type === cat.type),
  })).filter((cat) => cat.buildings.length > 0)
})

const expandedItemCats = computed(() => {
  return expandedOrder.value
    .filter((k) => k.startsWith('item-'))
    .map((k) => {
      const type = k.replace('item-', '')
      return categorizedItems.value.find((c) => c.type === type)
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
})

const expandedBldCats = computed(() => {
  return expandedOrder.value
    .filter((k) => k.startsWith('bld-'))
    .map((k) => {
      const type = k.replace('bld-', '')
      return categorizedBuildings.value.find((c) => c.type === type)
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
})

const searchResults = computed(() => {
  const q = indexSearch.value.trim().toLowerCase()
  if (!q) return { items: [], buildings: [] }
  const items = store.items.filter((i) => i.name.toLowerCase().includes(q))
  const buildings = store.buildings.filter((b: { name: string }) =>
    b.name.toLowerCase().includes(q),
  )
  return { items, buildings }
})

// Item detail data
const itemData = computed(() => {
  const d = store.detail
  if (!d || d.kind !== 'item' || d.id === '__index__') return null
  const item = store.itemsById.get(d.id)
  if (!item) return null

  const producers = store.fullProducerIndex.get(d.id) ?? []
  const usedIn = store.usedInIndex.get(d.id) ?? []
  const exports = store.exportsByItem.get(d.id) ?? []

  return { item, producers, usedIn, exports }
})

// Building detail data
const buildingData = computed(() => {
  const d = store.detail
  if (!d || d.kind !== 'building') return null
  const building = store.buildingsById.get(d.id)
  if (!building) return null

  const chain = store.chains.find((c) => c.baseId === d.id || c.upgradedId === d.id)
  const isV2 = chain ? chain.upgradedId === d.id : false
  const pairedId = chain ? (isV2 ? chain.baseId : chain.upgradedId) : null
  const pairedBuilding = pairedId ? store.buildingsById.get(pairedId) : null

  const unlock = store.buildingUnlock.get(d.id) ?? null
  const costs = store.buildingCosts.get(d.id) ?? null

  return { building, chain, isV2, pairedId, pairedBuilding, unlock, costs }
})

const buildingTypeColors: Record<string, string> = {
  production: 'bg-emerald-900/60 text-emerald-300',
  generator: 'bg-amber-900/60 text-amber-300',
  transport: 'bg-blue-900/60 text-blue-300',
  storage: 'bg-purple-900/60 text-purple-300',
  temperature: 'bg-cyan-900/60 text-cyan-300',
  defense: 'bg-red-900/60 text-red-300',
  habitat: 'bg-indigo-900/60 text-indigo-300',
  core: 'bg-rose-900/60 text-rose-300',
}

function goItem(id: string) {
  store.openItemDetail(id, true)
}

function goBuilding(id: string) {
  store.openBuildingDetail(id, true)
}

function openAsRecipe(id: string, buildingId: string, recipe: ProducerEntry['recipe']) {
  store.setOverride(id, buildingId)
  const bld =
    store.buildingsById.get(buildingId) ??
    ({ id: buildingId, name: buildingId, type: 'production' } as Building)
  store.setRecipeOverride(id, recipeKey(recipe, bld))
  store.addTargetItem(id)
}

function openUsedInAsRecipe(u: UsedInEntry) {
  store.setOverride(u.recipe.output.id, u.buildingId)
  const bld =
    store.buildingsById.get(u.buildingId) ??
    ({ id: u.buildingId, name: u.buildingName, type: 'production' } as Building)
  store.setRecipeOverride(u.recipe.output.id, recipeKey(u.recipe, bld))
  store.addTargetItem(u.recipe.output.id)
}
</script>

<template>
  <Teleport to="body">
    <template v-if="store.detail">
      <!-- Mobile: single backdrop -->
      <div
        v-if="!isDesktop"
        class="fixed left-0 right-0 bottom-0 z-[150] bg-black/50 backdrop-blur-sm"
        :style="{ top: versionBottom + 4 + 'px' }"
        @click="store.closeDetail()"
      />

      <!-- Desktop zone 1 -->
      <div
        v-if="isDesktop"
        class="fixed left-0 right-0 bottom-0 z-[150] bg-black/50 backdrop-blur-sm"
        :style="{
          top: zone1Top + 'px',
          maskImage: 'linear-gradient(to bottom, transparent, black 8px)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 8px)',
        }"
        @click="store.closeDetail()"
      />

      <!-- Desktop zone 2 -->
      <div
        v-if="isDesktop"
        class="fixed right-0 z-[150] bg-black/50 backdrop-blur-sm"
        :style="{
          top: '0px',
          left: blurStartLeft - 8 + 'px',
          height: zone1Top + 7 + 'px',
          maskImage: 'linear-gradient(to right, transparent, black 8px)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 8px)',
        }"
        @click="store.closeDetail()"
      />

      <!-- Drawer panel -->
      <div
        class="fixed left-0 right-0 z-[160] bg-[var(--panel)] border-t border-[var(--border)] shadow-2xl flex flex-col transition-all duration-300"
        :class="isExpanded ? 'bottom-0' : 'bottom-0 h-[65vh]'"
        :style="isExpanded ? { top: (isDesktop ? zone1Top : versionBottom + 4) + 'px' } : undefined"
        style="clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px)"
      >
        <!-- Extracted Modular Navigation Header -->
        <DrawerHeaderNav
          v-model:is-expanded="isExpanded"
          :is-desktop="isDesktop"
          @close="store.closeDetail()"
        />

        <!-- Scrollable drawer body -->
        <div class="overflow-y-auto flex-1 px-5 py-4">
          <ItemIndexView
            v-if="isIndex"
            v-model:index-search="indexSearch"
            :is-searching="isSearching"
            :search-results="searchResults"
            :all-expanded="allExpanded"
            :categorized-items="categorizedItems"
            :categorized-buildings="categorizedBuildings"
            :expanded-item-cats="expandedItemCats"
            :expanded-bld-cats="expandedBldCats"
            :building-type-colors="buildingTypeColors"
            :is-section-open="isSectionOpen"
            @go-item="goItem"
            @go-building="goBuilding"
            @toggle-section="toggleSection"
            @expand-all="expandAll"
            @collapse-all="collapseAll"
          />

          <ItemDetailView
            v-else-if="store.detail.kind === 'item' && itemData"
            :item-data="itemData"
            @go-item="goItem"
            @go-building="goBuilding"
            @open-as-recipe="openAsRecipe"
            @open-used-in-as-recipe="openUsedInAsRecipe"
          />

          <BuildingDetailView
            v-else-if="store.detail.kind === 'building' && buildingData"
            :building-data="buildingData"
            :building-type-colors="buildingTypeColors"
            @go-item="goItem"
            @replace-detail="store.replaceDetail"
          />

          <template v-else>
            <p class="text-[var(--muted)] italic">
              No data found for this {{ store.detail.kind }}.
            </p>
          </template>
        </div>
      </div>
    </template>
  </Teleport>
</template>
