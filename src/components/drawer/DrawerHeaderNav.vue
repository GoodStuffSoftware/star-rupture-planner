<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { usePlannerStore } from '../../stores/plannerStore'
import { useDetailStore, type NavTrack, type DetailNode } from '../../stores/detailStore'
import { useDataStore } from '../../stores/dataStore'
import GameIcon from '../GameIcon.vue'
import MicroJoystick from '../MicroJoystick.vue'

const props = defineProps<{
  isExpanded: boolean
  isDesktop: boolean
}>()

const emit = defineEmits<{
  (e: 'update:isExpanded', value: boolean): void
  (e: 'close'): void
}>()

const store = usePlannerStore()
const detailStore = useDetailStore()
const dataStore = useDataStore()

const isHistoryOpen = ref(false)
const isBreadcrumbExpanded = ref(false)

function toggleBreadcrumbExpand() {
  isBreadcrumbExpanded.value = !isBreadcrumbExpanded.value
}

function handleGlobalClick(e: MouseEvent) {
  if (isHistoryOpen.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.history-dropdown-wrap')) {
      isHistoryOpen.value = false
    }
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isHistoryOpen.value) {
    isHistoryOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('click', handleGlobalClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('click', handleGlobalClick)
})

const canGoBack = computed(() => detailStore.detailHistory.length > 0)
const canGoForward = computed(() => detailStore.detailForwardHistory.length > 0)

function getNodeTitle(node: DetailNode): string {
  if (node.name) return node.name
  if (node.id === '__index__') return 'Item Index'
  if (node.kind === 'item') {
    return dataStore.itemsById.get(node.id)?.name ?? node.id
  } else if (node.kind === 'building') {
    return dataStore.buildingsById.get(node.id)?.name ?? node.id
  }
  return node.id
}

function iconKind(kind: string): 'item' | 'building' {
  return kind === 'building' ? 'building' : 'item'
}

const formattedHistory = computed(() => {
  return detailStore.detailHistory
    .map((item, originalIndex) => ({
      ...item,
      title: getNodeTitle(item),
      originalIndex,
    }))
    .filter((item) => item.id !== '__index__')
})

const currentNode = computed(() => {
  if (!detailStore.detail) return null
  if (detailStore.detail.id === '__index__') {
    return {
      kind: 'index' as const,
      id: '__index__',
      title: 'Item Index',
      originalIndex: -1,
    }
  }
  return {
    kind: detailStore.detail.kind,
    id: detailStore.detail.id,
    title: getNodeTitle(detailStore.detail),
    originalIndex: -1,
  }
})

const activeBreadcrumbs = computed(() => {
  const steps = [...detailStore.detailHistory]
  if (detailStore.detail && detailStore.detail.id !== '__index__') {
    const last = steps[steps.length - 1]
    if (!last || last.kind !== detailStore.detail.kind || last.id !== detailStore.detail.id) {
      steps.push({ ...detailStore.detail })
    }
  }
  return steps.filter((s) => s.id !== '__index__')
})

function onJumpHistory(originalIndex: number) {
  detailStore.jumpToHistoryIndex(originalIndex)
}

function onRestoreTrack(track: NavTrack) {
  detailStore.restoreTrack(track)
  isHistoryOpen.value = false
}

function onDeleteTrack(trackId: string, e: MouseEvent) {
  e.stopPropagation()
  detailStore.deleteTrack(trackId)
}

function onClearAllTracks(e: MouseEvent) {
  e.stopPropagation()
  detailStore.clearAllTracks()
}

// Horizontal breadcrumb scrolling state
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function updateScrollState() {
  const el = document.getElementById('desktop-breadcrumb-track')
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 2
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}

function scrollTrack(delta: number) {
  const el = document.getElementById('desktop-breadcrumb-track')
  if (!el) return
  el.scrollBy({ left: delta, behavior: 'smooth' })
  setTimeout(updateScrollState, 150)
}

function onBreadcrumbWheel(e: WheelEvent) {
  const el = document.getElementById('desktop-breadcrumb-track')
  if (!el) return
  if (e.deltaY !== 0 || e.deltaX !== 0) {
    e.preventDefault()
    el.scrollLeft += e.deltaY || e.deltaX
    updateScrollState()
  }
}

watch(
  () => [detailStore.detailHistory.length, isBreadcrumbExpanded.value],
  () => {
    nextTick(() => {
      updateScrollState()
      const el = document.getElementById('desktop-breadcrumb-track')
      if (el) el.scrollLeft = el.scrollWidth
    })
  },
)
</script>

