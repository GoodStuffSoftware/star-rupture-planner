<script setup lang="ts">
import SupportButton from './SupportButton.vue'

const REPO = 'https://github.com/GoodStuffSoftware/star-rupture-planner'
const CHANGELOG_URL = `${REPO}/blob/main/CHANGELOG.md`
const FEEDBACK_URL = `${REPO}/issues/new?labels=feedback&template=feedback.md&title=%5BFeedback%5D+`

// Served from public/: the studio's mark + wordmark lockup (dark-surface colours, text outlined).
const LOGO_SRC = '/gss-lockup.svg'
const year = 2026
const version = __APP_VERSION__

// Shared look for every text link in the footer.
const link =
  'text-[var(--text-2)] underline decoration-[var(--border)] underline-offset-4 transition-colors hover:text-[var(--accent)] hover:decoration-[var(--accent)] focus-visible:text-[var(--accent)]'
</script>

<template>
  <!-- Sits directly on the page background: no panel, border or fill. Same horizontal inset and
       max width as <main>; equal top and bottom padding. -->
  <footer class="w-full max-w-screen-xl mx-auto px-2 py-4 sm:px-4 text-xs text-[var(--muted)]">
    <div>
      <!-- Main row: logo + links | coffee (dead centre) | version. Below 440px the three stack,
           centred, in that order. -->
      <div
        class="grid grid-cols-1 justify-items-center items-center gap-x-3 gap-y-3 min-[440px]:grid-cols-[1fr_auto_1fr]"
      >
        <div
          class="flex flex-col items-center gap-2 min-[440px]:items-start min-[440px]:justify-self-start"
        >
          <a
            href="https://goodstuffsoftware.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Good Stuff Software"
            class="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            data-testid="gss-logo"
          >
            <img
              :src="LOGO_SRC"
              alt="Good Stuff Software"
              width="129"
              height="36"
              class="h-9 w-auto max-w-full"
            />
          </a>
          <nav aria-label="Footer links" class="flex items-center gap-x-3">
            <a :href="REPO" target="_blank" rel="noopener noreferrer" :class="link">GitHub</a>
            <a :href="FEEDBACK_URL" target="_blank" rel="noopener noreferrer" :class="link"
              >Feedback</a
            >
          </nav>
        </div>

        <div class="justify-self-center">
          <SupportButton />
        </div>

        <a
          :href="CHANGELOG_URL"
          target="_blank"
          rel="noopener noreferrer"
          title="View the changelog"
          data-testid="app-version"
          class="font-mono text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)] focus-visible:text-[var(--accent-hover)] justify-self-center min-[440px]:justify-self-end"
          ><span class="sr-only">Changelog, </span>v{{ version }}</a
        >
      </div>

      <hr class="my-3 border-0 border-t border-[var(--border)]" />

      <!-- Fine print: disclaimer + attribution (licence terms require the credits) -->
      <p class="text-center text-[0.6875rem] leading-snug">
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
  </footer>
</template>
