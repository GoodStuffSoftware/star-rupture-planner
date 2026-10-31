<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { CraftNode } from '../../types/game'
import { fmt } from '../../lib/format'
import { usePlannerStore } from '../../stores/plannerStore'
import { createWheelStepper } from '../../lib/wheelStep'
import RateStepButton from './RateStepButton.vue'

const props = defineProps<{
  node: CraftNode
  depth: number
}>()

const store = usePlannerStore()

const canOverage = computed(() => props.depth > 0 && !props.node.isCycle)
const machineStep = computed(() => props.node.recipe?.output.amount_per_minute ?? 0)
const baseDemand = computed(() => props.node.ratePerMin - (props.node.overage ?? 0))

const autoOverage = computed(() => {
  const step = machineStep.value
  if (!step || !canOverage.value) return 0
  const demand = baseDemand.value
  const wholeMachineOutput = Math.ceil(demand / step - 1e-9) * step
  return wholeMachineOutput - demand
})

const hasManualOverage = computed(() => Math.abs(props.node.overage ?? 0) > 1e-9)

const displayOverage = computed(() => {
  if (hasManualOverage.value) return props.node.overage ?? 0
  if (store.showOverages) return autoOverage.value
  return 0
})

const outputInput = ref(props.node.ratePerMin)

watch(
  () => props.node.ratePerMin,
  (r) => {
    outputInput.value = r
  },
)

const isDeficit = computed(() => (props.node.overage ?? 0) < -1e-9)

function setOutput(total: number) {
  store.setOverage(props.node.path, Math.max(0, total) - baseDemand.value)
}

function stepOutput(dir: number) {
  const step = machineStep.value
  if (!step) {
    setOutput(props.node.ratePerMin + dir)
    return
  }
  const out = props.node.ratePerMin
  const eps = 1e-9
  const target =
    dir > 0 ? (Math.floor(out / step + eps) + 1) * step : (Math.ceil(out / step - eps) - 1) * step
  setOutput(target)
}

const onOutputWheel = createWheelStepper(stepOutput)

function onOutputChange() {
  const v = Number(outputInput.value)
  if (isFinite(v)) setOutput(v)
  else outputInput.value = props.node.ratePerMin
}

function resetOverage() {
  store.setOverage(props.node.path, 0)
}

// Root row: the big rate is an in-place editor for the active target's rate.
const rootDraft = ref(fmt(props.node.ratePerMin))

watch(
  () => props.node.ratePerMin,
  (r) => {
    rootDraft.value = fmt(r)
  },
)

function revertRoot() {
  rootDraft.value = fmt(props.node.ratePerMin)
}

function commitRoot() {
  // Untouched text (focus then leave, Escape) must not rewrite a rate the field only displays rounded.
  if (rootDraft.value === fmt(props.node.ratePerMin)) return
  // Drop thousands commas ("1,200"); a comma with 1-2 digits after it is a decimal comma ("7,5").
  const text = rootDraft.value
    .replace(/,(?=\d{3}(?!\d))/g, '')
    .replace(',', '.')
    .trim()
  const v = Number(text)
  if (text !== '' && isFinite(v) && v > 0 && store.targetItemId) {
    const rate = Math.round(v * 1000) / 1000
    store.setTarget(store.targetItemId, rate)
    rootDraft.value = fmt(rate)
  } else {
    revertRoot()
  }
}

// One producing machine's output for the target: what the root -/+ and arrows step by (as in the header).
const rootStep = computed(() =>
  store.targetItemId ? store.defaultRateForItem(store.targetItemId) : 0,
)
// Never step the target to zero or below: a step down that would is a no-op (the minus disables).
const canStepRootDown = computed(() => store.targetRate - rootStep.value > 1e-9)

function stepRoot(dir: 1 | -1) {
  if (dir < 0 && !canStepRootDown.value) return
  store.stepTargetRate(dir)
  rootDraft.value = fmt(store.targetRate)
}

const onRootWheel = createWheelStepper((dir) => {
  stepRoot(dir)
  const el = document.activeElement
  if (el instanceof HTMLInputElement) nextTick(() => el.select())
})