<template>
  <div
    class="h-[52px] min-[859px]:h-9 border-b border-[var(--border)] px-3 flex items-center justify-between shrink-0 select-none relative bg-[var(--panel-2)] text-sm"
  >
    <!-- Left & Center Zone: Micro-Joystick + Sliding Breadcrumb Track -->
    <div class="flex items-center gap-1.5 min-w-0 flex-1">
      <!-- Zone 1: Micro-Joystick Navigation Component + Integrated History Dropdown -->
      <div class="history-dropdown-wrap relative shrink-0">
        <MicroJoystick
          :can-go-back="canGoBack"
          :can-go-forward="canGoForward"
          :has-history="detailStore.savedTracks.length > 0 || activeBreadcrumbs.length > 0"
          @back="detailStore.detailBack()"
          @forward="detailStore.detailForward()"
          @down="isHistoryOpen = !isHistoryOpen"
        />

        <!-- Past Breadcrumbs History Dropdown -->
        <Transition
          enter-active-class="transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1)"
          enter-from-class="opacity-0 -translate-y-6 scale-y-75"
          enter-to-class="opacity-100 translate-y-0 scale-y-100"
          leave-active-class="transition-all duration-180 ease-in"
          leave-from-class="opacity-100 translate-y-0 scale-y-100"
          leave-to-class="opacity-0 -translate-y-4 scale-y-85"
        >
          <div
            v-if="isHistoryOpen"
            class="absolute top-full mt-1 left-0 z-[300] p-2 w-max max-w-[calc(100vw-32px)] max-h-[65vh] flex flex-col gap-2 select-none origin-top-left rounded-xl"
            @click.stop
          >
            <!-- Dedicated background layer with soft blurred mask edges -->
            <div
              class="absolute -inset-2 bg-black/30 backdrop-blur-md rounded-2xl pointer-events-none -z-10 shadow-[0_0_30px_rgba(0,0,0,0.6)]"
              style="
                mask-image: radial-gradient(ellipse at center, black 50%, transparent 100%);
                -webkit-mask-image: radial-gradient(ellipse at center, black 50%, transparent 100%);
              "
            />
            <!-- Header bar -->
            <div
              class="flex items-center justify-between px-2.5 py-1.5 font-bold text-[var(--muted)] uppercase tracking-wider text-[10px] bg-black rounded-md border border-[var(--border)]/60 shadow-md shrink-0"
            >
              <span class="text-[var(--text-strong)] font-semibold tracking-wide"
                >Navigation History ({{ detailStore.savedTracks.length }}/100)</span
              >
              <button
                v-if="detailStore.savedTracks.length > 0"
                class="text-[10px] text-[var(--muted)] hover:text-red-400 transition-colors lowercase font-normal"
                @click="onClearAllTracks"
              >
                clear all
              </button>
            </div>

            <div class="overflow-y-auto flex flex-col gap-2 pr-1 max-h-[52vh]">
              <!-- Active Session Trail -->
              <div
                v-if="activeBreadcrumbs.length > 0"
                class="flex flex-col gap-1 blinds-item"
                :style="{ animationDelay: '20ms' }"
              >
                <div
                  class="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider px-2.5 py-1 bg-black rounded-md border border-[var(--border)]/50 shadow-xs w-max"
                >
                  Current Active Session
                </div>
                <div
                  class="flex items-center gap-1.5 p-2.5 rounded-lg bg-[var(--panel)] border border-[var(--border)]/60 text-left shadow-sm"
                >
                  <div
                    class="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto py-0.5"
                    style="scrollbar-width: none"
                  >
                    <template
                      v-for="(step, sIdx) in activeBreadcrumbs"
                      :key="'active-' + sIdx + '-' + step.id"
                    >
                      <div class="flex items-center gap-1 shrink-0">
                        <GameIcon
                          v-if="step.id !== '__index__'"
                          :id="step.id"
                          :kind="iconKind(step.kind)"
                          :name="getNodeTitle(step)"
                          :size="16"
                        />
                        <span
                          class="text-xs font-semibold text-[var(--text-strong)] whitespace-nowrap"
                        >
                          {{ getNodeTitle(step) }}
                        </span>
                      </div>
                      <span
                        v-if="sIdx < activeBreadcrumbs.length - 1"
                        class="text-[10px] text-[var(--accent)] font-mono shrink-0"
                        >&gt;</span
                      >
                    </template>
                  </div>
                </div>
              </div>

              <!-- Saved Past Session Tracks -->
              <div v-if="detailStore.savedTracks.length > 0" class="flex flex-col gap-1.5">
                <div
                  class="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider px-2.5 py-1 bg-black rounded-md border border-[var(--border)]/50 shadow-xs w-max"
                >
                  Past Completed Sessions
                </div>
                <div
                  v-for="(track, index) in detailStore.savedTracks"
                  :key="track.id"
                  class="blinds-item flex items-center justify-between p-2.5 rounded-lg bg-[var(--panel)] hover:bg-[var(--border)]/50 border border-[var(--border)]/40 transition-colors text-left group cursor-pointer shadow-sm"
                  :style="{ animationDelay: `${(index + 1) * 45}ms` }"
                  @click="onRestoreTrack(track)"
                >
                  <!-- Breadcrumb Path Preview -->
                  <div
                    class="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto pr-2 py-0.5"
                    style="scrollbar-width: none"
                  >
                    <template
                      v-for="(step, sIdx) in track.steps"
                      :key="track.id + '-' + sIdx + '-' + step.id"
                    >
                      <div class="flex items-center gap-1 shrink-0">
                        <GameIcon
                          v-if="step.id !== '__index__'"
                          :id="step.id"
                          :kind="iconKind(step.kind)"
                          :name="getNodeTitle(step)"
                          :size="16"
                        />
                        <span
                          class="text-xs font-medium text-[var(--text)] group-hover:text-[var(--accent)] transition-colors whitespace-nowrap"
                        >
                          {{ getNodeTitle(step) }}
                        </span>
                      </div>
                      <span
                        v-if="sIdx < track.steps.length - 1"
                        class="text-[10px] text-[var(--muted-2)] font-mono shrink-0"
                        >&gt;</span
                      >
                    </template>
                  </div>

                  <!-- Delete Session Button -->
                  <button
                    class="w-5 h-5 flex items-center justify-center rounded text-[var(--muted-2)] hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0 opacity-70 group-hover:opacity-100"
                    title="Delete this history session"
                    @click.stop="onDeleteTrack(track.id, $event)"
                  >
                    <svg
                      class="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Empty state -->
              <div
                v-if="detailStore.savedTracks.length === 0 && activeBreadcrumbs.length === 0"
                class="px-2 py-4 text-center text-[var(--muted)] italic text-xs"
              >
                No navigation history yet
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Zone 2: Center/Main Sliding Breadcrumb Track -->
      <div class="flex items-center gap-1 min-w-0 flex-1 overflow-hidden py-0.5">
        <button
          v-if="
            props.isDesktop && isBreadcrumbExpanded && formattedHistory.length > 0 && canScrollLeft
          "
          class="w-4 h-5 flex items-center justify-center rounded text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--panel)] shrink-0 z-10 transition-opacity"
          title="Scroll left"
          @click.stop="scrollTrack(-100)"
        >
          <svg
            class="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            stroke-width="2.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div
          v-if="props.isDesktop && isBreadcrumbExpanded && formattedHistory.length > 0"
          id="desktop-breadcrumb-track"
          class="flex items-center gap-1.5 transition-all duration-300 ease-in-out shrink min-w-0 overflow-x-auto select-none bg-[var(--panel)]/80 border border-[var(--border)]/60 rounded-md px-2 py-0.5 shadow-inner"
          style="scrollbar-width: none; -ms-overflow-style: none"
          @wheel="onBreadcrumbWheel"
          @scroll="updateScrollState"
        >
          <template v-for="item in formattedHistory" :key="item.originalIndex">
            <button
              class="flex items-center gap-1.5 text-[var(--muted)] hover:text-[var(--accent)] font-semibold truncate shrink-0 transition-colors"
              @click.stop="onJumpHistory(item.originalIndex)"
            >
              <GameIcon
                v-if="item.id !== '__index__'"
                :id="item.id"
                :kind="iconKind(item.kind)"
                :name="item.title"
                :size="18"
              />
              <span class="truncate max-w-[120px] text-sm">{{ item.title }}</span>
            </button>
            <span class="text-[var(--muted-2)] font-mono text-xs select-none shrink-0">&gt;</span>
          </template>
        </div>

        <button
          v-if="
            props.isDesktop && isBreadcrumbExpanded && formattedHistory.length > 0 && canScrollRight
          "
          class="w-4 h-5 flex items-center justify-center rounded text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--panel)] shrink-0 z-10 transition-opacity"
          title="Scroll right"
          @click.stop="scrollTrack(100)"
        >
          <svg
            class="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            stroke-width="2.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div
          class="flex items-center gap-1 text-[var(--text-strong)] font-semibold shrink min-w-0 cursor-pointer py-0.5 px-1 rounded hover:bg-[var(--panel)]/60 transition-colors"
          @click="toggleBreadcrumbExpand"
        >
          <GameIcon
            v-if="currentNode && currentNode.id !== '__index__'"
            :id="currentNode.id"
            :kind="iconKind(currentNode.kind)"
            :name="currentNode.title"
            :size="20"
          />
          <span class="text-sm font-bold text-[var(--text-strong)] tracking-wide truncate">
            {{ currentNode?.title }}
          </span>

          <svg
            v-if="formattedHistory.length > 0"
            class="w-3.5 h-3.5 text-[var(--muted)] transition-transform duration-300 ml-0.5 shrink-0"
            :class="isBreadcrumbExpanded ? 'rotate-90 text-[var(--accent)]' : ''"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </div>

    <!-- Mobile Downward Breadcrumb Expansion Dropdown -->
    <div
      v-if="!props.isDesktop && isBreadcrumbExpanded && formattedHistory.length > 0"
      class="absolute top-full mt-1 left-14 z-[200] bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl p-2 min-w-[220px] max-w-[85vw] flex flex-col gap-1 text-sm animate-in fade-in duration-200"
    >
      <div
        class="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider px-2 py-1 border-b border-[var(--border)]"
      >
        Breadcrumb Trail
      </div>
      <div class="max-h-[40vh] overflow-y-auto flex flex-col gap-1 py-1">
        <button
          v-for="item in formattedHistory"
          :key="item.originalIndex"
          class="flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-[var(--panel-2)] text-[var(--text)] hover:text-[var(--accent)] transition-colors text-left"
          @click.stop="onJumpHistory(item.originalIndex)"
        >
          <GameIcon
            v-if="item.id !== '__index__'"
            :id="item.id"
            :kind="iconKind(item.kind)"
            :name="item.title"
            :size="16"
          />
          <span class="truncate font-semibold text-xs">{{ item.title }}</span>
        </button>
      </div>
    </div>

    <!-- Right Controls: Search, Expand/Collapse & Close Button -->
    <div class="flex items-center gap-1 shrink-0 ml-1">
      <!-- Search Index Button -->
      <button
        class="w-7 h-7 flex items-center justify-center rounded text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--panel)] transition-colors"
        title="Search Index"
        @click="store.openItemIndex()"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </button>

      <!-- Chevron Expand/Collapse Button -->
      <button
        class="w-7 h-7 flex items-center justify-center rounded text-[var(--muted)] hover:text-[var(--text-strong)] hover:bg-[var(--panel)] transition-colors"
        :title="props.isExpanded ? 'Collapse' : 'Expand'"
        @click="emit('update:isExpanded', !props.isExpanded)"
      >
        <svg
          class="w-4 h-4 transition-transform duration-300"
          :class="props.isExpanded ? 'rotate-180' : ''"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      <button
        class="w-7 h-7 flex items-center justify-center rounded text-[var(--muted)] hover:text-red-400 hover:bg-[var(--panel)] transition-colors"
        title="Close drawer (Esc)"
        @click="emit('close')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
@keyframes blindsUnfurl {
  0% {
    opacity: 0;
    transform: perspective(600px) rotateX(-75deg) translateY(-28px) scaleY(0.2);
    filter: blur(2px);
  }
  15% {
    opacity: 1;
    filter: blur(0px);
  }
  60% {
    opacity: 1;
    transform: perspective(600px) rotateX(10deg) translateY(3px) scaleY(1.04);
    filter: blur(0px);
  }
  85% {
    opacity: 1;
    transform: perspective(600px) rotateX(-3deg) translateY(-1px) scaleY(0.98);
  }
  100% {
    opacity: 1;
    transform: perspective(600px) rotateX(0deg) translateY(0) scaleY(1);
    filter: blur(0px);
  }
}

.blinds-item {
  animation: blindsUnfurl 0.38s cubic-bezier(0.34, 1.45, 0.64, 1) both;
  transform-origin: top center;
  will-change: transform, opacity, filter;
}
</style>
