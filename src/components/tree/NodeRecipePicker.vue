<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CraftNode } from '../../types/game'
import { fmt } from '../../lib/format'
import { usePlannerStore } from '../../stores/plannerStore'

const props = defineProps<{
  node: CraftNode
}>()

const store = usePlannerStore()

const showRecipeDropdown = ref(false)
const hasAlternateRecipes = computed(() => (props.node.alternateRecipes?.length ?? 0) > 1)

function toggleRecipeDropdown(e: Event) {
  e.stopPropagation()
  showRecipeDropdown.value = !showRecipeDropdown.value
}

function selectRecipe(rKey: string, e: Event) {
  e.stopPropagation()
  store.setRecipeOverride(props.node.path, rKey)
  showRecipeDropdown.value = false
}

function recipeInputSummary(inputs: { id: string; amount_per_minute: number }[]): string {
  return inputs.map((i) => store.itemsById.get(i.id)?.name ?? i.id).join(' + ')
}

function recipeLabel(r: {
  recipeKey: string
  recipe: { variant?: string; id?: string; output: { amount_per_minute: number } }
}): string {
  if (r.recipe.variant) return 'Alt'
  if (r.recipe.id) return 'Std'
  return 'Default'
}
</script>

<template>
  <template v-if="hasAlternateRecipes">
    <!-- Small dropdown arrow -->
    <button
      class="flex items-center justify-center w-5 h-5 rounded transition-colors shrink-0"
      :class="
        showRecipeDropdown
          ? 'bg-[var(--accent)] text-[var(--accent-on)]'
          : 'text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
      "
      title="Switch recipe variant"
      @click="toggleRecipeDropdown"
    >
      <svg
        class="w-3 h-3"
        :class="showRecipeDropdown ? 'rotate-180' : ''"
        fill="currentColor"
        viewBox="0 0 20 20"
        style="transition: transform 0.15s"
      >
        <path
          fill-rule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
          clip-rule="evenodd"
        />
      </svg>
    </button>

    <!-- Dropdown panel -->
    <div
      v-if="showRecipeDropdown"
      class="absolute top-full left-0 mt-1 z-50 min-w-[220px] max-w-[320px] bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden"
    >
      <div
        v-for="alt in node.alternateRecipes"
        :key="alt.recipeKey"
        class="px-3 py-2 cursor-pointer transition-colors text-xs border-b border-[var(--border)] last:border-b-0"
        :class="
          node.selectedRecipeKey === alt.recipeKey
            ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
            : 'hover:bg-[var(--panel-2)] text-[var(--text)]'
        "
        @click="selectRecipe(alt.recipeKey, $event)"
      >
        <div class="flex items-center gap-2 mb-1">
          <span class="font-semibold">
            {{ recipeLabel(alt) }}
          </span>
          <span class="text-[var(--muted)] font-mono"
            >{{ fmt(alt.recipe.output.amount_per_minute) }}/min</span
          >
          <span v-if="node.selectedRecipeKey === alt.recipeKey" class="text-[var(--accent)] ml-auto"
            >✓</span
          >
        </div>
        <div class="text-[var(--muted-2)]">
          {{ recipeInputSummary(alt.recipe.inputs) }}
        </div>
      </div>
    </div>
  </template>
</template>