function onRootKey(e: KeyboardEvent) {
  const el = e.target as HTMLInputElement
  if (e.key === 'Enter') {
    el.blur() // blur commits
  } else if (e.key === 'Escape') {
    e.stopPropagation() // don't also close the detail drawer
    revertRoot()
    el.blur()
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    stepRoot(e.key === 'ArrowUp' ? 1 : -1)
    nextTick(() => el.select())
  }
}

const stepTitle = computed(() =>
  machineStep.value ? `${machineStep.value}/min (one machine)` : '1/min',
)
const rootStepTitle = computed(() =>
  rootStep.value ? `${rootStep.value}/min (one machine)` : '1/min',
)
</script>

<template>
  <div
    class="ml-auto flex items-center gap-1.5 shrink-0 pl-3 sticky right-0 z-10 bg-[var(--panel)] group-hover:bg-[var(--panel-2)] transition-colors shadow-[-10px_0_10px_-6px_rgba(0,0,0,0.5)] sm:shadow-none"
  >
    <template v-if="canOverage">
      <!-- Reset button (⟳) -->
      <button
        v-if="hasManualOverage"
        type="button"
        title="Reset to default production"
        class="w-5 h-5 flex items-center justify-center rounded text-amber-400 hover:bg-amber-400/20 transition-colors shrink-0"
        @click.stop="resetOverage"
      >
        <svg
          class="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>

      <!-- Overage badge -->
      <span
        v-if="displayOverage > 1e-9"
        class="text-xs font-mono text-amber-400"
        :title="`+${fmt(displayOverage)}/min overproduced`"
      >
        +{{ fmt(displayOverage) }}
      </span>
      <span
        v-else-if="isDeficit"
        class="text-xs font-mono text-red-400"
        :title="`${fmt(node.overage ?? 0)}/min below the ${fmt(baseDemand)}/min required`"
      >
        {{ fmt(node.overage ?? 0) }}
      </span>

      <!-- Stepper buttons & input -->
      <div
        class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center p-px gap-px overflow-hidden"
        @click.stop
      >
        <RateStepButton :dir="-1" :label="`−${stepTitle}`" @click.stop="stepOutput(-1)" />
        <input
          v-model.number="outputInput"
          type="number"
          min="0"
          step="1"
          :title="'Output items/min — raise above demand to overproduce, lower below it for a deficit'"
          class="amount-input bg-[var(--panel-2)] text-[var(--text)] text-sm px-1 py-0.5 w-9 text-right font-mono focus:outline-none"
          @change="onOutputChange"
          @wheel="onOutputWheel"
          @click.stop
        />
        <RateStepButton :dir="1" :label="`+${stepTitle}`" @click.stop="stepOutput(1)" />
      </div>
      <span
        class="text-sm font-mono"
        :class="isDeficit ? 'text-red-400' : 'text-slate-400'"
        :title="isDeficit ? `Producing below the ${fmt(baseDemand)}/min required here` : undefined"
        >/min</span
      >
    </template>
    <!-- depth=0 root: large orange rate (replaces old header), same -/+ stepper as the child rows -->
    <template v-else-if="depth === 0">
      <div
        class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center p-px gap-px overflow-hidden"
        @click.stop
      >
        <RateStepButton
          :dir="-1"
          :label="`−${rootStepTitle}`"
          :disabled="!canStepRootDown"
          @click.stop="stepRoot(-1)"
        />
        <input
          v-model="rootDraft"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          aria-label="Target output per minute"
          title="Target output — click to edit"
          :style="{ width: `${Math.max(rootDraft.length, 1)}ch` }"
          class="m-0 px-1 border-0 rounded-sm bg-[var(--panel-2)] text-xl font-bold font-mono text-[var(--accent)] text-right cursor-text outline-none hover:bg-[var(--border)]/50 focus:bg-[var(--border)] transition-colors box-content"
          @focus="($event.target as HTMLInputElement).select()"
          @keydown="onRootKey"
          @wheel="onRootWheel"
          @blur="commitRoot"
          @click.stop
        />
        <RateStepButton :dir="1" :label="`+${rootStepTitle}`" @click.stop="stepRoot(1)" />
      </div>
      <span class="text-xl font-bold font-mono text-[var(--accent)]">/min</span>
    </template>
    <!-- depth>0 non-overage nodes -->
    <span v-else class="text-base font-mono text-slate-400">{{ fmt(node.ratePerMin) }}/min</span>
  </div>
</template>

<style scoped>
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
