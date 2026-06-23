<script setup lang="ts">
// Square "+" button that adds a new recipe tab. Visibility/positioning is left
// to the parent (wrap it); this just renders the button and the action.
import { usePlannerStore } from '../stores/plannerStore'

const store = usePlannerStore()
</script>

<template>
  <button
    type="button"
    aria-label="Add recipe"
    title="Add recipe"
    class="chamfer-sm [--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] shrink-0 w-8 h-8 inline-flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] transition-colors"
    @click="store.addTarget()"
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14M5 12h14" />
    </svg>
  </button>
</template>
