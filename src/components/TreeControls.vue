<script setup lang="ts">
import { computed } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'

const store = usePlannerStore()

// The numbered levels to show: 1..min(treeMaxDepth, 8)
const levelButtons = computed<number[]>(() => {
  const max = Math.min(store.treeMaxDepth, 8)
  const arr: number[] = []
  for (let i = 1; i <= max; i++) arr.push(i)
  return arr
})

function isActive(level: number | typeof Infinity): boolean {
  return store.expandLevel === level
}
</script>

<template>
  <div class="flex items-center gap-1 flex-wrap py-2 px-1">
    <span class="text-xs font-semibold text-[#a8a29a] uppercase tracking-wider mr-1 shrink-0">
      Expand:
    </span>

    <!-- Collapse = level 1 -->
    <button
      @click="store.setExpandLevel(1)"
      :class="
        isActive(1)
          ? 'bg-[#ee8b22] text-black'
          : 'bg-[#24201b] text-[#a8a29a] hover:bg-[#34302a] hover:text-[#f3f1ee]'
      "
      class="clip-chamfer-sm text-xs px-2.5 py-1 font-medium transition-colors border border-[#34302a]"
    >
      Collapse
    </button>

    <!-- Numbered levels -->
    <button
      v-for="n in levelButtons"
      :key="n"
      @click="store.setExpandLevel(n)"
      :class="
        isActive(n)
          ? 'bg-[#ee8b22] text-black'
          : 'bg-[#24201b] text-[#a8a29a] hover:bg-[#34302a] hover:text-[#f3f1ee]'
      "
      class="clip-chamfer-sm text-xs px-2.5 py-1 font-medium transition-colors border border-[#34302a] min-w-[2rem]"
    >
      {{ n }}
    </button>

    <!-- All = Infinity -->
    <button
      @click="store.setExpandLevel(Infinity)"
      :class="
        isActive(Infinity)
          ? 'bg-[#ee8b22] text-black'
          : 'bg-[#24201b] text-[#a8a29a] hover:bg-[#34302a] hover:text-[#f3f1ee]'
      "
      class="clip-chamfer-sm text-xs px-2.5 py-1 font-medium transition-colors border border-[#34302a]"
    >
      All
    </button>
  </div>
</template>
