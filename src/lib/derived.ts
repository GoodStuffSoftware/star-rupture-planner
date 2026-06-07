/**
 * Pure derived-lookup builders for the detail drawer + hover system (v6).
 * All functions are pure (no side effects) and operate on already-loaded data.
 */

import type { Building, Recipe } from '../types/game'

// ─── usedInIndex ─────────────────────────────────────────────────────────────
// Maps itemId -> list of { buildingId, recipe } that consume it as an input.

export interface UsedInEntry {
  buildingId: string
  buildingName: string
  recipe: Recipe
}

export function buildUsedInIndex(buildings: Building[]): Map<string, UsedInEntry[]> {
  const index = new Map<string, UsedInEntry[]>()

  for (const building of buildings) {
    if (!building.recipes) continue
    for (const recipe of building.recipes) {
      for (const input of recipe.inputs) {
        const key = input.id
        if (!index.has(key)) index.set(key, [])
        index.get(key)!.push({
          buildingId: building.id,
          buildingName: building.name,
          recipe,
        })
      }
    }
  }

  return index
}

// ─── exportsByItem ───────────────────────────────────────────────────────────
// Maps itemId -> list of { corp, corpId, level, points } entries.

export interface ExportEntry {
  corp: string
  corpId: string
  level: number
  points: number
}

// corporations_components.json shape (partial — only what we need)
export interface CorporationsData {
  [corpName: string]: {
    id: string
    description?: string
    levels: {
      level: number
      xp?: number
      components: { id: string; points: number }[]
      rewards?: { name: string }[]
    }[]
  }
}

export function buildExportsByItem(corporations: CorporationsData): Map<string, ExportEntry[]> {
  const index = new Map<string, ExportEntry[]>()

  for (const [corpName, corp] of Object.entries(corporations)) {
    for (const lvl of corp.levels) {
      for (const comp of lvl.components) {
        const key = comp.id
        if (!index.has(key)) index.set(key, [])
        index.get(key)!.push({
          corp: corpName,
          corpId: corp.id,
          level: lvl.level,
          points: comp.points,
        })
      }
    }
  }

  return index
}

// ─── buildingUnlock ──────────────────────────────────────────────────────────
// Maps buildingId -> { corp, level } for the LOWEST matching level.
// Matches building name against reward names (case-insensitive, trimmed).

export interface UnlockEntry {
  corp: string
  level: number
}

export function buildBuildingUnlock(
  buildings: Building[],
  corporations: CorporationsData,
): Map<string, UnlockEntry> {
  // Build a map from normalized reward name -> building id(s)
  const nameToBuilding = new Map<string, string>()
  for (const building of buildings) {
    nameToBuilding.set(building.name.trim().toLowerCase(), building.id)
  }

  const result = new Map<string, UnlockEntry>()

  for (const [corpName, corp] of Object.entries(corporations)) {
    for (const lvl of corp.levels) {
      if (!lvl.rewards) continue
      for (const reward of lvl.rewards) {
        const key = reward.name.trim().toLowerCase()
        const buildingId = nameToBuilding.get(key)
        if (!buildingId) continue

        // Keep the LOWEST level match
        const existing = result.get(buildingId)
        if (!existing || lvl.level < existing.level) {
          result.set(buildingId, { corp: corpName, level: lvl.level })
        }
      }
    }
  }

  return result
}

// ─── buildingCosts ───────────────────────────────────────────────────────────
// Maps buildingId -> [{ id, amount }] (loaded from optional building_costs.json).
// The loader handles 404 gracefully; this type just names the shape.

export interface BuildingCostEntry {
  id: string
  amount: number
}

export type BuildingCostsData = Record<string, BuildingCostEntry[]>

export function buildBuildingCosts(raw: BuildingCostsData): Map<string, BuildingCostEntry[]> {
  const result = new Map<string, BuildingCostEntry[]>()
  for (const [buildingId, costs] of Object.entries(raw)) {
    result.set(buildingId, costs)
  }
  return result
}
