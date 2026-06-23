<script setup lang="ts">
// Recursive crafting-tree node: item + producer + per-node version picker.
import { ref, watch, computed } from 'vue'
import type { CraftNode } from '../types/game'
import { fmt, fmtBuildings } from '../lib/format'
import { usePlannerStore } from '../stores/plannerStore'
import GameIcon from './GameIcon.vue'

const props = defineProps<{
  node: CraftNode
  depth: number
}>()

const store = usePlannerStore()

// ─── Per-row overage (overproduction) controls ─────────────────────────────
// The root row is driven by the top target control; cycle rows don't recurse,
// so neither gets an overage stepper.
const canOverage = computed(() => props.depth > 0 && !props.node.isCycle)

// One producing machine's output for this item — the "+/− a machine" step.
const machineStep = computed(() => props.node.recipe?.output.amount_per_minute ?? 0)

// Demand for this item excluding any overage applied here (i.e. what parents need).
const baseDemand = computed(() => props.node.ratePerMin - (props.node.overage ?? 0))

// Editable per-minute output for this row = demand + overage. Re-synced when the
// resolved rate changes (the node is also re-keyed on rate, so this stays fresh).
const outputInput = ref(props.node.ratePerMin)
watch(
  () => props.node.ratePerMin,
  (r) => {
    outputInput.value = r
  },
)

// True when this row is producing below what its parents require (a deficit).
const isDeficit = computed(() => (props.node.overage ?? 0) < -1e-9)

// Set the row's total output (floored at zero). The delta from demand becomes the
// item's overage — positive overproduces, negative is an intentional deficit.
function setOutput(total: number) {
  store.setOverage(props.node.path, Math.max(0, total) - baseDemand.value)
}
// Step the row's output by whole machines. The first click snaps up to the next
// whole-machine output (so the demand's fractional machine fills out to an even
// count), and further clicks add/remove one full machine. A machine-less raw row
// falls back to single items/min.
function stepOutput(dir: number) {
  const step = machineStep.value
  if (!step) {
    setOutput(props.node.ratePerMin + dir)
    return
  }
  const out = props.node.ratePerMin
  const eps = 1e-9
  const target =
    dir > 0
      ? (Math.floor(out / step + eps) + 1) * step // next whole-machine output above current
      : (Math.ceil(out / step - eps) - 1) * step // previous whole-machine output (clamped to demand)
  setOutput(target)
}
function onOutputChange() {
  const v = Number(outputInput.value)
  if (isFinite(v)) setOutput(v)
  else outputInput.value = props.node.ratePerMin
}

const stepTitle = computed(() =>
  machineStep.value ? `${machineStep.value}/min (one machine)` : '1/min',
)

// Expanded based on expandLevel from store; caret toggle still works locally
const expanded = ref(props.depth < store.expandLevel)

watch(
  () => store.expandLevel,
  (l) => {
    expanded.value = props.depth < l
  },
)

const typeColors: Record<string, string> = {
  raw: 'bg-amber-900/60 text-amber-300',
  processed: 'bg-blue-900/60 text-blue-300',
  component: 'bg-emerald-900/60 text-emerald-300',
  material: 'bg-purple-900/60 text-purple-300',
  ammo: 'bg-red-900/60 text-red-300',
}

const depthBorderColors = [
  'border-cyan-700/60',
  'border-emerald-700/60',
  'border-purple-700/60',
  'border-amber-700/60',
  'border-red-700/60',
  'border-blue-700/60',
]

function getBorderColor(depth: number): string {
  return depthBorderColors[depth % depthBorderColors.length]
}

// Derive a short version tag for a building id given the chain list
function versionTag(buildingId: string): string {
  const chains = store.productionChains
  // Is it an upgraded (v2) id?
  if (chains.some((c) => c.upgradedId === buildingId)) return 'v2'
  // Is it a base (v1) id in a production chain?
  if (chains.some((c) => c.baseId === buildingId)) return 'v1'
  // Fall back to short name
  return store.buildingsById.get(buildingId)?.name ?? buildingId
}

// Check if this node is an extractor-type raw node (has a building, no inputs)
function isExtractorNode(node: CraftNode): boolean {
  return node.isRaw && !!node.building
}

// Whether to show the extractor machine info on a raw node
function showExtractorMachine(node: CraftNode): boolean {
  return isExtractorNode(node) && store.showExtractors
}

// ─── v6: hover handlers ────────────────────────────────────────────────────
function onItemMouseEnter(e: MouseEvent) {
  store.setHover(
    'item',
    props.node.itemId,
    (e.currentTarget as HTMLElement).getBoundingClientRect(),
  )
}
function onItemMouseLeave() {
  store.clearHover()
}

