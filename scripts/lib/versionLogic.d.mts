export const HIDDEN_VERSION_IDS: string[]
export function versionSortKey(name: string): string
export function sortVersions(ids: string[]): string[]
export function isTestVersion(id: string, label?: string): boolean
export function pickDefaultVersion(versions: { id: string; label: string }[]): string
export function classifyBranch(branch: string): 'live' | 'test' | null
export function parseUpdateNumber(title: string): number | null
export function isLiveReleaseTitle(title: string): boolean
export function currentLiveVersion(existingIds?: string[]): string | null
export function decideVersionId(input: {
  branch: string
  title?: string
  existingIds?: string[]
}): string | null
