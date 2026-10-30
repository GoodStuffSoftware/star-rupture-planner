import { ref, computed, watch, nextTick } from 'vue'
import { defineStore } from 'pinia'
import type {
  CraftNode,
  Item,
  Building,
  UpgradeChain,
  Totals,
  VersionOverrides,
  RecipeOverrides,
  Overages,
  NodeExpansion,
  ItemType,
} from '../types/game'
import {
  getAvailableBuildings,
  buildProducerIndex,
  pickProducer,
  recipeKey,
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
  isSamePlan,
  planTargetList,
  LS_KEY,
  type PlanState,
  type PlanTargetState,
} from '../lib/persistState'
import {
  readAddItemRequest,
  sanitizeAddRate,
  stripHandledParams,
  hasHandOffSupport,
  requestHandOff,
  serveHandOff,
  type AddItemRequest,
} from '../lib/addItemLink'
import { useDataStore } from './dataStore'
import { useDetailStore } from './detailStore'
import { usePrefsStore } from './prefsStore'

export interface PlanTarget {
  tid: string
  targetItemId: string | null
  targetRate: number
  overages: Overages
  expandLevel: number
  /**
   * Manual caret toggles for this tab, keyed by CraftNode.path. Only nodes the
   * user moved away from the `expandLevel` default are kept — everything else
   * falls back to `depth < expandLevel`. Living on the target (not in the node
   * component) is what makes expansion survive a tab switch.
   */
  expanded: NodeExpansion
}

let _tidSeq = 0
function _newTid(): string {
  return `t${Date.now().toString(36)}_${(_tidSeq++).toString(36)}`
}

