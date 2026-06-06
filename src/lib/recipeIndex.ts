import type { Building, Recipe, UpgradeChain } from '../types/game'

export type TierSelection = Record<string, 'v1' | 'v2'>

export interface ProducerEntry {
  building: Building
  recipe: Recipe
}

/**
 * Filter buildings based on tier selections.
 *
 * Owning v2 does NOT remove your v1 buildings — in-game v2 is an unlock you build
 * *in addition* to v1, and v2 buildings do not necessarily carry every recipe the v1
 * had. So:
 *   - v2 selected: keep BOTH base and upgraded available (resolver prefers v2 where it
 *     has a recipe, and falls back to v1 for items v2 can't make).
 *   - v1 selected (default): only the base is available; drop the upgraded building.
 * Non-production chains: leave both buildings as-is (their tier has no recipe effect).
 */
export function getAvailableBuildings(
  buildings: Building[],
  chains: UpgradeChain[],
  tier: TierSelection,
): Building[] {
  const dropIds = new Set<string>()

  for (const chain of chains) {
    if (!chain.isProduction) continue

    // Only drop the upgraded building when the user has NOT unlocked v2.
    // When v2 is selected, keep both tiers available.
    if (tier[chain.baseId] !== 'v2') {
      dropIds.add(chain.upgradedId)
    }
  }

  return buildings.filter((b) => !dropIds.has(b.id))
}

/**
 * Build an index: itemId -> list of {building, recipe} that produce it.
 *
 * `upgradedIds` is the set of v2/upgraded building ids; producers from those buildings
 * are sorted first so an item makeable by both tiers prefers the v2 recipe. Within a
 * tier, production-type buildings are preferred over non-production producers.
 */
export function buildProducerIndex(
  availableBuildings: Building[],
  upgradedIds: Set<string> = new Set(),
): Map<string, ProducerEntry[]> {
  const index = new Map<string, ProducerEntry[]>()

  for (const building of availableBuildings) {
    if (!building.recipes) continue
    for (const recipe of building.recipes) {
      const key = recipe.output.id
      if (!index.has(key)) {
        index.set(key, [])
      }
      index.get(key)!.push({ building, recipe })
    }
  }

  // Rank producers so pickProducer can simply take the first: v2 (upgraded) first,
  // then production-type buildings, keeping a stable order otherwise.
  const score = (e: ProducerEntry): number => {
    let s = 0
    if (upgradedIds.has(e.building.id)) s += 2
    if (e.building.type === 'production') s += 1
    return s
  }
  for (const entries of index.values()) {
    if (entries.length > 1) {
      entries.sort((a, b) => score(b) - score(a))
    }
  }

  return index
}

/**
 * Pick the preferred producer for an item. The producer index is pre-ranked
 * (v2 first, then production-type), so the first entry is the best choice.
 */
export function pickProducer(
  itemId: string,
  index: Map<string, ProducerEntry[]>,
): ProducerEntry | undefined {
  const entries = index.get(itemId)
  if (!entries || entries.length === 0) return undefined
  return entries[0]
}

/**
 * Get all candidate producers for an item from the full (all-buildings) index,
 * deduped by buildingId and ranked v2-first. Used to populate the per-node picker.
 */
export function getCandidates(
  itemId: string,
  fullIndex: Map<string, ProducerEntry[]>,
): { buildingId: string; buildingName: string }[] {
  const entries = fullIndex.get(itemId)
  if (!entries || entries.length === 0) return []
  // Deduplicate by buildingId (a building may produce the same item via multiple recipes)
  const seen = new Set<string>()
  const result: { buildingId: string; buildingName: string }[] = []
  for (const entry of entries) {
    if (!seen.has(entry.building.id)) {
      seen.add(entry.building.id)
      result.push({ buildingId: entry.building.id, buildingName: entry.building.name })
    }
  }
  return result
}
