<script setup lang="ts">
/** A chamfered (angular) on/off toggle that matches the game aesthetic. */
defineProps<{ checked: boolean }>()
defineEmits<{ (e: 'toggle'): void }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="checked"
    class="chamfer-sm relative h-6 w-11 shrink-0 transition-colors focus:outline-none"
    :style="{ '--cf-fill': checked ? 'var(--accent)' : 'var(--panel-2)' }"
    @click="$emit('toggle')"
  >
    <!-- Chamfered sliding thumb -->
    <span
      class="absolute top-1/2 -translate-y-1/2 h-4 w-4 clip-chamfer-sm transition-all duration-150"
      :class="
        checked ? 'left-[calc(100%-1.25rem)] bg-[var(--accent-on)]' : 'left-1 bg-[var(--muted)]'
      "
    />
  </button>
</template>
