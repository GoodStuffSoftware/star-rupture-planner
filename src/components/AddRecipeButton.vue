<script setup lang="ts">
// Square "+" button that opens a new, empty tab and puts the cursor in the item search. Uses the accent color (orange
// in Star Rupture, blue in Space Age) to give it more visual weight.
import { usePlannerStore } from '../stores/plannerStore'
import { onTabContextMenu, onTabMenuKey } from '../lib/tabMenu'

const store = usePlannerStore()
</script>

<template>
  <button
    type="button"
    aria-label="New tab"
    title="New tab"
    class="chamfer-sm [--cf-fill:var(--accent)] hover:[--cf-fill:var(--accent-hover)] shrink-0 w-8 h-8 inline-flex items-center justify-center text-[var(--accent-on)] transition-colors"
    aria-haspopup="menu"
    @click="store.newTab()"
    @contextmenu="onTabContextMenu($event, { kind: 'add' })"
    @keydown="onTabMenuKey($event, { kind: 'add' })"
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  </button>
</template>
