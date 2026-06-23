<script setup lang="ts">
import { onMounted } from 'vue'
import { usePlannerStore } from './stores/plannerStore'
import VersionSelector from './components/VersionSelector.vue'
import TargetSelector from './components/TargetSelector.vue'
import RecipeTabs from './components/RecipeTabs.vue'
import AddRecipeButton from './components/AddRecipeButton.vue'
import OptionsPanel from './components/OptionsPanel.vue'
import CraftTree from './components/CraftTree.vue'
import TotalsPanel from './components/TotalsPanel.vue'
import DetailDrawer from './components/DetailDrawer.vue'
import HoverCard from './components/HoverCard.vue'
import AppFooter from './components/AppFooter.vue'

const store = usePlannerStore()

onMounted(() => {
  store.init()
})
</script>

<template>
  <div
    class="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col"
    :style="store.treeFontScale !== 1 ? { zoom: store.treeFontScale } : undefined"
  >
    <!-- Header bar -->
    <header class="chamfer backdrop-blur-sm sticky top-0 z-30">
      <div class="max-w-screen-xl mx-auto px-2 pt-3 pb-2 sm:px-4 flex flex-col gap-3">
        <!-- Row 1: title, version, target search + amount, share -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
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

          <!-- Controls: a full-width wrapping group on mobile; on sm+ it dissolves
               (display:contents) so the items sit inline on the single nav row.
               The add (+) button sits next to the per-minute amount, and Share is
               pushed (ml-auto) to the very end of the header line. -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2 w-full sm:contents">
            <!-- Version selector -->
            <VersionSelector />

            <!-- Divider -->
            <div class="hidden sm:block w-px h-6 bg-[var(--border)] shrink-0" />

            <!-- Target selector (edits the active tab). The add (+) button rides
                 in its trailing slot, so it stays on the per-minute line. With
                 multiple recipes it's hidden at sm+ (the tab line carries it). -->
            <TargetSelector>
              <span :class="store.targets.length > 1 ? 'sm:hidden' : ''">
                <AddRecipeButton />
              </span>
            </TargetSelector>
          </div>
        </div>

        <!-- Row 2: recipe tabs — only once a second recipe exists. The tab strip
             carries its own sticky-right + add button (at sm+). -->
        <div v-if="store.targets.length > 1" class="border-t border-[var(--border)] pt-2.5 min-w-0">
          <RecipeTabs />
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main
      class="flex-1 max-w-screen-xl mx-auto w-full px-2 py-2 sm:px-4 sm:py-4 flex flex-col gap-2 sm:gap-4 min-h-0"
    >
      <!-- Options panel (full width, above tree/sidebar) -->
      <OptionsPanel />

      <!-- Combined "all totals" view -->
      <div v-if="store.isAllView" class="mx-auto w-full max-w-5xl flex flex-col gap-2 sm:gap-4">
        <section class="chamfer px-4 py-3">
          <h2 class="text-lg font-bold text-[var(--accent)] uppercase tracking-tight">
            Big ambitions, convict?
          </h2>
          <p class="text-sm text-[var(--muted)] mt-0.5">
            Every open recipe, tallied into one glorious work order. The Company has noted your
            enthusiasm — and added it to your tab.
          </p>
        </section>
        <TotalsPanel aggregate />
      </div>

      <!-- Tree + Totals — side-by-side (Totals position: Side) or stacked (Bottom).
           Side only applies at md+; mobile always stacks the totals below.
           items-start so the tree box hugs its content instead of stretching. -->
      <div
        v-else
        class="flex flex-col gap-2 sm:gap-4 md:items-start"
        :class="store.totalsPlacement === 'side' ? 'md:flex-row' : ''"
      >
        <!-- Left: craft tree — grows to fit content (flex-1 fills width in side mode) -->
        <section class="w-full md:flex-1 min-w-0 chamfer flex flex-col">
          <!-- Inner wrapper: no clip, handles padding -->
          <div class="p-2 sm:p-4 flex flex-col">
            <CraftTree />
          </div>
        </section>

        <!-- Totals: a sticky right sidebar when 'side', or a full-width panel below when 'bottom' -->
        <aside
          class="w-full shrink-0 flex flex-col gap-4"
          :class="
            store.totalsPlacement === 'side'
              ? 'md:w-80 md:sticky md:top-20 md:max-h-[calc(100vh-5.5rem)] md:overflow-y-auto'
              : ''
          "
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
