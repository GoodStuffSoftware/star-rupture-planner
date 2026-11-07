import type { PlannerBuilding, PlannerCorporations, PlannerItem } from './lib/convertGameData.mjs'
export function compareData(
  game: { buildings: PlannerBuilding[]; items: PlannerItem[]; corporations: PlannerCorporations },
  planner: { buildings: PlannerBuilding[]; items: PlannerItem[]; corporations: PlannerCorporations },
): { A: string[]; B: string[]; C: string[]; counts: Record<string, unknown> }
