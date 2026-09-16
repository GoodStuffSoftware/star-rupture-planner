<script setup lang="ts">
import type { CraftNode } from '../../types/game'
import { usePlannerStore } from '../../stores/plannerStore'

defineProps<{
  node: CraftNode
}>()

const store = usePlannerStore()

function versionTag(buildingId: string): string {
  const chains = store.productionChains
  if (chains.some((c) => c.upgradedId === buildingId)) return 'v2'
  if (chains.some((c) => c.baseId === buildingId)) return 'v1'
  return store.buildingsById.get(buildingId)?.name ?? buildingId
}
</script>

<template>
  <div
    v-if="node.candidates && node.candidates.length > 1"
    class="chamfer-sm [--cf-fill:var(--panel-2)] flex shrink-0 p-px gap-px overflow-hidden text-xs"
  >
    <button
      v-for="cand in node.candidates"
      :key="cand.buildingId"
      :class="
        node.building?.id === cand.buildingId
          ? 'bg-[var(--accent)] text-[var(--accent-on)]'
          : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
      "
      class="px-1.5 py-0.5 transition-colors flex items-center gap-1"
      :title="cand.buildingName"
      @click.stop="store.setOverride(node.path, cand.buildingId)"
    >
      {{ versionTag(cand.buildingId) }}
    </button>
  </div>
</template>
