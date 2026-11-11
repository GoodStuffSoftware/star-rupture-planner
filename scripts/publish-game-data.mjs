#!/usr/bin/env node
// Publishes one game-extract build as a planner version folder.
//
//   node scripts/publish-game-data.mjs --extract <dir> --branch <steam branch> --buildid <n> --title <news title> [--adopt] [--dry-run] [--result <file>]
//
// <dir> is the extractor output (manifest.json at its top) or the unzipped sr-data-<buildid> artifact (extract/ inside).
//
// 1. skips a build that a SOURCE.json already holds (same Steam branch, same or newer build id)
// 2. picks the version folder id from the Steam branch and news title (decideVersionId); when it cannot,
//    it tells Discord and stops: nothing is published
// 3. converts with --prev = the folder it will replace (when it exists), else the default version
// 4. gate for a new build: converter invariants only (publishGate.checkInvariants): the extractor guard, the build id,
//    every recipe maps, no kind shrinks by more than 10%. Value differences never block: they are the changelog
//    (added, removed and changed recipes, items and buildings). Value equality with the same build stays the
//    regression test (data-parity.mjs and its tests).
// 5. when the data differs (or the folder is new) writes public/game-data/<id>/ (3 JSON files + SOURCE.json), the
//    icons that are new, and src/data/versions.ts. Identical data writes nothing at all, not even SOURCE.json.
// --adopt takes over a version folder that is already covered, with identical data (the live build the upstream
//    files came from): writes SOURCE.json (so the daily upstream refresh leaves the folder alone), keeps the three
//    data files byte for byte, and replaces the committed icons with the game's (the report counts replaced,
//    unchanged and committed icons with no game counterpart, which stay). Refuses when the data differs.
// --dry-run prints the plan and the changelog and writes nothing (and sends no Discord message).
// --result <file> writes { outcome, versionId, branch, buildid, title, changelog } as JSON (dry runs too).
// Outcomes and exit codes: published | unchanged | already-published (0), gate-failed (1), bad arguments or
// extract (2), name-undecided (3).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { convertGameData, toPlannerJson } from './lib/convertGameData.mjs'
import { catalogIds, classifyStagedIcons, iconsWithoutGameCounterpart, planIcons, writeIcons } from './lib/convertIcons.mjs'
import { gameExtractSource, readSource, writeSource } from './lib/provenance.mjs'
import { buildChangelog, checkInvariants, formatChangelog } from './lib/publishGate.mjs'
import { alreadyPublished, publishedBuilds } from './lib/pullPlan.mjs'
import { decideVersionId, isTestVersion } from './lib/versionLogic.mjs'
import { renderVersionsTs } from './lib/versionsFile.mjs'
import { swapIn } from './lib/swapIn.mjs'
import { readExtract, readPlannerVersion } from './convert-game-data.mjs'

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
    else if (a === '--result') out.result = argv[++i]
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--adopt') out.adopt = true
    else throw new Error(`unknown argument ${a}`)
  }
  for (const k of ['extract', 'branch', 'buildid', 'title']) {
    // an empty title is valid for the live branch: no live-release post means a hotfix of the current live version
    if (out[k] === undefined || (k !== 'title' && !out[k])) throw new Error(`missing --${k}. usage: publish-game-data.mjs --extract <dir> --branch <b> --buildid <n> --title <news title> [--adopt] [--dry-run] [--result <file>]`)
  }
  if (!/^\d+$/.test(out.buildid)) throw new Error(`--buildid must be a number, got ${JSON.stringify(out.buildid)}`)
  return out
}

function notify(message, dryRun) {
  if (dryRun) return
  spawnSync(process.execPath, [path.join(here, 'notify-discord.mjs'), message], { stdio: 'inherit', windowsHide: true })
}

// The converter writes CRLF (as upstream's files are), git may store LF: compare line-ending-insensitively.
const lf = (text) => text.replace(/\r\n/g, '\n')
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

/** The artifact keeps the extractor output in extract/; a plain extractor output dir has manifest.json at the top. */
function resolveExtractDir(dir) {
  const inner = path.join(dir, 'extract')
  return !fs.existsSync(path.join(dir, 'manifest.json')) && fs.existsSync(path.join(inner, 'manifest.json')) ? inner : dir
}

