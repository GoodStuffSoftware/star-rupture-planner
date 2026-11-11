// Refreshes the bundled Star Rupture game data + icons from the upstream
// flexsurfer/starrupture-planner repo (MIT). Run: `npm run refresh-data`.
//
// Data + icons are bundled (not fetched at runtime) so the app works offline and is
// insulated from upstream changes. Re-run this when a new game version drops.
//
// Versions are auto-discovered from the upstream repo — no hardcoded list needed.
//
// Environment:
//   UPSTREAM_REF  Branch, tag or commit of the upstream repo to read (default: main). Pins
//                 version discovery, data files and icons, so a past state can be reproduced.
//   GITHUB_TOKEN / GH_TOKEN  Sent with the version-discovery API call (raises the rate limit).
//   CI            When set, a failed version discovery fails the run instead of falling back.

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import {
  collectFolderIds,
  listSkippedFolders,
  partitionVersions,
  planIconDownloads,
  readSource,
} from './lib/provenance.mjs'
import { renderVersionsTs } from './lib/versionsFile.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(__dirname, '..', 'public')
const OUT_ROOT = resolve(PUBLIC, 'game-data')

const REPO = 'flexsurfer/starrupture-planner'
const REF = process.env.UPSTREAM_REF || 'main'
const RAW = `https://raw.githubusercontent.com/${REPO}/${REF}/assets`
const API = `https://api.github.com/repos/${REPO}`
const DATA_BASE = `${RAW}/game-data`
const ICON_BASE = `${RAW}/icons`

const FILES = [
  'buildings_and_recipes.json',
  'items_catalog.json',
  'corporations_components.json',
]

// Read by src/data/loader.ts. Upstream does not ship it for every version (or at all, today):
// a 404 is not an error and never deletes the bundled copy.
const OPTIONAL_FILES = ['building_costs.json']

