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
    <label
      for="version-select"
      class="text-xs font-medium text-[var(--muted)] uppercase tracking-wider"
    >
      Version
    </label>
    <div class="chamfer-sm [--cf-fill:var(--panel-2)] inline-flex">
      <select
        id="version-select"
        :value="store.version"
        class="bg-transparent border-0 text-[var(--text)] text-sm px-3 py-1.5 focus:outline-none cursor-pointer"
        @change="onChange"
      >
        <option v-for="v in VERSIONS" :key="v.id" :value="v.id">
          {{ v.label }}
        </option>
      </select>
    </div>
  </div>
</template>
