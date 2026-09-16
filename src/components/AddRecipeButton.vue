<script setup lang="ts">
// Square "+" button that adds a new recipe tab. Uses the accent color (orange
// in Star Rupture, blue in Space Age) to give it more visual weight.
import { usePlannerStore } from '../stores/plannerStore'

const store = usePlannerStore()
</script>

<template>
  <button
    type="button"
    aria-label="Add recipe"
    title="Add recipe"
    class="chamfer-sm [--cf-fill:var(--accent)] hover:[--cf-fill:var(--accent-hover)] shrink-0 w-8 h-8 inline-flex items-center justify-center text-[var(--accent-on)] transition-colors"
    @click="store.addTarget()"
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  </button>
</template>
