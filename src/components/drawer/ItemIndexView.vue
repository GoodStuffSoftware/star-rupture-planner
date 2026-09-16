<script setup lang="ts">
import type { Item, Building } from '../../types/game'
import { itemTypeChipClass } from '../../lib/itemTypeChip'
import GameIcon from '../GameIcon.vue'

defineProps<{
  indexSearch: string
  isSearching: boolean
  searchResults: { items: Item[]; buildings: Building[] }
  allExpanded: boolean
  categorizedItems: Array<{ type: string; label: string; items: Item[] }>
  categorizedBuildings: Array<{ type: string; label: string; buildings: Building[] }>
  expandedItemCats: Array<{ type: string; label: string; items: Item[] }>
  expandedBldCats: Array<{ type: string; label: string; buildings: Building[] }>
  buildingTypeColors: Record<string, string>
  isSectionOpen: (key: string) => boolean
}>()

const emit = defineEmits<{
  (e: 'update:indexSearch', val: string): void
  (e: 'goItem', id: string): void
  (e: 'goBuilding', id: string): void
  (e: 'toggleSection', key: string): void
  (e: 'expandAll'): void
  (e: 'collapseAll'): void
}>()
</script>

<template>
  <div class="item-index-view">
    <!-- Search bar -->
    <div class="mb-4">
      <input
        :value="indexSearch"
        type="text"
        placeholder="Search items and buildings..."
        class="w-full bg-[var(--panel-2)] text-[var(--text)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
        @input="emit('update:indexSearch', ($event.target as HTMLInputElement).value)"
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
            @click="emit('goItem', item.id)"
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
            @click="emit('goBuilding', b.id)"
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
          class="text-xs font-semibold text-[var(--muted)] hover:text-[var(--accent)] transition-colors uppercase tracking-wider"
          @click="allExpanded ? emit('collapseAll') : emit('expandAll')"
        >
          {{ allExpanded ? '▸ Collapse all' : '▾ Expand all' }}
        </button>
      </div>

      <!-- ── Items ── -->
      <h2 class="text-xs font-bold text-[var(--muted)] uppercase tracking-widest mb-3">Items</h2>
      <div class="flex flex-wrap gap-2 mb-2">
        <template v-for="cat in categorizedItems" :key="'item-' + cat.type">
          <!-- Collapsed: just the chip (forms columns) -->
          <button
            v-if="!isSectionOpen('item-' + cat.type)"
            class="flex items-center gap-1.5 py-1 px-1 cursor-pointer"
            @click="emit('toggleSection', 'item-' + cat.type)"
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
              class="px-1.5 py-0.5 rounded text-xs font-medium"
              >{{ cat.label }}</span
            >
            <span class="text-[var(--muted-2)] text-xs font-mono">{{ cat.items.length }}</span>
          </button>
        </template>
      </div>
      <!-- Expanded item sections — ordered by most recently expanded -->
      <template v-for="cat in expandedItemCats" :key="'item-exp-' + cat.type">
        <div class="mb-4">
          <button
            class="w-full flex items-center gap-2 py-1.5 cursor-pointer"
            @click="emit('toggleSection', 'item-' + cat.type)"
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
              class="px-1.5 py-0.5 rounded text-xs font-medium"
              >{{ cat.label }}</span
            >
            <span class="text-[var(--muted-2)] text-xs font-mono">{{ cat.items.length }}</span>
          </button>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-2">
            <button
              v-for="item in cat.items"
              :key="item.id"
              class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center gap-2 px-2.5 py-2 text-sm text-[var(--text)] hover:[--cf-border:var(--accent)] hover:text-[var(--accent)] transition-colors text-left"
              @click="emit('goItem', item.id)"
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
            @click="emit('toggleSection', 'bld-' + cat.type)"
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
              class="px-1.5 py-0.5 rounded text-xs font-medium"
              >{{ cat.label }}</span
            >
            <span class="text-[var(--muted-2)] text-xs font-mono">{{ cat.buildings.length }}</span>
          </button>
        </template>
      </div>
      <!-- Expanded building sections — ordered by most recently expanded -->
      <template v-for="cat in expandedBldCats" :key="'bld-exp-' + cat.type">
        <div class="mb-4">
          <button
            class="w-full flex items-center gap-2 py-1.5 cursor-pointer"
            @click="emit('toggleSection', 'bld-' + cat.type)"
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
              class="px-1.5 py-0.5 rounded text-xs font-medium"
              >{{ cat.label }}</span
            >
            <span class="text-[var(--muted-2)] text-xs font-mono">{{ cat.buildings.length }}</span>
          </button>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
            <button
              v-for="b in cat.buildings"
              :key="b.id"
              class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center gap-2 px-2.5 py-2 text-sm text-[var(--text)] hover:[--cf-border:var(--accent)] hover:text-[var(--accent)] transition-colors text-left"
              @click="emit('goBuilding', b.id)"
            >
              <GameIcon :id="b.id" kind="building" :name="b.name" :size="20" />
              <span class="truncate">{{ b.name }}</span>
            </button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
