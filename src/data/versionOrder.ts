import type { VersionInfo } from './versions'

// VERSIONS is generated oldest to newest; the selector shows newest first.
export function newestFirst(versions: readonly VersionInfo[]): VersionInfo[] {
  return [...versions].reverse()
}

/**
 * The versions the selector lists, newest first: every version not marked `hidden`, plus the active
 * version when it is hidden (so the user sees what they are on and can switch away from it).
 */
export function selectableVersions(
  versions: readonly VersionInfo[],
  activeId: string,
): VersionInfo[] {
  return newestFirst(versions).filter((v) => !v.hidden || v.id === activeId)
}
