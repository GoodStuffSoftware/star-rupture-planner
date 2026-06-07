<script setup lang="ts">
import { onMounted } from 'vue'
import { usePlannerStore } from './stores/plannerStore'
import VersionSelector from './components/VersionSelector.vue'
import TargetSelector from './components/TargetSelector.vue'
import OptionsPanel from './components/OptionsPanel.vue'
import CraftTree from './components/CraftTree.vue'
import TotalsPanel from './components/TotalsPanel.vue'
import ShareButton from './components/ShareButton.vue'
import DetailDrawer from './components/DetailDrawer.vue'
import HoverCard from './components/HoverCard.vue'
import AppFooter from './components/AppFooter.vue'

const store = usePlannerStore()

onMounted(() => {
  store.init()
})
</script>

<template>
  <div class="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col">
    <!-- Header bar -->
    <header class="chamfer backdrop-blur-sm sticky top-0 z-30">
      <div class="max-w-screen-xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4">
        <!-- Title -->
        <div class="flex items-center gap-2 mr-2">
          <div
            class="w-7 h-7 chamfer-sm [--cf-fill:var(--accent-soft)] [--cf-border:var(--accent-soft-border)] flex items-center justify-center shrink-0"
          >
            <svg
              class="w-4 h-4 text-[var(--accent)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h1
            class="text-base font-bold text-[var(--text)] whitespace-nowrap tracking-tight uppercase"
          >
            Star Rupture Planner
          </h1>
        </div>

        <!-- Divider -->
        <div class="hidden sm:block w-px h-6 bg-[var(--border)] shrink-0" />

        <!-- Version selector -->
        <VersionSelector />

        <!-- Divider -->
        <div class="hidden sm:block w-px h-6 bg-[var(--border)] shrink-0" />

        <!-- Target selector -->
        <TargetSelector />

        <!-- Share button — pushed to the right -->
        <div class="ml-auto shrink-0">
          <ShareButton />
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 max-w-screen-xl mx-auto w-full px-4 py-4 flex flex-col gap-4 min-h-0">
      <!-- Options panel (full width, above tree/sidebar) -->
      <OptionsPanel />

      <!-- Tree + Sidebar row -->
      <div class="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        <!-- Left: craft tree (flex-1) — outer frame clips; inner scroll child stays rectangular -->
        <section class="flex-1 min-w-0 chamfer flex flex-col min-h-96">
          <!-- Inner wrapper: no clip, handles padding and scroll -->
          <div class="flex-1 p-4 flex flex-col min-h-0">
            <CraftTree />
          </div>
        </section>

        <!-- Right: sidebar -->
        <aside
          class="w-full lg:w-80 shrink-0 flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto"
        >
          <TotalsPanel />
        </aside>
      </div>
    </main>

    <AppFooter />

    <!-- v6: single app-level detail drawer + hover card -->
    <DetailDrawer />
    <HoverCard />
  </div>
</template>
