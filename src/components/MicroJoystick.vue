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

const activeDirection = computed<'none' | 'left' | 'right' | 'down'>(() => {
  if (flashSide.value) return flashSide.value
  if (isDragging.value) {
    const deltaX = dragCurrentX.value - dragStartX.value
    const deltaY = dragCurrentY.value - dragStartY.value

    if (deltaY > 6 && deltaY > Math.abs(deltaX) && props.hasHistory) return 'down'
    if (deltaX < -6 && Math.abs(deltaX) >= Math.abs(deltaY) && props.canGoBack) return 'left'
    if (deltaX > 6 && Math.abs(deltaX) >= Math.abs(deltaY) && props.canGoForward) return 'right'

    if (Math.abs(deltaX) <= 6 && Math.abs(deltaY) <= 6 && pointerDownSide.value) {
      if (pointerDownSide.value === 'left' && props.canGoBack) return 'left'
      if (pointerDownSide.value === 'right' && props.canGoForward) return 'right'
      if (pointerDownSide.value === 'down' && props.hasHistory) return 'down'
    }
    return 'none'
  }
  return hoverSide.value ?? 'none'
})

const deflectionLevel = computed<'none' | 'half' | 'full'>(() => {
  if (activeDirection.value === 'none') return 'none'
  if (flashSide.value) return 'full'
  if (isDragging.value) {
    const deltaX = dragCurrentX.value - dragStartX.value
    const deltaY = dragCurrentY.value - dragStartY.value
    if (Math.abs(deltaX) > 6 || deltaY > 6) return 'full'
    if (pointerDownSide.value) return 'full'
  }
  // Mouse hover state uses half lean
  return 'half'
})

// Calculate SVG X & Y coordinates for shaft arm (viewBox 0 0 44 28)
// Full deflection travels closer to the track arrowheads (x=10.5 for left, x=33.5 for right, y=21.8 for down)
const dotX = computed(() => {
  if (activeDirection.value === 'left' && props.canGoBack) {
    return deflectionLevel.value === 'full' ? 10.5 : 16.3
  }
  if (activeDirection.value === 'right' && props.canGoForward) {
    return deflectionLevel.value === 'full' ? 33.5 : 27.7
  }
  return 22
})

const dotY = computed(() => {
  if (activeDirection.value === 'down' && props.hasHistory) {
    return deflectionLevel.value === 'full' ? 21.8 : 17.9
  }
  return 14
})

function onHover(side: 'left' | 'right' | 'down', e?: MouseEvent) {
  if (e && (e as PointerEvent).pointerType === 'touch') return
  if (!isDragging.value) hoverSide.value = side
}

