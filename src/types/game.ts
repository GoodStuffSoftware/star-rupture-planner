export type ItemType = 'raw' | 'processed' | 'component' | 'material' | 'ammo'
export type BuildingType =
  | 'production'
  | 'generator'
  | 'transport'
  | 'storage'
  | 'temperature'
  | 'defense'
  | 'habitat'
  | 'core'

export interface Item {
  id: string
  name: string
  type: ItemType
}

export interface RecipePort {
  id: string
  amount_per_minute: number
}

export interface Recipe {
  output: RecipePort
  inputs: RecipePort[]
}

export interface Building {
  id: string
  name: string
  type: BuildingType
  power?: number
  heat?: number
  upgrade?: string
  recipes?: Recipe[]
}

export interface UpgradeChain {
  baseId: string
  upgradedId: string
  isProduction: boolean
}

// Per-item building override: itemId -> buildingId
export type VersionOverrides = Record<string, string>

// Resolved crafting-tree node
export interface CraftNode {
  itemId: string
  itemName: string
  itemType: ItemType
  ratePerMin: number // required output rate of this item at this node
  building?: Building // producer chosen for this item (undefined if none)
  recipe?: Recipe
  buildingsNeeded?: number // exact fractional count = ratePerMin / output.amount_per_minute
  isRaw: boolean // true if leaf: no producer OR recipe has no inputs
  isCycle: boolean // true if this item already appeared in its own ancestry
  children: CraftNode[]
  candidates?: { buildingId: string; buildingName: string }[] // all buildings that produce this item
  isOverridden?: boolean // producer came from an override, not the global default
}

export interface Totals {
  rawMaterials: { itemId: string; itemName: string; ratePerMin: number }[]
  buildings: { buildingId: string; buildingName: string; count: number; ceilCount: number }[]
  totalPower: number // sum buildingsNeeded * (building.power ?? 0)
  totalHeat: number // sum buildingsNeeded * (building.heat ?? 0)
}
