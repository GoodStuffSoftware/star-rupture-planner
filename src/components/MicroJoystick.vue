<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  canGoBack: boolean
  canGoForward: boolean
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'forward'): void
}>()

const hoverSide = ref<'left' | 'right' | null>(null)
const flashSide = ref<'left' | 'right' | null>(null)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragCurrentX = ref(0)

// Compute dot position along X axis (midpoint is 22 for 44px width)
const dotX = computed(() => {
  if (isDragging.value) {
    const delta = dragCurrentX.value - dragStartX.value
    if (delta < -6 && props.canGoBack) return 14
    if (delta > 6 && props.canGoForward) return 30
    return 22
  }
  if (hoverSide.value === 'left' && props.canGoBack) return 14
  if (hoverSide.value === 'right' && props.canGoForward) return 30
  return 22
})

const activeSide = computed<'left' | 'right' | null>(() => {
  if (isDragging.value) {
    const delta = dragCurrentX.value - dragStartX.value
    if (delta < -6 && props.canGoBack) return 'left'
    if (delta > 6 && props.canGoForward) return 'right'
    return null
  }
  return hoverSide.value
})

function handleMouseEnter(side: 'left' | 'right', e?: MouseEvent) {
  if (e && (e as PointerEvent).pointerType === 'touch') return
  if (!isDragging.value) hoverSide.value = side
}

function handleMouseLeave() {
  if (!isDragging.value) hoverSide.value = null
}

function onPointerDown(e: PointerEvent) {
  isDragging.value = true
  dragStartX.value = e.clientX
  dragCurrentX.value = e.clientX
  try {
    ;(e.currentTarget as HTMLElement)?.setPointerCapture(e.pointerId)
  } catch {
    // Ignore pointer capture errors if touch
  }
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  dragCurrentX.value = e.clientX
}

function onPointerUp(e: PointerEvent) {
  if (!isDragging.value) return
  const delta = dragCurrentX.value - dragStartX.value
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clickX = e.clientX - rect.left

  isDragging.value = false
  hoverSide.value = null

  if (Math.abs(delta) > 6) {
    // Drag gesture
    if (delta < -6 && props.canGoBack) {
      triggerAction('left')
    } else if (delta > 6 && props.canGoForward) {
      triggerAction('right')
    }
  } else {
    // Click / Tap gesture
    if (clickX < rect.width / 2 && props.canGoBack) {
      triggerAction('left')
    } else if (clickX >= rect.width / 2 && props.canGoForward) {
      triggerAction('right')
    }
  }

  // Clear hoverSide again after synthetic mouse events fire on mobile touch
  setTimeout(() => {
    hoverSide.value = null
  }, 50)
}

function triggerAction(side: 'left' | 'right') {
  flashSide.value = side
  setTimeout(() => {
    flashSide.value = null
  }, 250)
  if (side === 'left') emit('back')
  else emit('forward')
}
</script>

