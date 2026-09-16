<script setup lang="ts">
import { usePlannerStore } from '../stores/plannerStore'
import { fmt } from '../lib/format'
import TotalsIntermediate from './TotalsIntermediate.vue'
import TotalsMaterialSection from './totals/TotalsMaterialSection.vue'
import TotalsBuildingsSection from './totals/TotalsBuildingsSection.vue'

const props = defineProps<{ aggregate?: boolean }>()
const store = usePlannerStore()

function sectionKey(s: string): string {
  return props.aggregate ? 'all:' + s : s
}
</script>

<template>
  <div class="chamfer p-4 space-y-4">
    <!-- Aggregate slot header -->
    <div v-if="aggregate">
      <slot name="header" />
    </div>

    <!-- Header + layout toggle -->
    <div v-else class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">Totals</h3>
      <div
        class="chamfer-sm [--cf-fill:var(--panel-2)] hidden md:flex shrink-0 p-px gap-px overflow-hidden"
      >
        <button
          type="button"
          title="Totals on the side"
          aria-label="Totals on the side"
          class="px-1.5 py-1 transition-colors"
          :class="
            store.totalsPlacement === 'side'
              ? 'bg-[var(--accent)] text-[var(--accent-on)]'
              : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
          "
          @click="store.setTotalsPlacement('side')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="1" stroke-width="2" />
            <line x1="14" y1="4" x2="14" y2="20" stroke-width="2" />
          </svg>
        </button>
        <button
          type="button"
          title="Totals on the bottom"
          aria-label="Totals on the bottom"
          class="px-1.5 py-1 transition-colors"
          :class="
            store.totalsPlacement === 'bottom'
              ? 'bg-[var(--accent)] text-[var(--accent-on)]'
              : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
          "
          @click="store.setTotalsPlacement('bottom')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="1" stroke-width="2" />
            <line x1="3" y1="14" x2="21" y2="14" stroke-width="2" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="!store.totals" class="text-[var(--muted-2)] text-sm italic">No target selected</div>

    <template v-else>
      <!-- Power & Heat -->
      <div
        class="grid grid-cols-2 gap-3"
        :class="!aggregate && store.totalsPlacement === 'bottom' ? 'max-w-[365px]' : ''"
      >
        <div class="chamfer-sm [--cf-fill:var(--panel-2)] p-2.5">
          <div class="text-xs text-[var(--muted-2)] mb-1">Power</div>
          <div class="text-base font-mono text-amber-400">{{ fmt(store.totals.totalPower) }} W</div>
        </div>
        <div class="chamfer-sm [--cf-fill:var(--panel-2)] p-2.5">
          <div class="text-xs text-[var(--muted-2)] mb-1">Heat</div>
          <div class="text-base font-mono text-red-400">
            {{ fmt(store.totals.totalHeat) }}
          </div>
        </div>
      </div>

      <!-- Sections grid -->
      <div
        :class="
          aggregate
            ? 'space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-6 md:items-start'
            : 'space-y-4'
        "
      >
        <div class="space-y-4">
          <!-- Raw materials section -->
          <TotalsMaterialSection :section-key="sectionKey('raw')" />

          <!-- Intermediates -->
          <TotalsIntermediate v-if="!aggregate" />
          <TotalsIntermediate v-else key-prefix="all:" class="md:hidden" />

          <!-- Buildings & construction materials section -->
          <TotalsBuildingsSection :section-key="sectionKey" />
        </div>

        <!-- Column 2 for aggregate layout -->
        <div v-if="aggregate" class="hidden md:block">
          <TotalsIntermediate key-prefix="all:" />
        </div>
      </div>
    </template>
  </div>
</template>
