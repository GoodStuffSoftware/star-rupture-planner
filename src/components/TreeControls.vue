<script setup lang="ts">
import { computed } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'

const store = usePlannerStore()

// One button per level, 1..treeMaxDepth. Level 1 = most collapsed (root + its
// children); the highest level = fully expanded (so no separate Collapse/All).
const levelButtons = computed<number[]>(() => {
  const arr: number[] = []
  for (let i = 1; i <= store.treeMaxDepth; i++) arr.push(i)
  return arr
})

function isActive(level: number): boolean {
  // The top level also represents "fully expanded" (covers a persisted Infinity).
  if (level === store.treeMaxDepth && store.expandLevel >= store.treeMaxDepth) return true
  return store.expandLevel === level
}
</script>

<template>
  <div v-if="levelButtons.length" class="flex items-center gap-1 flex-wrap py-2 px-1">
    <span class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mr-1 shrink-0">
      Expand:
    </span>

    <button
      v-for="n in levelButtons"
      :key="n"
      :class="
        isActive(n)
          ? '[--cf-fill:var(--accent)] text-[var(--accent-on)]'
          : '[--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
      "
      class="chamfer-sm text-xs px-2.5 py-1 font-medium transition-colors min-w-[2rem]"
      @click="store.setExpandLevel(n)"
    >
      {{ n }}
    </button>
  </div>
</template>
