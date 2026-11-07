#!/usr/bin/env node
// Publishes one game-extract build as a planner version folder.
//
//   node scripts/publish-game-data.mjs --extract <dir> --branch <steam branch> --buildid <n> --title <news title> [--dry-run]
//
// 1. picks the version folder id from the Steam branch and news title (decideVersionId); when it cannot,
//    it tells Discord and stops: nothing is published
// 2. converts with --prev = the folder it will replace if we own it (game-extract), else the default version
// 3. runs the parity gate against the default version: any class A difference fails
// 4. writes public/game-data/<id>/ (3 JSON files + SOURCE.json), the icons that are new, and src/data/versions.ts
// --dry-run prints the plan and the diff summary and writes nothing (and sends no Discord message).
// Exit codes: 0 ok, 1 parity gate failed, 2 bad arguments or extract, 3 version name undecidable.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { convertGameData, toPlannerJson } from './lib/convertGameData.mjs'
import { catalogIds, planIcons, writeIcons } from './lib/convertIcons.mjs'
import { gameExtractSource, readSource, writeSource, SOURCE_GAME_EXTRACT } from './lib/provenance.mjs'
import { decideVersionId, isTestVersion } from './lib/versionLogic.mjs'
import { renderVersionsTs } from './lib/versionsFile.mjs'
import { readExtract, readPlannerVersion } from './convert-game-data.mjs'
import { compareData } from './data-parity.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..')
const DATA_ROOT = path.join(ROOT, 'public', 'game-data')
const ICON_ROOT = path.join(ROOT, 'public', 'icons')
const ID_MAP = path.join(here, 'data', 'id-map.json')
const VERSIONS_TS = path.join(ROOT, 'src', 'data', 'versions.ts')
const FILES = {
  buildings: 'buildings_and_recipes.json',
  items: 'items_catalog.json',
  corporations: 'corporations_components.json',
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--extract') out.extract = argv[++i]
    else if (a === '--branch') out.branch = argv[++i]
    else if (a === '--buildid') out.buildid = argv[++i]
    else if (a === '--title') out.title = argv[++i]
    else if (a === '--dry-run') out.dryRun = true
    else throw new Error(`unknown argument ${a}`)
  }
  for (const k of ['extract', 'branch', 'buildid', 'title']) {
    if (!out[k]) throw new Error(`missing --${k}. usage: publish-game-data.mjs --extract <dir> --branch <b> --buildid <n> --title <news title> [--dry-run]`)
  }
  if (!/^\d+$/.test(out.buildid)) throw new Error(`--buildid must be a number, got ${JSON.stringify(out.buildid)}`)
  return out
}

