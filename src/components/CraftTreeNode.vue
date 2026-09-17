<script setup lang="ts">
// Recursive crafting-tree node: item + producer + per-node version picker.
import { ref, watch } from 'vue'
import type { CraftNode } from '../types/game'
import { fmtBuildings } from '../lib/format'
import { itemTypeChipClass } from '../lib/itemTypeChip'
import { usePlannerStore } from '../stores/plannerStore'
import { stripBuildingVersion } from '../lib/buildingVersion'
import GameIcon from './GameIcon.vue'
import NodeRecipePicker from './tree/NodeRecipePicker.vue'
import NodeBuildingPicker from './tree/NodeBuildingPicker.vue'
import NodeOverageInput from './tree/NodeOverageInput.vue'

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

// Check if this node is an extractor-type raw node (has a building, no inputs)
function isExtractorNode(node: CraftNode): boolean {
  return node.isRaw && !!node.building
}

// Whether to show the extractor machine info on a raw node
function showExtractorMachine(node: CraftNode): boolean {
  return isExtractorNode(node) && store.showExtractors
}

// Hover handlers for text words (excluding icons to prevent tooltip zoom conflicts)
function onItemMouseEnter(e: MouseEvent) {
  store.setHover(
    'item',
    props.node.itemId,
    (e.currentTarget as HTMLElement).getBoundingClientRect(),
  )
}

function onItemMouseLeave() {
  store.clearHover()
}

function onBuildingMouseEnter(e: MouseEvent) {
  if (!props.node.building) return
  store.setHover(
    'building',
    props.node.building.id,
    (e.currentTarget as HTMLElement).getBoundingClientRect(),
  )
}

function onBuildingMouseLeave() {
  store.clearHover()
}

function isV2Building(buildingId: string): boolean {
  return store.chains.some((c) => c.upgradedId === buildingId)
}
</script>

<template>
  <div :class="depth > 0 ? `pl-4 border-l-2 ${getBorderColor(depth - 1)}` : ''">
    <div
      class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--panel-2)] transition-colors group w-full"
      :class="[depth === 0 ? 'py-2' : '', store.showRowDividers ? 'row-underline' : '']"
    >
      <!-- Caret / expand button -->
      <button
        v-if="node.children.length > 0"
        class="w-4 h-4 shrink-0 flex items-center justify-center text-[var(--muted-2)] hover:text-[var(--accent)] transition-colors"
        @click="expanded = !expanded"
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
      <div v-else class="w-4 shrink-0" />

      <!-- Item icon + name + alternate recipe picker -->
      <div class="relative flex items-center gap-1" @click.stop>
        <span
          class="flex items-center gap-1 cursor-pointer hover:text-[var(--accent)] transition-colors"
          @click="store.openItemDetail(node.itemId)"
        >
          <GameIcon
            :id="node.itemId"
            kind="item"
            :name="node.itemName"
            :size="depth === 0 ? 48 : 30"
          />
          <span
            :class="[
              depth === 0
                ? 'text-xl font-bold text-[var(--text-strong)]'
                : depth === 1
                  ? 'text-base font-semibold text-[var(--text-2)]'
                  : 'text-base font-semibold text-[var(--text-2)]',
            ]"
            class="whitespace-nowrap"
            @mouseenter="onItemMouseEnter"
            @mouseleave="onItemMouseLeave"
          >
            {{ node.itemName }}
          </span>
        </span>

        <!-- Modular Recipe Variant Picker Component -->
        <NodeRecipePicker :node="node" />
      </div>

      <!-- Item type chip -->
      <span
        :class="itemTypeChipClass(node.itemType)"
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
        <template v-if="showExtractorMachine(node)">
          <span
            v-if="node.itemType !== 'raw'"
            class="text-xs px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-medium shrink-0"
          >
            raw
          </span>
          <span
            class="text-xs text-slate-400 shrink-0 flex items-center gap-1 whitespace-nowrap cursor-pointer hover:text-[var(--accent)] transition-colors"
            @click="store.openBuildingDetail(node.building!.id)"
          >
            <GameIcon
              :id="node.building!.id"
              kind="building"
              :name="node.building!.name"
              :size="38"
            />
            <span
              class="inline-flex items-center gap-1"
              @mouseenter="onBuildingMouseEnter"
              @mouseleave="onBuildingMouseLeave"
            >
              <span class="text-slate-300"
                >{{ fmtBuildings(node.buildingsNeeded ?? 0) }}&times;</span
              >
              {{ stripBuildingVersion(node.building!.name) }}
              <span
                v-if="isV2Building(node.building!.id)"
                class="text-[10px] font-bold text-[var(--accent-2)]"
                >v2</span
              >
              <span v-if="node.isOverridden" class="text-amber-400 ml-0.5" title="Overridden"
                >&bull;</span
              >
            </span>
          </span>

          <!-- Modular Building Tier Selector Component -->
          <NodeBuildingPicker :node="node" />
        </template>

        <template v-else>
          <span
            v-if="node.itemType !== 'raw'"
            class="text-xs px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-medium shrink-0"
          >
            raw
          </span>
        </template>
      </template>

      <!-- Producer info (non-raw nodes) -->
      <template v-else-if="node.building && node.buildingsNeeded !== undefined">
        <span
          class="text-xs text-slate-400 shrink-0 flex items-center gap-1 whitespace-nowrap cursor-pointer hover:text-[var(--accent)] transition-colors"
          @click="store.openBuildingDetail(node.building.id)"
        >
          <GameIcon :id="node.building.id" kind="building" :name="node.building.name" :size="38" />
          <span
            class="inline-flex items-center gap-1"
            @mouseenter="onBuildingMouseEnter"
            @mouseleave="onBuildingMouseLeave"
          >
            <span class="text-slate-300"
              >{{
                store.showOverages && depth > 0 && !node.isCycle
                  ? Math.ceil(node.buildingsNeeded - 1e-9)
                  : fmtBuildings(node.buildingsNeeded)
              }}&times;</span
            >
            {{ stripBuildingVersion(node.building.name) }}
            <span
              v-if="isV2Building(node.building.id)"
              class="text-[10px] font-bold text-[var(--accent-2)]"
              >v2</span
            >
            <span v-if="node.isOverridden" class="text-amber-400 ml-0.5" title="Overridden"
              >&bull;</span
            >
          </span>
        </span>

        <!-- Modular Building Tier Selector Component -->
        <NodeBuildingPicker :node="node" />
      </template>

      <!-- Modular Rate & Overage Stepper Component -->
      <NodeOverageInput :node="node" :depth="depth" />
    </div>

    <!-- Recursive Children -->
    <div v-if="expanded && node.children.length > 0" class="mt-0.5">
      <CraftTreeNode
        v-for="child in node.children"
        :key="child.itemId"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>
