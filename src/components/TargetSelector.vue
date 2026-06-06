<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import type { Item } from '../types/game'

const store = usePlannerStore()

const searchText = ref('')
const rateInput = ref(store.targetRate)
const showDropdown = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})

// Color mapping for item types
const typeColors: Record<string, string> = {
  raw: 'bg-amber-900/60 text-amber-300',
  processed: 'bg-blue-900/60 text-blue-300',
  component: 'bg-emerald-900/60 text-emerald-300',
  material: 'bg-purple-900/60 text-purple-300',
  ammo: 'bg-red-900/60 text-red-300',
}

// Sync search text when store's targetItemId changes externally
watch(
  () => store.targetItemId,
  (newId) => {
    if (newId) {
      const item = store.itemsById.get(newId)
      if (item) {
        searchText.value = item.name
      }
    }
  },
  { immediate: true },
)

watch(
  () => store.targetRate,
  (newRate) => {
    rateInput.value = newRate
  },
)

const filteredItems = computed<Item[]>(() => {
  const q = searchText.value.toLowerCase().trim()
  if (!q) return store.items.slice(0, 50)
  return store.items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 50)
})

function selectItem(item: Item) {
  searchText.value = item.name
  showDropdown.value = false
  // Defaults the rate to one producing building's output.
  store.selectTargetItem(item.id)
}

// The dropdown is teleported to <body> so the header's clip-path can't clip it;
// position it under the input using viewport (fixed) coordinates.
function updateDropdownPos() {
  const el = inputRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  dropdownStyle.value = {
    top: `${r.bottom + 4}px`,
    left: `${r.left}px`,
    width: `${Math.max(r.width, 288)}px`,
  }
}

function openDropdown() {
  showDropdown.value = true
  nextTick(updateDropdownPos)
}

function onSearchInput() {
  openDropdown()
}

function onSearchFocus() {
  openDropdown()
}

function onSearchBlur() {
  // Delay to allow click on dropdown item
  setTimeout(() => {
    showDropdown.value = false
  }, 150)
}

onMounted(() => {
  window.addEventListener('scroll', updateDropdownPos, true)
  window.addEventListener('resize', updateDropdownPos)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateDropdownPos, true)
  window.removeEventListener('resize', updateDropdownPos)
})

function onRateChange() {
  const rate = Number(rateInput.value)
  if (rate >= 0 && store.targetItemId) {
    store.setTarget(store.targetItemId, rate)
  }
}
</script>

<template>
  <div class="flex items-center gap-3 flex-wrap">
    <!-- Item search -->
    <div class="relative">
      <label class="sr-only" for="item-search">Search item</label>
      <div class="relative">
        <input
          id="item-search"
          ref="inputRef"
          v-model="searchText"
          type="text"
          placeholder="Search item…"
          autocomplete="off"
          @input="onSearchInput"
          @focus="onSearchFocus"
          @blur="onSearchBlur"
          class="bg-[#24201b] border border-[#34302a] text-[#f3f1ee] text-sm pl-3 pr-8 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-[#ee8b22] focus:border-transparent hover:border-[#a8a29a] transition-colors placeholder:text-[#736d64]"
        />
        <svg
          class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <!-- Dropdown — teleported to <body> so the header's clip-path can't clip it -->
      <Teleport to="body">
        <div
          v-if="showDropdown && filteredItems.length > 0"
          :style="dropdownStyle"
          class="fixed z-[100] bg-[#1a1714] border border-[#34302a] shadow-xl max-h-64 overflow-y-auto"
        >
          <button
            v-for="item in filteredItems"
            :key="item.id"
            @mousedown.prevent="selectItem(item)"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[#24201b] transition-colors"
            :class="item.id === store.targetItemId ? 'bg-[#24201b] text-[#ee8b22]' : 'text-[#f3f1ee]'"
          >
            <span class="flex-1 truncate">{{ item.name }}</span>
            <span
              :class="typeColors[item.type] ?? 'bg-slate-700 text-slate-300'"
              class="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
            >
              {{ item.type }}
            </span>
          </button>
        </div>
      </Teleport>
    </div>

    <!-- Rate input -->
    <div class="flex items-center gap-1.5">
      <input
        v-model.number="rateInput"
        type="number"
        min="0"
        step="any"
        @change="onRateChange"
        class="bg-[#24201b] border border-[#34302a] text-[#f3f1ee] text-sm px-3 py-1.5 w-24 focus:outline-none focus:ring-2 focus:ring-[#ee8b22] focus:border-transparent hover:border-[#a8a29a] transition-colors text-right"
      />
      <span class="text-[#a8a29a] text-sm font-medium">/min</span>
    </div>
  </div>
</template>
