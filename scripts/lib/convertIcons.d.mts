import type { PlannerBuilding, PlannerItem } from './convertGameData.mjs'
export const WEBP_OPTIONS: { quality: number; alphaQuality: number; effort: number }
export interface IconPlanEntry {
  kind: 'items' | 'buildings'
  id: string
  texture: string
}
export interface IconPlan {
  icons: IconPlanEntry[]
  missing: { kind: string; id: string; asset: string; why: string }[]
}
export function planIcons(args: {
  extract: {
    items: { id: string; asset?: string; icon?: string }[]
    buildings: { configAsset: string; icon?: string }[]
  }
  idMap: { items: Record<string, string>; buildings: Record<string, string> }
  ids?: { items: Set<string>; buildings: Set<string> }
}): IconPlan
export function catalogIds(args: { items: PlannerItem[]; buildings: PlannerBuilding[] }): {
  items: Set<string>
  buildings: Set<string>
}
export function writeIcons(args: {
  plan: IconPlan
  extractDir: string
  outDir: string
  overwrite?: boolean
}): Promise<{ written: IconPlanEntry[]; kept: IconPlanEntry[]; noPng: IconPlanEntry[] }>
export function classifyStagedIcons(args: { stagedDir: string; iconRoot: string }): {
  added: string[]
  replaced: string[]
  unchanged: string[]
}
export function iconsWithoutGameCounterpart(args: { plan: IconPlan; iconRoot: string }): string[]
