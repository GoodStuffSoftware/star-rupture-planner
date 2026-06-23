<script setup lang="ts">
// A small "pick one" segmented chip group. Used for the Options toggles
// (theme, text size, totals position). Emits update:modelValue for v-model.
type Value = string | number

defineProps<{
  options: { value: Value; label: string }[]
  modelValue: Value
}>()

defineEmits<{ (e: 'update:modelValue', value: Value): void }>()
</script>

<template>
  <div
    class="chamfer-sm [--cf-fill:var(--panel-2)] flex shrink-0 p-px gap-px overflow-hidden text-xs font-medium"
  >
    <button
      v-for="opt in options"
      :key="String(opt.value)"
      type="button"
      class="px-2.5 py-1 transition-colors"
      :class="
        opt.value === modelValue
          ? 'bg-[var(--accent)] text-[var(--accent-on)]'
          : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
      "
      @click="$emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