function onHoverLeave() {
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

  if (clickY > rect.height * 0.65 && clickX >= rect.width * 0.3 && clickX <= rect.width * 0.7) {
    pointerDownSide.value = 'down'
  } else {
    pointerDownSide.value = clickX < rect.width / 2 ? 'left' : 'right'
  }

  try {
    target.setPointerCapture(e.pointerId)
  } catch {
    // Ignore pointer capture errors
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

  if (deltaY > 6 && deltaY > Math.abs(deltaX) && props.hasHistory) {
    triggerAction('down')
  } else if (Math.abs(deltaX) > 6) {
    if (deltaX < -6 && props.canGoBack) triggerAction('left')
    else if (deltaX > 6 && props.canGoForward) triggerAction('right')
  } else {
    if (clickX < rect.width * 0.35 && props.canGoBack) {
      triggerAction('left')
    } else if (clickX > rect.width * 0.65 && props.canGoForward) {
      triggerAction('right')
    } else if (props.hasHistory) {
      triggerAction('down')
    }
  }

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
    class="micro-joystick"
    :data-direction="activeDirection"
    :data-deflection="deflectionLevel"
    :class="{
      'can-back': props.canGoBack,
      'can-forward': props.canGoForward,
      'has-history': props.hasHistory,
    }"
    title="Navigation Joystick (Click left/right for Back/Forward, Drag down for History)"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onHoverLeave"
  >
    <!-- Background Action Pulse Flash Overlays -->
    <div v-if="flashSide === 'left'" class="flash-pulse flash-left" />
    <div v-if="flashSide === 'right'" class="flash-pulse flash-right" />
    <div v-if="flashSide === 'down'" class="flash-pulse flash-down" />

    <!-- Scalable Vector Schematic Layer (Resting track lines, arrowheads, shaft & pivot) -->
    <svg
      class="joystick-vector-layer"
      viewBox="0 0 44 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- Shaft Arm (Line connecting pivot 22,14 to dot position) -->
      <line
        x1="22"
        y1="14"
        :x2="dotX"
        :y2="dotY"
        stroke="var(--accent, #ee8b22)"
        stroke-width="4"
        stroke-linecap="round"
        class="shaft-line"
        :class="
          activeDirection !== 'none' &&
          ((activeDirection === 'left' && props.canGoBack) ||
            (activeDirection === 'right' && props.canGoForward) ||
            (activeDirection === 'down' && props.hasHistory))
            ? 'active'
            : ''
        "
      />

      <!-- Resting Left Track Line -->
      <line
        x1="10"
        y1="14"
        x2="15.5"
        y2="14"
        stroke="currentColor"
        stroke-width="1"
        class="resting-line"
        :class="props.canGoBack && activeDirection === 'none' ? 'visible' : ''"
      />

      <!-- Resting Right Track Line -->
      <line
        x1="28.5"
        y1="14"
        x2="34"
        y2="14"
        stroke="currentColor"
        stroke-width="1"
        class="resting-line"
        :class="props.canGoForward && activeDirection === 'none' ? 'visible' : ''"
      />

      <!-- Resting Down Track Line (Subtle 3.5px line starting outside bottom circle radius y=20.5 to y=24) -->
      <line
        x1="22"
        y1="20.5"
        x2="22"
        y2="24"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        class="resting-line-down"
        :class="props.hasHistory && activeDirection === 'none' ? 'visible' : ''"
      />

      <!-- Resting Left Arrowhead (<) -->
      <path
        d="M 12 11.5 L 9.5 14 L 12 16.5"
        stroke="currentColor"
        stroke-width="1"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="resting-arrow"
        :class="props.canGoBack && activeDirection === 'none' ? 'visible' : ''"
      />

      <!-- Resting Right Arrowhead (>) -->
      <path
        d="M 32 11.5 L 34.5 14 L 32 16.5"
        stroke="currentColor"
        stroke-width="1"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="resting-arrow"
        :class="props.canGoForward && activeDirection === 'none' ? 'visible' : ''"
      />

      <!-- Pivot Point Base Indicator -->
      <circle
        cx="22"
        cy="14"
        r="2"
        fill="var(--accent, #ee8b22)"
        class="pivot-dot"
        :class="
          activeDirection !== 'none' &&
          ((activeDirection === 'left' && props.canGoBack) ||
            (activeDirection === 'right' && props.canGoForward) ||
            (activeDirection === 'down' && props.hasHistory))
            ? 'active'
            : ''
        "
      />
    </svg>

    <!-- Joystick Knob (Center Dot - Positioned via CSS Container Percentages for Fluid Scalability) -->
    <div class="joystick-knob" />

    <!-- Hit Testing Target Quadrants -->
    <div class="hit-zones">
      <div
        class="hit-zone zone-left"
        :class="props.canGoBack ? 'clickable' : 'disabled'"
        @mouseenter="onHover('left', $event)"
        @mouseleave="onHoverLeave"
      />
      <div
        class="hit-zone zone-right"
        :class="props.canGoForward ? 'clickable' : 'disabled'"
        @mouseenter="onHover('right', $event)"
        @mouseleave="onHoverLeave"
      />
      <div
        class="hit-zone zone-down clickable"
        @mouseenter="onHover('down', $event)"
        @mouseleave="onHoverLeave"
      />
      <div class="hit-zone zone-top-neutral" @mouseenter="onHoverLeave" />
    </div>
  </div>
</template>

<style scoped>
/* ==========================================================================
   MicroJoystick - Scalable HTML & CSS Component Architecture
   Positioning is percentage-based so the component scales to any pixel size!
   ========================================================================== */

/* Root Pill Container (44x28px with 1:1 SVG Vector Alignment) */
.micro-joystick {
  position: relative;
  width: 44px;
  height: 28px;
  border-radius: 9999px;
  background-color: var(--panel, #1e1b18);
  border: 1px solid var(--border, #3a342e);
  user-select: none;
  touch-action: none;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

/* --------------------------------------------------------------------------
   Joystick Vector Overlay (SVG Shaft, Pivot, Track Lines & Arrowheads)
   -------------------------------------------------------------------------- */
.joystick-vector-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.shaft-line {
  opacity: 0;
  transition:
    x2 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    y2 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.3s ease;
}
.shaft-line.active {
  opacity: 1;
}

.pivot-dot {
  opacity: 0;
  transition: opacity 0.3s ease;
}
.pivot-dot.active {
  opacity: 0.6;
}

.resting-line {
  opacity: 0;
  transition: opacity 0.3s ease;
}
.resting-line.visible {
  opacity: 0.4;
}

.resting-line-down {
  opacity: 0;
  transition: opacity 0.3s ease;
}
.resting-line-down.visible {
  opacity: 0.5;
}

.resting-arrow {
  opacity: 0;
  transition: opacity 0.3s ease;
}
.resting-arrow.visible {
  opacity: 0.4;
}

/* --------------------------------------------------------------------------
   Joystick Knob (Center Dot)
   Positioned using CSS percentages relative to container for fluid scaling:
   - Resting Center: left 50%, top 50%
   - Left Half Lean: left 37% (x=16.3)
   - Left Full Deflection: left 24% (x=10.5, travels right over left track line!)
   - Right Half Lean: left 63% (x=27.7)
   - Right Full Deflection: left 76% (x=33.5, travels right over right track line!)
   - Down Half Lean: top 64% (y=17.9)
   - Down Full Deflection: top 78% (y=21.8)
   -------------------------------------------------------------------------- */
.joystick-knob {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 30%;
  aspect-ratio: 1;
  max-width: 13px;
  max-height: 13px;
  border-radius: 50%;
  background-color: var(--text, #f3f1ee);
  color: var(--text, #f3f1ee);
  opacity: 0.6;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 5;
  transition:
    left 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    top 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    background-color 0.3s ease,
    opacity 0.3s ease;
}

/* Left Deflections */
.micro-joystick[data-direction='left'][data-deflection='half'].can-back .joystick-knob {
  left: 37%;
  top: 50%;
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}
.micro-joystick[data-direction='left'][data-deflection='full'].can-back .joystick-knob {
  left: 24%;
  top: 50%;
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}

/* Right Deflections */
.micro-joystick[data-direction='right'][data-deflection='half'].can-forward .joystick-knob {
  left: 63%;
  top: 50%;
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}
.micro-joystick[data-direction='right'][data-deflection='full'].can-forward .joystick-knob {
  left: 76%;
  top: 50%;
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}

/* Down Deflections */
.micro-joystick[data-direction='down'][data-deflection='half'].has-history .joystick-knob {
  left: 50%;
  top: 64%;
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}
.micro-joystick[data-direction='down'][data-deflection='full'].has-history .joystick-knob {
  left: 50%;
  top: 78%;
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}

/* --------------------------------------------------------------------------
   Hit Testing & Hover Quadrant Grid
   -------------------------------------------------------------------------- */
.hit-zones {
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: auto;
}

.hit-zone {
  position: absolute;
}

.hit-zone.clickable {
  cursor: pointer;
}

.hit-zone.disabled {
  cursor: not-allowed;
}

.zone-left {
  left: 0;
  top: 0;
  width: 35%;
  height: 100%;
}

.zone-right {
  right: 0;
  top: 0;
  width: 35%;
  height: 100%;
}

.zone-down {
  left: 35%;
  width: 30%;
  bottom: 0;
  height: 33%;
}

.zone-top-neutral {
  left: 35%;
  width: 30%;
  top: 0;
  height: 67%;
}

/* --------------------------------------------------------------------------
   Action Pulse Flash Overlays
   -------------------------------------------------------------------------- */
.flash-pulse {
  position: absolute;
  background-color: rgba(238, 139, 34, 0.4);
  z-index: 10;
  pointer-events: none;
  animation: flashPulse 0.3s ease-out;
}

.flash-left {
  left: 0;
  top: 0;
  width: 50%;
  height: 100%;
  border-top-left-radius: 9999px;
  border-bottom-left-radius: 9999px;
}

.flash-right {
  right: 0;
  top: 0;
  width: 50%;
  height: 100%;
  border-top-right-radius: 9999px;
  border-bottom-right-radius: 9999px;
}

.flash-down {
  left: 0;
  bottom: 0;
  width: 100%;
  height: 50%;
  border-bottom-left-radius: 9999px;
  border-bottom-right-radius: 9999px;
}

@keyframes flashPulse {
  0% {
    opacity: 0.8;
  }
  100% {
    opacity: 0.2;
  }
}
</style>