function notify(message, dryRun) {
  if (dryRun) return
  spawnSync(process.execPath, [path.join(here, 'notify-discord.mjs'), message], { stdio: 'inherit', windowsHide: true })
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const idsOf = (list) => new Set(list.map((x) => x.id))
const delta = (before, after) => ({
  added: [...after].filter((x) => !before.has(x)),
  removed: [...before].filter((x) => !after.has(x)),
})

async function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  const tag = args.dryRun ? '[dry-run] ' : ''
  const existingIds = fs
    .readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
  const { defaultVersion } = renderVersionsTs(existingIds)

  // 1. version id
  const versionId = decideVersionId({ branch: args.branch, title: args.title, existingIds })
  if (!versionId) {
    const msg = `Game data NOT published: cannot decide the version name for Steam branch "${args.branch}" build ${args.buildid} (news title: "${args.title.slice(0, 120)}"). Publish by hand or fix the naming rule.`
    console.error(`${tag}${msg}`)
    notify(msg, args.dryRun)
    process.exit(3)
  }
  const targetDir = path.join(DATA_ROOT, versionId)
  const targetExists = existingIds.includes(versionId)
  const targetSource = targetExists ? readSource(targetDir) : null
  const ownedByUs = targetSource?.source === SOURCE_GAME_EXTRACT
  const prevId = ownedByUs ? versionId : defaultVersion
  console.log(`${tag}version id: ${versionId} (${targetExists ? 'existing folder' : 'NEW folder'}${targetExists ? `, owner ${targetSource?.source ?? 'upstream'}` : ''}); default version: ${defaultVersion}`)
  console.log(`${tag}--prev: ${prevId}`)

  // 2. convert
  let extract
  try {
    extract = readExtract(args.extract)
  } catch (e) {
    console.error(`cannot read the extract ${args.extract}: ${e.message}`)
    process.exit(2)
  }
  const idMap = readJson(ID_MAP)
  const prev = readPlannerVersion(path.join(DATA_ROOT, prevId))
  const result = convertGameData({ extract, idMap, prev })

  // 3. parity gate: pure game data (no --prev) against the default version; any class A difference fails
  const defaultData = readPlannerVersion(path.join(DATA_ROOT, defaultVersion))
  const pure = convertGameData({ extract, idMap })
  const { A, B, C } = compareData(pure, defaultData)
  const r = pure.report
  for (const m of r.missingFromExtract) A.push(`${m.kind} ${m.id} (${m.asset}) is in the id map but not in the extract`)
  for (const f of r.extractorRateFallbacks) A.push(`extractor rate fallback for ${f.building} ${f.recipe}`)
  console.log(`${tag}parity vs ${defaultVersion}: class A ${A.length}, B ${B.length}, C ${C.length}`)
  if (A.length) {
    for (const a of A.slice(0, 30)) console.error(`  A: ${a}`)
    const msg = `Game data NOT published: parity gate failed for ${versionId} (Steam ${args.branch} build ${args.buildid}): ${A.length} class A difference(s) vs ${defaultVersion}. Check the extractor/converter.`
    console.error(`${tag}${msg}`)
    notify(msg, args.dryRun)
    process.exit(1)
  }

  // 4. plan: data files, icons, versions.ts
  const outputs = {
    buildings: toPlannerJson(result.buildings),
    items: toPlannerJson(result.items),
    corporations: toPlannerJson(result.corporations),
  }
  const against = targetExists ? versionId : prevId
  console.log(`${tag}data diff vs ${against}:`)
  for (const [k, file] of Object.entries(FILES)) {
    const old = fs.readFileSync(path.join(DATA_ROOT, against, file), 'utf8')
    console.log(`  ${file}: ${old === outputs[k] ? 'identical (no data change)' : `CHANGED (${old.length} -> ${outputs[k].length} chars)`}`)
  }
  const prevIdsB = idsOf(prev.buildings)
  const prevIdsI = idsOf(prev.items)
  const dB = delta(prevIdsB, idsOf(result.buildings))
  const dI = delta(prevIdsI, idsOf(result.items))
  console.log(`  buildings ${result.buildings.length} (added ${dB.added.join(',') || 'none'}; removed ${dB.removed.join(',') || 'none'}), items ${result.items.length} (added ${dI.added.join(',') || 'none'}; removed ${dI.removed.join(',') || 'none'})`)
  const mapChanged = JSON.stringify(result.idMap) !== JSON.stringify(idMap)
  console.log(`  id map: ${mapChanged ? 'WOULD CHANGE (new ids)' : 'unchanged'}`)
  for (const u of result.report.uncurated) console.log(`  NO CURATED VALUE: ${u.kind} ${u.id} ${u.field}`)

  const plan = planIcons({ extract, idMap: result.idMap, ids: catalogIds(result) })
  const iconDest = (ic) => path.join(ICON_ROOT, ic.kind, `${ic.id}.webp`)
  const newIcons = plan.icons.filter((ic) => !fs.existsSync(iconDest(ic)))
  console.log(`  icons: ${plan.icons.length} for catalog ids, ${newIcons.length} new (existing WebPs are kept), ${plan.missing.length} with no game icon`)
  for (const m of plan.missing) console.log(`    no icon: ${m.kind}/${m.id}: ${m.why}`)

  const versions = renderVersionsTs([...new Set([...existingIds, versionId])])
  const versionsChanged = fs.readFileSync(VERSIONS_TS, 'utf8').replace(/\r\n/g, '\n') !== versions.text
  console.log(`  versions.ts: ${versionsChanged ? 'CHANGES' : 'unchanged'} (default ${versions.defaultVersion}${versions.defaultVersion === defaultVersion ? ', unchanged' : ', CHANGED'}; ${isTestVersion(versionId) ? 'test build, never the default' : 'live build'})`)

  const source = gameExtractSource({
    branch: args.branch,
    buildid: args.buildid,
    extractorVersion: readExtractorVersion(args.extract),
    versionId,
    generatedAt: new Date().toISOString(),
  })
  console.log(`${tag}SOURCE.json: ${JSON.stringify({ ...source, generatedAt: '<now>' })}`)

  if (args.dryRun) {
    console.log('[dry-run] nothing written')
    return
  }
  fs.mkdirSync(targetDir, { recursive: true })
  for (const [k, file] of Object.entries(FILES)) fs.writeFileSync(path.join(targetDir, file), outputs[k])
  writeSource(targetDir, source)
  if (mapChanged) fs.writeFileSync(ID_MAP, `${JSON.stringify(result.idMap, null, 2)}\n`)
  const res = await writeIcons({ plan: { icons: newIcons, missing: [] }, extractDir: args.extract, outDir: ICON_ROOT })
  for (const m of res.noPng) console.warn(`icon PNG not found: ${m.src}`)
  fs.writeFileSync(VERSIONS_TS, versions.text)
  console.log(`published ${versionId}: 3 data files, SOURCE.json, ${res.written.length} new icons, versions.ts`)
}

function readExtractorVersion(dir) {
  try {
    return readJson(path.join(dir, 'manifest.json')).tool.version
  } catch {
    return 'unknown'
  }
}

await main()
