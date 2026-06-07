<script setup lang="ts">
const year = 2026
</script>

<template>
  <footer class="border-t border-[var(--border)] px-4 py-5 text-xs text-[var(--muted-2)]">
    <div
      class="max-w-screen-xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <!-- Brand -->
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="font-semibold text-[var(--muted)]">Good Stuff Software</span>
        <span class="opacity-50">·</span>
        <a
          href="https://goodstuffsoftware.com"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-[var(--accent)] transition-colors"
          >goodstuffsoftware.com</a
        >
        <span class="opacity-50">·</span>
        <span>© {{ year }}</span>
      </div>

      <!-- Credits / disclaimer -->
      <div class="sm:text-right leading-relaxed">
        Unofficial fan tool — not affiliated with Creepy Jar. Free to use; donations welcome. Game
        data &amp; icons from
        <a
          href="https://github.com/flexsurfer/starrupture-planner"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-[var(--accent)] transition-colors"
          >flexsurfer/starrupture-planner</a
        >
        (MIT) and the
        <a
          href="https://starrupture.wiki.gg"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-[var(--accent)] transition-colors"
          >Star Rupture Wiki</a
        >
        (CC BY-SA 4.0).
      </div>
    </div>
  </footer>
</template>
