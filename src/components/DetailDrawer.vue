<script setup lang="ts">
/**
 * DetailDrawer — single app-level bottom drawer, teleported to body.
 * Driven by store.detail. Slides up from bottom, ~70vh max (expandable to full).
 * Close on ✕ button, Esc, and backdrop click.
 * Supports back navigation via a history stack.
 */
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { fmt } from '../lib/format'
import { itemTypeChipClass } from '../lib/itemTypeChip'
import { recipeKey } from '../lib/recipeIndex'
import GameIcon from './GameIcon.vue'

const store = usePlannerStore()

// Full-screen toggle
const isExpanded = ref(false)

// Blur zone measurements
const headerBottom = ref(48) // bottom of the full header element
const row1Bottom = ref(48) // bottom of row 1
const versionBottom = ref(48) // bottom of version selector (for mobile)
const blurStartLeft = ref(0) // left edge of blur-start divider
const isDesktop = ref(window.innerWidth >= 640)

// Shared zone 1 top position
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

// ─── Keyboard close (Esc) ─────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && store.detail) store.closeDetail()
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

// ─── Is this the item index view? ─────────────────────────────────────────
const isIndex = computed(() => store.detail?.id === '__index__')

// Is the user searching?
const isSearching = computed(() => indexSearch.value.trim().length > 0)

// Collapsed section tracking — starts with ALL sections collapsed
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
// Track order of expansion — most recently expanded first
const expandedOrder = ref<string[]>([])

