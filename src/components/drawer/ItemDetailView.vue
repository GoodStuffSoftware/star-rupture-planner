<script setup lang="ts">
import type { Item } from '../../types/game'
import type { ProducerEntry } from '../../lib/recipeIndex'
import type { UsedInEntry, ExportEntry } from '../../lib/derived'
import { itemTypeChipClass } from '../../lib/itemTypeChip'
import { fmt } from '../../lib/format'
import { usePlannerStore } from '../../stores/plannerStore'
import { stripBuildingVersion } from '../../lib/buildingVersion'
import GameIcon from '../GameIcon.vue'

defineProps<{
  itemData: {
    item: Item
    producers: ProducerEntry[]
    usedIn: UsedInEntry[]
    exports: ExportEntry[]
  }
}>()

const emit = defineEmits<{
  (e: 'goItem', id: string): void
  (e: 'goBuilding', id: string): void
  (e: 'openAsRecipe', id: string, buildingId: string, recipe: ProducerEntry['recipe']): void
  (e: 'openUsedInAsRecipe', u: UsedInEntry): void
}>()

const store = usePlannerStore()

function isV2Building(buildingId: string): boolean {
  return store.chains.some((c) => c.upgradedId === buildingId)
}
</script>

<template>
  <div class="item-detail-view">
    <!-- Item header -->
    <div class="flex items-center gap-3 mb-4">
      <GameIcon :id="itemData.item.id" kind="item" :name="itemData.item.name" :size="40" />
      <div>
        <h2 class="text-xl font-bold text-[var(--text-strong)]">
          {{ itemData.item.name }}
        </h2>
        <span
          :class="itemTypeChipClass(itemData.item.type)"
          class="text-xs px-2 py-0.5 rounded font-medium"
        >
          {{ itemData.item.type }}
        </span>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Made by -->
      <div v-if="itemData.producers.length > 0">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
          Made by
        </h3>
        <div class="space-y-3">
          <div
            v-for="(prod, i) in itemData.producers"
            :key="prod.building.id + '-' + i"
            class="chamfer-sm [--cf-fill:var(--panel-2)] p-3"
          >
            <!-- Top row: output item + building with version + ⚡ -->
            <div class="flex items-center gap-2 mb-2">
              <button
                class="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors font-semibold text-[var(--text)] text-left flex-1 min-w-0"
                @click="emit('goItem', itemData.item.id)"
              >
                <GameIcon
                  :id="itemData.item.id"
                  kind="item"
                  :name="itemData.item.name"
                  :size="20"
                />
                <span class="truncate">{{ itemData.item.name }}</span>
              </button>
              <button
                class="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors shrink-0"
                @click="emit('goBuilding', prod.building.id)"
              >
                <GameIcon
                  :id="prod.building.id"
                  kind="building"
                  :name="prod.building.name"
                  :size="16"
                />
                <span>{{ stripBuildingVersion(prod.building.name) }}</span>
                <span
                  v-if="isV2Building(prod.building.id)"
                  class="text-[10px] font-bold text-[var(--accent-2)]"
                  >v2</span
                >
              </button>
              <span
                v-if="prod.recipe.variant"
                class="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 font-medium shrink-0"
                >Alt</span
              >
              <!-- Open as recipe button -->
              <button
                class="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-on)] hover:bg-[var(--accent-hover)] transition-colors"
                title="Open this recipe in a new planning tab"
                @click="emit('openAsRecipe', itemData.item.id, prod.building.id, prod.recipe)"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  stroke-width="2.5"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            <!-- Recipe inputs → output -->
            <div class="text-xs text-[var(--muted)] space-y-1">
              <div v-for="inp in prod.recipe.inputs" :key="inp.id" class="flex items-center gap-1">
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
                  <span>{{ store.itemsById.get(inp.id)?.name ?? inp.id }}</span>
                </button>
                <span class="text-[var(--muted-2)]">{{ fmt(inp.amount_per_minute) }}/min</span>
              </div>
              <div v-if="prod.recipe.inputs.length === 0" class="italic text-[var(--muted-2)]">
                Extractor (no inputs)
              </div>
              <div
                class="flex items-center gap-1 text-[var(--accent)] mt-1 pt-1 border-t border-[var(--border)]"
              >
                <span>→ {{ fmt(prod.recipe.output.amount_per_minute) }}/min</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Used in — full recipe cards showing what this item is consumed by -->
      <div v-if="itemData.usedIn.length > 0">
        <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
          Used in
        </h3>
        <div class="space-y-3">
          <div
            v-for="(entry, i) in itemData.usedIn"
            :key="entry.buildingId + '-' + entry.recipe.output.id + '-' + i"
            class="chamfer-sm [--cf-fill:var(--panel-2)] p-3"
          >
            <!-- Output item name + building — top row -->
            <div class="flex items-center gap-2 mb-2">
              <button
                class="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors font-semibold text-[var(--text)] text-left flex-1 min-w-0"
                @click="emit('goItem', entry.recipe.output.id)"
              >
                <GameIcon
                  :id="entry.recipe.output.id"
                  kind="item"
                  :name="
                    store.itemsById.get(entry.recipe.output.id)?.name ?? entry.recipe.output.id
                  "
                  :size="20"
                />
                <span class="truncate">{{
                  store.itemsById.get(entry.recipe.output.id)?.name ?? entry.recipe.output.id
                }}</span>
              </button>
              <button
                class="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors shrink-0"
                @click="emit('goBuilding', entry.buildingId)"
              >
                <GameIcon
                  :id="entry.buildingId"
                  kind="building"
                  :name="entry.buildingName"
                  :size="16"
                />
                <span>{{ stripBuildingVersion(entry.buildingName) }}</span>
                <span
                  v-if="isV2Building(entry.buildingId)"
                  class="text-[10px] font-bold text-[var(--accent-2)]"
                  >v2</span
                >
              </button>
              <!-- Open as recipe button -->
              <button
                class="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-on)] hover:bg-[var(--accent-hover)] transition-colors"
                title="Open this recipe in a new planning tab"
                @click="emit('openUsedInAsRecipe', entry)"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  stroke-width="2.5"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            <!-- Recipe inputs -->
            <div class="text-xs text-[var(--muted)] space-y-1">
              <div v-for="inp in entry.recipe.inputs" :key="inp.id" class="flex items-center gap-1">
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
                  <span>{{ store.itemsById.get(inp.id)?.name ?? inp.id }}</span>
                </button>
                <span class="text-[var(--muted-2)]">{{ fmt(inp.amount_per_minute) }}/min</span>
              </div>
              <div
                class="flex items-center gap-1 text-[var(--accent)] mt-1 pt-1 border-t border-[var(--border)]"
              >
                <span>→ {{ fmt(entry.recipe.output.amount_per_minute) }}/min</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Exports -->
    <div v-if="itemData.exports.length > 0" class="mt-4">
      <h3 class="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
        Corporation exports
      </h3>
      <div class="space-y-1">
        <div
          v-for="(exp, i) in itemData.exports"
          :key="exp.corpId + '-' + exp.level + '-' + i"
          class="flex items-center gap-3 text-sm"
        >
          <span class="text-[var(--text)]">{{ exp.corp }}</span>
          <span class="text-[var(--muted)] text-xs">Lv {{ exp.level }}</span>
          <span class="text-[var(--accent)] font-mono text-xs">{{ exp.points }} pts</span>
        </div>
      </div>
    </div>
  </div>
</template>
