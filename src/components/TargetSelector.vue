<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { itemTypeChipClass } from '../lib/itemTypeChip'
import { parseWholeRate, RATE_DEBOUNCE_MS } from '../lib/format'
import type { Item } from '../types/game'

const store = usePlannerStore()

const searchText = ref('')
const rateInput = ref(store.targetRate)
const showDropdown = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const dropdownEl = ref<HTMLElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})
const activeIndex = ref(0)

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

// While this field is focused and the user has typed, its draft is theirs: a debounced commit of
// their own typing must not rewrite it under the cursor. Changes from elsewhere (the root number,
// a stepper, another tab) show up unless they are mid-edit.
let rateFocused = false
let rateDirty = false
let rateFocusRate = 0 // the rate when the field got focus: what Escape restores
let rateTimer: ReturnType<typeof setTimeout> | null = null

function clearRateTimer() {
  if (rateTimer !== null) clearTimeout(rateTimer)
  rateTimer = null
}

watch(
  () => store.targetRate,
  (newRate) => {
    if (rateFocused && rateDirty) return
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

// Clear the search text and keep focus so the user can type a fresh query.
// Use mousedown.prevent on the button so the input's blur handler doesn't fire first.
function clearSearch() {
  searchText.value = ''
  activeIndex.value = 0
  showDropdown.value = true
  nextTick(() => {
    inputRef.value?.focus()
    updateDropdownPos()
  })
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
  clearRateTimer()
  rateDirty = false
  store.stepTargetRate(dir)
}

onMounted(() => {
  window.addEventListener('scroll', updateDropdownPos, true)
  window.addEventListener('resize', updateDropdownPos)
})

onBeforeUnmount(() => {
  clearRateTimer()
  window.removeEventListener('scroll', updateDropdownPos, true)
  window.removeEventListener('resize', updateDropdownPos)
})

function onRateFocus() {
  rateFocused = true
  rateDirty = false
  rateFocusRate = store.targetRate
}

// Typing commits a valid value once the user pauses; an empty or half-typed draft commits nothing
// (it is settled on blur/Enter).
function onRateInput() {
  rateDirty = true
  clearRateTimer()
  rateTimer = setTimeout(() => {
    rateTimer = null
    const rate = parseWholeRate(rateInput.value)
    if (rate !== null && store.targetItemId && rate !== store.targetRate) {
      store.setTarget(store.targetItemId, rate)
    }
  }, RATE_DEBOUNCE_MS)
}

// The target is a whole number of items/min: round the typed value; empty, non-numeric or
// rounding below 1 puts the current rate back. Fires on Enter and blur, after typing.
function onRateChange() {
  clearRateTimer()
  if (!rateDirty) return
  rateDirty = false
  const rate = parseWholeRate(rateInput.value)
  if (rate !== null && store.targetItemId) {
    store.setTarget(store.targetItemId, rate)
    rateInput.value = rate
  } else {
    rateInput.value = store.targetRate
  }
}

function onRateBlur() {
  clearRateTimer()
  // `change` already settled a typed draft; this settles one that never fired it (and reverts
  // an empty or invalid draft).
  onRateChange()
  rateFocused = false
  rateDirty = false
  rateInput.value = store.targetRate
}

// Escape: back to the rate the field had on focus, undoing debounced commits made during this edit.
function onRateEscape(e: KeyboardEvent) {
  e.stopPropagation() // don't also close the detail drawer
  clearRateTimer()
  rateDirty = false
  if (store.targetItemId && store.targetRate !== rateFocusRate) {
    store.setTarget(store.targetItemId, rateFocusRate, true) // a value the store already held
  }
  rateInput.value = rateFocusRate
  ;(e.target as HTMLInputElement).blur()
}

function onRateEnter(e: KeyboardEvent) {
  ;(e.target as HTMLInputElement).blur()
}
</script>

<template>
  <div class="flex items-center gap-1.5 md:gap-2.5 lg:gap-3 flex-wrap">
    <!-- Item search -->
    <div class="relative shrink-0">
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
          class="bg-[var(--panel-2)] border border-[var(--border)] text-[var(--text)] text-xs sm:text-sm pl-2.5 sm:pl-3 pr-11 sm:pr-13 py-1 sm:py-1.5 w-32 min-[720px]:w-40 sm:w-44 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent hover:border-[var(--muted)] transition-colors placeholder:text-[var(--muted-2)]"
          @input="onSearchInput"
          @focus="onSearchFocus"
          @blur="onSearchBlur"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @keydown.enter.prevent="onEnter"
          @keydown.esc="onEsc"
        />
        <button
          v-if="searchText"
          type="button"
          aria-label="Clear search"
          title="Clear search"
          class="absolute right-6 sm:right-7 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-2)] hover:text-[var(--text)] transition-colors"
          @mousedown.prevent="clearSearch"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
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
              :class="itemTypeChipClass(item.type)"
              class="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
            >
              {{ item.type }}
            </span>
          </button>
        </div>
      </Teleport>
    </div>

    <!-- Rate input with per-machine stepper (± one machine's output) -->
    <div class="flex items-center gap-1 sm:gap-1.5 shrink-0">
      <div
        class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center p-px gap-px overflow-hidden"
      >
        <button
          type="button"
          :title="machineStep ? `−${machineStep}/min (one machine)` : 'decrease'"
          class="px-1.5 sm:px-2 py-1 sm:py-1.5 bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)] transition-colors text-xs sm:text-base leading-none"
          @click="stepRate(-1)"
        >
          &minus;
        </button>
        <input
          v-model.number="rateInput"
          type="number"
          inputmode="numeric"
          min="1"
          step="1"
          class="bg-[var(--panel-2)] text-[var(--text)] text-xs sm:text-sm px-0.5 sm:px-1 py-1 sm:py-1.5 w-10 sm:w-12 focus:outline-none transition-colors text-right"
          @focus="onRateFocus"
          @input="onRateInput"
          @change="onRateChange"
          @blur="onRateBlur"
          @keydown.enter="onRateEnter"
          @keydown.esc="onRateEscape"
        />
        <button
          type="button"
          :title="machineStep ? `+${machineStep}/min (one machine)` : 'increase'"
          class="px-1.5 sm:px-2 py-1 sm:py-1.5 bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)] transition-colors text-xs sm:text-base leading-none"
          @click="stepRate(1)"
        >
          +
        </button>
      </div>
      <span class="text-[var(--muted)] text-xs sm:text-sm font-medium">/min</span>
      <!-- Trailing slot (e.g. the add-recipe button) — stays on the rate line -->
      <slot />
    </div>
  </div>
</template>
