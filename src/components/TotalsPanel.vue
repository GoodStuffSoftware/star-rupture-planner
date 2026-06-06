<script setup lang="ts">
import { usePlannerStore } from '../stores/plannerStore'
import { fmt, fmtBuildings } from '../lib/format'
import GameIcon from './GameIcon.vue'

const store = usePlannerStore()
</script>

<template>
  <div class="bg-[#1a1714] border border-[#34302a] clip-chamfer p-4 space-y-4">
    <h3 class="text-sm font-semibold text-[#f3f1ee] uppercase tracking-wider">Totals</h3>

    <div v-if="!store.totals" class="text-[#736d64] text-sm italic">No target selected</div>

    <template v-else>
      <!-- Raw Materials -->
      <div>
        <h4 class="text-xs font-medium text-[#a8a29a] uppercase tracking-wider mb-2">
          Raw materials / min
        </h4>
        <div v-if="store.totals.rawMaterials.length === 0" class="text-[#736d64] text-sm italic">
          None
        </div>
        <div v-else class="space-y-1">
          <div
            v-for="mat in store.totals.rawMaterials"
            :key="mat.itemId"
            class="flex justify-between items-center text-base"
          >
            <span class="flex items-center gap-1.5 text-[#f3f1ee] truncate">
              <GameIcon kind="item" :id="mat.itemId" :name="mat.itemName" :size="22" />
              {{ mat.itemName }}
            </span>
            <span class="text-emerald-400 font-mono ml-2 shrink-0">{{ fmt(mat.ratePerMin) }}</span>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-[#34302a]" />

      <!-- Buildings -->
      <div>
        <h4 class="text-xs font-medium text-[#a8a29a] uppercase tracking-wider mb-2">Buildings</h4>
        <div v-if="store.totals.buildings.length === 0" class="text-[#736d64] text-sm italic">
          None
        </div>
        <div v-else class="space-y-1">
          <div
            v-for="bld in store.totals.buildings"
            :key="bld.buildingId"
            class="flex justify-between items-center text-base"
          >
            <span class="flex items-center gap-1.5 text-[#f3f1ee] truncate">
              <GameIcon kind="building" :id="bld.buildingId" :name="bld.buildingName" :size="22" />
              {{ bld.buildingName }}
            </span>
            <span class="text-[#ee8b22] font-mono ml-2 shrink-0">
              &times;{{ bld.ceilCount }}
              <span class="text-[#736d64] text-xs">({{ fmtBuildings(bld.count) }})</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-[#34302a]" />

      <!-- Power & Heat -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-[#24201b] clip-chamfer-sm p-2.5">
          <div class="text-xs text-[#736d64] mb-1">Power</div>
          <div class="text-base font-mono text-amber-400">{{ fmt(store.totals.totalPower) }} W</div>
        </div>
        <div class="bg-[#24201b] clip-chamfer-sm p-2.5">
          <div class="text-xs text-[#736d64] mb-1">Heat</div>
          <div class="text-base font-mono text-red-400">{{ fmt(store.totals.totalHeat) }}</div>
        </div>
      </div>
    </template>
  </div>
</template>
