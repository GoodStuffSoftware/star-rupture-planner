export const SOURCE_FILE: string
export const SOURCE_UPSTREAM: 'upstream'
export const SOURCE_GAME_EXTRACT: 'game-extract'
export interface SourceInfo {
  source: string
  version?: string
  steamBranch?: string
  buildid?: string
  extractorVersion?: string
  generatedAt?: string
  error?: string
}
export function readSource(versionDir: string): SourceInfo | null
export function refreshShouldSkip(source: SourceInfo | null | undefined): boolean
export function listSkippedFolders(rootDir: string): string[]
export function partitionVersions(
  upstreamIds: string[],
  skippedIds: string[],
): { refresh: string[]; skipped: string[]; all: string[] }
export function gameExtractSource(args: {
  branch: string
  buildid: string | number
  extractorVersion: string
  versionId: string
  generatedAt: string
}): SourceInfo
export function collectFolderIds(
  rootDir: string,
  folders: string[],
): { buildings: Set<string>; items: Set<string> }
export function planIconDownloads(
  ids: Iterable<string>,
  protectedIds: Set<string>,
  iconExists: (id: string) => boolean,
): { download: string[]; protected: string[] }
export function writeSource(versionDir: string, body: SourceInfo): void
