<script setup lang="ts">
import { ref } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'

const store = usePlannerStore()

const copied = ref(false)
let _resetTimer: ReturnType<typeof setTimeout> | null = null

async function handleShare() {
  const url = store.buildShareUrl()

  // Attempt modern clipboard API first
  const didCopy = await tryClipboard(url)

  if (!didCopy) {
    // Graceful fallback: select a hidden textarea
    fallbackCopy(url)
  }

  // Show transient "Copied!" for 1.5 s
  copied.value = true
  if (_resetTimer !== null) clearTimeout(_resetTimer)
  _resetTimer = setTimeout(() => {
    copied.value = false
    _resetTimer = null
  }, 1500)
}

async function tryClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator?.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function fallbackCopy(text: string): void {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  } catch {
    // Last resort: nothing we can do without throwing
  }
}
</script>

<template>
  <button
    class="chamfer-sm flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors"
    :class="
      copied
        ? '[--cf-fill:var(--accent-soft)] [--cf-border:var(--accent-soft-border)] text-[var(--accent)]'
        : '[--cf-fill:var(--panel-2)] hover:[--cf-fill:var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
    "
    :title="copied ? 'URL copied to clipboard!' : 'Copy shareable link'"
    @click="handleShare"
  >
    <!-- Link icon -->
    <svg
      v-if="!copied"
      class="w-3.5 h-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
    <!-- Check icon (copied state) -->
    <svg
      v-else
      class="w-3.5 h-3.5 shrink-0 text-[var(--accent)]"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>

    <span>{{ copied ? 'Copied!' : 'Share' }}</span>
  </button>
</template>
