import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  Building,
  Item,
  UpgradeChain,
  CraftNode,
  Totals,
  VersionOverrides,
} from '../types/game'
import { loadGameData } from '../data/loader'
import {
  getAvailableBuildings,
  buildProducerIndex,
  pickProducer,
  type TierSelection,
  type ProducerEntry,
} from '../lib/recipeIndex'
import { resolveTree, aggregateTotals } from '../lib/resolver'
import { DEFAULT_VERSION } from '../data/versions'
import { save, loadSaved, encodePlan, decodePlanFromUrl, type PlanState } from '../lib/persistState'
import {
  buildUsedInIndex,
  buildExportsByItem,
  buildBuildingUnlock,
  buildBuildingCosts,
  type CorporationsData,
  type UsedInEntry,
  type ExportEntry,
  type UnlockEntry,
  type BuildingCostEntry,
} from '../lib/derived'

export const usePlannerStore = defineStore('planner', () => {
  // State
  const version = ref<string>(DEFAULT_VERSION)
  const buildings = ref<Building[]>([])
  const items = ref<Item[]>([])
  const chains = ref<UpgradeChain[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const tier = ref<TierSelection>({})
  const targetItemId = ref<string | null>(null)
  const targetRate = ref<number>(60)

  // v2 state
  const overrides = ref<VersionOverrides>({})
  const showExtractors = ref<boolean>(false)
  const showIcons = ref<boolean>(true)
  const showRowDividers = ref<boolean>(false)
  const optionsCollapsed = ref<boolean>(false)

  // v3 state — default 2 (persisted view pref)
  const expandLevel = ref<number>(2)

  // v5 state — theme
  const theme = ref<'starrupture' | 'spaceage'>('starrupture')

  // v6 state — corporations data (loaded, not persisted)
  const corporations = ref<CorporationsData>({})
  const _buildingCostsRaw = ref<Record<string, BuildingCostEntry[]>>({})

  // v6 transient UI state — NOT persisted
  const detail = ref<{ kind: 'item' | 'building'; id: string } | null>(null)
  const hover = ref<{ kind: 'item' | 'building'; id: string; rect: DOMRect } | null>(null)

  // Derived
  const itemsById = computed<Map<string, Item>>(() => new Map(items.value.map((i) => [i.id, i])))

  const buildingsById = computed<Map<string, Building>>(
    () => new Map(buildings.value.map((b) => [b.id, b])),
  )

  const productionChains = computed<UpgradeChain[]>(() =>
    chains.value.filter((c) => c.isProduction),
  )

  const availableBuildings = computed<Building[]>(() =>
    getAvailableBuildings(buildings.value, chains.value, tier.value),
  )

  // v2/upgraded building ids — used to prefer v2 recipes when both tiers are available.
  const upgradedIds = computed<Set<string>>(() => new Set(chains.value.map((c) => c.upgradedId)))

  const producerIndex = computed<Map<string, ProducerEntry[]>>(() =>
    buildProducerIndex(availableBuildings.value, upgradedIds.value),
  )

  // Full producer index over ALL buildings (used for overrides + candidates)
  const fullProducerIndex = computed<Map<string, ProducerEntry[]>>(() =>
    buildProducerIndex(buildings.value, upgradedIds.value),
  )

  // v6 derived lookups
  const usedInIndex = computed<Map<string, UsedInEntry[]>>(() => buildUsedInIndex(buildings.value))

  const exportsByItem = computed<Map<string, ExportEntry[]>>(() =>
    buildExportsByItem(corporations.value),
  )

  const buildingUnlock = computed<Map<string, UnlockEntry>>(() =>
    buildBuildingUnlock(buildings.value, corporations.value),
  )

  const buildingCosts = computed<Map<string, BuildingCostEntry[]>>(() =>
    buildBuildingCosts(_buildingCostsRaw.value),
  )

  const tree = computed<CraftNode | null>(() => {
    if (!targetItemId.value) return null
    return resolveTree(targetItemId.value, targetRate.value, {
      itemsById: itemsById.value,
      producerIndex: producerIndex.value,
      fullProducerIndex: fullProducerIndex.value,
      overrides: overrides.value,
    })
  })

  const totals = computed<Totals | null>(() => {
    if (!tree.value) return null
    return aggregateTotals(tree.value, { showExtractors: showExtractors.value })
  })

  function _maxDepth(node: CraftNode, d: number): number {
    if (node.children.length === 0) return d
    return Math.max(...node.children.map((c) => _maxDepth(c, d + 1)))
  }

  const treeMaxDepth = computed<number>(() => {
    if (!tree.value) return 0
    return _maxDepth(tree.value, 0)
  })

  // Actions

  /**
   * Load game data for version v, optionally restoring a validated PlanState.
   * If plan is provided and plan.version === v, apply a validated plan instead of defaults.
   * Called by init() (with possible plan) and setVersion() (hard reset, no plan).
   */
  async function load(v: string, plan?: PlanState | null) {
    loading.value = true
    error.value = null
    try {
      const data = await loadGameData(v)
      buildings.value = data.buildings
      items.value = data.items
      chains.value = data.chains
      corporations.value = data.corporations
      _buildingCostsRaw.value = data.buildingCostsRaw
      version.value = v

      // Build default all-v1 tier for production chains
      const defaultTier: TierSelection = {}
      for (const chain of data.chains) {
        if (chain.isProduction) {
          defaultTier[chain.baseId] = 'v1'
        }
      }

      if (plan && plan.version === v) {
        // ── Apply validated plan ──────────────────────────────────────────────

        // tier: only accept production baseIds with 'v1'|'v2' values
        const restoredTier: TierSelection = { ...defaultTier }
        for (const [baseId, val] of Object.entries(plan.tier)) {
          if ((val === 'v1' || val === 'v2') && baseId in defaultTier) {
            restoredTier[baseId] = val
          }
        }
        tier.value = restoredTier

        // Build the full producer index NOW (buildings are freshly set above) so
        // we can validate overrides against actual building/item pairs.
        const allUpgradedIds = new Set(data.chains.map((c) => c.upgradedId))
        const freshFullIndex = buildProducerIndex(data.buildings, allUpgradedIds)
        const freshItemsById = new Map(data.items.map((i) => [i.id, i]))

        // overrides: keep only entries where item exists AND building actually produces it
        const restoredOverrides: VersionOverrides = {}
        for (const [itemId, buildingId] of Object.entries(plan.overrides)) {
          if (!freshItemsById.has(itemId)) continue
          const producers = freshFullIndex.get(itemId)
          if (producers?.some((e) => e.building.id === buildingId)) {
            restoredOverrides[itemId] = buildingId
          }
        }
        overrides.value = restoredOverrides

        // targetItemId: use if item exists, else fall back to default
        const validTarget =
          plan.targetItemId && freshItemsById.has(plan.targetItemId)
            ? plan.targetItemId
            : (data.items.find((i) => i.type === 'component')?.id ?? data.items[0]?.id ?? null)
        targetItemId.value = validTarget

        // targetRate: use if positive finite number, else compute default
        targetRate.value =
          typeof plan.targetRate === 'number' && isFinite(plan.targetRate) && plan.targetRate > 0
            ? plan.targetRate
            : validTarget
              ? defaultRateForItem(validTarget)
              : 60
      } else {
        // ── Default reset ─────────────────────────────────────────────────────
        tier.value = defaultTier
        overrides.value = {}

        const firstComponent = data.items.find((i) => i.type === 'component')
        const newTarget = firstComponent?.id ?? data.items[0]?.id ?? null
        targetItemId.value = newTarget
        targetRate.value = newTarget ? defaultRateForItem(newTarget) : 60
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  /**
   * init() replaces the old on-mount store.load(version) call.
   * Priority: URL plan > saved plan > default.
   */
  async function init() {
    const urlPlan = decodePlanFromUrl()
    const saved = loadSaved()

    // Apply saved view prefs first (before load sets defaults)
    if (saved?.prefs) {
      showExtractors.value = saved.prefs.showExtractors
      showIcons.value = saved.prefs.showIcons
      showRowDividers.value = saved.prefs.showRowDividers
      expandLevel.value = saved.prefs.expandLevel
      optionsCollapsed.value = saved.prefs.optionsCollapsed
      if (saved.prefs.theme) {
        theme.value = saved.prefs.theme
      }
    }
    // Apply theme to DOM
    document.documentElement.dataset.theme = theme.value === 'spaceage' ? 'spaceage' : ''

    const plan = urlPlan ?? saved?.plan ?? null
    await load(plan?.version ?? DEFAULT_VERSION, plan)
  }

  function setTier(baseId: string, value: 'v1' | 'v2') {
    tier.value = { ...tier.value, [baseId]: value }
  }

  function setVersion(v: string) {
    // Hard reset — no plan; load() will set version.value inside
    load(v)
  }

  function setTarget(itemId: string, rate: number) {
    targetItemId.value = itemId
    targetRate.value = rate
  }

  // The producer that will actually make this item (override first, else tier-aware default).
  function effectiveProducerFor(itemId: string): ProducerEntry | undefined {
    const ovId = overrides.value[itemId]
    if (ovId) {
      const p = fullProducerIndex.value.get(itemId)?.find((e) => e.building.id === ovId)
      if (p) return p
    }
    return pickProducer(itemId, producerIndex.value)
  }

  // Default target rate for an item = a single producing building's output (items/min).
  function defaultRateForItem(itemId: string): number {
    const out = effectiveProducerFor(itemId)?.recipe.output.amount_per_minute
    return out && out > 0 ? out : 60
  }

  // Select a new target item and default its rate to one building's output.
  function selectTargetItem(itemId: string) {
    targetItemId.value = itemId
    targetRate.value = defaultRateForItem(itemId)
  }

  function setOverride(itemId: string, buildingId: string) {
    // If the buildingId matches the global-default producer, remove the override
    const globalDefault = pickProducer(itemId, producerIndex.value)
    if (globalDefault && globalDefault.building.id === buildingId) {
      const newOverrides = { ...overrides.value }
      delete newOverrides[itemId]
      overrides.value = newOverrides
    } else {
      overrides.value = { ...overrides.value, [itemId]: buildingId }
    }
  }

  function clearOverrides() {
    overrides.value = {}
  }

  function setShowExtractors(value: boolean) {
    showExtractors.value = value
  }

  function setShowIcons(value: boolean) {
    showIcons.value = value
  }

  function setShowRowDividers(value: boolean) {
    showRowDividers.value = value
  }

  function toggleOptions() {
    optionsCollapsed.value = !optionsCollapsed.value
  }

  function setExpandLevel(n: number) {
    expandLevel.value = n
  }

  function setTheme(t: 'starrupture' | 'spaceage') {
    theme.value = t
    document.documentElement.dataset.theme = t === 'spaceage' ? 'spaceage' : ''
  }

  // v6 detail drawer actions
  function openItemDetail(id: string) {
    detail.value = { kind: 'item', id }
  }

  function openBuildingDetail(id: string) {
    detail.value = { kind: 'building', id }
  }

  function closeDetail() {
    detail.value = null
  }

  // v6 hover card actions (350ms open delay handled via a timer)
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

  /** Build a shareable URL encoding the current plan state. */
  function buildShareUrl(): string {
    return encodePlan({
      version: version.value,
      targetItemId: targetItemId.value,
      targetRate: targetRate.value,
      tier: tier.value,
      overrides: overrides.value,
    })
  }

  // ── Debounced persistence watch ────────────────────────────────────────────
  // Watch plan + prefs; save to localStorage ~300ms after the last change.
  let _saveTimer: ReturnType<typeof setTimeout> | null = null

  function _scheduleSave() {
    if (_saveTimer !== null) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      _saveTimer = null
      save(
        {
          version: version.value,
          targetItemId: targetItemId.value,
          targetRate: targetRate.value,
          tier: tier.value,
          overrides: overrides.value,
        },
        {
          showExtractors: showExtractors.value,
          showIcons: showIcons.value,
          showRowDividers: showRowDividers.value,
          expandLevel: expandLevel.value,
          optionsCollapsed: optionsCollapsed.value,
          theme: theme.value,
        },
      )
    }, 300)
  }

  // Watch plan fields
  watch([version, targetItemId, targetRate], _scheduleSave)
  watch(tier, _scheduleSave, { deep: true })
  watch(overrides, _scheduleSave, { deep: true })
  // Watch view prefs
  watch(
    [showExtractors, showIcons, showRowDividers, expandLevel, optionsCollapsed, theme],
    _scheduleSave,
  )

  return {
    // State
    version,
    buildings,
    items,
    chains,
    loading,
    error,
    tier,
    targetItemId,
    targetRate,
    overrides,
    showExtractors,
    showIcons,
    showRowDividers,
    optionsCollapsed,
    // Computed
    itemsById,
    buildingsById,
    productionChains,
    availableBuildings,
    producerIndex,
    fullProducerIndex,
    tree,
    totals,
    treeMaxDepth,
    // v3 state
    expandLevel,
    // v5 state
    theme,
    // v6 state
    corporations,
    detail,
    hover,
    // v6 computed
    usedInIndex,
    exportsByItem,
    buildingUnlock,
    buildingCosts,
    // Actions
    init,
    load,
    setTier,
    setVersion,
    setTarget,
    selectTargetItem,
    defaultRateForItem,
    setOverride,
    clearOverrides,
    setShowExtractors,
    setShowIcons,
    setShowRowDividers,
    toggleOptions,
    setExpandLevel,
    setTheme,
    buildShareUrl,
    // v6 actions
    openItemDetail,
    openBuildingDetail,
    closeDetail,
    setHover,
    clearHover,
  }
})
