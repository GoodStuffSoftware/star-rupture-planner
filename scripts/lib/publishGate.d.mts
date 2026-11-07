import type { PlannerBuilding, PlannerItem } from './convertGameData.mjs'

export const MAX_DROP: number
export function recipeKey(buildingId: string, r: { output: { id: string }; inputs: { id: string }[] }): string
export function checkInvariants(input: {
  result: { buildings: PlannerBuilding[]; items: PlannerItem[]; corporations: Record<string, unknown>; report?: Record<string, unknown[] | undefined> }
  prev?: { buildings: PlannerBuilding[]; items: PlannerItem[]; corporations: Record<string, unknown> }
  manifest?: { build?: string | number; guard?: { status?: string; overridden?: boolean; dataProblems?: unknown[] } }
  buildid?: string
}): string[]
export interface ChangeSet {
  added: string[]
  removed: string[]
  changed: string[]
}
export interface Changelog {
  buildings: ChangeSet
  items: ChangeSet
  recipes: ChangeSet
  total: number
}
export function buildChangelog(
  before: { buildings: PlannerBuilding[]; items: PlannerItem[] },
  after: { buildings: PlannerBuilding[]; items: PlannerItem[] },
): Changelog
export function formatChangelog(log: Changelog, max?: number): string
