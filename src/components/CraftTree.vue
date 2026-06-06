<script setup lang="ts">
import { usePlannerStore } from '../stores/plannerStore'
import { fmt } from '../lib/format'
import CraftTreeNode from './CraftTreeNode.vue'
import TreeControls from './TreeControls.vue'

const store = usePlannerStore()
</script>

<template>
  <div class="min-h-0 flex flex-col">
    <!-- Loading state -->
    <div
      v-if="store.loading"
      class="flex-1 flex items-center justify-center text-slate-400 text-sm"
    >
      <svg
        class="animate-spin w-5 h-5 mr-2 text-cyan-400"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v8H4z"
        />
      </svg>
      Loading game data&hellip;
    </div>

    <!-- Error state -->
    <div
      v-else-if="store.error"
      class="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6"
    >
      <svg class="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <div>
        <p class="text-red-400 font-semibold">Failed to load data</p>
        <p class="text-slate-400 text-sm mt-1">{{ store.error }}</p>
      </div>
    </div>

    <!-- Empty / no target state -->
    <div
      v-else-if="!store.targetItemId || !store.tree"
      class="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6"
    >
      <svg class="w-12 h-12 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
        />
      </svg>
      <div>
        <p class="text-slate-400 font-medium">Select a target item</p>
        <p class="text-slate-600 text-sm mt-1">Use the search above to pick an item and set a rate</p>
      </div>
    </div>

    <!-- Tree -->
    <template v-else>
      <!-- Header -->
      <div class="flex items-baseline gap-2 mb-2 px-2">
        <span class="text-3xl font-bold text-[#ee8b22]">{{ fmt(store.targetRate) }}/min</span>
        <span class="text-2xl text-slate-200 font-semibold">
          {{ store.itemsById.get(store.targetItemId)?.name ?? store.targetItemId }}
        </span>
      </div>

      <!-- Level controls (between header and scrollable tree) -->
      <TreeControls />

      <!-- Scrollable tree -->
      <div class="flex-1 overflow-auto">
        <CraftTreeNode :node="store.tree" :depth="0" />
      </div>
    </template>
  </div>
</template>