// Simple bounded-concurrency map.
async function pool(items, limit, fn) {
  const results = []
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

// ---- Phase 0: Discover versions from upstream ----
console.log(`Discovering game data versions from upstream (ref: ${REF})...`)
let VERSIONS
try {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  const headers = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API}/contents/assets/game-data?ref=${encodeURIComponent(REF)}`, {
    headers,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const dirs = await res.json()
  VERSIONS = dirs
    .filter((d) => d.type === 'dir')
    .map((d) => d.name)
    // Sort so older versions come first (alphabetical happens to work:
    // earlyaccess, playtest, update1, update1_PTB, update2_QoL, ...)
    .sort()
  console.log(`  Found ${VERSIONS.length} versions: ${VERSIONS.join(', ')}`)
} catch (e) {
  if (process.env.CI) {
    // The local folders cannot reveal a brand-new upstream version, so a silent fallback
    // here could hide it. Fail loudly instead.
    console.error(`  Failed to discover versions from GitHub API: ${e.message}`)
    console.error(
      '  Refusing to fall back to local folders in CI: a new upstream version could go unnoticed.',
    )
    process.exit(1)
  }
  console.warn(`  Failed to discover versions from GitHub API: ${e.message}`)
  console.warn('  Falling back to scanning existing local directories (local run only)...')
  // Fallback: use whatever version directories already exist locally
  const { readdirSync, statSync } = await import('node:fs')
  try {
    VERSIONS = readdirSync(OUT_ROOT)
      .filter((f) => {
        try {
          return statSync(resolve(OUT_ROOT, f)).isDirectory()
        } catch {
          return false
        }
      })
      .sort()
    console.log(`  Local versions: ${VERSIONS.join(', ')}`)
  } catch {
    console.error('  No local game-data directory found. Cannot proceed.')
    process.exit(1)
  }
}

// ---- Folders written by our own pipeline (SOURCE.json says game-extract) are never refreshed ----
// They stay in the final version list, even when upstream has no such folder.
const { refresh: REFRESH_VERSIONS, skipped: SKIPPED_VERSIONS, all: ALL_VERSIONS } = partitionVersions(
  VERSIONS,
  listSkippedFolders(OUT_ROOT),
)
for (const version of SKIPPED_VERSIONS) {
  const src = readSource(resolve(OUT_ROOT, version))
  console.log(
    `  skip ${version}: owned by ${src?.source ?? 'unknown'}` +
      `${src?.buildid ? ` (build ${src.buildid})` : ''}, not refreshed from upstream`,
  )
}

// ---- Phase 1: game data ----
let dataOk = 0
let dataFail = 0
for (const version of REFRESH_VERSIONS) {
  await mkdir(resolve(OUT_ROOT, version), { recursive: true })
  for (const file of FILES) {
    const url = `${DATA_BASE}/${version}/${file}`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      JSON.parse(text)
      await writeFile(resolve(OUT_ROOT, version, file), text)
      console.log(`  ok   data ${version}/${file}`)
      dataOk++
    } catch (e) {
      console.warn(`  FAIL data ${version}/${file} — ${e.message}`)
      dataFail++
    }
  }
  for (const file of OPTIONAL_FILES) {
    const url = `${DATA_BASE}/${version}/${file}`
    try {
      const res = await fetch(url)
      if (res.status === 404) {
        console.log(`  skip data ${version}/${file} (not in upstream)`)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      JSON.parse(text)
      await writeFile(resolve(OUT_ROOT, version, file), text)
      console.log(`  ok   data ${version}/${file}`)
      dataOk++
    } catch (e) {
      console.warn(`  FAIL data ${version}/${file} — ${e.message}`)
      dataFail++
    }
  }
}

// ---- Collect unique building + item ids from the bundled data ----
const buildingIds = new Set()
const itemIds = new Set()
for (const version of REFRESH_VERSIONS) {
  try {
    const b =JSON.parse(await readFile(resolve(OUT_ROOT, version, 'buildings_and_recipes.json'), 'utf8'))
    for (const bld of b) if (bld?.id) buildingIds.add(bld.id)
  } catch {}
  try {
    const it = JSON.parse(await readFile(resolve(OUT_ROOT, version, 'items_catalog.json'), 'utf8'))
    for (const item of it) if (item?.id) itemIds.add(item.id)
  } catch {}
}

// ---- Phase 2: icons (WebP, keyed directly by id) ----
async function downloadIcon(kind, id) {
  const url = `${ICON_BASE}/${kind}/${id}.webp`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(resolve(PUBLIC, 'icons', kind, `${id}.webp`), buf)
    return { id, ok: true }
  } catch (e) {
    return { id, ok: false, err: e.message }
  }
}

await mkdir(resolve(PUBLIC, 'icons', 'buildings'), { recursive: true })
await mkdir(resolve(PUBLIC, 'icons', 'items'), { recursive: true })

// Icons of ids used by a game-extract folder come from the game: never overwrite them. The hidden
// upstream versions keep refreshing and list the same ids, so they would otherwise put the upstream art back.
const owned = collectFolderIds(OUT_ROOT, SKIPPED_VERSIONS)
const iconPath = (kind, id) => resolve(PUBLIC, 'icons', kind, `${id}.webp`)
const bPlan = planIconDownloads([...buildingIds], owned.buildings, (id) => existsSync(iconPath('buildings', id)))
const iPlan = planIconDownloads([...itemIds], owned.items, (id) => existsSync(iconPath('items', id)))
const protectedCount = bPlan.protected.length + iPlan.protected.length
console.log(`\nIcons protected (game-extract, not overwritten): ${protectedCount}`)

const bRes = await pool(bPlan.download, 8, (id) => downloadIcon('buildings', id))
const iRes = await pool(iPlan.download, 8, (id) => downloadIcon('items', id))

const bOk = bRes.filter((r) => r.ok).length
const iOk = iRes.filter((r) => r.ok).length
const missing = [...bRes, ...iRes].filter((r) => !r.ok)

console.log(
  `\nIcons: ${bOk}/${bPlan.download.length} buildings, ${iOk}/${iPlan.download.length} items downloaded; ${protectedCount} protected.`,
)
if (missing.length) {
  console.log(`  Missing icons (fallback glyph will be used): ${missing.map((m) => m.id).join(', ')}`)
}

console.log(`\nDone. Data: ${dataOk} ok / ${dataFail} failed. Icons: ${bOk + iOk} downloaded.`)

// ---- Phase 3: Auto-generate src/data/versions.ts from discovered versions ----
// The generator lives in scripts/lib/versionsFile.mjs (shared with scripts/publish-game-data.mjs).
// Folders we own (game-extract) stay in the list although they were not refreshed.
const { text: versionsTs, versions: finalVersions, defaultVersion: DEFAULT } = renderVersionsTs(ALL_VERSIONS)

const versionsPath = resolve(__dirname, '..', 'src', 'data', 'versions.ts')
await writeFile(versionsPath, versionsTs)
console.log(`Generated src/data/versions.ts with ${finalVersions.length} versions (default: ${DEFAULT})`)

if (dataFail > 0) process.exitCode = 1

