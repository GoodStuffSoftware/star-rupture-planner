import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Building, Item, UpgradeChain, CraftNode, Totals, VersionOverrides } from '../types/game'
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
  const optionsCollapsed = ref<boolean>(false)

  // v3 state
  const expandLevel = ref<number>(Infinity)

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
  const upgradedIds = computed<Set<string>>(
    () => new Set(chains.value.map((c) => c.upgradedId)),
  )

  const producerIndex = computed<Map<string, ProducerEntry[]>>(() =>
    buildProducerIndex(availableBuildings.value, upgradedIds.value),
  )

  // Full producer index over ALL buildings (used for overrides + candidates)
  const fullProducerIndex = computed<Map<string, ProducerEntry[]>>(() =>
    buildProducerIndex(buildings.value, upgradedIds.value),
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
  async function load(v: string) {
    loading.value = true
    error.value = null
    try {
      const data = await loadGameData(v)
      buildings.value = data.buildings
      items.value = data.items
      chains.value = data.chains

      // Reset tier to all v1 for production chains
      const newTier: TierSelection = {}
      for (const chain of data.chains) {
        if (chain.isProduction) {
          newTier[chain.baseId] = 'v1'
        }
      }
      tier.value = newTier

      // Reset overrides on version change (item ids differ across versions)
      overrides.value = {}

      // Default targetItemId to first component, or first item;
      // default the rate to that item's single-building output.
      const firstComponent = data.items.find((i) => i.type === 'component')
      const newTarget = firstComponent?.id ?? data.items[0]?.id ?? null
      targetItemId.value = newTarget
      targetRate.value = newTarget ? defaultRateForItem(newTarget) : 60
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function setTier(baseId: string, value: 'v1' | 'v2') {
    tier.value = { ...tier.value, [baseId]: value }
  }

  function setVersion(v: string) {
    version.value = v
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

  function toggleOptions() {
    optionsCollapsed.value = !optionsCollapsed.value
  }

  function setExpandLevel(n: number) {
    expandLevel.value = n
  }

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
    // Actions
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
    toggleOptions,
    setExpandLevel,
  }
})
