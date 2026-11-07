<script setup lang="ts">
import { computed } from 'vue'
import SupportButton from './SupportButton.vue'
import { usePlannerStore } from '../stores/plannerStore'
import { VERSIONS } from '../data/versions'

const REPO = 'https://github.com/GoodStuffSoftware/star-rupture-planner'
const CHANGELOG_URL = `${REPO}/blob/main/CHANGELOG.md`
const FEEDBACK_URL = `${REPO}/issues/new?labels=feedback&template=feedback.md&title=%5BFeedback%5D+`

const store = usePlannerStore()

// Served from public/ (a copy of the company's dark-mode logo mark).
const LOGO_SRC = '/gss-logo.svg'
const year = 2026
const version = __APP_VERSION__
const commit = __APP_COMMIT__
const gameVersionLabel = computed(
  () => VERSIONS.find((v) => v.id === store.version)?.label ?? store.version,
)

// Shared look for every text link in the footer.
const link =
  'text-[var(--text-2)] underline decoration-[var(--border)] underline-offset-4 transition-colors hover:text-[var(--accent)] hover:decoration-[var(--accent)] focus-visible:text-[var(--accent)]'
</script>

<template>
  <footer class="px-2 py-2 sm:px-4">
    <!-- One spacing unit (p-2.5) on all four sides and around the divider. -->
    <div class="chamfer mx-auto max-w-screen-xl text-xs text-[var(--muted)]">
      <!-- Main row: brand + links | coffee (dead centre) | build identity -->
      <div
        class="grid grid-cols-1 items-center justify-items-center gap-2.5 p-2.5 lg:grid-cols-[1fr_auto_1fr] lg:justify-items-stretch"
      >
        <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 lg:justify-start">
          <div class="flex items-center gap-2">
            <a
              href="https://goodstuffsoftware.com"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex"
              data-testid="gss-logo"
            >
              <img
                :src="LOGO_SRC"
                alt="Good Stuff Software"
                width="20"
                height="20"
                class="h-5 w-5"
              />
            </a>
            <span class="text-sm font-semibold text-[var(--text-strong)]">Good Stuff Software</span>
          </div>
          <nav aria-label="Footer links" class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href="https://goodstuffsoftware.com"
              target="_blank"
              rel="noopener noreferrer"
              :class="link"
              >goodstuffsoftware.com</a
            >
            <a :href="REPO" target="_blank" rel="noopener noreferrer" :class="link">GitHub</a>
            <a :href="FEEDBACK_URL" target="_blank" rel="noopener noreferrer" :class="link"
              >Feedback</a
            >
          </nav>
        </div>

        <SupportButton />

        <dl class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:justify-end">
          <dt class="sr-only">App version</dt>
          <dd class="flex items-center gap-3 font-mono">
            <a
              :href="CHANGELOG_URL"
              target="_blank"
              rel="noopener noreferrer"
              title="View the changelog"
              data-testid="app-version"
              class="chamfer-sm inline-flex h-6 items-center px-2.5 text-[var(--accent)] transition-colors [--cf-border:var(--accent-soft-border)] [--cf-fill:var(--panel-2)] hover:text-[var(--accent-hover)] focus-visible:text-[var(--accent-hover)] focus-visible:[--cf-border:var(--accent)]"
              ><span class="sr-only">Changelog, </span>v{{ version }}</a
            >
            <a
              v-if="commit"
              :href="`${REPO}/commit/${commit}`"
              target="_blank"
              rel="noopener noreferrer"
              title="View this build's commit"
              data-testid="app-commit"
              :class="link"
              ><span class="sr-only">build </span>{{ commit }}</a
            >
          </dd>
          <dt>Game data</dt>
          <dd class="-ml-1.5 font-mono text-[var(--text-2)]" data-testid="game-data-version">
            {{ gameVersionLabel }}
          </dd>
        </dl>
      </div>

      <!-- Bottom: disclaimer + attribution -->
      <div class="border-t border-[var(--border)] p-2.5 text-center leading-tight lg:text-left">
        <p>
          Unofficial fan tool, not affiliated with or endorsed by Creepy Jar. Free to use; donations
          welcome. Game data &amp; icons from
          <a
            href="https://github.com/flexsurfer/starrupture-planner"
            target="_blank"
            rel="noopener noreferrer"
            :class="link"
            >flexsurfer/starrupture-planner</a
          >
          (MIT) and the
          <a
            href="https://starrupture.wiki.gg"
            target="_blank"
            rel="noopener noreferrer"
            :class="link"
            >Star Rupture Wiki</a
          >
          (CC BY-SA 4.0). &copy; {{ year }} Good Stuff Software LLC.
        </p>
      </div>
    </div>
  </footer>
</template>
