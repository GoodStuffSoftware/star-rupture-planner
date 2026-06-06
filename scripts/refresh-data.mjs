// Refreshes the bundled Star Rupture game data + icons from the upstream
// flexsurfer/starrupture-planner repo (MIT). Run: `npm run refresh-data`.
//
// Data + icons are bundled (not fetched at runtime) so the app works offline and is
// insulated from upstream changes. Re-run this when a new game version drops.

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(__dirname, '..', 'public')
const OUT_ROOT = resolve(PUBLIC, 'game-data')

const RAW = 'https://raw.githubusercontent.com/flexsurfer/starrupture-planner/main/assets'
const DATA_BASE = `${RAW}/game-data`
const ICON_BASE = `${RAW}/icons`

const VERSIONS = ['playtest', 'earlyaccess', 'update1_PTB', 'update1']
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
if (dataFail > 0) process.exitCode = 1
