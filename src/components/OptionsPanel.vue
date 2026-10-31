<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import GameIcon from './GameIcon.vue'
import ChamferToggle from './ChamferToggle.vue'
import SegmentedControl from './SegmentedControl.vue'
import {
  RATE_DEBOUNCE_MS,
  MAX_DEFAULT_MACHINES,
  MAX_DEFAULT_PER_MIN,
  isDefaultTargetUntouched,
  parseWholeRate,
  type DefaultTargetMode,
} from '../lib/format'

const store = usePlannerStore()

// Tree text-size presets (zoom factor + label). 100% is the current default.
const fontScales = [
  { value: 0.75, label: '75%' },
  { value: 0.85, label: '85%' },
  { value: 1, label: '100%' },
  { value: 1.15, label: '115%' },
]

// Option toggles backed by SegmentedControl.
const themeOptions = [
  { value: 'starrupture', label: 'Star Rupture' },
  { value: 'spaceage', label: 'Space Age' },
]
const totalsOptions = [
  { value: 'side', label: 'Side' },
  { value: 'bottom', label: 'Bottom' },
]

const defaultTargetOptions = [
  { value: 'machines', label: 'Machines' },
  { value: 'perMin', label: 'Items/min' },
]

// Default for new targets: one numeric field for the active mode, committed after a pause,
// on Enter or blur, and by the -/+ buttons. The field follows the store (another tab,
// a mode switch) unless it is being typed in.
const dtMode = computed(() => store.defaultTarget.mode)
const dtValue = computed(() =>
  dtMode.value === 'machines' ? store.defaultTarget.machines : store.defaultTarget.perMin,
)
const dtMax = computed(() =>
  dtMode.value === 'machines' ? MAX_DEFAULT_MACHINES : MAX_DEFAULT_PER_MIN,
)
const dtInput = ref(String(dtValue.value))
const dtEditing = ref(false)
let dtTimer: ReturnType<typeof setTimeout> | null = null

watch(dtValue, (v) => {
  if (!dtEditing.value) dtInput.value = String(v)
})
watch(dtMode, () => {
  dtEditing.value = false
  dtInput.value = String(dtValue.value)
})

function setDtMode(mode: DefaultTargetMode) {
  store.setDefaultTarget({ mode })
}

function saveDt(n: number) {
  store.setDefaultTarget(dtMode.value === 'machines' ? { machines: n } : { perMin: n })
}

function commitDt() {
  if (dtTimer !== null) clearTimeout(dtTimer)
  dtTimer = null
  const n = parseWholeRate(dtInput.value)
  if (n !== null) saveDt(n)
  // Show what was kept (rounded, clamped), or put the old value back when it was unusable.
  dtInput.value = String(dtValue.value)
}

function onDtInput() {
  dtEditing.value = true
  if (dtTimer !== null) clearTimeout(dtTimer)
  dtTimer = setTimeout(() => {
    const n = parseWholeRate(dtInput.value)
    if (n !== null) saveDt(n)
  }, RATE_DEBOUNCE_MS)
}

function onDtBlur() {
  dtEditing.value = false
  commitDt()
}

function stepDt(dir: number) {
  if (dtTimer !== null) clearTimeout(dtTimer)
  dtTimer = null
  saveDt(Math.min(dtMax.value, Math.max(1, dtValue.value + dir)))
  dtInput.value = String(dtValue.value)
}

