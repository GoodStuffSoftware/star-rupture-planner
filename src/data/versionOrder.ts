import type { VersionInfo } from './versions'

// VERSIONS is generated oldest to newest; the selector shows newest first.
export function newestFirst(versions: readonly VersionInfo[]): VersionInfo[] {
  return [...versions].reverse()
}
