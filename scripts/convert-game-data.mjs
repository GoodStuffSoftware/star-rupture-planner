#!/usr/bin/env node
// Convert the game-extract raw output into the planner's game-data JSON.
//   node scripts/convert-game-data.mjs --in <extract-dir> --out <version-dir> [--prev <version-dir>] [--id-map <file>]
//                                      [--icons <public/icons dir> [--icons-catalog-only]]
// Writes buildings_and_recipes.json, items_catalog.json, corporations_components.json into --out
// and writes the id map back when new ids were assigned. Raw extracts are never committed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertGameData, toPlannerJson } from './lib/convertGameData.mjs'
import { planIcons, catalogIds, writeIcons } from './lib/convertIcons.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const out = { idMap: path.join(here, 'data', 'id-map.json') }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--in') out.in = argv[++i]
    else if (a === '--out') out.out = argv[++i]
    else if (a === '--prev') out.prev = argv[++i]
    else if (a === '--id-map') out.idMap = argv[++i]
    else if (a === '--icons') out.icons = argv[++i]
    else if (a === '--icons-catalog-only') out.iconsCatalogOnly = true
    else throw new Error(`unknown argument ${a}`)
  }
  if (!out.in || !out.out) throw new Error('usage: convert-game-data.mjs --in <extract-dir> --out <version-dir> [--prev <version-dir>] [--id-map <file>] [--icons <dir> [--icons-catalog-only]]')
  if (out.iconsCatalogOnly && !out.icons) throw new Error('--icons-catalog-only needs --icons <dir>')
  return out
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

/** Reads the extractor output directory into the shape convertGameData expects. */
export function readExtract(dir) {
  return {
    recipes: readJson(path.join(dir, 'recipes.json')),
    collections: readJson(path.join(dir, 'recipe-collections.json')),
    buildings: readJson(path.join(dir, 'buildings.json')),
    extractorRates: readJson(path.join(dir, 'extractor-rates.json')),
    items: readJson(path.join(dir, 'items.json')),
    corporations: readJson(path.join(dir, 'corporations.json')),
  }
}

export function readPlannerVersion(dir) {
  return {
    buildings: readJson(path.join(dir, 'buildings_and_recipes.json')),
    items: readJson(path.join(dir, 'items_catalog.json')),
    corporations: readJson(path.join(dir, 'corporations_components.json')),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const extract = readExtract(args.in)
  const idMap = readJson(args.idMap)
  const prev = args.prev ? readPlannerVersion(args.prev) : undefined
  const result = convertGameData({ extract, idMap, prev })

  fs.mkdirSync(args.out, { recursive: true })
  fs.writeFileSync(path.join(args.out, 'buildings_and_recipes.json'), toPlannerJson(result.buildings))
  fs.writeFileSync(path.join(args.out, 'items_catalog.json'), toPlannerJson(result.items))
  fs.writeFileSync(path.join(args.out, 'corporations_components.json'), toPlannerJson(result.corporations))

  const mapChanged = JSON.stringify(result.idMap) !== JSON.stringify(idMap)
  if (mapChanged) fs.writeFileSync(args.idMap, `${JSON.stringify(result.idMap, null, 2)}\n`)

  const r = result.report
  console.log(
    `wrote ${result.buildings.length} buildings, ${result.items.length} items, ${Object.keys(result.corporations).length} corporations to ${args.out}`,
  )
  console.log(`id map ${mapChanged ? 'UPDATED: commit it' : 'unchanged'}; new items ${r.newItemIds.length}, new buildings ${r.newBuildingIds.length}`)
  if (r.defaultedBuildTimes.length) console.log(`build time defaulted for ${r.defaultedBuildTimes.length} recipes`)
  for (const m of r.missingFromExtract) console.warn(`MISSING from extract: ${m.kind} ${m.id} (${m.asset})`)
  for (const u of r.unavailable) console.warn(`not available on this build (left out): ${u.kind} ${u.id} (${u.asset})`)
  for (const d of r.derived) console.log(`derived from the game: ${d.kind} ${d.id} ${d.field} = ${d.value}`)
  for (const u of r.uncurated) console.warn(`NO CURATED VALUE: ${u.kind} ${u.id} ${u.field}: ${u.note}`)
  for (const f of r.extractorRateFallbacks) console.warn(`extractor rate fallback: ${f.building} ${f.recipe}`)
  if (args.icons) {
    // --icons-catalog-only: only ids in the converted catalog; otherwise every id in the id map.
    const ids = args.iconsCatalogOnly ? catalogIds(result) : undefined
    const plan = planIcons({ extract, idMap: result.idMap, ids })
    const res = await writeIcons({ plan, extractDir: args.in, outDir: args.icons })
    console.log(`icons: wrote ${res.written.length} WebP to ${args.icons}${args.iconsCatalogOnly ? ' (catalog ids only)' : ''}`)
    for (const m of plan.missing) console.warn(`icon missing: ${m.kind}/${m.id} (${m.asset}): ${m.why}`)
    for (const m of res.noPng) console.warn(`icon PNG not found: ${m.src}`)
  }
  if (r.missingFromExtract.length) process.exitCode = 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message)
    process.exitCode = 2
  })
}
