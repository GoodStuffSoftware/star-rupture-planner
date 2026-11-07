<script setup lang="ts">
import { computed } from 'vue'
import SupportButton from './SupportButton.vue'
import { usePlannerStore } from '../stores/plannerStore'
import { VERSIONS } from '../data/versions'

const REPO = 'https://github.com/GoodStuffSoftware/star-rupture-planner'
const CHANGELOG_URL = `${REPO}/blob/main/CHANGELOG.md`
const FEEDBACK_URL = `${REPO}/issues/new?labels=feedback&template=feedback.md&title=%5BFeedback%5D+`

const store = usePlannerStore()

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
  <footer class="px-2 pt-6 pb-4 sm:px-4">
    <div class="chamfer mx-auto max-w-screen-xl text-xs text-[var(--muted)]">
      <!-- Top: brand + links (left), build identity (right) -->
      <div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div class="flex min-w-0 flex-col gap-3">
          <p class="flex items-center gap-2 text-sm font-semibold text-[var(--text-strong)]">
            <span
              class="clip-chamfer-sm inline-block h-3 w-3 bg-[var(--accent)]"
              aria-hidden="true"
            />
            Good Stuff Software
          </p>
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
            <SupportButton />
          </nav>
        </div>

        <dl class="flex flex-col gap-1.5 sm:items-end">
          <div class="flex items-center gap-2">
            <dt class="sr-only">App version</dt>
            <dd class="flex items-center gap-2 font-mono">
              <a
                :href="CHANGELOG_URL"
                target="_blank"
                rel="noopener noreferrer"
                title="View the changelog"
                data-testid="app-version"
                class="chamfer-sm inline-block px-2 py-0.5 text-[var(--accent)] transition-colors [--cf-border:var(--accent-soft-border)] [--cf-fill:var(--panel-2)] hover:text-[var(--accent-hover)] focus-visible:text-[var(--accent-hover)] focus-visible:[--cf-border:var(--accent)]"
                ><span class="sr-only">Changelog, </span>v{{ version }}</a
              >
              <span v-if="commit" data-testid="app-commit"
                ><span class="sr-only">build </span>{{ commit }}</span
              >
            </dd>
          </div>
          <div class="flex items-center gap-2">
            <dt>Game data</dt>
            <dd class="font-mono text-[var(--text-2)]" data-testid="game-data-version">
              {{ gameVersionLabel }}
            </dd>
          </div>
        </dl>
      </div>

      <!-- Bottom: disclaimer + attribution -->
      <div class="border-t border-[var(--border)] px-4 py-3 leading-relaxed sm:px-5">
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