async function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  const tag = args.dryRun ? '[dry-run] ' : ''
  const done = (outcome, extra = {}, code = 0) => {
    if (args.result) {
      fs.writeFileSync(args.result, `${JSON.stringify({ outcome, branch: args.branch, buildid: args.buildid, title: args.title, ...extra }, null, 2)}\n`)
    }
    if (code) process.exit(code)
  }
  const existingIds = fs
    .readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
  const { defaultVersion } = renderVersionsTs(existingIds)

  // 1. already published (or a newer build of this branch is)?
  const published = publishedBuilds(existingIds.map((id) => readSource(path.join(DATA_ROOT, id))))
  if (alreadyPublished(published, args.branch, args.buildid)) {
    console.log(`${tag}Steam ${args.branch} build ${args.buildid}: a SOURCE.json already holds this build or a newer one. Nothing to do.`)
    return done('already-published')
  }

  // 2. version id
  const versionId = decideVersionId({ branch: args.branch, title: args.title, existingIds })
  if (!versionId) {
    const msg = `Game data NOT published: cannot decide the version name for Steam branch "${args.branch}" build ${args.buildid} (news title: "${args.title.slice(0, 120)}"). Publish by hand or fix the naming rule.`
    console.error(`${tag}${msg}`)
    notify(msg, args.dryRun)
    return done('name-undecided', {}, 3)
  }
  const targetDir = path.join(DATA_ROOT, versionId)
  const targetExists = existingIds.includes(versionId)
  const targetSource = targetExists ? readSource(targetDir) : null
  const prevId = targetExists ? versionId : defaultVersion
  console.log(`${tag}version id: ${versionId} (${targetExists ? 'existing folder' : 'NEW folder'}${targetExists ? `, owner ${targetSource?.source ?? 'upstream'}` : ''}); default version: ${defaultVersion}`)
  console.log(`${tag}--prev: ${prevId}`)

  // 3. convert
  const extractDir = resolveExtractDir(args.extract)
  let extract
  let manifest
  try {
    extract = readExtract(extractDir)
    manifest = readJson(path.join(extractDir, 'manifest.json'))
  } catch (e) {
    console.error(`cannot read the extract ${extractDir}: ${e.message}`)
    return done('bad-extract', { error: e.message }, 2)
  }
  const idMap = readJson(ID_MAP)
  const prev = readPlannerVersion(path.join(DATA_ROOT, prevId))
  const result = convertGameData({ extract, idMap, prev })

  // 4. gate: converter invariants. A new build may differ in value; that is the changelog.
  const problems = checkInvariants({ result, prev, manifest, buildid: args.buildid })
  console.log(`${tag}gate vs ${prevId}: ${problems.length ? `${problems.length} invariant problem(s)` : 'invariants hold'}`)
  if (problems.length) {
    for (const p of problems.slice(0, 30)) console.error(`  invariant: ${p}`)
    const msg = `Game data NOT published: the converter gate failed for ${versionId} (Steam ${args.branch} build ${args.buildid}): ${problems.length} problem(s), first: ${problems[0]}. Check the extractor/converter.`
    console.error(`${tag}${msg}`)
    notify(msg, args.dryRun)
    return done('gate-failed', { versionId, problems }, 1)
  }

  // 5. plan: data files, changelog, icons, versions.ts
  const outputs = {
    buildings: toPlannerJson(result.buildings),
    items: toPlannerJson(result.items),
    corporations: toPlannerJson(result.corporations),
  }
  const unchanged =
    targetExists &&
    Object.entries(FILES).every(([k, file]) => lf(fs.readFileSync(path.join(DATA_ROOT, versionId, file), 'utf8')) === lf(outputs[k]))
  const log = buildChangelog(prev, result)
  const changelog = formatChangelog(log)
  console.log(`${tag}data vs ${prevId}: ${unchanged ? 'all 3 files identical (no data change)' : targetExists ? 'CHANGED' : 'NEW folder'}`)
  console.log(`${tag}changelog vs ${prevId} (${log.total} change(s)):\n${changelog.replace(/^/gm, '  ')}`)
  if (args.adopt && !unchanged) {
    const msg = `--adopt refused: ${versionId} ${targetExists ? 'differs from the extract' : 'does not exist yet'}. Publish it without --adopt.`
    console.error(`${tag}${msg}`)
    return done('adopt-refused', { versionId, changelog }, 1)
  }
  if (unchanged && !args.adopt) {
    console.log(`${tag}nothing written (no SOURCE.json either: the folder stays as it is)`)
    return done('unchanged', { versionId, changelog })
  }
  const mapChanged = JSON.stringify(result.idMap) !== JSON.stringify(idMap)
  console.log(`  id map: ${mapChanged ? 'WOULD CHANGE (new ids)' : 'unchanged'}`)
  for (const u of result.report.unavailable) console.log(`  not available on this build (left out): ${u.kind} ${u.id} (${u.asset})`)
  for (const d of result.report.derived) console.log(`  derived from the game: ${d.kind} ${d.id} ${d.field} = ${d.value}`)
  for (const u of result.report.uncurated) console.log(`  NO CURATED VALUE: ${u.kind} ${u.id} ${u.field}`)

  const plan = planIcons({ extract, idMap: result.idMap, ids: catalogIds(result) })
  const iconDest = (ic) => path.join(ICON_ROOT, ic.kind, `${ic.id}.webp`)
  // a publish writes only icons that do not exist yet; an adopt writes them all and swaps in what differs
  const newIcons = args.adopt ? plan.icons : plan.icons.filter((ic) => !fs.existsSync(iconDest(ic)))
  console.log(
    args.adopt
      ? `  icons: ${plan.icons.length} for catalog ids (an adopt replaces the committed WebPs), ${plan.missing.length} with no game icon`
      : `  icons: ${plan.icons.length} for catalog ids, ${newIcons.length} new (existing WebPs are kept), ${plan.missing.length} with no game icon`,
  )
  for (const m of plan.missing) console.log(`    no icon: ${m.kind}/${m.id}: ${m.why}`)

  const versions = renderVersionsTs([...new Set([...existingIds, versionId])])
  const versionsChanged = fs.readFileSync(VERSIONS_TS, 'utf8').replace(/\r\n/g, '\n') !== versions.text
  console.log(`  versions.ts: ${versionsChanged ? 'CHANGES' : 'unchanged'} (default ${versions.defaultVersion}${versions.defaultVersion === defaultVersion ? ', unchanged' : ', CHANGED'}; ${isTestVersion(versionId) ? 'test build, never the default' : 'live build'})`)

  const source = gameExtractSource({
    branch: args.branch,
    buildid: args.buildid,
    extractorVersion: manifest.tool?.version ?? 'unknown',
    versionId,
    generatedAt: new Date().toISOString(),
  })
  console.log(`${tag}SOURCE.json: ${JSON.stringify({ ...source, generatedAt: '<now>' })}`)

  if (args.dryRun && !args.adopt) {
    console.log('[dry-run] nothing written')
    return done('published', { versionId, changelog, dryRun: true })
  }
  // Atomic publish: everything is built in a temp directory first (a throw while converting an icon leaves the
  // project untouched), then moved into place; a failure while moving rolls back what was moved.
  const stage = fs.mkdtempSync(path.join(ROOT, '.publish-stage-'))
  try {
    const staged = {
      data: path.join(stage, 'data'),
      icons: path.join(stage, 'icons'),
      idMap: path.join(stage, 'id-map.json'),
      versionsTs: path.join(stage, 'versions.ts'),
    }
    fs.mkdirSync(staged.data, { recursive: true })
    // an adopt keeps the committed data files byte for byte (the converter's CRLF/LF may differ from git's)
    for (const [k, file] of Object.entries(FILES)) {
      fs.writeFileSync(path.join(staged.data, file), args.adopt ? fs.readFileSync(path.join(targetDir, file)) : outputs[k])
    }
    writeSource(staged.data, source)
    if (mapChanged) fs.writeFileSync(staged.idMap, `${JSON.stringify(result.idMap, null, 2)}\n`)
    const res = await writeIcons({ plan: { icons: newIcons, missing: [] }, extractDir, outDir: staged.icons })
    for (const m of res.noPng) console.warn(`icon PNG not found: ${m.src}`)
    let adoptStats = null
    if (args.adopt) {
      adoptStats = classifyStagedIcons({ stagedDir: staged.icons, iconRoot: ICON_ROOT })
      const kept = iconsWithoutGameCounterpart({ plan, iconRoot: ICON_ROOT })
      console.log(`  adopt icons: ${adoptStats.replaced.length} replaced, ${adoptStats.unchanged.length} unchanged, ${adoptStats.added.length} new, ${kept.length} committed with no game counterpart (kept)`)
      for (const k of kept) console.log(`    kept: ${k}`)
      adoptStats = { replaced: adoptStats.replaced.length, unchanged: adoptStats.unchanged.length, added: adoptStats.added.length, keptWithoutGameIcon: kept }
      if (args.dryRun) {
        console.log('[dry-run] nothing written')
        return done('published', { versionId, changelog, dryRun: true, adopt: adoptStats })
      }
    }
    fs.writeFileSync(staged.versionsTs, versions.text)

    swapIn({
      stage,
      targetDir,
      staged,
      iconRoot: ICON_ROOT,
      idMapFile: mapChanged ? ID_MAP : null,
      versionsFile: VERSIONS_TS,
    })
    console.log(
      args.adopt
        ? `adopted ${versionId}: SOURCE.json, data files unchanged, icons ${adoptStats.replaced} replaced / ${adoptStats.unchanged} unchanged / ${adoptStats.added} new, versions.ts`
        : `published ${versionId}: 3 data files, SOURCE.json, ${res.written.length} new icons, versions.ts`,
    )
    return done('published', { versionId, changelog, ...(adoptStats ? { adopt: adoptStats } : {}) })
  } catch (e) {
    console.error(`publish failed, nothing was changed: ${e.stack ?? e.message}`)
    fs.rmSync(stage, { recursive: true, force: true }) // done() exits, which skips the finally below
    return done('publish-failed', { versionId, error: e.message }, 2)
  } finally {
    fs.rmSync(stage, { recursive: true, force: true })
  }
}

await main()