<template>
  <div
    class="relative w-[66px] h-[42px] min-[859px]:w-11 min-[859px]:h-7 rounded-full bg-[var(--panel)] border border-[var(--border)] select-none shrink-0 overflow-hidden flex items-center justify-between shadow-inner group touch-none"
    title="Navigation Joystick (Click or Drag left for Back, right for Forward)"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="handleMouseLeave"
  >
    <!-- Left hover detection overlay (50%) -->
    <div
      class="absolute left-0 top-0 w-1/2 h-full z-20"
      :class="props.canGoBack ? 'cursor-pointer' : 'cursor-not-allowed'"
      @mouseenter="handleMouseEnter('left', $event)"
      @mouseleave="handleMouseLeave"
    />

    <!-- Right hover detection overlay (50%) -->
    <div
      class="absolute right-0 top-0 w-1/2 h-full z-20"
      :class="props.canGoForward ? 'cursor-pointer' : 'cursor-not-allowed'"
      @mouseenter="handleMouseEnter('right', $event)"
      @mouseleave="handleMouseLeave"
    />

    <!-- Click flash pulse overlay -->
    <div
      v-if="flashSide === 'left'"
      class="absolute left-0 top-0 w-1/2 h-full bg-[var(--accent)]/40 z-10 animate-pulse pointer-events-none rounded-l-full"
    />
    <div
      v-if="flashSide === 'right'"
      class="absolute right-0 top-0 w-1/2 h-full bg-[var(--accent)]/40 z-10 animate-pulse pointer-events-none rounded-r-full"
    />

    <!-- SVG Schematic Overlay -->
    <svg
      class="w-full h-full pointer-events-none z-0"
      viewBox="0 0 44 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- Joystick Shaft/Arm (Thick line connecting center base 22,14 to active dot position) -->
      <line
        x1="22"
        y1="14"
        :x2="dotX"
        y2="14"
        stroke="var(--accent)"
        stroke-width="4"
        stroke-linecap="round"
        class="transition-all duration-300 ease-out"
        :class="
          activeSide &&
          ((activeSide === 'left' && props.canGoBack) ||
            (activeSide === 'right' && props.canGoForward))
            ? 'opacity-100'
            : 'opacity-0'
        "
      />

      <!-- Resting Left Track Line (Only visible if canGoBack & not hovering/dragging) -->
      <line
        x1="10"
        y1="14"
        x2="15.5"
        y2="14"
        stroke="currentColor"
        stroke-width="1"
        class="transition-all duration-300 ease-out"
        :class="props.canGoBack && !activeSide ? 'opacity-40 text-[var(--muted)]' : 'opacity-0'"
      />

      <!-- Resting Right Track Line (Only visible if canGoForward & not hovering/dragging) -->
      <line
        x1="28.5"
        y1="14"
        x2="34"
        y2="14"
        stroke="currentColor"
        stroke-width="1"
        class="transition-all duration-300 ease-out"
        :class="props.canGoForward && !activeSide ? 'opacity-40 text-[var(--muted)]' : 'opacity-0'"
      />

      <!-- Resting Left Arrowhead (Only visible if canGoBack & not hovering/dragging) -->
      <path
        d="M 12 11.5 L 9.5 14 L 12 16.5"
        stroke="currentColor"
        stroke-width="1"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="transition-all duration-300 ease-out"
        :class="props.canGoBack && !activeSide ? 'opacity-40 text-[var(--muted)]' : 'opacity-0'"
      />

      <!-- Resting Right Arrowhead (Only visible if canGoForward & not hovering/dragging) -->
      <path
        d="M 32 11.5 L 34.5 14 L 32 16.5"
        stroke="currentColor"
        stroke-width="1"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="transition-all duration-300 ease-out"
        :class="props.canGoForward && !activeSide ? 'opacity-40 text-[var(--muted)]' : 'opacity-0'"
      />

      <!-- Center Base Origin Indicator (Visible when joystick is deflected) -->
      <circle
        cx="22"
        cy="14"
        r="2"
        fill="var(--accent)"
        class="transition-opacity duration-300"
        :class="
          activeSide &&
          ((activeSide === 'left' && props.canGoBack) ||
            (activeSide === 'right' && props.canGoForward))
            ? 'opacity-60'
            : 'opacity-0'
        "
      />

      <!-- Center Knob (Dot - sits cleanly on top of stick & track lines) -->
      <circle
        :cx="dotX"
        cy="14"
        r="6.5"
        class="transition-all duration-300 ease-out shadow-md"
        :fill="
          activeSide &&
          ((activeSide === 'left' && props.canGoBack) ||
            (activeSide === 'right' && props.canGoForward))
            ? 'var(--accent)'
            : 'currentColor'
        "
        :class="
          activeSide &&
          ((activeSide === 'left' && props.canGoBack) ||
            (activeSide === 'right' && props.canGoForward))
            ? 'opacity-100'
            : 'opacity-60 text-[var(--muted)]'
        "
      />
    </svg>
  </div>
</template>
