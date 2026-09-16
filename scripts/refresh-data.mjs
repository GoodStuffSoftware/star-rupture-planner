// Refreshes the bundled Star Rupture game data + icons from the upstream
// flexsurfer/starrupture-planner repo (MIT). Run: `npm run refresh-data`.
//
// Data + icons are bundled (not fetched at runtime) so the app works offline and is
// insulated from upstream changes. Re-run this when a new game version drops.
//
// Versions are auto-discovered from the upstream repo — no hardcoded list needed.

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(__dirname, '..', 'public')
const OUT_ROOT = resolve(PUBLIC, 'game-data')

const REPO = 'flexsurfer/starrupture-planner'
const RAW = `https://raw.githubusercontent.com/${REPO}/main/assets`
const API = `https://api.github.com/repos/${REPO}`
const DATA_BASE = `${RAW}/game-data`
const ICON_BASE = `${RAW}/icons`

const FILES = [
  'buildings_and_recipes.json',
  'items_catalog.json',
  'corporations_components.json',
]

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
console.log('Discovering game data versions from upstream...')
let VERSIONS
try {
  const res = await fetch(`${API}/contents/assets/game-data`)
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
  console.warn(`  Failed to discover versions from GitHub API: ${e.message}`)
  console.warn('  Falling back to scanning existing local directories...')
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

// ---- Phase 1: game data ----
let dataOk = 0
let dataFail = 0
for (const version of VERSIONS) {
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
}

// ---- Collect unique building + item ids from the bundled data ----
const buildingIds = new Set()
const itemIds = new Set()
for (const version of VERSIONS) {
  try {
    const b = JSON.parse(await readFile(resolve(OUT_ROOT, version, 'buildings_and_recipes.json'), 'utf8'))
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

const bRes = await pool([...buildingIds], 8, (id) => downloadIcon('buildings', id))
const iRes = await pool([...itemIds], 8, (id) => downloadIcon('items', id))

const bOk = bRes.filter((r) => r.ok).length
const iOk = iRes.filter((r) => r.ok).length
const missing = [...bRes, ...iRes].filter((r) => !r.ok)

console.log(`\nIcons: ${bOk}/${buildingIds.size} buildings, ${iOk}/${itemIds.size} items.`)
if (missing.length) {
  console.log(`  Missing icons (fallback glyph will be used): ${missing.map((m) => m.id).join(', ')}`)
}

console.log(`\nDone. Data: ${dataOk} ok / ${dataFail} failed. Icons: ${bOk + iOk} downloaded.`)

// ---- Phase 3: Auto-generate src/data/versions.ts from discovered versions ----
function humanLabel(dirName) {
  // Known labels for exact matches
  const known = {
    playtest: 'Playtest',
    earlyaccess: 'Early Access',
  }
  if (known[dirName]) return known[dirName]

  // Split on underscores, then insert spaces between letters and digits within tokens
  return dirName
    .split('_')
    .map((tok) =>
      tok
        // "update1" → "update 1"
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .split(' ')
        .map((w) => {
          const upper = w.toUpperCase()
          if (upper === 'PTB' || upper === 'QOL') return upper === 'QOL' ? 'QoL' : 'PTB'
          return w.charAt(0).toUpperCase() + w.slice(1)
        })
        .join(' '),
    )
    .join(' ')
}

// Sort versions chronologically: playtest, earlyaccess, then updates by number
function versionSortKey(name) {
  if (name === 'playtest') return '0_playtest'
  if (name === 'earlyaccess') return '1_earlyaccess'
  // Extract update number + suffix (e.g. update1_PTB → "1_PTB", update2_QoL → "2_QoL")
  const m = name.match(/update(\d+)(.*)/)
  if (m) return `2_${m[1].padStart(3, '0')}${m[2]}`
  return `3_${name}`
}
VERSIONS.sort((a, b) => versionSortKey(a).localeCompare(versionSortKey(b)))

const versionsTs = `// AUTO-GENERATED by scripts/refresh-data.mjs — do not edit manually.
// Re-run \`npm run refresh-data\` to update when a new game version drops.

export interface VersionInfo {
  id: string
  label: string
}

export const VERSIONS: VersionInfo[] = [
${VERSIONS.map((v) => `  { id: '${v}', label: '${humanLabel(v)}' },`).join('\n')}
]

export const DEFAULT_VERSION = '${VERSIONS[VERSIONS.length - 1]}'
`

const versionsPath = resolve(__dirname, '..', 'src', 'data', 'versions.ts')
await writeFile(versionsPath, versionsTs)
console.log(`Generated src/data/versions.ts with ${VERSIONS.length} versions (default: ${VERSIONS[VERSIONS.length - 1]})`)

if (dataFail > 0) process.exitCode = 1

