<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    canGoBack: boolean
    canGoForward: boolean
    hasHistory?: boolean
  }>(),
  {
    hasHistory: true,
  },
)

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'forward'): void
  (e: 'down'): void
}>()

const hoverSide = ref<'left' | 'right' | 'down' | null>(null)
const flashSide = ref<'left' | 'right' | 'down' | null>(null)
const pointerDownSide = ref<'left' | 'right' | 'down' | null>(null)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragCurrentX = ref(0)
const dragCurrentY = ref(0)

const activeSide = computed<'left' | 'right' | 'down' | null>(() => {
  if (flashSide.value) return flashSide.value
  if (isDragging.value) {
    const deltaX = dragCurrentX.value - dragStartX.value
    const deltaY = dragCurrentY.value - dragStartY.value

    // Downward drag takes precedence when Y movement > 6px and exceeds X movement
    if (deltaY > 6 && deltaY > Math.abs(deltaX)) {
      return 'down'
    }
    if (deltaX < -6 && Math.abs(deltaX) >= Math.abs(deltaY) && props.canGoBack) return 'left'
    if (deltaX > 6 && Math.abs(deltaX) >= Math.abs(deltaY) && props.canGoForward) return 'right'

    if (Math.abs(deltaX) <= 6 && Math.abs(deltaY) <= 6 && pointerDownSide.value) {
      if (pointerDownSide.value === 'left' && props.canGoBack) return 'left'
      if (pointerDownSide.value === 'right' && props.canGoForward) return 'right'
      if (pointerDownSide.value === 'down') return 'down'
    }
    return null
  }
  return hoverSide.value
})

const isFullDeflection = computed(() => {
  if (flashSide.value) return true
  if (isDragging.value) {
    const deltaX = dragCurrentX.value - dragStartX.value
    const deltaY = dragCurrentY.value - dragStartY.value
    if (Math.abs(deltaX) > 6 || deltaY > 6) return true
  }
  return false
})

// Compute dot position along X axis:
// Hover = half lean (18 for left, 26 for right)
// Active click / drag / flash = full deflection (14 for left, 30 for right)
const dotX = computed(() => {
  if (activeSide.value === 'left' && props.canGoBack) {
    return isFullDeflection.value ? 14 : 18
  }
  if (activeSide.value === 'right' && props.canGoForward) {
    return isFullDeflection.value ? 30 : 26
  }
  return 22
})

// Compute dot position along Y axis:
// Hover down = half lean (17.5)
// Active click / drag down / flash = full deflection (21)
const dotY = computed(() => {
  if (activeSide.value === 'down' && props.hasHistory) {
    return isFullDeflection.value ? 21 : 17.5
  }
  return 14
})

function handleMouseEnter(side: 'left' | 'right' | 'down', e?: MouseEvent) {
  if (e && (e as PointerEvent).pointerType === 'touch') return
  if (!isDragging.value) hoverSide.value = side
}

function handleMouseLeave() {
  if (!isDragging.value) hoverSide.value = null
}

function onPointerDown(e: PointerEvent) {
  isDragging.value = true
  dragStartX.value = e.clientX
  dragStartY.value = e.clientY
  dragCurrentX.value = e.clientX
  dragCurrentY.value = e.clientY

  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clickX = e.clientX - rect.left
  const clickY = e.clientY - rect.top

  if (clickY > rect.height * 0.55 && clickX >= rect.width * 0.3 && clickX <= rect.width * 0.7) {
    pointerDownSide.value = 'down'
  } else {
    pointerDownSide.value = clickX < rect.width / 2 ? 'left' : 'right'
  }

  try {
    target.setPointerCapture(e.pointerId)
  } catch {
    // Ignore pointer capture errors if touch
  }
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  dragCurrentX.value = e.clientX
  dragCurrentY.value = e.clientY
}

function onPointerUp(e: PointerEvent) {
  if (!isDragging.value) return
  const deltaX = dragCurrentX.value - dragStartX.value
  const deltaY = dragCurrentY.value - dragStartY.value
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const clickX = e.clientX - rect.left

  isDragging.value = false
  pointerDownSide.value = null
  hoverSide.value = null

  if (deltaY > 6 && deltaY > Math.abs(deltaX)) {
    // Downward drag gesture (opens/toggles history)
    triggerAction('down')
  } else if (Math.abs(deltaX) > 6) {
    // Horizontal drag gesture
    if (deltaX < -6 && props.canGoBack) {
      triggerAction('left')
    } else if (deltaX > 6 && props.canGoForward) {
      triggerAction('right')
    }
  } else {
    // Click / Tap gesture (triggers left/right back/forward, or down if bottom quadrant clicked)
    if (clickX < rect.width * 0.35 && props.canGoBack) {
      triggerAction('left')
    } else if (clickX > rect.width * 0.65 && props.canGoForward) {
      triggerAction('right')
    } else {
      triggerAction('down')
    }
  }

  // Clear hoverSide again after synthetic mouse events fire on mobile touch
  setTimeout(() => {
    hoverSide.value = null
  }, 50)
}

