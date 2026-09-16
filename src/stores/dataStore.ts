import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Building, Item, UpgradeChain } from '../types/game'
import { loadGameData } from '../data/loader'
import { buildProducerIndex, type ProducerEntry } from '../lib/recipeIndex'
import { DEFAULT_VERSION } from '../data/versions'
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

export const useDataStore = defineStore('data', () => {
  const version = ref<string>(DEFAULT_VERSION)
  const buildings = ref<Building[]>([])
  const items = ref<Item[]>([])
  const chains = ref<UpgradeChain[]>([])
  const corporations = ref<CorporationsData>({})
  const _buildingCostsRaw = ref<Record<string, BuildingCostEntry[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Derived lookups
  const itemsById = computed<Map<string, Item>>(() => new Map(items.value.map((i) => [i.id, i])))

  const buildingsById = computed<Map<string, Building>>(
    () => new Map(buildings.value.map((b) => [b.id, b])),
  )

  const productionChains = computed<UpgradeChain[]>(() =>
    chains.value.filter((c) => c.isProduction),
  )

  const upgradedIds = computed<Set<string>>(() => new Set(chains.value.map((c) => c.upgradedId)))

  const fullProducerIndex = computed<Map<string, ProducerEntry[]>>(() =>
    buildProducerIndex(buildings.value, upgradedIds.value),
  )

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

  async function loadData(v: string) {
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
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    version,
    buildings,
    items,
    chains,
    corporations,
    loading,
    error,
    itemsById,
    buildingsById,
    productionChains,
    upgradedIds,
    fullProducerIndex,
    usedInIndex,
    exportsByItem,
    buildingUnlock,
    buildingCosts,
    loadData,
  }
})
