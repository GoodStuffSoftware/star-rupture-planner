<script setup lang="ts">
defineProps<{
  /** -1 renders "−", +1 renders "+". */
  dir: 1 | -1
  /** Tooltip and accessible name, e.g. "+10/min (one machine)". */
  label: string
}>()
</script>

<template>
  <button
    type="button"
    :title="label"
    :aria-label="label"
    class="px-1 py-0.5 bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--panel-2)] disabled:hover:text-[var(--muted)] transition-colors text-sm leading-none"
  >
    <template v-if="dir < 0">&minus;</template>
    <template v-else>+</template>
  </button>
</template>
