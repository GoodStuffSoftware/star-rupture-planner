<script setup lang="ts">
import { usePlannerStore } from '../stores/plannerStore'
import { VERSIONS } from '../data/versions'

const store = usePlannerStore()

function onChange(e: Event) {
  const target = e.target as HTMLSelectElement
  store.setVersion(target.value)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <label for="version-select" class="text-xs font-medium text-[#a8a29a] uppercase tracking-wider">
      Version
    </label>
    <select
      id="version-select"
      :value="store.version"
      @change="onChange"
      class="bg-[#24201b] border border-[#34302a] text-[#f3f1ee] text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#ee8b22] focus:border-transparent hover:border-[#a8a29a] transition-colors cursor-pointer"
    >
      <option v-for="v in VERSIONS" :key="v.id" :value="v.id">
        {{ v.label }}
      </option>
    </select>
  </div>
</template>