export const usePlannerStore = defineStore('planner', () => {
  const dataStore = useDataStore()
  const detailStore = useDetailStore()
  const prefsStore = usePrefsStore()

  // Planning State
  const tier = ref<TierSelection>({})
  const overrides = ref<VersionOverrides>({})
  const recipeOverrides = ref<RecipeOverrides>({})

  /** Transient, non-blocking message for the UI (e.g. an unknown `?add=` item). */
  const notice = ref<string | null>(null)

  /**
   * A full-plan link (`?p=`) that differs from the saved plan, parked until the
   * user picks what to do with it (see `resolveShare`). While set, the saved
   * plan is what's on screen and nothing has been written.
   */
  const pendingShare = ref<PlanState | null>(null)
  let _deferredAdd: AddItemRequest | null = null

  /**
   * Set while this tab, opened by an `?add=` link, is handing the item to an
   * already-open planner tab: 'asking' until one answers, 'done' once it has
   * added it (this tab is then only waiting to be closed). While set the tab
   * loads nothing, never saves and ignores sibling saves; the app shows a
   * placeholder instead of the planner.
   */
  const handOff = ref<'asking' | 'done' | null>(null)

  // Multi-target tabs
  const targets = ref<PlanTarget[]>([
    {
      tid: _newTid(),
      targetItemId: null,
      targetRate: 60,
      overages: {},
      expandLevel: 2,
      expanded: {},
    },
  ])
  const activeTargetId = ref<string>(targets.value[0].tid)

  const activeTarget = computed<PlanTarget>(
    () => targets.value.find((t) => t.tid === activeTargetId.value) ?? targets.value[0],
  )

  // Writable proxies onto active tab
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
  const expandLevel = computed<number>({
    get: () => activeTarget.value?.expandLevel ?? 2,
    set: (v) => {
      if (activeTarget.value) activeTarget.value.expandLevel = v
    },
  })
  const expanded = computed<NodeExpansion>(() => activeTarget.value?.expanded ?? {})

  /** Effective expanded state for a tree row: manual toggle wins, else the tab's level. */
  function isNodeExpanded(path: string, depth: number): boolean {
    return expanded.value[path] ?? depth < expandLevel.value
  }

  /**
   * Flip a row's caret on the active tab. Toggling a row back to what its
   * expandLevel would give drops the entry, so the map only ever holds real
   * deviations and a level change can reset everything by clearing it.
   */
  function toggleNode(path: string, depth: number): void {
    const t = activeTarget.value
    if (!t) return
    const next = !isNodeExpanded(path, depth)
    if (next === depth < t.expandLevel) delete t.expanded[path]
    else t.expanded[path] = next
  }

  // Derived available buildings & producer index based on selected tiers
  const availableBuildings = computed(() =>
    getAvailableBuildings(dataStore.buildings, dataStore.chains, tier.value),
  )

  const producerIndex = computed<Map<string, ProducerEntry[]>>(() =>
    buildProducerIndex(availableBuildings.value, dataStore.upgradedIds),
  )

  const ALL_TARGETS_ID = '__all__'
  const isAllView = computed(() => activeTargetId.value === ALL_TARGETS_ID)

  const tree = computed<CraftNode | null>(() => {
    if (isAllView.value || !targetItemId.value) return null
    return resolveTree(targetItemId.value, targetRate.value, {
      itemsById: dataStore.itemsById,
      producerIndex: producerIndex.value,
      fullProducerIndex: dataStore.fullProducerIndex,
      overrides: overrides.value,
      recipeOverrides: recipeOverrides.value,
      overages: overages.value,
    })
  })

  const allTotals = computed<Totals | null>(() => {
    const real = targets.value.filter((t) => t.targetItemId)
    if (real.length === 0) return null
    const rawMap = new Map<string, { itemName: string; ratePerMin: number }>()
    const intMap = new Map<string, { itemName: string; itemType: ItemType; ratePerMin: number }>()
    const bldMap = new Map<string, { buildingName: string; count: number }>()
    let totalPower = 0
    let totalHeat = 0
    for (const t of real) {
      const tr = resolveTree(t.targetItemId!, t.targetRate, {
        itemsById: dataStore.itemsById,
        producerIndex: producerIndex.value,
        fullProducerIndex: dataStore.fullProducerIndex,
        overrides: overrides.value,
        recipeOverrides: recipeOverrides.value,
        overages: t.overages,
      })
      const tot = aggregateTotals(tr, { showExtractors: prefsStore.showExtractors })
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
    return aggregateTotals(tree.value, { showExtractors: prefsStore.showExtractors })
  })

  function _maxDepth(node: CraftNode, d: number): number {
    if (node.children.length === 0) return d
    return Math.max(...node.children.map((c) => _maxDepth(c, d + 1)))
  }

  const treeMaxDepth = computed<number>(() => {
    if (!tree.value) return 0
    return _maxDepth(tree.value, 0)
  })

  // Helper actions
  function effectiveProducerFor(itemId: string): ProducerEntry | undefined {
    const ovId = overrides.value[itemId]
    if (ovId) {
      const p = dataStore.fullProducerIndex.get(itemId)?.find((e) => e.building.id === ovId)
      if (p) return p
    }
    return pickProducer(itemId, producerIndex.value)
  }

  function defaultRateForItem(itemId: string): number {
    const out = effectiveProducerFor(itemId)?.recipe.output.amount_per_minute
    return out && out > 0 ? out : 60
  }

  /**
   * Apply a plan — or fall back to defaults — against an ALREADY-loaded
   * game-data set. Split out of `load` so cross-tab sync can re-hydrate from a
   * sibling tab's save without refetching JSON or flashing the loading spinner.
   */
  function _applyPlan(
    v: string,
    plan: PlanState | null | undefined,
    data: { items: Item[]; buildings: Building[]; chains: UpgradeChain[] },
  ) {
    const defaultTier: TierSelection = {}
    for (const chain of data.chains) {
      if (chain.isProduction) {
        defaultTier[chain.baseId] = 'v1'
      }
    }

    if (plan && plan.version === v) {
      const restoredTier: TierSelection = { ...defaultTier }
      for (const [baseId, val] of Object.entries(plan.tier)) {
        if ((val === 'v1' || val === 'v2') && baseId in defaultTier) {
          restoredTier[baseId] = val
        }
      }
      tier.value = restoredTier

      const freshFullIndex = buildProducerIndex(
        data.buildings,
        new Set(data.chains.map((c) => c.upgradedId)),
      )
      const freshItemsById = new Map(data.items.map((i) => [i.id, i]))

      const restoredOverrides: VersionOverrides = {}
      for (const [itemId, buildingId] of Object.entries(plan.overrides)) {
        if (!freshItemsById.has(itemId)) continue
        const producers = freshFullIndex.get(itemId)
        if (producers?.some((e) => e.building.id === buildingId)) {
          restoredOverrides[itemId] = buildingId
        }
      }
      overrides.value = restoredOverrides

      const restoredRecipeOverrides: RecipeOverrides = {}
      for (const [itemId, rKey] of Object.entries(plan.recipeOverrides ?? {})) {
        if (freshItemsById.has(itemId) && typeof rKey === 'string') {
          restoredRecipeOverrides[itemId] = rKey
        }
      }
      recipeOverrides.value = restoredRecipeOverrides

      const fallbackItem =
        data.items.find((i) => i.type === 'component')?.id ?? data.items[0]?.id ?? null

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

      // Expansion is keyed by node path, which only makes sense against the
      // tree the tab resolves to — keep well-formed entries, drop the rest.
      const validateExpanded = (raw: NodeExpansion | undefined): NodeExpansion => {
        const out: NodeExpansion = {}
        for (const [path, open] of Object.entries(raw ?? {})) {
          const leafItemId = path.split('>').pop() ?? ''
          if (freshItemsById.has(leafItemId) && typeof open === 'boolean') out[path] = open
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
            : prefsStore.defaultExpandLevel
        return {
          tid: _newTid(),
          targetItemId: validItem,
          targetRate: rate,
          overages: validateOverages(s.overages),
          expandLevel: exp,
          expanded: validateExpanded(s.expanded),
        }
      })
      if (restoredTargets.length === 0) {
        restoredTargets.push({
          tid: _newTid(),
          targetItemId: fallbackItem,
          targetRate: fallbackItem ? defaultRateForItem(fallbackItem) : 60,
          expandLevel: prefsStore.defaultExpandLevel,
          overages: {},
          expanded: {},
        })
      }
      targets.value = restoredTargets
      const ai = plan.activeTargetIndex ?? 0
      activeTargetId.value =
        ai === -1 && restoredTargets.length > 1
          ? ALL_TARGETS_ID
          : restoredTargets[Math.min(Math.max(ai, 0), restoredTargets.length - 1)].tid
    } else {
      tier.value = defaultTier
      overrides.value = {}
      recipeOverrides.value = {}

      const newTarget =
        data.items.find((i) => i.type === 'component')?.id ?? data.items[0]?.id ?? null
      targets.value = [
        {
          tid: _newTid(),
          targetItemId: newTarget,
          targetRate: newTarget ? defaultRateForItem(newTarget) : 60,
          overages: {},
          expandLevel: prefsStore.defaultExpandLevel,
          expanded: {},
        },
      ]
      activeTargetId.value = targets.value[0].tid
    }
  }

  async function load(v: string, plan?: PlanState | null) {
    try {
      const data = await dataStore.loadData(v)
      _applyPlan(v, plan, data)
    } catch {
      // handled in dataStore
    }
  }

  /**
   * The single place URL parameters are handled at startup. No parameter may
   * change stored state without the user's say-so:
   *  - `?p=` / `?plan=` (replaces the plan): applied directly only when nothing
   *    is saved or the saved plan is the same (`isSamePlan`). Otherwise the saved
   *    plan stays loaded, saves are held while it loads, and the link waits in
   *    `pendingShare` for `resolveShare`.
   *  - `?add=` (additive, never destructive): first offered to an already-open
   *    planner tab (`_handOffAdd`); otherwise applied once the plan is settled.
   * Handled params are then stripped from the address bar so a refresh can't
   * run them again; a pending link is stripped when the user chooses.
   */
  async function init() {
    prefsStore.initPrefs()
    const shared = decodePlanFromUrl()
    const addRequest = readAddItemRequest(location.search)
    // A lone `?add=` goes to an open planner tab when there is one. A share link
    // keeps its own prompt, so it is never handed off.
    if (addRequest && !shared && (await _handOffAdd(addRequest))) return
    const saved = loadSaved()?.plan ?? null
    const needsChoice = shared !== null && saved !== null && !isSamePlan(shared, saved)
    // A saved plan always wins: when the link differs it waits for a choice, and
    // when it is equal there is nothing to apply (re-applying it would reset the
    // view state `isSamePlan` ignores: expand levels, caret toggles, active tab).
    const plan = saved ?? shared

    if (needsChoice) {
      // Same guard as cross-tab adoption: we're showing what's already in
      // storage, so the watchers must not write it back.
      _adoptDepth++
      _adopting = true
    }
    try {
      await load(plan?.version ?? DEFAULT_VERSION, plan)
      if (needsChoice) await nextTick()
    } finally {
      if (needsChoice && --_adoptDepth === 0) _adopting = false
    }

    if (needsChoice) {
      pendingShare.value = shared
      _deferredAdd = addRequest
    } else {
      if (addRequest) _applyAddItemRequest(addRequest, plan !== null)
      stripHandledParams()
    }
    detailStore.loadNavHistoryFromStorage()
    _stopServingHandOff()
    _stopServingHandOff = serveHandOff(_canTakeHandOff, (req) => {
      // Persist before the asking tab is told it is done (and closes): a sibling
      // save landing inside the debounce would otherwise replace the plan and
      // drop the item for good. The hold keeps the watchers from queueing a
      // second, identical save for the same change.
      _adoptDepth++
      _adopting = true
      try {
        _applyAddItemRequest(req, true)
        if (_saveTimer !== null) clearTimeout(_saveTimer)
        _saveTimer = null
        save(_planState(), prefsStore.getPrefs())
      } finally {
        void nextTick().then(() => {
          if (--_adoptDepth === 0) _adopting = false
        })
      }
    })
  }

  /**
   * Offer a lone `?add=` to the other open planner tabs. True when one of them
   * confirmed the add: this tab then loads and saves nothing and closes itself,
   * or, if the browser refuses, stays as the "you can close this one" message.
   * False (no BroadcastChannel, no answer in time) leaves the add to the local path.
   */
  async function _handOffAdd(req: AddItemRequest): Promise<boolean> {
    if (!hasHandOffSupport()) return false
    handOff.value = 'asking'
    if (!(await requestHandOff(req))) {
      handOff.value = null
      return false
    }
    stripHandledParams()
    handOff.value = 'done'
    window.close()
    return true
  }

  // Which tabs may take a hand-off. One with a share prompt open must not: its
  // "Use shared plan" would replace the plan and silently drop the item the
  // other tab was told had been added. It stays quiet and the asking tab adds
  // the item itself, which this tab then adopts through the storage sync.
  let _stopServingHandOff = () => {}
  const _canTakeHandOff = () =>
    !handOff.value && !pendingShare.value && !_adopting && !dataStore.loading && !dataStore.error

  /**
   * Settle a pending share link: 'use' replaces the plan with the shared one,
   * 'add' appends the shared tabs to the current plan (what an old single-item
   * game link means), 'keep' leaves the plan alone. A deferred `?add=` then
   * applies on top of the outcome.
   */
  async function resolveShare(choice: 'use' | 'add' | 'keep') {
    const shared = pendingShare.value
    if (!shared) return
    pendingShare.value = null
    const add = _deferredAdd
    _deferredAdd = null

    if (choice === 'use') {
      await load(shared.version, shared)
      _scheduleSave()
    }
    // One notice for the whole settle, not a flicker per recipe. An unknown
    // item's error notice (set inside the apply) wins over the summary.
    const results: AddResult[] = []
    let failed = false
    const apply = (r: AddItemRequest) => {
      const res = _applyAddItemRequest(r, true, false)
      if (res) results.push(res)
      else failed = true
    }
    if (choice === 'add') {
      for (const t of planTargetList(shared)) {
        if (!t.targetItemId) continue
        apply({ itemId: t.targetItemId, rate: sanitizeAddRate(t.targetRate) })
      }
    }
    if (add) apply(add)
    if (!failed && results.length) notice.value = _addedNotice(results)
    stripHandledParams()
  }

  type AddResult = { name: string; created: boolean }

  /**
   * Merge an `?add=` link into the plan that was just restored. Never removes
   * or rewrites anything: an item that is already a target is just focused
   * (its rate is left alone), an unknown id only raises a notice, and any
   * other item becomes a new tab. `hadPlan` is false only when nothing was
   * saved, where the lone default tab is a placeholder and is filled instead.
   */
  function _applyAddItemRequest(
    req: AddItemRequest,
    hadPlan: boolean,
    announce = true,
  ): AddResult | null {
    const item = dataStore.itemsById.get(req.itemId)
    if (!item) {
      notice.value = `Couldn't add "${req.itemId}": it isn't in this game version. Your plan is unchanged.`
      return null
    }
    const existing = hadPlan ? targets.value.find((t) => t.targetItemId === req.itemId) : undefined
    if (!hadPlan) {
      setTarget(req.itemId, req.rate)
    } else if (existing) {
      setActiveTarget(existing.tid)
    } else {
      addTargetItem(req.itemId)
      targetRate.value = req.rate
    }
    const result = { name: item.name, created: !existing }
    if (announce) notice.value = _addedNotice([result])
    return result
  }

  /**
   * Confirmation for successful adds: the name for one item, a count of the
   * tabs actually created for several. Items already in the plan are only
   * focused, and are reported as such rather than as added.
   */
  function _addedNotice(results: AddResult[]): string {
    const created = results.filter((r) => r.created)
    if (results.length === 1) {
      const { name } = results[0]
      return created.length ? `Added ${name} to your plan.` : `${name} is already in your plan.`
    }
    if (created.length === 0) return 'Those recipes are already in your plan.'
    if (created.length === 1) return `Added ${created[0].name} to your plan.`
    return `Added ${created.length} recipes to your plan.`
  }

  function setTier(baseId: string, value: 'v1' | 'v2') {
    tier.value = { ...tier.value, [baseId]: value }
  }

  function setVersion(v: string) {
    load(v)
  }

  function setTarget(itemId: string, rate: number) {
    const t = activeTarget.value
    if (!t) return
    if (t.targetItemId !== itemId) t.expanded = {}
    t.targetItemId = itemId
    t.targetRate = rate
  }

  function setActiveTarget(tid: string) {
    if (targets.value.some((t) => t.tid === tid)) activeTargetId.value = tid
  }

  function showAllTotals() {
    activeTargetId.value = ALL_TARGETS_ID
  }

  function addTargetItem(itemId: string | null) {
    const tid = _newTid()
    targets.value.push({
      tid,
      targetItemId: itemId,
      targetRate: itemId ? defaultRateForItem(itemId) : 60,
      overages: {},
      expandLevel: activeTarget.value?.expandLevel ?? prefsStore.defaultExpandLevel,
      expanded: {},
    })
    activeTargetId.value = tid
  }

  function addTarget() {
    const newItem =
      dataStore.items.find((i) => i.type === 'component')?.id ?? dataStore.items[0]?.id ?? null
    addTargetItem(newItem)
  }

  function closeTarget(tid: string) {
    const idx = targets.value.findIndex((t) => t.tid === tid)
    if (idx === -1) return
    targets.value.splice(idx, 1)
    if (targets.value.length === 0) {
      const newItem =
        dataStore.items.find((i) => i.type === 'component')?.id ?? dataStore.items[0]?.id ?? null
      targets.value.push({
        tid: _newTid(),
        targetItemId: newItem,
        targetRate: newItem ? defaultRateForItem(newItem) : 60,
        overages: {},
        expandLevel: prefsStore.defaultExpandLevel,
        expanded: {},
      })
    }
    if (activeTargetId.value === ALL_TARGETS_ID) {
      if (targets.value.length <= 1) activeTargetId.value = targets.value[0].tid
    } else if (!targets.value.some((t) => t.tid === activeTargetId.value)) {
      activeTargetId.value = targets.value[Math.min(idx, targets.value.length - 1)].tid
    }
  }

  function moveTarget(fromTid: string, toTid: string) {
    const from = targets.value.findIndex((t) => t.tid === fromTid)
    const to = targets.value.findIndex((t) => t.tid === toTid)
    if (from === -1 || to === -1 || from === to) return
    const arr = targets.value.slice()
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    targets.value = arr
  }

  function selectTargetItem(itemId: string) {
    const t = activeTarget.value
    if (!t) return
    // A different target means a different tree — the old paths no longer apply.
    if (t.targetItemId !== itemId) t.expanded = {}
    t.targetItemId = itemId
    t.targetRate = defaultRateForItem(itemId)
  }

  function setOverride(itemId: string, buildingId: string) {
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
    recipeOverrides.value = {}
  }

  function setRecipeOverride(itemId: string, rKey: string) {
    const producers = dataStore.fullProducerIndex.get(itemId)
    if (producers && producers.length > 0) {
      const defaultKey = recipeKey(producers[0].recipe, producers[0].building)
      if (rKey === defaultKey) {
        const next = { ...recipeOverrides.value }
        delete next[itemId]
        recipeOverrides.value = next
        return
      }
    }
    recipeOverrides.value = { ...recipeOverrides.value, [itemId]: rKey }
  }

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

  function setExpandLevel(n: number) {
    // Picking a level is a reset: drop the tab's manual caret toggles so every
    // row follows the new level, the way the level buttons always behaved.
    if (activeTarget.value) activeTarget.value.expanded = {}
    expandLevel.value = n
  }

  function _planState(): PlanState {
    const active = activeTarget.value
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
      expanded: t.expanded,
    }))
    return {
      version: dataStore.version,
      targetItemId: active?.targetItemId ?? null,
      targetRate: active?.targetRate ?? 60,
      overages: active?.overages ?? {},
      targets: planTargets,
      activeTargetIndex: idx,
      tier: tier.value,
      overrides: overrides.value,
      recipeOverrides: recipeOverrides.value,
    }
  }

  function buildShareUrl(): string {
    const active = activeTarget.value
    return encodePlan({
      version: dataStore.version,
      targetItemId: active?.targetItemId ?? null,
      targetRate: active?.targetRate ?? 60,
      overages: active?.overages ?? {},
      tier: tier.value,
      overrides: overrides.value,
      recipeOverrides: recipeOverrides.value,
    })
  }

  // Persistence watcher
  let _saveTimer: ReturnType<typeof setTimeout> | null = null
  function _scheduleSave() {
    // While adopting a sibling tab's state, our own watchers fire for every ref
    // we touch. Saving then would write our copy straight back out and bounce
    // the change to the other tab — so stay quiet until adoption settles.
    if (_adopting) return
    // A tab handing its item to another one holds no plan of its own: saving
    // would race the receiver's save with an empty default.
    if (handOff.value) return
    if (_saveTimer !== null) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => {
      _saveTimer = null
      save(_planState(), prefsStore.getPrefs())
    }, 300)
  }

  // ─── Cross-tab sync ────────────────────────────────────────────────────────
  // The whole plan lives in one localStorage blob on a debounced save, so two
  // browser tabs of the app would otherwise clobber each other last-writer-wins.
  // `storage` fires only in OTHER tabs, never the one that wrote, so each tab
  // adopts whatever its sibling just saved and the two converge instead of
  // fighting. No per-tab slots, so nothing to garbage-collect when a tab closes.
  let _adopting = false
  let _adoptDepth = 0
  let _adoptSeq = 0
  let _lastAdoptedRaw: string | null = null

  async function _adoptFromStorage(raw: string | null) {
    // Cleared storage, or an echo of what we already took — nothing to do.
    if (!raw || raw === _lastAdoptedRaw) return
    // A handing-off tab has no game data loaded to adopt into.
    if (handOff.value) return
    _lastAdoptedRaw = raw

    const incoming = loadSaved()
    if (!incoming?.plan) return

    // Depth-counted so overlapping events can't release the guard early.
    const gen = ++_adoptSeq
    _adoptDepth++
    _adopting = true
    try {
      // Prefs share the blob; initPrefs re-reads them and reapplies the theme.
      prefsStore.initPrefs()
      if (incoming.plan.version === dataStore.version) {
        // Same game data already in memory — re-hydrate in place, no refetch.
        _applyPlan(dataStore.version, incoming.plan, {
          items: dataStore.items,
          buildings: dataStore.buildings,
          chains: dataStore.chains,
        })
      } else {
        // Sibling switched game version: that one does need a data load. Hold
        // the guard across the await, or the post-load watchers would bounce
        // the state right back at the tab we just took it from. Fetch and apply
        // separately so a newer adopt that landed while we waited isn't undone
        // by this staler one (3+ tabs, one of them switching version).
        const data = await dataStore.loadData(incoming.plan.version)
        if (gen !== _adoptSeq) return
        _applyPlan(incoming.plan.version, incoming.plan, data)
      }
      // Watchers are pre-flush, so they have all run once nextTick resolves.
      await nextTick()
    } catch {
      // Data fetch failed — dataStore surfaces the error; keep current state.
    } finally {
      if (--_adoptDepth === 0) _adopting = false
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== null && e.key !== LS_KEY) return
      void _adoptFromStorage(e.key === null ? localStorage.getItem(LS_KEY) : e.newValue)
    })
  }

  watch(() => dataStore.version, _scheduleSave)
  watch(activeTargetId, _scheduleSave)
  watch(targets, _scheduleSave, { deep: true })
  watch(tier, _scheduleSave, { deep: true })
  watch(overrides, _scheduleSave, { deep: true })
  watch(recipeOverrides, _scheduleSave, { deep: true })

  return {
    // Stores facade / re-exports for backwards compatibility
    dataStore,
    detailStore,
    prefsStore,

    // Re-export Data store refs & getters
    version: computed({
      get: () => dataStore.version,
      set: (v) => setVersion(v),
    }),
    buildings: computed(() => dataStore.buildings),
    items: computed(() => dataStore.items),
    chains: computed(() => dataStore.chains),
    loading: computed(() => dataStore.loading),
    error: computed(() => dataStore.error),
    itemsById: computed(() => dataStore.itemsById),
    buildingsById: computed(() => dataStore.buildingsById),
    productionChains: computed(() => dataStore.productionChains),
    usedInIndex: computed(() => dataStore.usedInIndex),
    exportsByItem: computed(() => dataStore.exportsByItem),
    buildingUnlock: computed(() => dataStore.buildingUnlock),
    buildingCosts: computed(() => dataStore.buildingCosts),
    corporations: computed(() => dataStore.corporations),
    fullProducerIndex: computed(() => dataStore.fullProducerIndex),

    // Re-export Prefs store refs & setters
    showExtractors: computed({
      get: () => prefsStore.showExtractors,
      set: (v) => prefsStore.setShowExtractors(v),
    }),
    showIcons: computed({
      get: () => prefsStore.showIcons,
      set: (v) => prefsStore.setShowIcons(v),
    }),
    showRowDividers: computed({
      get: () => prefsStore.showRowDividers,
      set: (v) => prefsStore.setShowRowDividers(v),
    }),
    showOverages: computed({
      get: () => prefsStore.showOverages,
      set: (v) => prefsStore.setShowOverages(v),
    }),
    optionsCollapsed: computed({
      get: () => prefsStore.optionsCollapsed,
      set: () => prefsStore.toggleOptions(),
    }),
    treeFontScale: computed({
      get: () => prefsStore.treeFontScale,
      set: (v) => prefsStore.setTreeFontScale(v),
    }),
    totalsPlacement: computed({
      get: () => prefsStore.totalsPlacement,
      set: (v) => prefsStore.setTotalsPlacement(v),
    }),
    totalsCollapsed: computed(() => prefsStore.totalsCollapsed),
    theme: computed({
      get: () => prefsStore.theme,
      set: (v) => prefsStore.setTheme(v),
    }),

    setShowExtractors: prefsStore.setShowExtractors,
    setShowIcons: prefsStore.setShowIcons,
    setShowRowDividers: prefsStore.setShowRowDividers,
    setShowOverages: prefsStore.setShowOverages,
    toggleOptions: prefsStore.toggleOptions,
    setTreeFontScale: prefsStore.setTreeFontScale,
    setTotalsPlacement: prefsStore.setTotalsPlacement,
    toggleTotalsSection: prefsStore.toggleTotalsSection,
    setTheme: prefsStore.setTheme,

    // Re-export Detail store refs & methods
    detail: computed({
      get: () => detailStore.detail,
      set: (v) => {
        if (!v) detailStore.closeDetail()
        else if (v.kind === 'item') detailStore.openItemDetail(v.id)
        else if (v.kind === 'building') detailStore.openBuildingDetail(v.id)
      },
    }),
    hover: computed(() => detailStore.hover),
    detailHistory: computed(() => detailStore.detailHistory),
    detailForwardHistory: computed(() => detailStore.detailForwardHistory),
    recentVisits: computed(() => detailStore.recentVisits),
    savedTracks: computed(() => detailStore.savedTracks),

    openItemDetail: detailStore.openItemDetail,
    openBuildingDetail: detailStore.openBuildingDetail,
    openItemIndex: detailStore.openItemIndex,
    detailBack: detailStore.detailBack,
    detailForward: detailStore.detailForward,
    jumpToHistoryIndex: detailStore.jumpToHistoryIndex,
    closeDetail: detailStore.closeDetail,
    replaceDetail: detailStore.replaceDetail,
    restoreTrack: detailStore.restoreTrack,
    deleteTrack: detailStore.deleteTrack,
    clearAllTracks: detailStore.clearAllTracks,
    clearNavHistory: detailStore.clearNavHistory,
    setHover: detailStore.setHover,
    clearHover: detailStore.clearHover,

    // Core Planner State & Computed
    notice,
    pendingShare,
    handOff,
    tier,
    overrides,
    recipeOverrides,
    targets,
    activeTargetId,
    activeTarget,
    targetItemId,
    targetRate,
    overages,
    expandLevel,
    expanded,
    availableBuildings,
    producerIndex,
    isAllView,
    tree,
    allTotals,
    totals,
    treeMaxDepth,

    // Planner Actions
    init,
    resolveShare,
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
    setRecipeOverride,
    clearOverrides,
    setOverage,
    clearOverages,
    setExpandLevel,
    isNodeExpanded,
    toggleNode,
    buildShareUrl,
  }
})
