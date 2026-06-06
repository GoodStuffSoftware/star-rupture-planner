import type { Building, Item, UpgradeChain } from '../types/game'

export interface GameData {
  buildings: Building[]
  items: Item[]
  chains: UpgradeChain[]
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export function deriveUpgradeChains(buildings: Building[]): UpgradeChain[] {
  const buildingsById = new Map(buildings.map((b) => [b.id, b]))
  const chains: UpgradeChain[] = []

  for (const building of buildings) {
    if (!building.upgrade) continue

    const upgraded = buildingsById.get(building.upgrade)

    // isProduction: base or upgraded building has non-empty recipes
    const baseHasRecipes = (building.recipes?.length ?? 0) > 0
    const upgradedHasRecipes = (upgraded?.recipes?.length ?? 0) > 0
    const isProduction = baseHasRecipes || upgradedHasRecipes

    chains.push({
      baseId: building.id,
      upgradedId: building.upgrade,
      isProduction,
    })
  }

  return chains
}

export async function loadGameData(version: string): Promise<GameData> {
  const base = `/game-data/${version}`

  const [buildings, items] = await Promise.all([
    fetchJson<Building[]>(`${base}/buildings_and_recipes.json`),
    fetchJson<Item[]>(`${base}/items_catalog.json`),
  ])

  const chains = deriveUpgradeChains(buildings)

  return { buildings, items, chains }
}
