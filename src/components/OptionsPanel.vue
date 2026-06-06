<script setup lang="ts">
import { computed } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import GameIcon from './GameIcon.vue'

const store = usePlannerStore()

function buildingName(id: string): string {
  return store.buildingsById.get(id)?.name ?? id
}

function setAll(value: 'v1' | 'v2') {
  for (const chain of store.productionChains) {
    store.setTier(chain.baseId, value)
  }
}

// Summary chips for collapsed view
const summaryChips = computed<string[]>(() => {
  const chips: string[] = []

  // v2 buildings
  for (const chain of store.productionChains) {
    if (store.tier[chain.baseId] === 'v2') {
      chips.push(`${buildingName(chain.baseId)} v2`)
    }
  }

  // Extractors shown
  if (store.showExtractors) chips.push('Extractors')

  // Icons off
  if (!store.showIcons) chips.push('Icons off')

  // Override count
  const overrideCount = Object.keys(store.overrides ?? {}).length
  if (overrideCount > 0) chips.push(`${overrideCount} override${overrideCount > 1 ? 's' : ''}`)

  return chips
})

const overrideCount = computed(() => Object.keys(store.overrides ?? {}).length)
const hasOverrides = computed(() => overrideCount.value > 0)

// For each production chain, determine the building id for the currently-selected tier
function selectedBuildingId(chain: { baseId: string; upgradedId: string }): string {
  return store.tier[chain.baseId] === 'v2' ? chain.upgradedId : chain.baseId
}
</script>

<template>
  <div class="bg-[#1a1714] border border-[#34302a] clip-chamfer">
    <!-- Header row (always visible) -->
    <button
      class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#24201b] transition-colors"
      :class="store.optionsCollapsed ? '' : 'border-b border-[#34302a]'"
      @click="store.toggleOptions()"
    >
      <!-- Caret -->
      <svg
        :class="store.optionsCollapsed ? '' : 'rotate-90'"
        class="w-4 h-4 text-[#a8a29a] shrink-0 transition-transform"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fill-rule="evenodd"
          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
          clip-rule="evenodd"
        />
      </svg>

      <!-- Title -->
      <span class="text-sm font-semibold text-[#f3f1ee] uppercase tracking-wider shrink-0">
        Options
      </span>

      <!-- Summary chips (collapsed only) -->
      <div v-if="store.optionsCollapsed" class="flex flex-wrap gap-1.5 ml-1">
        <span
          v-if="summaryChips.length === 0"
          class="text-xs px-2 py-0.5 rounded bg-[#24201b] text-[#736d64] font-medium border border-[#34302a]"
        >
          All defaults
        </span>
        <span
          v-for="chip in summaryChips"
          :key="chip"
          class="text-xs px-2 py-0.5 rounded bg-[#ee8b22]/20 text-[#ee8b22] font-medium border border-[#ee8b22]/30"
        >
          {{ chip }}
        </span>
      </div>
    </button>

    <!-- Expanded body -->
    <div v-if="!store.optionsCollapsed" class="px-4 py-3 space-y-5">

      <!-- Building versions subsection -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-xs font-semibold text-[#a8a29a] uppercase tracking-wider">
            Building versions
          </h4>
          <div class="flex gap-1">
            <button
              @click="setAll('v1')"
              class="clip-chamfer-sm text-xs px-2.5 py-1 bg-[#24201b] hover:bg-[#34302a] text-[#a8a29a] hover:text-[#f3f1ee] transition-colors border border-[#34302a]"
            >
              All v1
            </button>
            <button
              @click="setAll('v2')"
              class="clip-chamfer-sm text-xs px-2.5 py-1 bg-[#24201b] hover:bg-[#34302a] text-[#a8a29a] hover:text-[#f3f1ee] transition-colors border border-[#34302a]"
            >
              All v2
            </button>
          </div>
        </div>

        <div v-if="store.productionChains.length === 0" class="text-[#736d64] text-sm italic">
          No upgradeable buildings
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="chain in store.productionChains"
            :key="chain.baseId"
            class="flex items-center justify-between gap-3"
          >
            <!-- Building icon + name -->
            <div class="flex items-center gap-2 min-w-0">
              <GameIcon
                kind="building"
                :id="selectedBuildingId(chain)"
                :name="buildingName(selectedBuildingId(chain))"
                :size="22"
              />
              <div class="min-w-0">
                <span class="text-base text-[#f3f1ee] truncate block">
                  {{ buildingName(chain.baseId) }}
                </span>
                <span
                  v-if="store.tier[chain.baseId] === 'v2'"
                  class="text-xs text-[#22d3ee] truncate block"
                >
                  {{ buildingName(chain.upgradedId) }}
                </span>
              </div>
            </div>

            <!-- v1/v2 segmented toggle -->
            <div
              class="flex shrink-0 border border-[#34302a] overflow-hidden text-xs font-medium"
            >
              <button
                @click="store.setTier(chain.baseId, 'v1')"
                :class="
                  store.tier[chain.baseId] !== 'v2'
                    ? 'bg-[#ee8b22] text-black'
                    : 'bg-[#24201b] text-[#a8a29a] hover:bg-[#34302a] hover:text-[#f3f1ee]'
                "
                class="px-2.5 py-1 transition-colors"
              >
                v1
              </button>
              <button
                @click="store.setTier(chain.baseId, 'v2')"
                :class="
                  store.tier[chain.baseId] === 'v2'
                    ? 'bg-[#ee8b22] text-black'
                    : 'bg-[#24201b] text-[#a8a29a] hover:bg-[#34302a] hover:text-[#f3f1ee]'
                "
                class="px-2.5 py-1 transition-colors border-l border-[#34302a]"
              >
                v2
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-[#34302a]" />

      <!-- Display subsection -->
      <div>
        <h4 class="text-xs font-semibold text-[#a8a29a] uppercase tracking-wider mb-3">
          Display
        </h4>
        <div class="space-y-3">
          <!-- Show extractors toggle -->
          <label class="flex items-center justify-between gap-3 cursor-pointer">
            <span class="text-base text-[#f3f1ee]">Show extractors</span>
            <button
              role="switch"
              :aria-checked="store.showExtractors"
              @click="store.setShowExtractors(!store.showExtractors)"
              class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none"
              :class="store.showExtractors ? 'bg-[#ee8b22]' : 'bg-[#34302a]'"
            >
              <span
                class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform"
                :class="store.showExtractors ? 'translate-x-4' : 'translate-x-0'"
              />
            </button>
          </label>

          <!-- Show machine icons toggle -->
          <label class="flex items-center justify-between gap-3 cursor-pointer">
            <span class="text-base text-[#f3f1ee]">Show machine icons</span>
            <button
              role="switch"
              :aria-checked="store.showIcons"
              @click="store.setShowIcons(!store.showIcons)"
              class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none"
              :class="store.showIcons ? 'bg-[#ee8b22]' : 'bg-[#34302a]'"
            >
              <span
                class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform"
                :class="store.showIcons ? 'translate-x-4' : 'translate-x-0'"
              />
            </button>
          </label>

          <!-- Reset overrides button (only when overrides exist) -->
          <div v-if="hasOverrides" class="pt-1">
            <button
              @click="store.clearOverrides()"
              class="clip-chamfer-sm text-xs px-3 py-1.5 bg-[#24201b] hover:bg-red-900/40 text-[#a8a29a] hover:text-red-300 border border-[#34302a] hover:border-red-700/50 transition-colors"
            >
              Reset node overrides ({{ overrideCount }})
            </button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
