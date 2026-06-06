<script setup lang="ts">
// Recursive crafting-tree node: item + producer + per-node version picker.
import { ref, watch } from 'vue'
import type { CraftNode } from '../types/game'
import { fmt, fmtBuildings } from '../lib/format'
import { usePlannerStore } from '../stores/plannerStore'
import GameIcon from './GameIcon.vue'

const props = defineProps<{
  node: CraftNode
  depth: number
}>()

const store = usePlannerStore()

// Expanded based on expandLevel from store; caret toggle still works locally
const expanded = ref(props.depth < store.expandLevel)

watch(
  () => store.expandLevel,
  (l) => {
    expanded.value = props.depth < l
  },
)

const typeColors: Record<string, string> = {
  raw: 'bg-amber-900/60 text-amber-300',
  processed: 'bg-blue-900/60 text-blue-300',
  component: 'bg-emerald-900/60 text-emerald-300',
  material: 'bg-purple-900/60 text-purple-300',
  ammo: 'bg-red-900/60 text-red-300',
}

const depthBorderColors = [
  'border-cyan-700/60',
  'border-emerald-700/60',
  'border-purple-700/60',
  'border-amber-700/60',
  'border-red-700/60',
  'border-blue-700/60',
]

function getBorderColor(depth: number): string {
  return depthBorderColors[depth % depthBorderColors.length]
}

// Derive a short version tag for a building id given the chain list
function versionTag(buildingId: string): string {
  const chains = store.productionChains
  // Is it an upgraded (v2) id?
  if (chains.some((c) => c.upgradedId === buildingId)) return 'v2'
  // Is it a base (v1) id in a production chain?
  if (chains.some((c) => c.baseId === buildingId)) return 'v1'
  // Fall back to short name
  return store.buildingsById.get(buildingId)?.name ?? buildingId
}

// Check if this node is an extractor-type raw node (has a building, no inputs)
function isExtractorNode(node: CraftNode): boolean {
  return node.isRaw && !!node.building
}

// Whether to show the extractor machine info on a raw node
function showExtractorMachine(node: CraftNode): boolean {
  return isExtractorNode(node) && store.showExtractors
}
</script>

<template>
  <div :class="depth > 0 ? `pl-4 border-l-2 ${getBorderColor(depth - 1)}` : ''">
    <!-- Node row -->
    <div
      class="flex items-center gap-2 py-1 px-2 rounded hover:bg-[#24201b] transition-colors group"
      :class="depth === 0 ? 'py-1.5' : ''"
    >
      <!-- Caret / expand button -->
      <button
        v-if="node.children.length > 0"
        @click="expanded = !expanded"
        class="w-4 h-4 shrink-0 flex items-center justify-center text-[#736d64] hover:text-[#ee8b22] transition-colors"
      >
        <svg
          :class="expanded ? 'rotate-90' : ''"
          class="w-3 h-3 transition-transform"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fill-rule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
      <!-- Spacer for leaf nodes -->
      <div v-else class="w-4 shrink-0" />

      <!-- Item icon + name -->
      <GameIcon
        kind="item"
        :id="node.itemId"
        :name="node.itemName"
        :size="24"
      />
      <span
        class="font-semibold text-base"
        :class="depth === 0 ? 'text-[#f6f4f1]' : 'text-[#d8d3cc]'"
      >
        {{ node.itemName }}
      </span>

      <!-- Item type chip -->
      <span
        :class="typeColors[node.itemType] ?? 'bg-slate-700 text-slate-300'"
        class="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
      >
        {{ node.itemType }}
      </span>

      <!-- Cycle badge -->
      <span
        v-if="node.isCycle"
        class="text-xs px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 font-medium shrink-0"
      >
        &#8635; cycle
      </span>

      <!-- Raw node handling -->
      <template v-else-if="node.isRaw">
        <!-- Extractor with machine shown (showExtractors ON) -->
        <template v-if="showExtractorMachine(node)">
          <span class="text-xs px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-medium shrink-0">
            raw
          </span>
          <span class="text-xs text-slate-400 shrink-0 flex items-center gap-1">
            <GameIcon
              kind="building"
              :id="node.building!.id"
              :name="node.building!.name"
              :size="20"
            />
            <span class="text-slate-300">{{ fmtBuildings(node.buildingsNeeded ?? 0) }}&times;</span>
            {{ node.building!.name }}
            <span v-if="node.isOverridden" class="text-amber-400 ml-0.5" title="Overridden">&bull;</span>
          </span>
          <!-- Extractor version picker -->
          <div
            v-if="node.candidates && node.candidates.length > 1"
            class="flex shrink-0 clip-chamfer-sm border border-[#34302a] overflow-hidden text-xs"
          >
            <button
              v-for="cand in node.candidates"
              :key="cand.buildingId"
              @click="store.setOverride(node.itemId, cand.buildingId)"
              :class="
                node.building?.id === cand.buildingId
                  ? 'bg-[#ee8b22] text-black'
                  : 'bg-[#24201b] text-[#a8a29a] hover:bg-[#34302a] hover:text-[#f3f1ee]'
              "
              class="px-1.5 py-0.5 transition-colors border-r border-[#34302a] last:border-r-0 flex items-center gap-1"
              :title="cand.buildingName"
            >
              <GameIcon kind="building" :id="cand.buildingId" :name="cand.buildingName" :size="16" />
              {{ versionTag(cand.buildingId) }}
            </button>
          </div>
        </template>

        <!-- Plain raw leaf (showExtractors OFF or no building) -->
        <template v-else>
          <span class="text-xs px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-medium shrink-0">
            raw
          </span>
        </template>
      </template>

      <!-- Producer info (non-raw nodes) -->
      <template v-else-if="node.building && node.buildingsNeeded !== undefined">
        <span class="text-xs text-slate-400 shrink-0 flex items-center gap-1">
          <GameIcon
            kind="building"
            :id="node.building.id"
            :name="node.building.name"
            :size="20"
          />
          <span class="text-slate-300">{{ fmtBuildings(node.buildingsNeeded) }}&times;</span>
          {{ node.building.name }}
          <span v-if="node.isOverridden" class="text-amber-400 ml-0.5" title="Overridden">&bull;</span>
        </span>

        <!-- Version picker (when >1 candidate) -->
        <div
          v-if="node.candidates && node.candidates.length > 1"
          class="flex shrink-0 clip-chamfer-sm border border-[#34302a] overflow-hidden text-xs"
        >
          <button
            v-for="cand in node.candidates"
            :key="cand.buildingId"
            @click="store.setOverride(node.itemId, cand.buildingId)"
            :class="
              node.building?.id === cand.buildingId
                ? 'bg-[#ee8b22] text-black'
                : 'bg-[#24201b] text-[#a8a29a] hover:bg-[#34302a] hover:text-[#f3f1ee]'
            "
            class="px-1.5 py-0.5 transition-colors border-r border-[#34302a] last:border-r-0 flex items-center gap-1"
            :title="cand.buildingName"
          >
            <GameIcon kind="building" :id="cand.buildingId" :name="cand.buildingName" :size="16" />
            {{ versionTag(cand.buildingId) }}
          </button>
        </div>
      </template>

      <!-- Rate (right-aligned) -->
      <span class="ml-auto text-base font-mono text-slate-400 shrink-0 pl-3">
        {{ fmt(node.ratePerMin) }}/min
      </span>
    </div>

    <!-- Children -->
    <div v-if="expanded && node.children.length > 0" class="mt-0.5">
      <CraftTreeNode
        v-for="child in node.children"
        :key="child.itemId + '-' + child.ratePerMin"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>
