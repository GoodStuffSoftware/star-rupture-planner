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
    <!-- Background Action Pulse Flash -->
    <div v-if="flashSide === 'left'" class="flash-pulse flash-left" />
    <div v-if="flashSide === 'right'" class="flash-pulse flash-right" />
    <div v-if="flashSide === 'down'" class="flash-pulse flash-down" />

    <!-- Resting Track Indicators -->
    <div class="resting-track track-left">
      <span class="chevron chevron-left" />
      <span class="track-line-h" />
    </div>

    <div class="resting-track track-right">
      <span class="track-line-h" />
      <span class="chevron chevron-right" />
    </div>

    <div class="resting-track track-down">
      <span class="track-line-v" />
    </div>

    <!-- Active Deflection Joystick Shaft/Arm -->
    <div class="joystick-arm" />

    <!-- Center Base Pivot Point -->
    <div class="joystick-pivot" />

    <!-- Joystick Knob (Dot) -->
    <div class="joystick-knob" />

    <!-- Hover & Hit-Test Target Quadrants -->
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
   MicroJoystick - Custom HTML/CSS Component Architecture
   Clean, self-describing CSS with zero Tailwind utility dependencies
   ========================================================================== */

/* Root Pill Container */
.micro-joystick {
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
  transition:
    width 0.2s ease,
    height 0.2s ease;
}

/* Scaled size for Desktop viewports (>=859px) */
@media (min-width: 859px) {
  .micro-joystick {
    width: 44px;
    height: 28px;
  }
}

/* --------------------------------------------------------------------------
   Center Pivot Point (Origin dot when stick is deflected)
   -------------------------------------------------------------------------- */
.joystick-pivot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: var(--accent, #ee8b22);
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.micro-joystick[data-direction='left'].can-back .joystick-pivot,
.micro-joystick[data-direction='right'].can-forward .joystick-pivot,
.micro-joystick[data-direction='down'].has-history .joystick-pivot {
  opacity: 0.6;
}

/* --------------------------------------------------------------------------
   Joystick Shaft / Connecting Arm
   -------------------------------------------------------------------------- */
.joystick-arm {
  position: absolute;
  top: 50%;
  left: 50%;
  height: 4px;
  width: 0px;
  background-color: var(--accent, #ee8b22);
  border-radius: 9999px;
  transform-origin: left center;
  opacity: 0;
  pointer-events: none;
  transition:
    width 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.3s ease;
}

/* Shaft deflection transforms */
.micro-joystick[data-direction='left'][data-deflection='half'].can-back .joystick-arm {
  width: 18%;
  transform: translate(0, -50%) rotate(180deg);
  opacity: 1;
}
.micro-joystick[data-direction='left'][data-deflection='full'].can-back .joystick-arm {
  width: 36%;
  transform: translate(0, -50%) rotate(180deg);
  opacity: 1;
}

.micro-joystick[data-direction='right'][data-deflection='half'].can-forward .joystick-arm {
  width: 18%;
  transform: translate(0, -50%) rotate(0deg);
  opacity: 1;
}
.micro-joystick[data-direction='right'][data-deflection='full'].can-forward .joystick-arm {
  width: 36%;
  transform: translate(0, -50%) rotate(0deg);
  opacity: 1;
}

.micro-joystick[data-direction='down'][data-deflection='half'].has-history .joystick-arm {
  width: 18%;
  transform: translate(0, -50%) rotate(90deg);
  opacity: 1;
}
.micro-joystick[data-direction='down'][data-deflection='full'].has-history .joystick-arm {
  width: 32%;
  transform: translate(0, -50%) rotate(90deg);
  opacity: 1;
}

/* --------------------------------------------------------------------------
   Joystick Knob (Center Dot)
   -------------------------------------------------------------------------- */
.joystick-knob {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background-color: var(--text, #f3f1ee);
  opacity: 0.6;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 5;
  transition:
    transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    background-color 0.3s ease,
    opacity 0.3s ease;
}

/* Knob deflection offsets: Half-lean vs Full-deflection */
.micro-joystick[data-direction='left'][data-deflection='half'].can-back .joystick-knob {
  transform: translate(-110%, -50%);
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}
.micro-joystick[data-direction='left'][data-deflection='full'].can-back .joystick-knob {
  transform: translate(-170%, -50%);
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}

.micro-joystick[data-direction='right'][data-deflection='half'].can-forward .joystick-knob {
  transform: translate(10%, -50%);
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}
.micro-joystick[data-direction='right'][data-deflection='full'].can-forward .joystick-knob {
  transform: translate(70%, -50%);
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}

.micro-joystick[data-direction='down'][data-deflection='half'].has-history .joystick-knob {
  transform: translate(-50%, 0%);
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}
.micro-joystick[data-direction='down'][data-deflection='full'].has-history .joystick-knob {
  transform: translate(-50%, 50%);
  background-color: var(--accent, #ee8b22);
  opacity: 1;
}

/* --------------------------------------------------------------------------
   Resting Track Indicators & Arrowheads
   -------------------------------------------------------------------------- */
.resting-track {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  color: var(--muted, #a8a29a);
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.micro-joystick.can-back[data-direction='none'] .track-left {
  opacity: 0.4;
}
.micro-joystick.can-forward[data-direction='none'] .track-right {
  opacity: 0.4;
}
.micro-joystick.has-history[data-direction='none'] .track-down {
  opacity: 0.5;
}

.track-left {
  left: 14%;
  top: 50%;
  transform: translateY(-50%);
}

.track-right {
  right: 14%;
  top: 50%;
  transform: translateY(-50%);
}

.track-down {
  bottom: 8%;
  left: 50%;
  transform: translateX(-50%);
}

.track-line-h {
  width: 7px;
  height: 1px;
  background-color: currentColor;
}

.track-line-v {
  width: 1.5px;
  height: 4px;
  background-color: currentColor;
  border-radius: 1px;
}

.chevron {
  width: 5px;
  height: 5px;
  border-top: 1.5px solid currentColor;
  border-left: 1.5px solid currentColor;
}

.chevron-left {
  transform: rotate(-45deg);
}

.chevron-right {
  transform: rotate(135deg);
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