onBeforeUnmount(() => {
  if (dtTimer !== null) clearTimeout(dtTimer)
})

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

  // Default for new targets (only when changed from one machine)
  if (!isDefaultTargetUntouched(store.defaultTarget)) {
    const d = store.defaultTarget
    chips.push(
      d.mode === 'perMin'
        ? `New: ${d.perMin}/min`
        : `New: ${d.machines} machine${d.machines > 1 ? 's' : ''}`,
    )
  }

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
      class="w-full flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-3 text-left hover:bg-[var(--panel-2)] transition-colors"
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
      <span class="text-sm font-semibold text-[var(--text)] uppercase tracking-wider shrink-0 mr-1">
        Options
      </span>

      <!-- Summary chips (collapsed only) — flow inline after the title, wrapping
           onto extra lines only when the row is full. -->
      <template v-if="store.optionsCollapsed">
        <span
          v-if="summaryChips.length === 0"
          class="text-xs px-2 py-0.5 rounded bg-[var(--panel-2)] text-[var(--muted-2)] font-medium border border-[var(--border)] shrink-0"
        >
          All defaults
        </span>
        <span
          v-for="chip in summaryChips"
          :key="chip"
          class="text-xs px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] font-medium border border-[var(--accent-soft-border)] shrink-0"
        >
          {{ chip }}
        </span>
      </template>
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

        <div
          v-else
          class="relative grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 md:[&>*:nth-child(even)]:pl-8 md:before:absolute md:before:left-1/2 md:before:top-0 md:before:bottom-0 md:before:w-px md:before:bg-[var(--border)]"
        >
          <div
            v-for="chain in store.productionChains"
            :key="chain.baseId"
            class="flex items-center justify-between gap-3"
          >
            <!-- Building icon (swaps to the v2 building) + name + a 'v2' tag when active -->
            <button
              class="flex items-center gap-2 min-w-0 hover:text-[var(--accent)] transition-colors cursor-pointer text-left"
              :title="`View ${buildingName(selectedBuildingId(chain))} recipes`"
              @click="store.openBuildingDetail(selectedBuildingId(chain))"
            >
              <GameIcon
                :id="selectedBuildingId(chain)"
                kind="building"
                :name="buildingName(selectedBuildingId(chain))"
                :size="38"
              />
              <span class="flex items-center gap-1.5 min-w-0">
                <span class="text-base text-inherit truncate">{{
                  buildingName(chain.baseId)
                }}</span>
                <span
                  v-if="store.tier[chain.baseId] === 'v2'"
                  class="text-xs font-bold text-[var(--accent-2)] shrink-0"
                >
                  v2
                </span>
              </span>
            </button>

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
        <div
          class="relative grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 md:[&>*:nth-child(even)]:pl-8 md:before:absolute md:before:left-1/2 md:before:top-0 md:before:bottom-0 md:before:w-px md:before:bg-[var(--border)]"
        >
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

          <!-- Show overages toggle -->
          <label class="flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <span class="text-base text-[var(--text)]">Show overages</span>
              <span class="block text-xs text-[var(--muted-2)]">Round up to whole machines</span>
            </div>
            <ChamferToggle
              :checked="store.showOverages"
              @toggle="store.setShowOverages(!store.showOverages)"
            />
          </label>

          <!-- Theme -->
          <div class="flex items-center justify-between gap-3">
            <span class="text-base text-[var(--text)]">Theme</span>
            <SegmentedControl
              :options="themeOptions"
              :model-value="store.theme"
              @update:model-value="store.setTheme($event as 'starrupture' | 'spaceage')"
            />
          </div>

          <!-- Tree text size -->
          <div class="flex items-center justify-between gap-3">
            <span class="text-base text-[var(--text)]">Text size</span>
            <SegmentedControl
              :options="fontScales"
              :model-value="store.treeFontScale"
              @update:model-value="store.setTreeFontScale($event as number)"
            />
          </div>

          <!-- Totals placement -->
          <div class="flex items-center justify-between gap-3">
            <span class="text-base text-[var(--text)]">Totals position</span>
            <SegmentedControl
              :options="totalsOptions"
              :model-value="store.totalsPlacement"
              @update:model-value="store.setTotalsPlacement($event as 'side' | 'bottom')"
            />
          </div>

          <!-- Default for new targets -->
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="text-base text-[var(--text)]">Default for new targets</span>
              <span class="block text-xs text-[var(--muted-2)]">
                Where a target starts when added without a rate
              </span>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
              <SegmentedControl
                :options="defaultTargetOptions"
                :model-value="dtMode"
                @update:model-value="setDtMode($event as DefaultTargetMode)"
              />
              <div class="flex items-center gap-1.5">
                <div
                  class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center p-px gap-px overflow-hidden"
                >
                  <button
                    type="button"
                    :title="dtMode === 'machines' ? 'One machine fewer' : '1/min less'"
                    aria-label="Decrease default"
                    class="px-2 py-1 bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)] transition-colors text-base leading-none"
                    @click="stepDt(-1)"
                  >
                    &minus;
                  </button>
                  <input
                    v-model="dtInput"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    :max="dtMax"
                    step="1"
                    aria-label="Default for new targets"
                    data-testid="default-target-input"
                    class="bg-[var(--panel-2)] text-[var(--text)] text-sm px-1 py-1 w-14 focus:outline-none text-right"
                    @focus="dtEditing = true"
                    @input="onDtInput"
                    @change="commitDt"
                    @blur="onDtBlur"
                    @keydown.enter="commitDt"
                  />
                  <button
                    type="button"
                    :title="dtMode === 'machines' ? 'One machine more' : '1/min more'"
                    aria-label="Increase default"
                    class="px-2 py-1 bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)] transition-colors text-base leading-none"
                    @click="stepDt(1)"
                  >
                    +
                  </button>
                </div>
                <span class="text-[var(--muted)] text-sm font-medium w-14 text-left">{{
                  dtMode === 'machines' ? (dtValue === 1 ? 'machine' : 'machines') : '/min'
                }}</span>
              </div>
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
