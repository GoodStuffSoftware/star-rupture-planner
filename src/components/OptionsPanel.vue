<script setup lang="ts">
import { computed } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import GameIcon from './GameIcon.vue'
import ChamferToggle from './ChamferToggle.vue'

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
  <div class="chamfer">
    <!-- Header row (always visible) -->
    <button
      class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--panel-2)] transition-colors"
      :class="store.optionsCollapsed ? '' : 'border-b border-[var(--border)]'"
      @click="store.toggleOptions()"
    >
      <!-- Caret -->
      <svg
        :class="store.optionsCollapsed ? '' : 'rotate-90'"
        class="w-4 h-4 text-[var(--muted)] shrink-0 transition-transform"
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
      <span class="text-sm font-semibold text-[var(--text)] uppercase tracking-wider shrink-0">
        Options
      </span>

      <!-- Summary chips (collapsed only) -->
      <div v-if="store.optionsCollapsed" class="flex flex-wrap gap-1.5 ml-1">
        <span
          v-if="summaryChips.length === 0"
          class="text-xs px-2 py-0.5 rounded bg-[var(--panel-2)] text-[var(--muted-2)] font-medium border border-[var(--border)]"
        >
          All defaults
        </span>
        <span
          v-for="chip in summaryChips"
          :key="chip"
          class="text-xs px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] font-medium border border-[var(--accent-soft-border)]"
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
          <h4 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
            Building versions
          </h4>
          <div class="flex gap-1">
            <button
              class="chamfer-sm [--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] text-xs px-2.5 py-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              @click="setAll('v1')"
            >
              All v1
            </button>
            <button
              class="chamfer-sm [--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] text-xs px-2.5 py-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              @click="setAll('v2')"
            >
              All v2
            </button>
          </div>
        </div>

        <div
          v-if="store.productionChains.length === 0"
          class="text-[var(--muted-2)] text-sm italic"
        >
          No upgradeable buildings
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="chain in store.productionChains"
            :key="chain.baseId"
            class="flex items-center justify-between gap-3"
          >
            <!-- Building icon (swaps to the v2 building) + name + a 'v2' tag when active -->
            <div class="flex items-center gap-2 min-w-0">
              <GameIcon
                :id="selectedBuildingId(chain)"
                kind="building"
                :name="buildingName(selectedBuildingId(chain))"
                :size="38"
              />
              <span class="flex items-center gap-1.5 min-w-0">
                <span class="text-base text-[var(--text)] truncate">{{
                  buildingName(chain.baseId)
                }}</span>
                <span
                  v-if="store.tier[chain.baseId] === 'v2'"
                  class="text-xs font-bold text-[var(--accent-2)] shrink-0"
                >
                  v2
                </span>
              </span>
            </div>

            <!-- v1/v2 segmented toggle (mimics the tree's version picker) -->
            <div
              class="chamfer-sm [--cf-fill:var(--panel-2)] flex shrink-0 p-px gap-px overflow-hidden text-xs font-medium"
            >
              <button
                :class="
                  store.tier[chain.baseId] !== 'v2'
                    ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                    : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
                "
                class="px-2.5 py-1 transition-colors"
                @click="store.setTier(chain.baseId, 'v1')"
              >
                v1
              </button>
              <button
                :class="
                  store.tier[chain.baseId] === 'v2'
                    ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                    : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
                "
                class="px-2.5 py-1 transition-colors"
                @click="store.setTier(chain.baseId, 'v2')"
              >
                v2
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-[var(--border)]" />

      <!-- Display subsection -->
      <div>
        <h4 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
          Display
        </h4>
        <div class="space-y-3">
          <!-- Show extractors toggle -->
          <label class="flex items-center justify-between gap-3 cursor-pointer">
            <span class="text-base text-[var(--text)]">Show extractors</span>
            <ChamferToggle
              :checked="store.showExtractors"
              @toggle="store.setShowExtractors(!store.showExtractors)"
            />
          </label>

          <!-- Show machine icons toggle -->
          <label class="flex items-center justify-between gap-3 cursor-pointer">
            <span class="text-base text-[var(--text)]">Show icons</span>
            <ChamferToggle
              :checked="store.showIcons"
              @toggle="store.setShowIcons(!store.showIcons)"
            />
          </label>

          <!-- Underline rows toggle -->
          <label class="flex items-center justify-between gap-3 cursor-pointer">
            <span class="text-base text-[var(--text)]">Underline rows</span>
            <ChamferToggle
              :checked="store.showRowDividers"
              @toggle="store.setShowRowDividers(!store.showRowDividers)"
            />
          </label>

          <!-- Theme segmented control -->
          <div class="flex items-center justify-between gap-3">
            <span class="text-base text-[var(--text)]">Theme</span>
            <div
              class="chamfer-sm [--cf-fill:var(--panel-2)] flex shrink-0 p-px gap-px overflow-hidden text-xs font-medium"
            >
              <button
                :class="
                  store.theme !== 'spaceage'
                    ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                    : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
                "
                class="px-2.5 py-1 transition-colors"
                @click="store.setTheme('starrupture')"
              >
                Star Rupture
              </button>
              <button
                :class="
                  store.theme === 'spaceage'
                    ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                    : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
                "
                class="px-2.5 py-1 transition-colors"
                @click="store.setTheme('spaceage')"
              >
                Space Age
              </button>
            </div>
          </div>

          <!-- Reset overrides button (only when overrides exist) -->
          <div v-if="hasOverrides" class="pt-1">
            <button
              class="chamfer-sm [--cf-fill:var(--panel-2)] text-xs px-3 py-1.5 text-[var(--muted)] hover:text-red-300 transition-colors"
              @click="store.clearOverrides()"
            >
              Reset node overrides ({{ overrideCount }})
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
