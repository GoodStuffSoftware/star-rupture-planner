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
  /** Present on alternate recipes — marks this as a variant (e.g. different ingredient path) */
  variant?: string
  /** Present on original (non-variant) recipes when an alternate exists */
  id?: string
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

// Per-item alternate recipe override: itemId -> recipeKey
// When a building has multiple recipes producing the same item (alternate recipes),
// this picks which recipe variant to use.
export type RecipeOverrides = Record<string, string>

// Per-occurrence overproduction (overage): node path -> extra items/min beyond demand
// (negative = intentional deficit). See CraftNode.path for the key format.
export type Overages = Record<string, number>

// Resolved crafting-tree node
export interface CraftNode {
  itemId: string
  itemName: string
  itemType: ItemType
  path: string // unique per-occurrence key: chain of item ids from root, e.g. "pump>valve>titanium_beam"
  ratePerMin: number // required output rate of this item at this node
  building?: Building // producer chosen for this item (undefined if none)
  recipe?: Recipe
  buildingsNeeded?: number // exact fractional count = ratePerMin / output.amount_per_minute
  overage?: number // extra items/min added at this node as intentional overproduction (0/undefined = none)
  isRaw: boolean // true if leaf: no producer OR recipe has no inputs
  isCycle: boolean // true if this item already appeared in its own ancestry
  children: CraftNode[]
  candidates?: { buildingId: string; buildingName: string }[] // all buildings that produce this item
  isOverridden?: boolean // producer came from an override, not the global default
  /** Alternate recipes from the SAME building for this item's output (empty = no alternates) */
  alternateRecipes?: { recipeKey: string; recipe: Recipe }[]
  /** The recipeKey of the currently selected recipe */
  selectedRecipeKey?: string
}

export interface Totals {
  rawMaterials: { itemId: string; itemName: string; ratePerMin: number }[]
  // Produced items between the raw materials and the final product (target), summed across the tree.
  intermediates: { itemId: string; itemName: string; itemType: ItemType; ratePerMin: number }[]
  buildings: { buildingId: string; buildingName: string; count: number; ceilCount: number }[]
  totalPower: number // sum buildingsNeeded * (building.power ?? 0)
  totalHeat: number // sum buildingsNeeded * (building.heat ?? 0)
}
