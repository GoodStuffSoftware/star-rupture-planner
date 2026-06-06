<script setup lang="ts">
import { ref } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'

const props = withDefaults(
  defineProps<{
    kind: 'building' | 'item'
    id: string
    name: string
    size?: number
  }>(),
  { size: 24 },
)

const store = usePlannerStore()
const failed = ref(false)

function onError() {
  failed.value = true
}

// Fallback: first 1-2 letters of name, uppercase
function fallbackLabel(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}
</script>

<template>
  <!-- When showIcons is off: render nothing -->
  <template v-if="!store.showIcons" />

  <!-- When showIcons is on but image failed: render letter glyph -->
  <span
    v-else-if="failed"
    class="inline-flex items-center justify-center rounded bg-slate-700 text-slate-300 font-bold select-none shrink-0"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(8, size * 0.45)}px` }"
    :title="name"
  >
    {{ fallbackLabel(name) }}
  </span>

  <!-- Normal image -->
  <img
    v-else
    :src="`/icons/${kind}s/${id}.webp`"
    :alt="name"
    :title="name"
    :width="size"
    :height="size"
    loading="lazy"
    class="rounded shrink-0 object-contain"
    :style="{ width: `${size}px`, height: `${size}px` }"
    @error="onError"
  />
</template>
