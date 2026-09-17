<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    canGoBack: boolean
    canGoForward: boolean
    hasHistory?: boolean
    hoverDelayMs?: number
  }>(),
  {
    hasHistory: true,
    hoverDelayMs: 50,
  },
)

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'forward'): void
  (e: 'down'): void
}>()

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
  return 'none'
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
  return 'none'
})

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
    :style="{ '--hover-delay': `${props.hoverDelayMs}ms` }"
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
  >
    <!-- Background Action Pulse Flash Overlays -->
    <div v-if="flashSide === 'left'" class="flash-pulse flash-left" />
    <div v-if="flashSide === 'right'" class="flash-pulse flash-right" />
    <div v-if="flashSide === 'down'" class="flash-pulse flash-down" />

    <!-- Scalable Vector Track Schematic Layer (Lines & Arrowheads - Clean Even-Integer Grid) -->
    <svg
      class="track-vector-layer"
      viewBox="0 0 44 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shape-rendering="geometricPrecision"
    >
      <!-- Left Track Group (Line + Arrowhead on top) -->
      <g
        class="track-group track-left"
        :class="{ visible: props.canGoBack && activeDirection === 'none' }"
      >
        <line
          x1="6"
          y1="14"
          x2="16"
          y2="14"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <path
          d="M 10 10 L 6 14 L 10 18"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>

      <!-- Right Track Group (Line + Arrowhead on top) -->
      <g
        class="track-group track-right"
        :class="{ visible: props.canGoForward && activeDirection === 'none' }"
      >
        <line
          x1="28"
          y1="14"
          x2="38"
          y2="14"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
        <path
          d="M 34 10 L 38 14 L 34 18"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>

      <!-- Down Track Group (Subtle tick line) -->
      <g
        class="track-group track-down"
        :class="{ visible: props.hasHistory && activeDirection === 'none' }"
      >
        <line
          x1="22"
          y1="20"
          x2="22"
          y2="24"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </g>
    </svg>

    <!-- Pivot Point & Shaft Arm Layer -->
    <div class="shaft-pivot-layer">
      <div class="pivot-dot" />
      <div class="shaft-arm" />
    </div>

    <!-- Joystick Knob (Center Dot) -->
    <div class="joystick-knob" />

    <!-- Hit Testing Target Quadrants -->
    <div class="hit-zones">
      <div class="hit-zone zone-left" :class="props.canGoBack ? 'clickable' : 'disabled'" />
      <div class="hit-zone zone-right" :class="props.canGoForward ? 'clickable' : 'disabled'" />
      <div class="hit-zone zone-down clickable" />
      <div class="hit-zone zone-top-neutral" />
    </div>
  </div>
</template>

<style scoped>
/* ==========================================================================
   MicroJoystick - GPU-Accelerated Pure HTML & Vector Architecture
   100% Percentage-based transforms & viewBox fluid scaling across all devices!
   ========================================================================== */

/* Root Pill Container (66x42px on mobile = 1.5x scale, 44x28px on desktop)
   --hover-delay variable drives directional hover transition delays! */
