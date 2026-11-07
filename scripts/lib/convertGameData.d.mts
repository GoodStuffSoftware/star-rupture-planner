export interface PlannerRecipeIo {
  id: string
  amount_per_minute: number
}
export interface PlannerRecipe {
  id?: string
  variant?: string
  output: PlannerRecipeIo
  inputs: PlannerRecipeIo[]
}
export interface PlannerBuilding {
  id: string
  name: string
  type: string
  upgrade?: string
  power?: number
  heat?: number
  coreHeatCapacity?: number
  recipes?: PlannerRecipe[]
  levels?: { level: number; heatCapacity: number }[]
}
export interface PlannerItem {
  id: string
  name: string
  type: string
}
export interface PlannerCorporationLevel {
  level: number
  xp: number
  components: { id: string; points: number }[]
  rewards: { name: string }[]
}
export type PlannerCorporations = Record<
  string,
  { id: string; description: string; levels: PlannerCorporationLevel[] }
>
export interface IdMap {
  buildingOrder: string[]
  carryForwardBuildings?: string[]
  buildings: Record<string, string>
  items: Record<string, string>
  corporations: Record<string, string>
  [key: string]: unknown
}
export interface ConvertReport {
  newItemIds: string[]
  newBuildingIds: string[]
  uncurated: { kind: string; id: string; field: string; note: string }[]
  derived: { kind: string; id: string; field: string; value: string }[]
  missingFromExtract: { kind: string; id: string; asset: string }[]
  extractorRateFallbacks: { building: string; recipe: string }[]
  defaultedBuildTimes: string[]
  skippedCraftingBuildings: string[]
  skippedRecipes: string[]
}
export function assetName(path: string): string
export function slugify(raw: string): string
export function uniqueSlug(raw: string, taken: Set<string>): string
export function ratePerMinute(count: number, buildTime: number): number
export function convertGameData(args: {
  extract: Record<string, any>
  idMap: IdMap
  prev?: { buildings?: PlannerBuilding[]; items?: PlannerItem[]; corporations?: PlannerCorporations }
}): {
  buildings: PlannerBuilding[]
  items: PlannerItem[]
  corporations: PlannerCorporations
  idMap: IdMap
  report: ConvertReport
}
export function carryRecipeCuration(recipes: PlannerRecipe[], prevRecipes: PlannerRecipe[]): PlannerRecipe[]
export function toPlannerJson(value: unknown): string
