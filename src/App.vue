<script setup lang="ts">
import { onMounted } from 'vue'
import { usePlannerStore } from './stores/plannerStore'
import VersionSelector from './components/VersionSelector.vue'
import TargetSelector from './components/TargetSelector.vue'
import OptionsPanel from './components/OptionsPanel.vue'
import CraftTree from './components/CraftTree.vue'
import TotalsPanel from './components/TotalsPanel.vue'

const store = usePlannerStore()

onMounted(() => {
  store.load(store.version)
})
</script>

<template>
  <div class="min-h-screen bg-[#0d0c0b] text-[#f3f1ee] flex flex-col">
    <!-- Header bar -->
    <header class="border-b border-[#34302a] bg-[#1a1714]/95 backdrop-blur-sm sticky top-0 z-30 clip-chamfer">
      <div class="max-w-screen-xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
        <!-- Title -->
        <div class="flex items-center gap-2 mr-2">
          <div class="w-7 h-7 clip-chamfer-sm bg-[#ee8b22]/20 border border-[#ee8b22]/40 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-[#ee8b22]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h1 class="text-base font-bold text-[#f3f1ee] whitespace-nowrap tracking-tight uppercase">
            Star Rupture Planner
          </h1>
        </div>

        <!-- Divider -->
        <div class="hidden sm:block w-px h-6 bg-[#34302a] shrink-0" />

        <!-- Version selector -->
        <VersionSelector />

        <!-- Divider -->
        <div class="hidden sm:block w-px h-6 bg-[#34302a] shrink-0" />

        <!-- Target selector -->
        <TargetSelector />
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 max-w-screen-xl mx-auto w-full px-4 py-4 flex flex-col gap-4 min-h-0">
      <!-- Options panel (full width, above tree/sidebar) -->
      <OptionsPanel />

      <!-- Tree + Sidebar row -->
      <div class="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        <!-- Left: craft tree (flex-1) — outer frame clips; inner scroll child stays rectangular -->
        <section class="flex-1 min-w-0 bg-[#1a1714] rounded-none border border-[#34302a] clip-chamfer flex flex-col min-h-96">
          <!-- Inner wrapper: no clip, handles padding and scroll -->
          <div class="flex-1 p-4 flex flex-col min-h-0">
            <CraftTree />
          </div>
        </section>

        <!-- Right: sidebar -->
        <aside class="w-full lg:w-80 shrink-0 flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto">
          <TotalsPanel />
        </aside>
      </div>
    </main>
  </div>
</template>
