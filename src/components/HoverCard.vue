<script setup lang="ts">
/**
 * HoverCard — single app-level instance, teleported to body.
 * Driven by store.hover. Positioned near hover.rect (above if room, else below).
 * The 350ms open delay is handled in the store (setHover action).
 */
import { computed } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import GameIcon from './GameIcon.vue'

const store = usePlannerStore()

// Position the card near hover.rect — prefer above, fall back to below.
const cardStyle = computed(() => {
  const h = store.hover
  if (!h) return {}
  const rect = h.rect
  const cardH = 120 // estimated card height
  const cardW = 240 // fixed card width

  let top: number
  if (rect.top - cardH - 8 >= 8) {
    // Above
    top = rect.top - cardH - 8
  } else {
    // Below
    top = rect.bottom + 8
  }

  // Clamp horizontally
  let left = rect.left
  if (left + cardW > window.innerWidth - 8) {
    left = window.innerWidth - cardW - 8
  }
  if (left < 8) left = 8

  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${cardW}px`,
  }
})

// For items: find a producer building name
const itemProducerName = computed(() => {
  const h = store.hover
  if (!h || h.kind !== 'item') return null
  const producer = store.fullProducerIndex.get(h.id)?.[0]
  return producer?.building.name ?? null
})

// For buildings: count distinct inputs and recipes/outputs
const buildingStats = computed(() => {
  const h = store.hover
  if (!h || h.kind !== 'building') return null
  const building = store.buildingsById.get(h.id)
  if (!building) return null

  const allInputIds = new Set<string>()
  const recipeCount = building.recipes?.length ?? 0
  for (const recipe of building.recipes ?? []) {
    for (const inp of recipe.inputs) allInputIds.add(inp.id)
  }

  // Tier info
  const chains = store.chains
  const isV2 = chains.some((c) => c.upgradedId === building.id)
  const isV1 = chains.some((c) => c.baseId === building.id)
  const tier = isV2 ? 'v2' : isV1 ? 'v1' : null

  return {
    building,
    power: building.power ?? 0,
    heat: building.heat ?? 0,
    inputCount: allInputIds.size,
    outputCount: recipeCount,
    tier,
  }
})

const typeColors: Record<string, string> = {
  raw: 'bg-amber-900/60 text-amber-300',
  processed: 'bg-blue-900/60 text-blue-300',
  component: 'bg-emerald-900/60 text-emerald-300',
  material: 'bg-purple-900/60 text-purple-300',
  ammo: 'bg-red-900/60 text-red-300',
}
</script>

<template>
  <Teleport to="body">
    <div v-if="store.hover" :style="cardStyle" class="fixed z-[200] pointer-events-none">
      <!-- Two layers: outer = border colour, inner = panel — both chamfered, so the
           2px border follows the chamfer on all corners (clip-path can't clip a border). -->
      <div class="clip-chamfer bg-[var(--muted-2)] shadow-2xl p-[2px]">
        <div class="clip-chamfer bg-[var(--panel)] p-3.5 text-sm">
          <!-- Item hover card -->
          <template v-if="store.hover.kind === 'item'">
            <div class="flex items-center gap-2 mb-2">
              <GameIcon
                :id="store.hover.id"
                kind="item"
                :name="store.itemsById.get(store.hover.id)?.name ?? store.hover.id"
                :size="24"
              />
              <span class="font-semibold text-[var(--text-strong)] truncate">
                {{ store.itemsById.get(store.hover.id)?.name ?? store.hover.id }}
              </span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span
                :class="
                  typeColors[store.itemsById.get(store.hover.id)?.type ?? 'component'] ??
                  'bg-slate-700 text-slate-300'
                "
                class="text-xs px-1.5 py-0.5 rounded font-medium"
              >
                {{ store.itemsById.get(store.hover.id)?.type ?? 'item' }}
              </span>
              <span v-if="itemProducerName" class="text-[var(--muted)] text-xs">
                Made by {{ itemProducerName }}
              </span>
            </div>
          </template>

          <!-- Building hover card -->
          <template v-else-if="store.hover.kind === 'building' && buildingStats">
            <div class="flex items-center gap-2 mb-2">
              <GameIcon
                :id="store.hover.id"
                kind="building"
                :name="buildingStats.building.name"
                :size="24"
              />
              <span class="font-semibold text-[var(--text-strong)] truncate">
                {{ buildingStats.building.name }}
              </span>
            </div>
            <div class="flex items-center gap-2 flex-wrap text-xs text-[var(--muted)]">
              <span
                v-if="buildingStats.tier"
                class="bg-[var(--panel-2)] border border-[var(--border)] px-1.5 py-0.5 rounded"
              >
                {{ buildingStats.tier }}
              </span>
              <span>⚡ {{ buildingStats.power }} W</span>
              <span>🔥 {{ buildingStats.heat }}</span>
              <span :title="`${buildingStats.inputCount} distinct input items`"
                >↓{{ buildingStats.inputCount }} in</span
              >
              <span :title="`${buildingStats.outputCount} recipes / outputs`"
                >↑{{ buildingStats.outputCount }} out</span
              >
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
