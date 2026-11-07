// Provenance of a public/game-data/<version>/ folder: who writes it.
//
// Two sources share the folder tree:
//   upstream      flexsurfer/starrupture-planner, refreshed daily by scripts/refresh-data.mjs
//   game-extract  our own pipeline (tools/game-extract + scripts/publish-game-data.mjs)
// A folder without SOURCE.json is upstream-owned, so nothing changes for the existing folders.
// The refresh skips every game-extract folder: it must never overwrite our data with upstream's.
import fs from 'node:fs'
import path from 'node:path'

export const SOURCE_FILE = 'SOURCE.json'
export const SOURCE_UPSTREAM = 'upstream'
export const SOURCE_GAME_EXTRACT = 'game-extract'

/**
 * Reads <versionDir>/SOURCE.json. Returns null when there is none (upstream-owned).
 * A file that exists but cannot be read or has no known source returns { source: 'unreadable', error }:
 * callers treat that as "not upstream", so a damaged provenance file never lets the refresh overwrite the folder.
 */
export function readSource(versionDir) {
  const file = path.join(versionDir, SOURCE_FILE)
  if (!fs.existsSync(file)) return null
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (data && (data.source === SOURCE_UPSTREAM || data.source === SOURCE_GAME_EXTRACT)) return data
    return { source: 'unreadable', error: `unknown source ${JSON.stringify(data?.source)}` }
  } catch (e) {
    return { source: 'unreadable', error: e.message }
  }
}

/** Should the upstream refresh leave this folder alone? (Anything that is not plainly upstream-owned.) */
export function refreshShouldSkip(source) {
  if (source === null || source === undefined) return false
  return source.source !== SOURCE_UPSTREAM
}

/** Version folder names under rootDir whose provenance says the refresh must skip them. */
export function listSkippedFolders(rootDir) {
  if (!fs.existsSync(rootDir)) return []
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && refreshShouldSkip(readSource(path.join(rootDir, d.name))))
    .map((d) => d.name)
    .sort()
}

/**
 * Splits the version list for the refresh. `upstreamIds` are the folders upstream knows, `skippedIds` the
 * local folders we own. The final list keeps our folders even when upstream has never heard of them
 * (otherwise regenerating versions.ts would drop a build only we publish).
 */
export function partitionVersions(upstreamIds, skippedIds) {
  const skipped = new Set(skippedIds)
  const refresh = upstreamIds.filter((id) => !skipped.has(id))
  const all = [...new Set([...upstreamIds, ...skippedIds])].sort()
  return { refresh, skipped: [...skipped].sort(), all }
}

/** The SOURCE.json body for a folder written by our pipeline. */
export function gameExtractSource({ branch, buildid, extractorVersion, versionId, generatedAt }) {
  return {
    source: SOURCE_GAME_EXTRACT,
    version: versionId,
    steamBranch: branch,
    buildid: String(buildid),
    extractorVersion,
    generatedAt,
  }
}

export function writeSource(versionDir, body) {
  fs.mkdirSync(versionDir, { recursive: true })
  fs.writeFileSync(path.join(versionDir, SOURCE_FILE), `${JSON.stringify(body, null, 2)}\n`)
}