function triggerAction(side: 'left' | 'right' | 'down') {
  flashSide.value = side
  setTimeout(() => {
    flashSide.value = null
  }, 300)
  if (side === 'left') emit('back')
  else if (side === 'right') emit('forward')
  else if (side === 'down') emit('down')
}
</script>

<template>
  <div
    class="relative w-[66px] h-[42px] min-[859px]:w-11 min-[859px]:h-7 rounded-full bg-[var(--panel)] border border-[var(--border)] select-none shrink-0 overflow-hidden flex items-center justify-between shadow-inner group touch-none"
    title="Navigation Joystick (Click left/right for Back/Forward, Drag down for History)"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="handleMouseLeave"
  >
    <!-- Left hover detection overlay (left 35%) -->
    <div
      class="absolute left-0 top-0 w-[35%] h-full z-20"
      :class="props.canGoBack ? 'cursor-pointer' : 'cursor-not-allowed'"
      @mouseenter="handleMouseEnter('left', $event)"
      @mouseleave="handleMouseLeave"
    />

    <!-- Right hover detection overlay (right 35%) -->
    <div
      class="absolute right-0 top-0 w-[35%] h-full z-20"
      :class="props.canGoForward ? 'cursor-pointer' : 'cursor-not-allowed'"
      @mouseenter="handleMouseEnter('right', $event)"
      @mouseleave="handleMouseLeave"
    />

    <!-- Down / Bottom-Center hover detection overlay (middle 30% bottom half) -->
    <div
      class="absolute left-[35%] w-[30%] bottom-0 h-1/2 z-20 cursor-pointer"
      @mouseenter="handleMouseEnter('down', $event)"
      @mouseleave="handleMouseLeave"
    />

    <!-- Top-Center neutral hover detection overlay (middle 30% top half) -->
    <div class="absolute left-[35%] w-[30%] top-0 h-1/2 z-20" @mouseenter="handleMouseLeave" />

    <!-- Action flash pulse overlays -->
    <div
      v-if="flashSide === 'left'"
      class="absolute left-0 top-0 w-1/2 h-full bg-[var(--accent)]/40 z-10 animate-pulse pointer-events-none rounded-l-full"
    />
    <div
      v-if="flashSide === 'right'"
      class="absolute right-0 top-0 w-1/2 h-full bg-[var(--accent)]/40 z-10 animate-pulse pointer-events-none rounded-r-full"
    />
    <div
      v-if="flashSide === 'down'"
      class="absolute left-0 bottom-0 w-full h-1/2 bg-[var(--accent)]/40 z-10 animate-pulse pointer-events-none rounded-b-full"
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
        :y2="dotY"
        stroke="var(--accent)"
        stroke-width="4"
        stroke-linecap="round"
        class="transition-all duration-300 ease-out"
        :class="
          activeSide &&
          ((activeSide === 'left' && props.canGoBack) ||
            (activeSide === 'right' && props.canGoForward) ||
            (activeSide === 'down' && props.hasHistory))
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

      <!-- Resting Down Track Line (Clean 6px line starting outside bottom circle radius y=20.5 to y=26.5) -->
      <line
        x1="22"
        y1="20.5"
        x2="22"
        y2="26.5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        class="transition-all duration-300 ease-out"
        :class="props.hasHistory && !activeSide ? 'opacity-50 text-[var(--muted)]' : 'opacity-0'"
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
            (activeSide === 'right' && props.canGoForward) ||
            (activeSide === 'down' && props.hasHistory))
            ? 'opacity-60'
            : 'opacity-0'
        "
      />

      <!-- Center Knob (Dot - sits cleanly on top of stick & track lines) -->
      <circle
        :cx="dotX"
        :cy="dotY"
        r="6.5"
        class="transition-all duration-300 ease-out shadow-md"
        :fill="
          activeSide &&
          ((activeSide === 'left' && props.canGoBack) ||
            (activeSide === 'right' && props.canGoForward) ||
            (activeSide === 'down' && props.hasHistory))
            ? 'var(--accent)'
            : 'currentColor'
        "
        :class="
          activeSide &&
          ((activeSide === 'left' && props.canGoBack) ||
            (activeSide === 'right' && props.canGoForward) ||
            (activeSide === 'down' && props.hasHistory))
            ? 'opacity-100'
            : 'opacity-60 text-[var(--muted)]'
        "
      />
    </svg>
  </div>
</template>
