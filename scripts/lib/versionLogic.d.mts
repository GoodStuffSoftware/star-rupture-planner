export function versionSortKey(name: string): string
export function sortVersions(ids: string[]): string[]
export function isTestVersion(id: string, label?: string): boolean
export function pickDefaultVersion(versions: { id: string; label: string }[]): string
