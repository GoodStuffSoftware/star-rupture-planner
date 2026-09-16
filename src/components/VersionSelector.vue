<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { usePlannerStore } from '../stores/plannerStore'
import { VERSIONS } from '../data/versions'

const store = usePlannerStore()
const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)

// Position the dropdown relative to the trigger button
const dropdownStyle = ref<Record<string, string>>({})

function select(id: string) {
  store.setVersion(id)
  open.value = false
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    updatePosition()
  }
}

function updatePosition() {
  if (!triggerEl.value) return
  const rect = triggerEl.value.getBoundingClientRect()
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: 'max-content',
    zIndex: '300',
  }
}

function onBackdrop() {
  open.value = false
}

const currentLabel = computed(
  () => VERSIONS.find((v) => v.id === store.version)?.label ?? store.version,
)
</script>

<template>
  <div class="flex items-center gap-2">
    <label class="text-xs font-medium text-[var(--muted)] uppercase tracking-wider"> Ver </label>
    <div class="relative">
      <!-- Trigger button -->
      <button
        ref="triggerEl"
        class="chamfer-sm [--cf-fill:var(--panel-2)] flex items-center gap-1.5 px-2 py-1.5 text-sm text-[var(--text)] hover:[--cf-fill:var(--border)] transition-colors cursor-pointer select-none"
        @click.stop="toggle"
      >
        {{ currentLabel }}
        <svg
          class="w-3 h-3 text-[var(--muted)]"
          :class="open ? 'rotate-180' : ''"
          style="transition: transform 0.15s"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fill-rule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>

    <!-- Teleported dropdown (escapes the header's clip-path) -->
    <Teleport to="body">
      <template v-if="open">
        <!-- Backdrop -->
        <div class="fixed inset-0 z-[299]" @click="onBackdrop" />

        <!-- Dropdown panel -->
        <div
          :style="dropdownStyle"
          class="bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden flex flex-col min-w-[140px]"
        >
          <button
            v-for="v in VERSIONS"
            :key="v.id"
            class="w-full text-left px-3 py-1.5 text-sm transition-colors whitespace-nowrap"
            :class="
              v.id === store.version
                ? 'bg-[var(--accent)] text-[var(--accent-on)]'
                : 'text-[var(--text)] hover:bg-[var(--panel-2)]'
            "
            @click.stop="select(v.id)"
          >
            {{ v.label }}
          </button>
        </div>
      </template>
    </Teleport>
  </div>
</template>
