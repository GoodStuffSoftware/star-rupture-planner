<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import type { Item } from '../types/game'

const store = usePlannerStore()

const searchText = ref('')
const rateInput = ref(store.targetRate)
const showDropdown = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const dropdownEl = ref<HTMLElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})
const activeIndex = ref(0)

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

// Reset the keyboard-highlighted row whenever the filtered list changes.
watch(filteredItems, () => {
  activeIndex.value = 0
})

// One producing machine's output for the current target — used to step the rate.
const machineStep = computed(() => {
  if (!store.targetItemId) return 0
  return store.defaultRateForItem(store.targetItemId)
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
  activeIndex.value = 0
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

// --- Keyboard navigation for the dropdown ---
function scrollActiveIntoView() {
  nextTick(() => {
    const el = dropdownEl.value?.children[activeIndex.value] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function moveActive(delta: number) {
  if (!showDropdown.value) {
    openDropdown()
    return
  }
  const n = filteredItems.value.length
  if (n === 0) return
  activeIndex.value = Math.min(Math.max(activeIndex.value + delta, 0), n - 1)
  scrollActiveIntoView()
}

function onEnter() {
  const item = showDropdown.value ? filteredItems.value[activeIndex.value] : undefined
  if (item) selectItem(item)
}

function onEsc() {
  showDropdown.value = false
}

// --- Per-machine rate stepper ---
function stepRate(dir: number) {
  if (!store.targetItemId) return
  const step = machineStep.value || 1
  const next = Math.max(0, (Number(store.targetRate) || 0) + dir * step)
  // Round to avoid floating-point drift from repeated steps.
  store.setTarget(store.targetItemId, Math.round(next * 1000) / 1000)
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
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="showDropdown"
          class="bg-[var(--panel-2)] border border-[var(--border)] text-[var(--text)] text-sm pl-3 pr-8 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent hover:border-[var(--muted)] transition-colors placeholder:text-[var(--muted-2)]"
          @input="onSearchInput"
          @focus="onSearchFocus"
          @blur="onSearchBlur"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @keydown.enter.prevent="onEnter"
          @keydown.esc="onEsc"
        />
        <svg
          class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-2)] pointer-events-none"
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
          ref="dropdownEl"
          :style="dropdownStyle"
          class="fixed z-[100] bg-[var(--panel)] border border-[var(--border)] shadow-xl max-h-64 overflow-y-auto"
        >
          <button
            v-for="(item, index) in filteredItems"
            :key="item.id"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
            :class="
              index === activeIndex
                ? 'bg-[var(--accent-soft)] text-[var(--text)]'
                : item.id === store.targetItemId
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text)]'
            "
            @mousedown.prevent="selectItem(item)"
            @mouseenter="activeIndex = index"
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

    <!-- Rate input with per-machine stepper (± one machine's output) -->
    <div class="flex items-center gap-1.5">
      <div
        class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center p-px gap-px overflow-hidden"
      >
        <button
          type="button"
          :title="machineStep ? `−${machineStep}/min (one machine)` : 'decrease'"
          class="px-2 py-1.5 bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)] transition-colors text-base leading-none"
          @click="stepRate(-1)"
        >
          &minus;
        </button>
        <input
          v-model.number="rateInput"
          type="number"
          min="0"
          :step="machineStep || 'any'"
          class="bg-[var(--panel-2)] text-[var(--text)] text-sm px-2 py-1.5 w-20 focus:outline-none transition-colors text-right"
          @change="onRateChange"
        />
        <button
          type="button"
          :title="machineStep ? `+${machineStep}/min (one machine)` : 'increase'"
          class="px-2 py-1.5 bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)] transition-colors text-base leading-none"
          @click="stepRate(1)"
        >
          +
        </button>
      </div>
      <span class="text-[var(--muted)] text-sm font-medium">/min</span>
    </div>
  </div>
</template>
