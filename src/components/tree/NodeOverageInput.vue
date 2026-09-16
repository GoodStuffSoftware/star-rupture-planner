<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CraftNode } from '../../types/game'
import { fmt } from '../../lib/format'
import { usePlannerStore } from '../../stores/plannerStore'

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

function onOutputChange() {
  const v = Number(outputInput.value)
  if (isFinite(v)) setOutput(v)
  else outputInput.value = props.node.ratePerMin
}

function resetOverage() {
  store.setOverage(props.node.path, 0)
}

const stepTitle = computed(() =>
  machineStep.value ? `${machineStep.value}/min (one machine)` : '1/min',
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
        :title="isDeficit ? `Producing below the ${fmt(baseDemand)}/min required here` : undefined"
        >/min</span
      >
    </template>
    <!-- depth=0 root: large orange rate (replaces old header) -->
    <span v-else-if="depth === 0" class="text-xl font-bold font-mono text-[var(--accent)]"
      >{{ fmt(node.ratePerMin) }}/min</span
    >
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