.micro-joystick {
  --hover-delay: 50ms;
  position: relative;
  width: 66px;
  height: 42px;
  border-radius: 9999px;
  background-color: var(--panel, #1e1b18);
  border: 1px solid var(--border, #3a342e);
  user-select: none;
  touch-action: none;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

@media (min-width: 859px) {
  .micro-joystick {
    width: 44px;
    height: 28px;
  }
}

/* --------------------------------------------------------------------------
   Scalable Vector Track Schematic Layer
   -------------------------------------------------------------------------- */
.track-vector-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.track-group {
  opacity: 0;
  will-change: opacity;
  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text, #f3f1ee);
}
.track-group.visible {
  opacity: 0.45;
}

/* Fade out track lines ONLY when a specific directional zone is hovered or active */
.micro-joystick:has(.zone-left:hover) .track-group,
.micro-joystick:has(.zone-right:hover) .track-group,
.micro-joystick:has(.zone-down:hover) .track-group,
.micro-joystick[data-direction='left'] .track-group,
.micro-joystick[data-direction='right'] .track-group,
.micro-joystick[data-direction='down'] .track-group {
  opacity: 0 !important;
}

/* --------------------------------------------------------------------------
   Pivot Point & Shaft Arm Layer - GPU Compositor Layer
   -------------------------------------------------------------------------- */
.shaft-pivot-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}

.pivot-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--accent, #ee8b22);
  transform: translate3d(-50%, -50%, 0);
  opacity: 0;
  will-change: opacity;
  transition: opacity 0.25s ease;
  z-index: 3;
}

.micro-joystick:has(.zone-left:hover).can-back .pivot-dot,
.micro-joystick:has(.zone-right:hover).can-forward .pivot-dot,
.micro-joystick:has(.zone-down:hover).has-history .pivot-dot,
.micro-joystick[data-direction='left'].can-back .pivot-dot,
.micro-joystick[data-direction='right'].can-forward .pivot-dot,
.micro-joystick[data-direction='down'].has-history .pivot-dot {
  opacity: 0.6;
}

/* Shaft Arm Line - Exactly 26% width to reach knob center (24% or 76%) */
.shaft-arm {
  position: absolute;
  left: 50%;
  top: 50%;
  height: 4px;
  width: 26%;
  background-color: var(--accent, #ee8b22);
  border-radius: 9999px;
  transform-origin: left center;
  transform: translateY(-50%) rotate(0deg) scaleX(0);
  opacity: 0;
  z-index: 2;
  will-change: transform, opacity;
  transition:
    transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.25s ease;
}

/* Left Shaft Arm Rotations & Scaling */
.micro-joystick:has(.zone-left:hover).can-back .shaft-arm,
.micro-joystick[data-direction='left'][data-deflection='half'].can-back .shaft-arm {
  opacity: 1;
  transform: translateY(-50%) rotate(180deg) scaleX(0.5);
}
.micro-joystick[data-direction='left'][data-deflection='full'].can-back .shaft-arm {
  opacity: 1;
  transform: translateY(-50%) rotate(180deg) scaleX(1);
}

/* Right Shaft Arm Rotations & Scaling */
.micro-joystick:has(.zone-right:hover).can-forward .shaft-arm,
.micro-joystick[data-direction='right'][data-deflection='half'].can-forward .shaft-arm {
  opacity: 1;
  transform: translateY(-50%) rotate(0deg) scaleX(0.5);
}
.micro-joystick[data-direction='right'][data-deflection='full'].can-forward .shaft-arm {
  opacity: 1;
  transform: translateY(-50%) rotate(0deg) scaleX(1);
}

/* Down Shaft Arm Rotations & Scaling (width override 28% for down travel) */
.micro-joystick:has(.zone-down:hover).has-history .shaft-arm,
.micro-joystick[data-direction='down'][data-deflection='half'].has-history .shaft-arm {
  opacity: 1;
  transform: translateY(-50%) rotate(90deg) scaleX(0.5);
  width: 28%;
}
.micro-joystick[data-direction='down'][data-deflection='full'].has-history .shaft-arm {
  opacity: 1;
  transform: translateY(-50%) rotate(90deg) scaleX(1);
  width: 28%;
}

/* --------------------------------------------------------------------------
   Joystick Knob (Center Dot) - GPU Compositor Layer
   Uses 100% OPAQUE background color so shaft line tip stays hidden underneath!
   -------------------------------------------------------------------------- */
.joystick-knob {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: #d4cfca;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  transform: translate3d(-50%, -50%, 0);
  pointer-events: none;
  z-index: 10;
  will-change: left, top, background-color, box-shadow;
  transition:
    left 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    top 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    background-color 0.25s ease,
    box-shadow 0.25s ease;
}

@media (min-width: 859px) {
  .joystick-knob {
    width: 12px;
    height: 12px;
  }
}

/* --- Left Deflections (Percentage Positioning: 37% half lean, 24% full deflection) --- */
.micro-joystick:has(.zone-left:hover).can-back .joystick-knob,
.micro-joystick[data-direction='left'][data-deflection='half'].can-back .joystick-knob {
  left: 37%;
  top: 50%;
  background-color: var(--accent, #ee8b22);
  box-shadow: 0 0 8px rgba(238, 139, 34, 0.6);
}
.micro-joystick[data-direction='left'][data-deflection='full'].can-back .joystick-knob {
  left: 24%;
  top: 50%;
  background-color: var(--accent, #ee8b22);
  box-shadow: 0 0 10px rgba(238, 139, 34, 0.8);
}

/* --- Right Deflections (Percentage Positioning: 63% half lean, 76% full deflection) --- */
.micro-joystick:has(.zone-right:hover).can-forward .joystick-knob,
.micro-joystick[data-direction='right'][data-deflection='half'].can-forward .joystick-knob {
  left: 63%;
  top: 50%;
  background-color: var(--accent, #ee8b22);
  box-shadow: 0 0 8px rgba(238, 139, 34, 0.6);
}
.micro-joystick[data-direction='right'][data-deflection='full'].can-forward .joystick-knob {
  left: 76%;
  top: 50%;
  background-color: var(--accent, #ee8b22);
  box-shadow: 0 0 10px rgba(238, 139, 34, 0.8);
}

/* --- Down Deflections (Percentage Positioning: 64% half lean, 78% full deflection) --- */
.micro-joystick:has(.zone-down:hover).has-history .joystick-knob,
.micro-joystick[data-direction='down'][data-deflection='half'].has-history .joystick-knob {
  left: 50%;
  top: 64%;
  background-color: var(--accent, #ee8b22);
  box-shadow: 0 0 8px rgba(238, 139, 34, 0.6);
}
.micro-joystick[data-direction='down'][data-deflection='full'].has-history .joystick-knob {
  left: 50%;
  top: 78%;
  background-color: var(--accent, #ee8b22);
  box-shadow: 0 0 10px rgba(238, 139, 34, 0.8);
}

/* --------------------------------------------------------------------------
   Directional Mouse Hover Delay (Configurable via --hover-delay CSS variable / prop)
   -------------------------------------------------------------------------- */
.micro-joystick:has(.zone-left:hover).can-back .pivot-dot,
.micro-joystick:has(.zone-right:hover).can-forward .pivot-dot,
.micro-joystick:has(.zone-down:hover).has-history .pivot-dot,
.micro-joystick:has(.zone-left:hover).can-back .shaft-arm,
.micro-joystick:has(.zone-right:hover).can-forward .shaft-arm,
.micro-joystick:has(.zone-down:hover).has-history .shaft-arm,
.micro-joystick:has(.zone-left:hover).can-back .joystick-knob,
.micro-joystick:has(.zone-right:hover).can-forward .joystick-knob,
.micro-joystick:has(.zone-down:hover).has-history .joystick-knob,
.micro-joystick:has(.zone-left:hover) .track-group,
.micro-joystick:has(.zone-right:hover) .track-group,
.micro-joystick:has(.zone-down:hover) .track-group {
  transition-delay: var(--hover-delay, 50ms);
}

/* Active Drag & Click Deflections (0ms delay for instant 60fps drag responsiveness!) */
.micro-joystick[data-direction='left'] .pivot-dot,
.micro-joystick[data-direction='right'] .pivot-dot,
.micro-joystick[data-direction='down'] .pivot-dot,
.micro-joystick[data-direction='left'] .shaft-arm,
.micro-joystick[data-direction='right'] .shaft-arm,
.micro-joystick[data-direction='down'] .shaft-arm,
.micro-joystick[data-direction='left'] .joystick-knob,
.micro-joystick[data-direction='right'] .joystick-knob,
.micro-joystick[data-direction='down'] .joystick-knob,
.micro-joystick[data-direction='left'] .track-group,
.micro-joystick[data-direction='right'] .track-group,
.micro-joystick[data-direction='down'] .track-group {
  transition-delay: 0ms !important;
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
