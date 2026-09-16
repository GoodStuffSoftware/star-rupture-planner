/**
 * Strip trailing version suffixes from building display names.
 * "Furnace v.2" → "Furnace"
 * "Fabricator v1" → "Fabricator"
 * "Mega Press" → "Mega Press" (unchanged)
 */
export function stripBuildingVersion(name: string): string {
  return name.replace(/\s+v\.?\d+$/i, '').trim()
}