function toggleSection(key: string) {
  const s = new Set(collapsedSections.value)
  if (s.has(key)) {
    // Opening — add to front of expanded order
    s.delete(key)
    expandedOrder.value = [key, ...expandedOrder.value.filter((k) => k !== key)]
  } else {
    // Closing — remove from expanded order
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
  // Put all keys in order (items first, then buildings)
  expandedOrder.value = [...ALL_SECTION_KEYS]
}
function collapseAll() {
  collapsedSections.value = new Set(ALL_SECTION_KEYS)
  expandedOrder.value = []
}

// Expanded item categories in most-recently-expanded-first order
const expandedItemCats = computed(() => {
  return expandedOrder.value
    .filter((k) => k.startsWith('item-'))
    .map((k) => {
      const type = k.replace('item-', '')
      return categorizedItems.value.find((c) => c.type === type)
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
})

// Expanded building categories in most-recently-expanded-first order
const expandedBldCats = computed(() => {
  return expandedOrder.value
    .filter((k) => k.startsWith('bld-'))
    .map((k) => {
      const type = k.replace('bld-', '')
      return categorizedBuildings.value.find((c) => c.type === type)
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
})

// Category order and labels
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

// Items grouped by category (for default view)
const categorizedItems = computed(() => {
  return ITEM_CATEGORIES.map((cat) => ({
    ...cat,
    items: store.items.filter((i) => i.type === cat.type),
  })).filter((cat) => cat.items.length > 0)
})

// Buildings grouped by type
const categorizedBuildings = computed(() => {
  return BUILDING_CATEGORIES.map((cat) => ({
    ...cat,
    buildings: store.buildings.filter((b: { type?: string }) => b.type === cat.type),
  })).filter((cat) => cat.buildings.length > 0)
})

// Search results (items + buildings)
const searchResults = computed(() => {
  const q = indexSearch.value.trim().toLowerCase()
  if (!q) return { items: [], buildings: [] }
  const items = store.items.filter((i) => i.name.toLowerCase().includes(q))
  const buildings = store.buildings.filter((b: { name: string }) =>
    b.name.toLowerCase().includes(q),
  )
  return { items, buildings }
})

// ─── Item detail data ─────────────────────────────────────────────────────
const itemData = computed(() => {
  const d = store.detail
  if (!d || d.kind !== 'item' || d.id === '__index__') return null
  const item = store.itemsById.get(d.id)
  if (!item) return null

  // All producers for this item (from full index)
  const producers = store.fullProducerIndex.get(d.id) ?? []

  // Used-in entries — recipes that consume this item as an input
  const usedIn = store.usedInIndex.get(d.id) ?? []

  // Export entries
  const exports = store.exportsByItem.get(d.id) ?? []

  return { item, producers, usedIn, exports }
})

// ─── Building detail data ─────────────────────────────────────────────────
const buildingData = computed(() => {
  const d = store.detail
  if (!d || d.kind !== 'building') return null
  const building = store.buildingsById.get(d.id)
  if (!building) return null

  // Tier info — find if this building has a v1 or v2 pair
  const chain = store.chains.find((c) => c.baseId === d.id || c.upgradedId === d.id)
  const isV2 = chain ? chain.upgradedId === d.id : false
  const pairedId = chain ? (isV2 ? chain.baseId : chain.upgradedId) : null
  const pairedBuilding = pairedId ? store.buildingsById.get(pairedId) : null

  // Unlock info
  const unlock = store.buildingUnlock.get(d.id) ?? null

  // Construction cost (if available)
  const costs = store.buildingCosts.get(d.id) ?? null

  return { building, chain, isV2, pairedId, pairedBuilding, unlock, costs }
})

// Building type chip colors
const buildingTypeColors: Record<string, string> = {
  production: 'bg-emerald-900/60 text-emerald-300',
  generator: 'bg-amber-900/60 text-amber-300',
  transport: 'bg-blue-900/60 text-blue-300',
  storage: 'bg-purple-900/60 text-purple-300',
  temperature: 'bg-cyan-900/60 text-cyan-300',
  defense: 'bg-red-900/60 text-red-300',
  habitat: 'bg-teal-900/60 text-teal-300',
  core: 'bg-orange-900/60 text-orange-300',
}

// ─── Cross-link helpers ───────────────────────────────────────────────────
function goBuilding(id: string) {
  store.openBuildingDetail(id)
}

/** Returns 'v1', 'v2', or null if the building isn't part of a version chain. */
function buildingVersion(id: string): string | null {
  const chain = store.chains.find((c) => c.baseId === id || c.upgradedId === id)
  if (!chain) return null
  return chain.upgradedId === id ? 'v2' : 'v1'
}

function goItem(id: string) {
  store.openItemDetail(id)
}

/** Open as recipe with a specific producer (building + recipe variant). */
function openAsRecipe(
  itemId: string,
  buildingId: string,
  recipe: {
    id?: string
    variant?: string
    output: { id: string; amount_per_minute: number }
    inputs: { id: string; amount_per_minute: number }[]
  },
) {
  store.addTargetItem(itemId)
  store.setOverride(itemId, buildingId)
  // If this is an alternate recipe, set the recipe override too
  const building = store.buildingsById.get(buildingId)
  if (building && (recipe.variant || recipe.id)) {
    const rKey = recipeKey(recipe, building)
    store.setRecipeOverride(itemId, rKey)
  }
  store.closeDetail()
}

/** Open as recipe from a used-in entry (the OUTPUT item of that recipe). */
function openUsedInAsRecipe(entry: {
  buildingId: string
  buildingName: string
  recipe: {
    id?: string
    variant?: string
    output: { id: string; amount_per_minute: number }
    inputs: { id: string; amount_per_minute: number }[]
  }
}) {
  openAsRecipe(entry.recipe.output.id, entry.buildingId, entry.recipe)
}

// Can go back?
const canGoBack = computed(() => store.detailHistory.length > 0)

// Header title
const headerTitle = computed(() => {
  if (isIndex.value) return 'Item Index'
  if (!store.detail) return ''
  return store.detail.kind === 'item' ? 'Item Detail' : 'Building Detail'
})
</script>

<template>
  <Teleport to="body">
    <template v-if="store.detail">
      <!-- Mobile: single positioned backdrop (below version selector) -->
      <div
        v-if="!isDesktop"
        class="fixed left-0 right-0 bottom-0 z-[150] bg-black/50 backdrop-blur-sm"
        :style="{ top: versionBottom + 4 + 'px' }"
        @click="store.closeDetail()"
      />

      <!-- Desktop zone 1: full width, from zone1Top downward
           Feathered top edge via mask-image gradient -->
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

      <!-- Desktop zone 2: from blur-start divider to right edge
           Extends down to zone1Top to fill the gap. Feathered left edge -->
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
        :class="isExpanded ? 'bottom-0' : 'bottom-0 max-h-[70vh]'"
        :style="isExpanded ? { top: (isDesktop ? zone1Top : versionBottom + 4) + 'px' } : undefined"
        style="clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px)"
      >
        <!-- Drawer header -->
        <div
          class="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0"
        >
          <div class="flex items-center gap-2">
            <!-- Back button — accent-colored chevron -->
            <button
              v-if="canGoBack"
              class="w-8 h-8 flex items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-on)] transition-colors"
              title="Go back"
              @click="store.detailBack()"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="2.5"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
              {{ headerTitle }}
            </span>
          </div>
          <div class="flex items-center gap-1">
            <!-- Expand/collapse toggle — single chevron that rotates -->
            <button
              class="w-7 h-7 flex items-center justify-center rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors"
              :title="isExpanded ? 'Collapse' : 'Expand'"
              @click="isExpanded = !isExpanded"
            >
              <svg
                class="w-4 h-4 transition-transform duration-300"
                :class="isExpanded ? 'rotate-180' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 15l7-7 7 7"
                />
              </svg>
            </button>
            <!-- Close button -->
            <button
              class="w-7 h-7 flex items-center justify-center rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors"
              title="Close (Esc)"
              @click="store.closeDetail()"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Scrollable body -->
        <div class="overflow-y-auto flex-1 px-5 py-4">
          <!-- ═══ ITEM INDEX ═══════════════════════════════════════════════════ -->
          <template v-if="isIndex">
            <!-- Search bar -->
            <div class="mb-4">
              <input
                v-model="indexSearch"
                type="text"
                placeholder="Search items and buildings..."
                class="w-full bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <!-- Search results (unified items + buildings) -->
            <template v-if="isSearching">
              <!-- Matching items -->
              <div v-if="searchResults.items.length > 0" class="mb-4">
                <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                  Items
                </h3>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  <button
                    v-for="item in searchResults.items"
                    :key="item.id"
                    class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center gap-2 px-2.5 py-2 text-sm text-[var(--text)] hover:[--cf-border:var(--accent)] hover:text-[var(--accent)] transition-colors text-left"
                    @click="goItem(item.id)"
                  >
                    <GameIcon :id="item.id" kind="item" :name="item.name" :size="20" />
                    <span class="truncate">{{ item.name }}</span>
                  </button>
                </div>
              </div>
              <!-- Matching buildings -->
              <div v-if="searchResults.buildings.length > 0" class="mb-4">
                <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                  Buildings
                </h3>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  <button
                    v-for="b in searchResults.buildings"
                    :key="b.id"
                    class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center gap-2 px-2.5 py-2 text-sm text-[var(--text)] hover:[--cf-border:var(--accent)] hover:text-[var(--accent)] transition-colors text-left"
                    @click="goBuilding(b.id)"
                  >
                    <GameIcon :id="b.id" kind="building" :name="b.name" :size="20" />
                    <span class="truncate">{{ b.name }}</span>
                  </button>
                </div>
              </div>
              <!-- No results -->
              <p
                v-if="searchResults.items.length === 0 && searchResults.buildings.length === 0"
                class="text-[var(--muted)] italic text-sm"
              >
                No results found.
              </p>
            </template>

            <!-- Default: categorized view with collapsible sections -->
            <template v-else>
              <!-- Expand/collapse all control -->
              <div class="flex items-center justify-end mb-3">
                <button
                  class="text-[10px] font-semibold text-[var(--muted)] hover:text-[var(--accent)] transition-colors uppercase tracking-wider"
                  @click="allExpanded ? collapseAll() : expandAll()"
                >
                  {{ allExpanded ? '▸ Collapse all' : '▾ Expand all' }}
                </button>
              </div>

              <!-- ── Items ── -->
              <h2 class="text-xs font-bold text-[var(--muted)] uppercase tracking-widest mb-3">
                Items
              </h2>
              <div class="flex flex-wrap gap-2 mb-2">
                <template v-for="cat in categorizedItems" :key="'item-' + cat.type">
                  <!-- Collapsed: just the chip (forms columns) -->
                  <button
                    v-if="!isSectionOpen('item-' + cat.type)"
                    class="flex items-center gap-1.5 py-1 px-1 cursor-pointer"
                    @click="toggleSection('item-' + cat.type)"
                  >
                    <svg
                      class="w-3 h-3 text-[var(--muted)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span
                      :class="itemTypeChipClass(cat.type)"
                      class="px-2 py-0.5 rounded text-[10px] font-bold"
                      >{{ cat.label }}</span
                    >
                    <span class="text-[var(--muted-2)] text-[10px]">{{ cat.items.length }}</span>
                  </button>
                </template>
              </div>
              <!-- Expanded item sections — ordered by most recently expanded -->
              <template v-for="cat in expandedItemCats" :key="'item-exp-' + cat.type">
                <div class="mb-4">
                  <button
                    class="w-full flex items-center gap-2 py-1.5 cursor-pointer"
                    @click="toggleSection('item-' + cat.type)"
                  >
                    <svg
                      class="w-3 h-3 text-[var(--muted)] rotate-90 transition-transform duration-200"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span
                      :class="itemTypeChipClass(cat.type)"
                      class="px-2 py-0.5 rounded text-[10px] font-bold"
                      >{{ cat.label }}</span
                    >
                    <span class="text-[var(--muted-2)] text-[10px]">{{ cat.items.length }}</span>
                  </button>
                  <div
                    class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-2"
                  >
                    <button
                      v-for="item in cat.items"
                      :key="item.id"
                      class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center gap-2 px-2.5 py-2 text-sm text-[var(--text)] hover:[--cf-border:var(--accent)] hover:text-[var(--accent)] transition-colors text-left"
                      @click="goItem(item.id)"
                    >
                      <GameIcon :id="item.id" kind="item" :name="item.name" :size="20" />
                      <span class="truncate">{{ item.name }}</span>
                    </button>
                  </div>
                </div>
              </template>

              <!-- ── Buildings ── -->
              <h2 class="text-xs font-bold text-[var(--muted)] uppercase tracking-widest mt-5 mb-3">
                Buildings
              </h2>
              <div class="flex flex-wrap gap-2 mb-2">
                <template v-for="cat in categorizedBuildings" :key="'bld-' + cat.type">
                  <!-- Collapsed: just the chip -->
                  <button
                    v-if="!isSectionOpen('bld-' + cat.type)"
                    class="flex items-center gap-1.5 py-1 px-1 cursor-pointer"
                    @click="toggleSection('bld-' + cat.type)"
                  >
                    <svg
                      class="w-3 h-3 text-[var(--muted)]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span
                      :class="buildingTypeColors[cat.type] ?? 'bg-slate-700 text-slate-300'"
                      class="px-2 py-0.5 rounded text-[10px] font-bold"
                      >{{ cat.label }}</span
                    >
                    <span class="text-[var(--muted-2)] text-[10px]">{{
                      cat.buildings.length
                    }}</span>
                  </button>
                </template>
              </div>
              <!-- Expanded building sections — ordered by most recently expanded -->
              <template v-for="cat in expandedBldCats" :key="'bld-exp-' + cat.type">
                <div class="mb-4">
                  <button
                    class="w-full flex items-center gap-2 py-1.5 cursor-pointer"
                    @click="toggleSection('bld-' + cat.type)"
                  >
                    <svg
                      class="w-3 h-3 text-[var(--muted)] rotate-90 transition-transform duration-200"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span
                      :class="buildingTypeColors[cat.type] ?? 'bg-slate-700 text-slate-300'"
                      class="px-2 py-0.5 rounded text-[10px] font-bold"
                      >{{ cat.label }}</span
                    >
                    <span class="text-[var(--muted-2)] text-[10px]">{{
                      cat.buildings.length
                    }}</span>
                  </button>
                  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                    <button
                      v-for="b in cat.buildings"
                      :key="b.id"
                      class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center gap-2 px-2.5 py-2 text-sm text-[var(--text)] hover:[--cf-border:var(--accent)] hover:text-[var(--accent)] transition-colors text-left"
                      @click="goBuilding(b.id)"
                    >
                      <GameIcon :id="b.id" kind="building" :name="b.name" :size="20" />
                      <span class="truncate">{{ b.name }}</span>
                    </button>
                  </div>
                </div>
              </template>
            </template>
          </template>

          <!-- ═══ ITEM VIEW ═══════════════════════════════════════════════════ -->
          <template v-else-if="store.detail.kind === 'item' && itemData">
            <!-- Item header -->
            <div class="flex items-center gap-3 mb-4">
              <GameIcon :id="itemData.item.id" kind="item" :name="itemData.item.name" :size="40" />
              <div>
                <h2 class="text-xl font-bold text-[var(--text-strong)]">
                  {{ itemData.item.name }}
                </h2>
                <span
                  :class="itemTypeChipClass(itemData.item.type)"
                  class="text-xs px-2 py-0.5 rounded font-medium"
                >
                  {{ itemData.item.type }}
                </span>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Made by -->
              <div v-if="itemData.producers.length > 0">
                <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                  Made by
                </h3>
                <div class="space-y-3">
                  <div
                    v-for="(prod, i) in itemData.producers"
                    :key="prod.building.id + '-' + i"
                    class="chamfer-sm [--cf-fill:var(--panel-2)] p-3"
                  >
                    <!-- Top row: output item + building with version + ⚡ -->
                    <div class="flex items-center gap-2 mb-2">
                      <button
                        class="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors font-semibold text-[var(--text)] text-left flex-1 min-w-0"
                        @click="goItem(itemData.item.id)"
                      >
                        <GameIcon
                          :id="itemData.item.id"
                          kind="item"
                          :name="itemData.item.name"
                          :size="20"
                        />
                        <span class="truncate">{{ itemData.item.name }}</span>
                      </button>
                      <button
                        class="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors shrink-0"
                        @click="goBuilding(prod.building.id)"
                      >
                        <GameIcon
                          :id="prod.building.id"
                          kind="building"
                          :name="prod.building.name"
                          :size="16"
                        />
                        <span>{{ prod.building.name }}</span>
                        <span
                          v-if="buildingVersion(prod.building.id)"
                          class="text-[10px] font-bold"
                          :class="
                            buildingVersion(prod.building.id) === 'v2'
                              ? 'text-[var(--accent-2)]'
                              : 'text-[var(--muted-2)]'
                          "
                          >{{ buildingVersion(prod.building.id) }}</span
                        >
                      </button>
                      <span
                        v-if="prod.recipe.variant"
                        class="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 font-medium shrink-0"
                        >Alt</span
                      >
                      <!-- Open as recipe button -->
                      <button
                        class="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-on)] hover:bg-[var(--accent-hover)] transition-colors"
                        title="Open this recipe in a new planning tab"
                        @click="openAsRecipe(itemData.item.id, prod.building.id, prod.recipe)"
                      >
                        <svg
                          class="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          stroke-width="2.5"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 5v14M5 12h14"
                          />
                        </svg>
                      </button>
                    </div>
                    <!-- Recipe inputs → output -->
                    <div class="text-xs text-[var(--muted)] space-y-1">
                      <div
                        v-for="inp in prod.recipe.inputs"
                        :key="inp.id"
                        class="flex items-center gap-1"
                      >
                        <button
                          class="flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
                          @click="goItem(inp.id)"
                        >
                          <GameIcon
                            :id="inp.id"
                            kind="item"
                            :name="store.itemsById.get(inp.id)?.name ?? inp.id"
                            :size="14"
                          />
                          <span>{{ store.itemsById.get(inp.id)?.name ?? inp.id }}</span>
                        </button>
                        <span class="text-[var(--muted-2)]"
                          >{{ fmt(inp.amount_per_minute) }}/min</span
                        >
                      </div>
                      <div
                        v-if="prod.recipe.inputs.length === 0"
                        class="italic text-[var(--muted-2)]"
                      >
                        Extractor (no inputs)
                      </div>
                      <div
                        class="flex items-center gap-1 text-[var(--accent)] mt-1 pt-1 border-t border-[var(--border)]"
                      >
                        <span>→ {{ fmt(prod.recipe.output.amount_per_minute) }}/min</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Used in — full recipe cards showing what this item is consumed by -->
              <div v-if="itemData.usedIn.length > 0">
                <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                  Used in
                </h3>
                <div class="space-y-3">
                  <div
                    v-for="(entry, i) in itemData.usedIn"
                    :key="entry.buildingId + '-' + entry.recipe.output.id + '-' + i"
                    class="chamfer-sm [--cf-fill:var(--panel-2)] p-3"
                  >
                    <!-- Output item name + building — top row -->
                    <div class="flex items-center gap-2 mb-2">
                      <button
                        class="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors font-semibold text-[var(--text)] text-left flex-1 min-w-0"
                        @click="goItem(entry.recipe.output.id)"
                      >
                        <GameIcon
                          :id="entry.recipe.output.id"
                          kind="item"
                          :name="
                            store.itemsById.get(entry.recipe.output.id)?.name ??
                            entry.recipe.output.id
                          "
                          :size="20"
                        />
                        <span class="truncate">{{
                          store.itemsById.get(entry.recipe.output.id)?.name ??
                          entry.recipe.output.id
                        }}</span>
                      </button>
                      <button
                        class="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors shrink-0"
                        @click="goBuilding(entry.buildingId)"
                      >
                        <GameIcon
                          :id="entry.buildingId"
                          kind="building"
                          :name="entry.buildingName"
                          :size="16"
                        />
                        <span>{{ entry.buildingName }}</span>
                        <span
                          v-if="buildingVersion(entry.buildingId)"
                          class="text-[10px] font-bold"
                          :class="
                            buildingVersion(entry.buildingId) === 'v2'
                              ? 'text-[var(--accent-2)]'
                              : 'text-[var(--muted-2)]'
                          "
                          >{{ buildingVersion(entry.buildingId) }}</span
                        >
                      </button>
                      <!-- Open as recipe button -->
                      <button
                        class="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-on)] hover:bg-[var(--accent-hover)] transition-colors"
                        title="Open this recipe in a new planning tab"
                        @click="openUsedInAsRecipe(entry)"
                      >
                        <svg
                          class="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          stroke-width="2.5"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 5v14M5 12h14"
                          />
                        </svg>
                      </button>
                    </div>
                    <!-- Recipe inputs -->
                    <div class="text-xs text-[var(--muted)] space-y-1">
                      <div
                        v-for="inp in entry.recipe.inputs"
                        :key="inp.id"
                        class="flex items-center gap-1"
                      >
                        <button
                          class="flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
                          @click="goItem(inp.id)"
                        >
                          <GameIcon
                            :id="inp.id"
                            kind="item"
                            :name="store.itemsById.get(inp.id)?.name ?? inp.id"
                            :size="14"
                          />
                          <span>{{ store.itemsById.get(inp.id)?.name ?? inp.id }}</span>
                        </button>
                        <span class="text-[var(--muted-2)]"
                          >{{ fmt(inp.amount_per_minute) }}/min</span
                        >
                      </div>
                      <div
                        class="flex items-center gap-1 text-[var(--accent)] mt-1 pt-1 border-t border-[var(--border)]"
                      >
                        <span>→ {{ fmt(entry.recipe.output.amount_per_minute) }}/min</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Exports -->
            <div v-if="itemData.exports.length > 0" class="mt-4">
              <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                Corporation exports
              </h3>
              <div class="space-y-1">
                <div
                  v-for="(exp, i) in itemData.exports"
                  :key="exp.corpId + '-' + exp.level + '-' + i"
                  class="flex items-center gap-3 text-sm"
                >
                  <span class="text-[var(--text)]">{{ exp.corp }}</span>
                  <span class="text-[var(--muted)] text-xs">Lv {{ exp.level }}</span>
                  <span class="text-[var(--accent)] font-mono text-xs">{{ exp.points }} pts</span>
                </div>
              </div>
            </div>
          </template>

          <!-- ═══ BUILDING VIEW ════════════════════════════════════════════════ -->
          <template v-else-if="store.detail.kind === 'building' && buildingData">
            <!-- Building header -->
            <div class="flex items-center gap-3 mb-4">
              <GameIcon
                :id="buildingData.building.id"
                kind="building"
                :name="buildingData.building.name"
                :size="40"
              />
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-xl font-bold text-[var(--text-strong)]">
                    {{ buildingData.building.name }}
                  </h2>
                  <!-- Inline v1/v2 toggle -->
                  <div
                    v-if="buildingData.pairedBuilding"
                    class="inline-flex rounded overflow-hidden border border-[var(--border)] text-xs font-semibold"
                  >
                    <button
                      class="px-2 py-0.5 transition-colors"
                      :class="
                        !buildingData.isV2
                          ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                          : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
                      "
                      @click="
                        !buildingData.isV2
                          ? null
                          : store.replaceDetail('building', buildingData.chain!.baseId)
                      "
                    >
                      v1
                    </button>
                    <button
                      class="px-2 py-0.5 transition-colors"
                      :class="
                        buildingData.isV2
                          ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                          : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
                      "
                      @click="
                        buildingData.isV2
                          ? null
                          : store.replaceDetail('building', buildingData.chain!.upgradedId)
                      "
                    >
                      v2
                    </button>
                  </div>
                </div>
                <span
                  :class="
                    buildingTypeColors[buildingData.building.type] ?? 'bg-slate-700 text-slate-300'
                  "
                  class="text-xs px-2 py-0.5 rounded font-medium"
                >
                  {{ buildingData.building.type }}
                </span>
              </div>
            </div>

            <!-- Stats row -->
            <div class="flex items-center gap-4 mb-4 text-sm">
              <span class="flex items-center gap-1 text-amber-400">
                <span>⚡</span> {{ buildingData.building.power ?? 0 }} W
              </span>
              <span class="flex items-center gap-1 text-red-400">
                <span>🔥</span> {{ buildingData.building.heat ?? 0 }}
              </span>
            </div>

            <!-- Unlocked by -->
            <div v-if="buildingData.unlock" class="mb-4">
              <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                Unlocked by
              </h3>
              <div class="text-sm text-[var(--text)]">
                {{ buildingData.unlock.corp }}
                <span class="text-[var(--muted)] ml-2">Level {{ buildingData.unlock.level }}</span>
              </div>
            </div>

            <!-- Construction cost (data-gated) -->
            <div v-if="buildingData.costs && buildingData.costs.length > 0" class="mb-4">
              <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                Construction cost
              </h3>
              <div class="space-y-1">
                <div
                  v-for="cost in buildingData.costs"
                  :key="cost.id"
                  class="flex items-center gap-2 text-sm"
                >
                  <button
                    class="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors"
                    @click="goItem(cost.id)"
                  >
                    <GameIcon
                      :id="cost.id"
                      kind="item"
                      :name="store.itemsById.get(cost.id)?.name ?? cost.id"
                      :size="16"
                    />
                    <span class="text-[var(--text)]">{{
                      store.itemsById.get(cost.id)?.name ?? cost.id
                    }}</span>
                  </button>
                  <span class="text-[var(--accent)] font-mono">×{{ cost.amount }}</span>
                </div>
              </div>
            </div>

            <!-- Recipes -->
            <div v-if="(buildingData.building.recipes?.length ?? 0) > 0">
              <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                Recipes
              </h3>
              <div class="space-y-3">
                <div
                  v-for="(recipe, i) in buildingData.building.recipes"
                  :key="recipe.output.id + '-' + i"
                  class="chamfer-sm [--cf-fill:var(--panel-2)] p-3"
                >
                  <!-- Output -->
                  <div class="flex items-center gap-1.5 mb-2">
                    <button
                      class="flex items-center gap-1.5 font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                      @click="goItem(recipe.output.id)"
                    >
                      <GameIcon
                        :id="recipe.output.id"
                        kind="item"
                        :name="store.itemsById.get(recipe.output.id)?.name ?? recipe.output.id"
                        :size="18"
                      />
                      {{ store.itemsById.get(recipe.output.id)?.name ?? recipe.output.id }}
                    </button>
                    <span class="text-[var(--muted)] text-xs ml-1"
                      >{{ fmt(recipe.output.amount_per_minute) }}/min</span
                    >
                  </div>
                  <!-- Inputs -->
                  <div v-if="recipe.inputs.length > 0" class="space-y-1">
                    <div
                      v-for="inp in recipe.inputs"
                      :key="inp.id"
                      class="flex items-center gap-1.5 text-xs text-[var(--muted)]"
                    >
                      <button
                        class="flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
                        @click="goItem(inp.id)"
                      >
                        <GameIcon
                          :id="inp.id"
                          kind="item"
                          :name="store.itemsById.get(inp.id)?.name ?? inp.id"
                          :size="14"
                        />
                        {{ store.itemsById.get(inp.id)?.name ?? inp.id }}
                      </button>
                      <span class="text-[var(--muted-2)]"
                        >{{ fmt(inp.amount_per_minute) }}/min</span
                      >
                    </div>
                  </div>
                  <div v-else class="text-xs text-[var(--muted-2)] italic">
                    No inputs (extractor)
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Fallback if data not found -->
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
