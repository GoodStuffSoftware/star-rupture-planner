import { ref } from 'vue'
import { defineStore } from 'pinia'
import { sanitizeDefaultTarget, DEFAULT_TARGET_PREF, type DefaultTargetPref } from '../lib/format'
import { loadSaved, savePrefs, type ViewPrefs } from '../lib/persistState'

export const usePrefsStore = defineStore('prefs', () => {
  const showExtractors = ref<boolean>(false)
  const showIcons = ref<boolean>(true)
  const showRowDividers = ref<boolean>(false)
  const showOverages = ref<boolean>(false)
  const optionsCollapsed = ref<boolean>(false)
  const defaultExpandLevel = ref<number>(2)
  const theme = ref<'starrupture' | 'spaceage'>('starrupture')
  const treeFontScale = ref<number>(1)
  const totalsPlacement = ref<'side' | 'bottom'>('side')
  const totalsCollapsed = ref<Record<string, boolean>>({})
  const defaultTarget = ref<DefaultTargetPref>({ ...DEFAULT_TARGET_PREF })

  function getPrefs(): ViewPrefs {
    return {
      showExtractors: showExtractors.value,
      showIcons: showIcons.value,
      showRowDividers: showRowDividers.value,
      showOverages: showOverages.value,
      expandLevel: defaultExpandLevel.value,
      optionsCollapsed: optionsCollapsed.value,
      theme: theme.value,
      treeFontScale: treeFontScale.value,
      totalsPlacement: totalsPlacement.value,
      totalsCollapsed: totalsCollapsed.value,
      defaultTarget: { ...defaultTarget.value },
    }
  }

  function persist() {
    savePrefs(getPrefs())
  }

  function initPrefs() {
    const saved = loadSaved()
    if (saved?.prefs) {
      const p = saved.prefs
      showExtractors.value = p.showExtractors
      showIcons.value = p.showIcons
      showRowDividers.value = p.showRowDividers
      showOverages.value = p.showOverages ?? false
      defaultExpandLevel.value = p.expandLevel
      optionsCollapsed.value = p.optionsCollapsed
      theme.value = p.theme
      treeFontScale.value = p.treeFontScale
      totalsPlacement.value = p.totalsPlacement
      totalsCollapsed.value = p.totalsCollapsed ?? {}
      defaultTarget.value = sanitizeDefaultTarget(p.defaultTarget)
    }
    document.documentElement.dataset.theme = theme.value === 'spaceage' ? 'spaceage' : ''
  }

  function setTheme(t: 'starrupture' | 'spaceage') {
    theme.value = t
    document.documentElement.dataset.theme = t === 'spaceage' ? 'spaceage' : ''
    persist()
  }

  function setShowExtractors(val: boolean) {
    showExtractors.value = val
    persist()
  }

  function setShowIcons(val: boolean) {
    showIcons.value = val
    persist()
  }

  function setShowRowDividers(val: boolean) {
    showRowDividers.value = val
    persist()
  }

  function setShowOverages(val: boolean) {
    showOverages.value = val
    persist()
  }

  /** Change part of the default-for-new-targets setting. Existing targets are never touched. */
  function setDefaultTarget(patch: Partial<DefaultTargetPref>) {
    defaultTarget.value = sanitizeDefaultTarget({ ...defaultTarget.value, ...patch })
    persist()
  }

  function toggleOptions() {
    optionsCollapsed.value = !optionsCollapsed.value
    persist()
  }

  function setTreeFontScale(val: number) {
    treeFontScale.value = val
    persist()
  }

  function setTotalsPlacement(val: 'side' | 'bottom') {
    totalsPlacement.value = val
    persist()
  }

  function toggleTotalsSection(id: string) {
    totalsCollapsed.value = {
      ...totalsCollapsed.value,
      [id]: !totalsCollapsed.value[id],
    }
    persist()
  }

  return {
    showExtractors,
    showIcons,
    showRowDividers,
    showOverages,
    optionsCollapsed,
    defaultExpandLevel,
    theme,
    treeFontScale,
    totalsPlacement,
    totalsCollapsed,
    defaultTarget,
    getPrefs,
    initPrefs,
    setTheme,
    setShowExtractors,
    setShowIcons,
    setShowRowDividers,
    setShowOverages,
    setDefaultTarget,
    toggleOptions,
    setTreeFontScale,
    setTotalsPlacement,
    toggleTotalsSection,
  }
})