function onBuildingMouseEnter(e: MouseEvent) {
  if (!props.node.building) return
  store.setHover(
    'building',
    props.node.building.id,
    (e.currentTarget as HTMLElement).getBoundingClientRect(),
  )
}
function onBuildingMouseLeave() {
  store.clearHover()
}
</script>

<template>
  <div :class="depth > 0 ? `pl-4 border-l-2 ${getBorderColor(depth - 1)}` : ''">
    <!-- Node row -->
    <div
      class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--panel-2)] transition-colors group min-w-full w-max"
      :class="[depth === 0 ? 'py-2' : '', store.showRowDividers ? 'row-underline' : '']"
    >
      <!-- Caret / expand button -->
      <button
        v-if="node.children.length > 0"
        class="w-4 h-4 shrink-0 flex items-center justify-center text-[var(--muted-2)] hover:text-[var(--accent)] transition-colors"
        @click="expanded = !expanded"
      >
        <svg
          :class="expanded ? 'rotate-90' : ''"
          class="w-3 h-3 transition-transform"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fill-rule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
      <!-- Spacer for leaf nodes -->
      <div v-else class="w-4 shrink-0" />

      <!-- Item icon + name (clickable → openItemDetail, hoverable) -->
      <span
        class="flex items-center gap-1 cursor-pointer hover:text-[var(--accent)] transition-colors"
        @click="store.openItemDetail(node.itemId)"
        @mouseenter="onItemMouseEnter"
        @mouseleave="onItemMouseLeave"
      >
        <GameIcon :id="node.itemId" kind="item" :name="node.itemName" :size="30" />
        <span
          class="font-semibold text-base whitespace-nowrap"
          :class="depth === 0 ? 'text-[var(--text-strong)]' : 'text-[var(--text-2)]'"
        >
          {{ node.itemName }}
        </span>
      </span>

      <!-- Item type chip -->
      <span
        :class="typeColors[node.itemType] ?? 'bg-slate-700 text-slate-300'"
        class="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
      >
        {{ node.itemType }}
      </span>

      <!-- Cycle badge -->
      <span
        v-if="node.isCycle"
        class="text-xs px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 font-medium shrink-0"
      >
        &#8635; cycle
      </span>

      <!-- Raw node handling -->
      <template v-else-if="node.isRaw">
        <!-- Extractor with machine shown (showExtractors ON) -->
        <template v-if="showExtractorMachine(node)">
          <span
            v-if="node.itemType !== 'raw'"
            class="text-xs px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-medium shrink-0"
          >
            raw
          </span>
          <!-- Machine icon+name: clickable + hoverable -->
          <span
            class="text-xs text-slate-400 shrink-0 flex items-center gap-1 whitespace-nowrap cursor-pointer hover:text-[var(--accent)] transition-colors"
            @click="store.openBuildingDetail(node.building!.id)"
            @mouseenter="onBuildingMouseEnter"
            @mouseleave="onBuildingMouseLeave"
          >
            <GameIcon
              :id="node.building!.id"
              kind="building"
              :name="node.building!.name"
              :size="38"
            />
            <span class="text-slate-300">{{ fmtBuildings(node.buildingsNeeded ?? 0) }}&times;</span>
            {{ node.building!.name }}
            <span v-if="node.isOverridden" class="text-amber-400 ml-0.5" title="Overridden"
              >&bull;</span
            >
          </span>
          <!-- Extractor version picker — stop propagation so click doesn't open drawer -->
          <div
            v-if="node.candidates && node.candidates.length > 1"
            class="chamfer-sm [--cf-fill:var(--panel-2)] flex shrink-0 p-px gap-px overflow-hidden text-xs"
          >
            <button
              v-for="cand in node.candidates"
              :key="cand.buildingId"
              :class="
                node.building?.id === cand.buildingId
                  ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                  : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
              "
              class="px-1.5 py-0.5 transition-colors flex items-center gap-1"
              :title="cand.buildingName"
              @click.stop="store.setOverride(node.itemId, cand.buildingId)"
            >
              {{ versionTag(cand.buildingId) }}
            </button>
          </div>
        </template>

        <!-- Plain raw leaf (showExtractors OFF or no building) -->
        <template v-else>
          <span
            v-if="node.itemType !== 'raw'"
            class="text-xs px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-medium shrink-0"
          >
            raw
          </span>
        </template>
      </template>

      <!-- Producer info (non-raw nodes): machine icon+name clickable + hoverable -->
      <template v-else-if="node.building && node.buildingsNeeded !== undefined">
        <span
          class="text-xs text-slate-400 shrink-0 flex items-center gap-1 whitespace-nowrap cursor-pointer hover:text-[var(--accent)] transition-colors"
          @click="store.openBuildingDetail(node.building.id)"
          @mouseenter="onBuildingMouseEnter"
          @mouseleave="onBuildingMouseLeave"
        >
          <GameIcon :id="node.building.id" kind="building" :name="node.building.name" :size="38" />
          <span class="text-slate-300">{{ fmtBuildings(node.buildingsNeeded) }}&times;</span>
          {{ node.building.name }}
          <span v-if="node.isOverridden" class="text-amber-400 ml-0.5" title="Overridden"
            >&bull;</span
          >
        </span>

        <!-- Version picker (when >1 candidate) — stop propagation so click doesn't open drawer -->
        <div
          v-if="node.candidates && node.candidates.length > 1"
          class="chamfer-sm [--cf-fill:var(--panel-2)] flex shrink-0 p-px gap-px overflow-hidden text-xs"
        >
          <button
            v-for="cand in node.candidates"
            :key="cand.buildingId"
            :class="
              node.building?.id === cand.buildingId
                ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
            "
            class="px-1.5 py-0.5 transition-colors flex items-center gap-1"
            :title="cand.buildingName"
            @click.stop="store.setOverride(node.itemId, cand.buildingId)"
          >
            {{ versionTag(cand.buildingId) }}
          </button>
        </div>
      </template>

      <!-- Rate (right-aligned), with per-row overage stepper on non-root rows.
           Sticky so it stays pinned to the visible right edge when a wide row
           overflows horizontally (e.g. on mobile). -->
      <div
        class="ml-auto flex items-center gap-1.5 shrink-0 pl-3 sticky right-0 z-10 bg-[var(--panel)] group-hover:bg-[var(--panel-2)] transition-colors shadow-[-10px_0_10px_-6px_rgba(0,0,0,0.5)] sm:shadow-none"
      >
        <template v-if="canOverage">
          <!-- Overage badge -->
          <span
            v-if="(node.overage ?? 0) > 0"
            class="text-xs font-mono text-amber-400"
            :title="`+${fmt(node.overage ?? 0)}/min overproduced`"
          >
            +{{ fmt(node.overage ?? 0) }}
          </span>
          <span
            v-else-if="isDeficit"
            class="text-xs font-mono text-red-400"
            :title="`${fmt(node.overage ?? 0)}/min below the ${fmt(baseDemand)}/min required`"
          >
            {{ fmt(node.overage ?? 0) }}
          </span>
          <!-- Stepper: ± one machine, or type / use up-down arrows for single items -->
          <div
            class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center p-px gap-px overflow-hidden"
            @click.stop
          >
            <button
              type="button"
              :title="`−${stepTitle}`"
              class="px-1 py-0.5 bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)] transition-colors text-sm leading-none"
              @click.stop="stepOutput(-1)"
            >
              &minus;
            </button>
            <input
              v-model.number="outputInput"
              type="number"
              min="0"
              step="1"
              :title="'Output items/min — raise above demand to overproduce, lower below it for a deficit'"
              class="amount-input bg-[var(--panel-2)] text-[var(--text)] text-sm px-1 py-0.5 w-9 text-right font-mono focus:outline-none"
              @change="onOutputChange"
              @click.stop
            />
            <button
              type="button"
              :title="`+${stepTitle}`"
              class="px-1 py-0.5 bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)] transition-colors text-sm leading-none"
              @click.stop="stepOutput(1)"
            >
              +
            </button>
          </div>
          <span
            class="text-sm font-mono"
            :class="isDeficit ? 'text-red-400' : 'text-slate-400'"
            :title="
              isDeficit ? `Producing below the ${fmt(baseDemand)}/min required here` : undefined
            "
            >/min</span
          >
        </template>
        <span v-else class="text-base font-mono text-slate-400"
          >{{ fmt(node.ratePerMin) }}/min</span
        >
      </div>
    </div>

    <!-- Children -->
    <div v-if="expanded && node.children.length > 0" class="mt-0.5">
      <CraftTreeNode
        v-for="child in node.children"
        :key="child.itemId"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style scoped>
/* Hide the native number spinner so the field only needs room for ~3 digits.
   Keyboard ↑/↓ still step by 1; the − / + buttons step by a whole machine. */
.amount-input::-webkit-outer-spin-button,
.amount-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.amount-input {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
