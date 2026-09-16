<script setup lang="ts">
import type { Building, UpgradeChain } from '../../types/game'
import type { UnlockEntry, BuildingCostEntry } from '../../lib/derived'
import { fmt } from '../../lib/format'
import { usePlannerStore } from '../../stores/plannerStore'
import GameIcon from '../GameIcon.vue'

defineProps<{
  buildingData: {
    building: Building
    chain?: UpgradeChain
    isV2: boolean
    pairedId: string | null
    pairedBuilding?: Building | null
    unlock: UnlockEntry | null
    costs: BuildingCostEntry[] | null
  }
  buildingTypeColors: Record<string, string>
}>()

const emit = defineEmits<{
  (e: 'goItem', id: string): void
  (e: 'replaceDetail', kind: 'building', id: string): void
}>()

const store = usePlannerStore()
</script>

<template>
  <div class="building-detail-view">
    <!-- Building header -->
    <div class="flex items-center gap-3 mb-4">
      <GameIcon
        :id="buildingData.building.id"
        kind="building"
        :name="buildingData.building.name"
        :size="40"
      />
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-xl font-bold text-[var(--text-strong)]">
            {{ buildingData.building.name }}
          </h2>
          <!-- Inline v1/v2 toggle -->
          <div
            v-if="buildingData.pairedBuilding && buildingData.chain"
            class="inline-flex rounded overflow-hidden border border-[var(--border)] text-xs font-semibold"
          >
            <button
              class="px-2 py-0.5 transition-colors"
              :class="
                !buildingData.isV2
                  ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                  : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
              "
              @click="
                !buildingData.isV2
                  ? null
                  : emit('replaceDetail', 'building', buildingData.chain.baseId)
              "
            >
              v1
            </button>
            <button
              class="px-2 py-0.5 transition-colors"
              :class="
                buildingData.isV2
                  ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                  : 'bg-[var(--panel-2)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--text)]'
              "
              @click="
                buildingData.isV2
                  ? null
                  : emit('replaceDetail', 'building', buildingData.chain.upgradedId)
              "
            >
              v2
            </button>
          </div>
        </div>
        <span
          :class="buildingTypeColors[buildingData.building.type] ?? 'bg-slate-700 text-slate-300'"
          class="text-xs px-2 py-0.5 rounded font-medium"
        >
          {{ buildingData.building.type }}
        </span>
      </div>
    </div>

    <!-- Stats row -->
    <div class="flex items-center gap-4 mb-4 text-sm">
      <span class="flex items-center gap-1 text-amber-400">
        <span>⚡</span> {{ buildingData.building.power ?? 0 }} W
      </span>
      <span class="flex items-center gap-1 text-red-400">
        <span>🔥</span> {{ buildingData.building.heat ?? 0 }}
      </span>
    </div>

    <!-- Unlocked by -->
    <div v-if="buildingData.unlock" class="mb-4">
      <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
        Unlocked by
      </h3>
      <div class="text-sm text-[var(--text)]">
        {{ buildingData.unlock.corp }}
        <span class="text-[var(--muted)] ml-2">Level {{ buildingData.unlock.level }}</span>
      </div>
    </div>

    <!-- Construction cost (data-gated) -->
    <div v-if="buildingData.costs && buildingData.costs.length > 0" class="mb-4">
      <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
        Construction cost
      </h3>
      <div class="space-y-1">
        <div
          v-for="cost in buildingData.costs"
          :key="cost.id"
          class="flex items-center gap-2 text-sm"
        >
          <button
            class="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors"
            @click="emit('goItem', cost.id)"
          >
            <GameIcon
              :id="cost.id"
              kind="item"
              :name="store.itemsById.get(cost.id)?.name ?? cost.id"
              :size="16"
            />
            <span class="text-[var(--text)]">{{
              store.itemsById.get(cost.id)?.name ?? cost.id
            }}</span>
          </button>
          <span class="text-[var(--accent)] font-mono">×{{ cost.amount }}</span>
        </div>
      </div>
    </div>

    <!-- Recipes -->
    <div v-if="(buildingData.building.recipes?.length ?? 0) > 0">
      <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
        Recipes
      </h3>
      <div class="space-y-3">
        <div
          v-for="(recipe, i) in buildingData.building.recipes"
          :key="recipe.output.id + '-' + i"
          class="chamfer-sm [--cf-fill:var(--panel-2)] p-3"
        >
          <!-- Output -->
          <div class="flex items-center gap-1.5 mb-2">
            <button
              class="flex items-center gap-1.5 font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
              @click="emit('goItem', recipe.output.id)"
            >
              <GameIcon
                :id="recipe.output.id"
                kind="item"
                :name="store.itemsById.get(recipe.output.id)?.name ?? recipe.output.id"
                :size="18"
              />
              {{ store.itemsById.get(recipe.output.id)?.name ?? recipe.output.id }}
            </button>
            <span class="text-[var(--muted)] text-xs ml-1"
              >{{ fmt(recipe.output.amount_per_minute) }}/min</span
            >
          </div>
          <!-- Inputs -->
          <div v-if="recipe.inputs.length > 0" class="space-y-1">
            <div
              v-for="inp in recipe.inputs"
              :key="inp.id"
              class="flex items-center gap-1.5 text-xs text-[var(--muted)]"
            >
              <button
                class="flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
                @click="emit('goItem', inp.id)"
              >
                <GameIcon
                  :id="inp.id"
                  kind="item"
                  :name="store.itemsById.get(inp.id)?.name ?? inp.id"
                  :size="14"
                />
                {{ store.itemsById.get(inp.id)?.name ?? inp.id }}
              </button>
              <span class="text-[var(--muted-2)]">{{ fmt(inp.amount_per_minute) }}/min</span>
            </div>
          </div>
          <div v-else class="text-xs text-[var(--muted-2)] italic">No inputs (extractor)</div>
        </div>
      </div>
    </div>
  </div>
</template>
