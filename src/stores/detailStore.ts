import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useDataStore } from './dataStore'

export interface DetailNode {
  kind: 'item' | 'building' | 'index'
  id: string
  name?: string
}

export interface RecentVisit {
  kind: 'item' | 'building'
  id: string
  timestamp: number
}

export interface NavTrack {
  id: string
  title: string
  steps: DetailNode[]
  timestamp: number
}

const NAV_HISTORY_KEY = 'srp:nav_history_v4'

export const useDetailStore = defineStore('detail', () => {
  const dataStore = useDataStore()

  // State
  const detail = ref<{ kind: 'item' | 'building'; id: string } | null>(null)
  const hover = ref<{ kind: 'item' | 'building'; id: string; rect: DOMRect } | null>(null)
  const detailHistory = ref<DetailNode[]>([])
  const detailForwardHistory = ref<DetailNode[]>([])
  const recentVisits = ref<RecentVisit[]>([])
  const savedTracks = ref<NavTrack[]>([])

  function saveNavHistoryToStorage() {
    try {
      const payload = {
        history: detailHistory.value,
        forward: detailForwardHistory.value,
        recent: recentVisits.value,
        tracks: savedTracks.value,
      }
      localStorage.setItem(NAV_HISTORY_KEY, JSON.stringify(payload))
    } catch {
      // ignore
    }
  }

  function loadNavHistoryFromStorage() {
    try {
      let raw = localStorage.getItem(NAV_HISTORY_KEY)
      if (!raw) {
        raw = localStorage.getItem('srp:nav_history_v3')
      }
      if (!raw) return
      const data = JSON.parse(raw)
      if (Array.isArray(data.history)) detailHistory.value = data.history
      if (Array.isArray(data.forward)) detailForwardHistory.value = data.forward
      if (Array.isArray(data.recent)) recentVisits.value = data.recent
      if (Array.isArray(data.tracks)) savedTracks.value = data.tracks
    } catch {
      // ignore
    }
  }

  function recordRecentVisit(kind: 'item' | 'building', id: string) {
    if (id === '__index__') return
    const filtered = recentVisits.value.filter((r) => !(r.kind === kind && r.id === id))
    recentVisits.value = [{ kind, id, timestamp: Date.now() }, ...filtered].slice(0, 25)
  }

  function getItemOrBuildingName(node: DetailNode): string {
    if (node.kind === 'item') return dataStore.itemsById.get(node.id)?.name ?? node.id
    if (node.kind === 'building') return dataStore.buildingsById.get(node.id)?.name ?? node.id
    return node.id
  }

  function archiveCurrentTrack() {
    if (!detail.value) return
    const steps: DetailNode[] = [...detailHistory.value]
    const last = steps[steps.length - 1]
    if (!last || last.kind !== detail.value.kind || last.id !== detail.value.id) {
      steps.push({ ...detail.value })
    }
    const validSteps = steps.filter((s) => s.id !== '__index__')
    if (validSteps.length >= 1) {
      const firstTitle = getItemOrBuildingName(validSteps[0])
      const lastTitle = getItemOrBuildingName(validSteps[validSteps.length - 1])
      const trackTitle = validSteps.length === 1 ? firstTitle : `${firstTitle} → ${lastTitle}`

      const filtered = savedTracks.value.filter((t) => t.title !== trackTitle)
      savedTracks.value = [
        {
          id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: trackTitle,
          steps: validSteps,
          timestamp: Date.now(),
        },
        ...filtered,
      ].slice(0, 100) // Up to 100 past sessions!
    }
  }

  function restoreTrack(track: NavTrack) {
    if (track.steps.length === 0) return
    archiveCurrentTrack()
    const past = track.steps.slice(0, track.steps.length - 1)
    const current = track.steps[track.steps.length - 1]
    detailHistory.value = [...past]
    detailForwardHistory.value = []
    detail.value = { ...current } as { kind: 'item' | 'building'; id: string }
    saveNavHistoryToStorage()
  }

  function deleteTrack(trackId: string) {
    savedTracks.value = savedTracks.value.filter((t) => t.id !== trackId)
    saveNavHistoryToStorage()
  }

  function clearAllTracks() {
    savedTracks.value = []
    saveNavHistoryToStorage()
  }

  function pushCurrentDetailToHistory() {
    if (detail.value && detail.value.id !== '__index__') {
      const last = detailHistory.value[detailHistory.value.length - 1]
      if (!last || last.kind !== detail.value.kind || last.id !== detail.value.id) {
        detailHistory.value.push({ ...detail.value })
      }
    }
  }

  function openItemDetail(id: string, fromDrawer = false) {
    if (detail.value !== null && !fromDrawer) {
      // Main page click while drawer was open: archive previous session & start fresh
      archiveCurrentTrack()
      detailHistory.value = []
      detailForwardHistory.value = []
    } else if (detail.value === null) {
      // Fresh session when opening closed drawer
      detailHistory.value = []
      detailForwardHistory.value = []
    } else if (detail.value.kind !== 'item' || detail.value.id !== id) {
      // Inside-drawer navigation: push to active breadcrumb history
      pushCurrentDetailToHistory()
      detailForwardHistory.value = []
    }
    detail.value = { kind: 'item', id }
    recordRecentVisit('item', id)
    saveNavHistoryToStorage()
  }

  function openBuildingDetail(id: string, fromDrawer = false) {
    if (detail.value !== null && !fromDrawer) {
      // Main page click while drawer was open: archive previous session & start fresh
      archiveCurrentTrack()
      detailHistory.value = []
      detailForwardHistory.value = []
    } else if (detail.value === null) {
      // Fresh session when opening closed drawer
      detailHistory.value = []
      detailForwardHistory.value = []
    } else if (detail.value.kind !== 'building' || detail.value.id !== id) {
      // Inside-drawer navigation: push to active breadcrumb history
      pushCurrentDetailToHistory()
      detailForwardHistory.value = []
    }
    detail.value = { kind: 'building', id }
    recordRecentVisit('building', id)
    saveNavHistoryToStorage()
  }

  function openItemIndex(fromDrawer = false) {
    if (detail.value !== null && !fromDrawer) {
      archiveCurrentTrack()
      detailHistory.value = []
      detailForwardHistory.value = []
    } else if (detail.value === null) {
      detailHistory.value = []
      detailForwardHistory.value = []
    } else {
      pushCurrentDetailToHistory()
      detailForwardHistory.value = []
    }
    detail.value = { kind: 'item', id: '__index__' }
    saveNavHistoryToStorage()
  }

  function clearNavHistory() {
    detailHistory.value = []
    detailForwardHistory.value = []
    recentVisits.value = []
    savedTracks.value = []
    saveNavHistoryToStorage()
  }

  function detailBack() {
    if (detailHistory.value.length === 0) return
    const prev = detailHistory.value.pop()
    if (prev) {
      if (detail.value) {
        detailForwardHistory.value.push({ ...detail.value })
      }
      detail.value = prev as { kind: 'item' | 'building'; id: string }
    }
    saveNavHistoryToStorage()
  }

  function detailForward() {
    if (detailForwardHistory.value.length === 0) return
    const next = detailForwardHistory.value.pop()
    if (next) {
      if (detail.value) {
        detailHistory.value.push({ ...detail.value })
      }
      detail.value = next as { kind: 'item' | 'building'; id: string }
    }
    saveNavHistoryToStorage()
  }

  function jumpToHistoryIndex(index: number) {
    if (index < 0 || index >= detailHistory.value.length) return
    const target = detailHistory.value[index]
    const remainingPast = detailHistory.value.slice(0, index)
    const movedToFuture = detailHistory.value.slice(index + 1)
    if (detail.value) {
      movedToFuture.push({ ...detail.value })
    }
    detailHistory.value = remainingPast
    detailForwardHistory.value = [...movedToFuture.reverse(), ...detailForwardHistory.value]
    detail.value = target as { kind: 'item' | 'building'; id: string }
    saveNavHistoryToStorage()
  }

  function closeDetail() {
    archiveCurrentTrack()
    detail.value = null
    detailHistory.value = []
    detailForwardHistory.value = []
    saveNavHistoryToStorage()
  }

  function replaceDetail(kind: 'item' | 'building', id: string) {
    detail.value = { kind, id }
  }

  // Hover timer
  let _hoverTimer: ReturnType<typeof setTimeout> | null = null

  function setHover(kind: 'item' | 'building', id: string, rect: DOMRect) {
    if (_hoverTimer !== null) clearTimeout(_hoverTimer)
    _hoverTimer = setTimeout(() => {
      _hoverTimer = null
      hover.value = { kind, id, rect }
    }, 350)
  }

  function clearHover() {
    if (_hoverTimer !== null) {
      clearTimeout(_hoverTimer)
      _hoverTimer = null
    }
    hover.value = null
  }

  return {
    detail,
    hover,
    detailHistory,
    detailForwardHistory,
    recentVisits,
    savedTracks,
    loadNavHistoryFromStorage,
    saveNavHistoryToStorage,
    openItemDetail,
    openBuildingDetail,
    openItemIndex,
    detailBack,
    detailForward,
    jumpToHistoryIndex,
    closeDetail,
    replaceDetail,
    archiveCurrentTrack,
    restoreTrack,
    deleteTrack,
    clearAllTracks,
    clearNavHistory,
    setHover,
    clearHover,
  }
})
