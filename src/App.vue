<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { usePlannerStore } from './stores/plannerStore'
import { planTargetList } from './lib/persistState'
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

// Transient notices (e.g. an unknown ?add= item) clear themselves, but only
// after a few seconds on screen: a notice raised while the tab is in the
// background (an item handed over from the game) waits until it is shown.
const NOTICE_MS = 8000
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function armNotice() {
  clearTimeout(noticeTimer)
  if (store.notice && document.visibilityState !== 'hidden') {
    noticeTimer = setTimeout(() => (store.notice = null), NOTICE_MS)
  }
}
watch(() => store.notice, armNotice)
document.addEventListener('visibilitychange', armNotice)
onUnmounted(() => {
  document.removeEventListener('visibilitychange', armNotice)
  clearTimeout(noticeTimer)
})
</script>

<template>
  <!-- An `?add=` tab that is handing its item to an open planner tab shows only this. -->
  <div
    v-if="store.handOff"
    role="status"
    class="min-h-screen bg-[var(--bg)] text-[var(--text)] flex items-center justify-center p-4"
  >
    <p class="chamfer px-4 py-3 text-sm text-center">
      {{
        store.handOff === 'done'
          ? 'Added to your open planner tab — you can close this one.'
          : 'Checking for an open planner tab…'
      }}
    </p>
  </div>
  <div
    v-else
    class="min-h-screen bg-[var(--bg)] text-[var(--text)] flex flex-col"
    :style="store.treeFontScale !== 1 ? { zoom: store.treeFontScale } : undefined"
  >
    <!-- Header bar -->
    <header class="chamfer backdrop-blur-sm sticky top-0 relative overflow-hidden z-30">
      <div class="max-w-screen-xl mx-auto px-2 pt-3 pb-2 sm:px-4 flex flex-col gap-3">
        <!-- Row 1: title, version, target search + amount, share -->
        <div
          id="header-row1"
          class="flex flex-wrap items-center gap-x-2 md:gap-x-3 lg:gap-x-4 gap-y-2"
        >
          <!-- Title -->
          <button
            class="flex items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity cursor-pointer shrink-0"
            title="Browse all items"
            @click="store.openItemIndex()"
          >
            <div
              class="w-6 h-6 sm:w-7 sm:h-7 chamfer-sm [--cf-fill:var(--accent-soft)] [--cf-border:var(--accent-soft-border)] flex items-center justify-center shrink-0"
            >
              <svg
                class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--accent)]"
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
              class="text-xs sm:text-base font-bold text-[var(--text)] whitespace-nowrap tracking-tight uppercase"
            >
              Star Rupture Planner
            </h1>
          </button>

          <!-- Divider -->
          <div class="hidden sm:block w-px h-6 bg-[var(--border)] shrink-0" />

          <!-- Controls: a full-width wrapping group on mobile (<640px); on >=640px it dissolves
               (display:contents) so the items sit inline on the single nav row. -->
          <div class="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-2 w-full sm:contents">
            <!-- Version selector -->
            <span id="version-selector-wrap"><VersionSelector /></span>

            <!-- Divider — marks start of blur zone in row 1 -->
            <div id="blur-start" class="hidden sm:block w-px h-6 bg-[var(--border)] shrink-0" />

            <!-- Target selector (edits the active tab). The add (+) button rides
                 in its trailing slot, so it stays on the per-minute line. With
                 multiple recipes it's hidden at >=640px (the tab line carries it). -->
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

      <!-- Combined "all totals" view — tagline lives inside the totals container -->
      <div v-if="store.isAllView" class="mx-auto w-full max-w-5xl">
        <TotalsPanel aggregate>
          <template #header>
            <h2 class="text-lg font-bold text-[var(--accent)] uppercase tracking-tight">
              Big ambitions, convict?
            </h2>
            <p class="text-sm text-[var(--muted)] mt-0.5">
              Every open recipe, tallied into one glorious work order. The Company has noted your
              enthusiasm — and added it to your tab.
            </p>
          </template>
        </TotalsPanel>
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

    <!-- Non-blocking notice (dismiss on click or after a few seconds). The fixed positioning
         lives on the wrapper: .chamfer sets position: relative and would override it. -->
    <div
      v-if="store.notice"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw]"
      @click="store.notice = null"
    >
      <div
        role="status"
        class="chamfer px-4 py-2 text-sm text-[var(--text)] break-words cursor-pointer"
      >
        {{ store.notice }}
      </div>
    </div>

    <!-- A shared-plan link that differs from the saved plan waits here for a choice;
         nothing has been changed or saved yet. -->
    <div
      v-if="store.pendingShare"
      role="alertdialog"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[28rem] max-w-[90vw]"
    >
      <div class="chamfer p-3 text-sm">
        <p class="text-[var(--text)]">
          This link carries a shared plan ({{ planTargetList(store.pendingShare).length }}
          {{ planTargetList(store.pendingShare).length === 1 ? 'recipe' : 'recipes' }}) that differs
          from your saved plan. Nothing has been changed yet.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="chamfer-sm [--cf-fill:var(--accent)] hover:[--cf-fill:var(--accent-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-on)] transition-colors"
            @click="store.resolveShare('add')"
          >
            Add to my plan
          </button>
          <button
            class="chamfer-sm [--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            @click="store.resolveShare('keep')"
          >
            Keep mine
          </button>
          <button
            class="chamfer-sm [--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-red-300 transition-colors"
            @click="store.resolveShare('use')"
          >
            Use shared plan (replaces mine)
          </button>
        </div>
      </div>
    </div>

    <!-- v6: single app-level detail drawer + hover card -->
    <DetailDrawer />
    <HoverCard />
  </div>
</template>
