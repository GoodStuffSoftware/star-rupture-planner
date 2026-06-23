import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import type {
  Building,
  Item,
  UpgradeChain,
  CraftNode,
  Totals,
  VersionOverrides,
  Overages,
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
import {
  save,
  loadSaved,
  encodePlan,
  decodePlanFromUrl,
  type PlanState,
  type PlanTargetState,
} from '../lib/persistState'
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

  // ── Multi-target tabs ──────────────────────────────────────────────────────
  // Each tab is an independent planning target: an item + rate + per-occurrence
  // overages. version / tier / overrides remain global across all tabs.
  interface PlanTarget {
    tid: string
    targetItemId: string | null
    targetRate: number
    overages: Overages
    expandLevel: number // per-tab expand scope
  }
  let _tidSeq = 0
  function _newTid(): string {
    return `t${Date.now().toString(36)}_${(_tidSeq++).toString(36)}`
  }

  const targets = ref<PlanTarget[]>([
    { tid: _newTid(), targetItemId: null, targetRate: 60, overages: {}, expandLevel: 2 },
  ])
  const activeTargetId = ref<string>(targets.value[0].tid)

  const activeTarget = computed<PlanTarget>(
    () => targets.value.find((t) => t.tid === activeTargetId.value) ?? targets.value[0],
  )

  // Writable proxies onto the active tab so the rest of the app keeps treating
  // "the target" as a single thing.
  const targetItemId = computed<string | null>({
    get: () => activeTarget.value?.targetItemId ?? null,
    set: (v) => {
      if (activeTarget.value) activeTarget.value.targetItemId = v
    },
  })
  const targetRate = computed<number>({
    get: () => activeTarget.value?.targetRate ?? 60,
    set: (v) => {
      if (activeTarget.value) activeTarget.value.targetRate = v
    },
  })
  const overages = computed<Overages>({
    get: () => activeTarget.value?.overages ?? {},
    set: (v) => {
      if (activeTarget.value) activeTarget.value.overages = v
    },
  })
  // Per-tab expand scope (proxied onto the active tab).
  const expandLevel = computed<number>({
    get: () => activeTarget.value?.expandLevel ?? 2,
    set: (v) => {
      if (activeTarget.value) activeTarget.value.expandLevel = v
    },
  })

  // v2 state
  const overrides = ref<VersionOverrides>({})
  const showExtractors = ref<boolean>(false)
  const showIcons = ref<boolean>(true)
  const showRowDividers = ref<boolean>(false)
  const optionsCollapsed = ref<boolean>(false)

  // Default expand scope for newly created/restored tabs (seeded from saved prefs).
  const defaultExpandLevel = ref<number>(2)

  // Tree text zoom (1 = 100%); persisted view pref
  const treeFontScale = ref<number>(1)

  // Totals panel placement: beside the tree or below it; persisted view pref
  const totalsPlacement = ref<'side' | 'bottom'>('side')

  // Collapsed state per Totals subsection (keyed by section id); persisted.
  const totalsCollapsed = ref<Record<string, boolean>>({})

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

  // The "all totals" pseudo-tab aggregates every open tab; it isn't a real target.
  const ALL_TARGETS_ID = '__all__'
  const isAllView = computed(() => activeTargetId.value === ALL_TARGETS_ID)

  const tree = computed<CraftNode | null>(() => {
    if (isAllView.value || !targetItemId.value) return null
    return resolveTree(targetItemId.value, targetRate.value, {
      itemsById: itemsById.value,
      producerIndex: producerIndex.value,
      fullProducerIndex: fullProducerIndex.value,
      overrides: overrides.value,
      overages: overages.value,
    })
  })

  // Combined totals across all open tabs (raw, intermediates, buildings, power,
  // heat summed; building counts re-ceiled on the combined fractional count).
  const allTotals = computed<Totals | null>(() => {
    const real = targets.value.filter((t) => t.targetItemId)
    if (real.length === 0) return null
    const rawMap = new Map<string, { itemName: string; ratePerMin: number }>()
    const intMap = new Map<
      string,
      { itemName: string; itemType: Item['type']; ratePerMin: number }
    >()
    const bldMap = new Map<string, { buildingName: string; count: number }>()
    let totalPower = 0
    let totalHeat = 0
    for (const t of real) {
      const tr = resolveTree(t.targetItemId!, t.targetRate, {
        itemsById: itemsById.value,
        producerIndex: producerIndex.value,
        fullProducerIndex: fullProducerIndex.value,
        overrides: overrides.value,
        overages: t.overages,
      })
      const tot = aggregateTotals(tr, { showExtractors: showExtractors.value })
      for (const r of tot.rawMaterials) {
        const e = rawMap.get(r.itemId)
        if (e) e.ratePerMin += r.ratePerMin
        else rawMap.set(r.itemId, { itemName: r.itemName, ratePerMin: r.ratePerMin })
      }
      for (const i of tot.intermediates) {
        const e = intMap.get(i.itemId)
        if (e) e.ratePerMin += i.ratePerMin
        else
          intMap.set(i.itemId, {
            itemName: i.itemName,
            itemType: i.itemType,
            ratePerMin: i.ratePerMin,
          })
      }
      for (const b of tot.buildings) {
        const e = bldMap.get(b.buildingId)
        if (e) e.count += b.count
        else bldMap.set(b.buildingId, { buildingName: b.buildingName, count: b.count })
      }
      totalPower += tot.totalPower
      totalHeat += tot.totalHeat
    }
    return {
      rawMaterials: [...rawMap.entries()]
        .map(([itemId, v]) => ({ itemId, itemName: v.itemName, ratePerMin: v.ratePerMin }))
        .sort((a, b) => b.ratePerMin - a.ratePerMin),
      intermediates: [...intMap.entries()]
        .map(([itemId, v]) => ({
          itemId,
          itemName: v.itemName,
          itemType: v.itemType,
          ratePerMin: v.ratePerMin,
        }))
        .sort((a, b) => b.ratePerMin - a.ratePerMin),
      buildings: [...bldMap.entries()]
        .map(([buildingId, v]) => ({
          buildingId,
          buildingName: v.buildingName,
          count: v.count,
          ceilCount: Math.ceil(v.count),
        }))
        .sort((a, b) => b.count - a.count),
      totalPower,
      totalHeat,
    }
  })

  const totals = computed<Totals | null>(() => {
    if (isAllView.value) return allTotals.value
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

        // Build target tabs from the plan (multi-target, or legacy single fields),
        // validating each item and its overages against the freshly loaded data.
        const fallbackItem =
          data.items.find((i) => i.type === 'component')?.id ?? data.items[0]?.id ?? null

        // overages are per-occurrence deltas keyed by node path; keep nonzero,
        // finite values whose leaf item (last path segment) still exists.
        const validateOverages = (raw: Overages | undefined): Overages => {
          const out: Overages = {}
          for (const [path, extra] of Object.entries(raw ?? {})) {
            const leafItemId = path.split('>').pop() ?? ''
            if (
              freshItemsById.has(leafItemId) &&
              typeof extra === 'number' &&
              isFinite(extra) &&
              extra !== 0
            ) {
              out[path] = extra
            }
          }
          return out
        }

        const sources: PlanTargetState[] =
          plan.targets && plan.targets.length
            ? plan.targets
            : [
                {
                  targetItemId: plan.targetItemId,
                  targetRate: plan.targetRate,
                  overages: plan.overages ?? {},
                },
              ]

        const restoredTargets: PlanTarget[] = sources.map((s) => {
          const validItem =
            s.targetItemId && freshItemsById.has(s.targetItemId) ? s.targetItemId : fallbackItem
          const rate =
            typeof s.targetRate === 'number' && isFinite(s.targetRate) && s.targetRate > 0
              ? s.targetRate
              : validItem
                ? defaultRateForItem(validItem)
                : 60
          const exp =
            typeof s.expandLevel === 'number' && s.expandLevel >= 0
              ? s.expandLevel
              : defaultExpandLevel.value
          return {
            tid: _newTid(),
            targetItemId: validItem,
            targetRate: rate,
            overages: validateOverages(s.overages),
            expandLevel: exp,
          }
        })
        if (restoredTargets.length === 0) {
          restoredTargets.push({
            tid: _newTid(),
            targetItemId: fallbackItem,
            targetRate: fallbackItem ? defaultRateForItem(fallbackItem) : 60,
            expandLevel: defaultExpandLevel.value,
            overages: {},
          })
        }
        targets.value = restoredTargets
        const ai = plan.activeTargetIndex ?? 0
        // -1 restores the combined "all totals" view (only valid with 2+ tabs).
        activeTargetId.value =
          ai === -1 && restoredTargets.length > 1
            ? ALL_TARGETS_ID
            : restoredTargets[Math.min(Math.max(ai, 0), restoredTargets.length - 1)].tid
      } else {
        // ── Default reset ─────────────────────────────────────────────────────
        tier.value = defaultTier
        overrides.value = {}

        const newTarget =
          data.items.find((i) => i.type === 'component')?.id ?? data.items[0]?.id ?? null
        targets.value = [
          {
            tid: _newTid(),
            targetItemId: newTarget,
            targetRate: newTarget ? defaultRateForItem(newTarget) : 60,
            overages: {},
            expandLevel: defaultExpandLevel.value,
          },
        ]
        activeTargetId.value = targets.value[0].tid
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
      defaultExpandLevel.value = saved.prefs.expandLevel
      optionsCollapsed.value = saved.prefs.optionsCollapsed
      if (saved.prefs.theme) {
        theme.value = saved.prefs.theme
      }
      if (saved.prefs.treeFontScale) {
        treeFontScale.value = saved.prefs.treeFontScale
      }
      if (saved.prefs.totalsPlacement) {
        totalsPlacement.value = saved.prefs.totalsPlacement
      }
      if (saved.prefs.totalsCollapsed) {
        totalsCollapsed.value = saved.prefs.totalsCollapsed
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
    const t = activeTarget.value
    if (!t) return
    t.targetItemId = itemId
    t.targetRate = rate
  }

  // ── Tab actions ────────────────────────────────────────────────────────────
  function setActiveTarget(tid: string) {
    if (targets.value.some((t) => t.tid === tid)) activeTargetId.value = tid
  }

  // Switch to the combined "all totals" view.
  function showAllTotals() {
    activeTargetId.value = ALL_TARGETS_ID
  }

  // Open the given item in a NEW recipe tab (default rate) and make it active.
  function addTargetItem(itemId: string | null) {
    const tid = _newTid()
    targets.value.push({
      tid,
      targetItemId: itemId,
      targetRate: itemId ? defaultRateForItem(itemId) : 60,
      overages: {},
      expandLevel: activeTarget.value?.expandLevel ?? defaultExpandLevel.value,
    })
    activeTargetId.value = tid
  }

  // Add a new recipe tab (defaults to the first component) and make it active.
  function addTarget() {
    const newItem =
      items.value.find((i) => i.type === 'component')?.id ?? items.value[0]?.id ?? null
    addTargetItem(newItem)
  }

  // Close a recipe tab. Always keeps at least one tab; re-points the active tab
  // to a neighbour if the closed one was active.
  function closeTarget(tid: string) {
    const idx = targets.value.findIndex((t) => t.tid === tid)
    if (idx === -1) return
    targets.value.splice(idx, 1)
    if (targets.value.length === 0) {
      const newItem =
        items.value.find((i) => i.type === 'component')?.id ?? items.value[0]?.id ?? null
      targets.value.push({
        tid: _newTid(),
        targetItemId: newItem,
        targetRate: newItem ? defaultRateForItem(newItem) : 60,
        overages: {},
        expandLevel: defaultExpandLevel.value,
      })
    }
    if (activeTargetId.value === ALL_TARGETS_ID) {
      // The all-totals view only exists with 2+ tabs; fall back if we dropped to one.
      if (targets.value.length <= 1) activeTargetId.value = targets.value[0].tid
    } else if (!targets.value.some((t) => t.tid === activeTargetId.value)) {
      activeTargetId.value = targets.value[Math.min(idx, targets.value.length - 1)].tid
    }
  }

  // Reorder tabs: move the tab `fromTid` to the position of `toTid`.
  function moveTarget(fromTid: string, toTid: string) {
    const from = targets.value.findIndex((t) => t.tid === fromTid)
    const to = targets.value.findIndex((t) => t.tid === toTid)
    if (from === -1 || to === -1 || from === to) return
    const arr = targets.value.slice()
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    targets.value = arr
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
    const t = activeTarget.value
    if (!t) return
    t.targetItemId = itemId
    t.targetRate = defaultRateForItem(itemId)
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

  // Set a per-occurrence overproduction delta (items/min beyond demand) for the
  // tree node at `path`. Positive overproduces, negative is an intentional
  // deficit; zero clears the entry.
  function setOverage(path: string, extra: number) {
    const t = activeTarget.value
    if (!t) return
    const rounded = Math.round((Number(extra) || 0) * 1000) / 1000
    if (rounded !== 0) {
      t.overages = { ...t.overages, [path]: rounded }
    } else if (path in t.overages) {
      const next = { ...t.overages }
      delete next[path]
      t.overages = next
    }
  }

  function clearOverages() {
    if (activeTarget.value) activeTarget.value.overages = {}
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

  function setTreeFontScale(n: number) {
    treeFontScale.value = n > 0 ? n : 1
  }

  function setTotalsPlacement(p: 'side' | 'bottom') {
    totalsPlacement.value = p
  }

  function toggleTotalsSection(key: string) {
    // Mutate in place so callers holding a reference stay in sync; the deep watch
    // still picks it up for persistence.
    totalsCollapsed.value[key] = !totalsCollapsed.value[key]
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

  // Snapshot the current plan (all tabs) for persistence + sharing. Legacy
  // single-target fields mirror the active tab for backward compatibility.
  function _planState(): PlanState {
    const active = activeTarget.value
    // -1 marks the combined "all totals" view (not a real target index).
    const idx = isAllView.value
      ? -1
      : Math.max(
          0,
          targets.value.findIndex((t) => t.tid === activeTargetId.value),
        )
    const planTargets: PlanTargetState[] = targets.value.map((t) => ({
      targetItemId: t.targetItemId,
      targetRate: t.targetRate,
      overages: t.overages,
      expandLevel: t.expandLevel,
    }))
    return {
      version: version.value,
      targetItemId: active?.targetItemId ?? null,
      targetRate: active?.targetRate ?? 60,
      overages: active?.overages ?? {},
      targets: planTargets,
      activeTargetIndex: idx,
      tier: tier.value,
      overrides: overrides.value,
    }
  }

  /** Build a shareable URL encoding ONLY the active recipe tab. */
  function buildShareUrl(): string {
    const active = activeTarget.value
    return encodePlan({
      version: version.value,
      targetItemId: active?.targetItemId ?? null,
      targetRate: active?.targetRate ?? 60,
      overages: active?.overages ?? {},
      tier: tier.value,
      overrides: overrides.value,
      // No `targets` array → encodePlan emits the compact single-target form.
    })
  }

  // ── Debounced persistence watch ────────────────────────────────────────────
  // Watch plan + prefs; save to localStorage ~300ms after the last change.
  let _saveTimer: ReturnType<typeof setTimeout> | null = null

  function _scheduleSave() {
    if (_saveTimer !== null) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      _saveTimer = null
      save(_planState(), {
        showExtractors: showExtractors.value,
        showIcons: showIcons.value,
        showRowDividers: showRowDividers.value,
        expandLevel: expandLevel.value,
        optionsCollapsed: optionsCollapsed.value,
        theme: theme.value,
        treeFontScale: treeFontScale.value,
        totalsPlacement: totalsPlacement.value,
        totalsCollapsed: totalsCollapsed.value,
      })
    }, 300)
  }

  // Watch plan fields
  watch(version, _scheduleSave)
  watch(activeTargetId, _scheduleSave)
  watch(targets, _scheduleSave, { deep: true })
  watch(tier, _scheduleSave, { deep: true })
  watch(overrides, _scheduleSave, { deep: true })
  // Watch view prefs
  watch(
    [
      showExtractors,
      showIcons,
      showRowDividers,
      expandLevel,
      optionsCollapsed,
      theme,
      treeFontScale,
      totalsPlacement,
    ],
    _scheduleSave,
  )
  watch(totalsCollapsed, _scheduleSave, { deep: true })

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
    overages,
    // multi-target tabs
    targets,
    activeTargetId,
    activeTarget,
    isAllView,
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
    treeFontScale,
    totalsPlacement,
    totalsCollapsed,
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
    setActiveTarget,
    showAllTotals,
    addTarget,
    addTargetItem,
    closeTarget,
    moveTarget,
    selectTargetItem,
    defaultRateForItem,
    setOverride,
    clearOverrides,
    setOverage,
    clearOverages,
    setShowExtractors,
    setShowIcons,
    setShowRowDividers,
    toggleOptions,
    setExpandLevel,
    setTreeFontScale,
    setTotalsPlacement,
    toggleTotalsSection,
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
