#!/usr/bin/env node
// Compare game-derived planner data with a committed planner version and write a markdown report.
//   node scripts/data-parity.mjs --extract <extract-dir> --planner <version-dir> --report <file.md> [--id-map <file>]
// The conversion runs WITHOUT --prev, so every curated field (names, types, grouping, rewards, order)
// comes from the game or is missing; each difference lands in exactly one class:
//   A  extraction/converter bug (fix it)       B  upstream hand-entry error (game value shown)
//   C  curation (names, grouping, order, descriptions, rewards)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertGameData } from './lib/convertGameData.mjs'
import { readExtract, readPlannerVersion } from './convert-game-data.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const EPS = 0.01

function parseArgs(argv) {
  const out = { idMap: path.join(here, 'data', 'id-map.json') }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--extract') out.extract = argv[++i]
    else if (a === '--planner') out.planner = argv[++i]
    else if (a === '--report') out.report = argv[++i]
    else if (a === '--id-map') out.idMap = argv[++i]
    else throw new Error(`unknown argument ${a}`)
  }
  if (!out.extract || !out.planner || !out.report) {
    throw new Error('usage: data-parity.mjs --extract <dir> --planner <version-dir> --report <file.md> [--id-map <file>]')
  }
  return out
}

const recipeKey = (r) => `${r.output.id}<-${r.inputs.map((i) => i.id).sort().join(',')}`
const close = (a, b) => Math.abs(a - b) <= EPS

/** Pure comparison; returns the three classes plus counts. Exported for tests. */
export function compareData(game, planner) {
  const A = []
  const B = []
  const C = []
  const counts = {}
  const gB = new Map(game.buildings.map((b) => [b.id, b]))
  const pB = new Map(planner.buildings.map((b) => [b.id, b]))

  // building set
  for (const id of pB.keys()) {
    if (!gB.has(id)) {
      const p = pB.get(id)
      if (p.power === undefined && p.heat === undefined && !p.recipes) C.push(`building \`${id}\` is curated-only in the planner (no game numbers), carried forward from the previous version`)
      else A.push(`building \`${id}\` is in the planner but was not produced from the game`)
    }
  }
  for (const id of gB.keys()) if (!pB.has(id)) A.push(`building \`${id}\` was produced from the game but is not in the planner`)
  counts.buildings = { game: gB.size, planner: pB.size }

  // per building: power, heat, name, order of recipes
  let powerHeatChecked = 0
  let recipesChecked = 0
  let ratesChecked = 0
  for (const [id, g] of gB) {
    const p = pB.get(id)
    if (!p) continue
    if (p.power !== undefined) {
      powerHeatChecked++
      if (!close(p.power, g.power ?? 0)) B.push(`power \`${id}\`: planner ${p.power}, game ${g.power}`)
      if (!close(p.heat, g.heat ?? 0)) B.push(`heat \`${id}\`: planner ${p.heat}, game ${g.heat}`)
    }
    if (p.name !== g.name) C.push(`name building \`${id}\`: planner "${p.name}", game "${g.name}"`)
    if (p.type !== g.type) C.push(`type building \`${id}\`: planner "${p.type}", converter default "${g.type}" (type is curated)`)
    if (p.upgrade) C.push(`upgrade grouping \`${id}\` -> \`${p.upgrade}\` is curated (not in the game data)`)
    if (p.coreHeatCapacity !== undefined) C.push(`coreHeatCapacity \`${id}\` = ${p.coreHeatCapacity} is curated (not extracted)`)

    const gR = new Map((g.recipes ?? []).map((r) => [recipeKey(r), r]))
    const pR = new Map((p.recipes ?? []).map((r) => [recipeKey(r), r]))
    for (const [k, pr] of pR) {
      recipesChecked++
      const gr = gR.get(k)
      if (!gr) {
        A.push(`recipe \`${id}\` ${k} is in the planner but not in the converted game data`)
        continue
      }
      if (pr.id) C.push(`recipe id \`${pr.id}\` (${id} ${k}) is curated`)
      if (pr.variant) C.push(`recipe variant "${pr.variant}" (${id} ${k}) is curated`)
      ratesChecked++
      if (!close(pr.output.amount_per_minute, gr.output.amount_per_minute)) {
        B.push(`rate output \`${id}\` ${k}: planner ${pr.output.amount_per_minute}, game ${gr.output.amount_per_minute}`)
      }
      for (const pi of pr.inputs) {
        const gi = gr.inputs.find((i) => i.id === pi.id)
        ratesChecked++
        if (!gi || !close(pi.amount_per_minute, gi.amount_per_minute)) {
          B.push(`rate input \`${pi.id}\` of \`${id}\` ${k}: planner ${pi.amount_per_minute}, game ${gi?.amount_per_minute}`)
        }
      }
    }
    for (const k of gR.keys()) if (!pR.has(k)) B.push(`recipe \`${id}\` ${k} is in the game data but not in the planner (missing upstream)`)
    if (JSON.stringify([...pR.keys()]) !== JSON.stringify([...gR.keys()]) && pR.size === gR.size) {
      C.push(`recipe order of \`${id}\` differs (the planner orders by hand)`)
    }
  }
  counts.powerHeat = powerHeatChecked
  counts.recipes = recipesChecked
  counts.rates = ratesChecked

  // items
  const gI = new Map(game.items.map((i) => [i.id, i]))
  const pI = new Map(planner.items.map((i) => [i.id, i]))
  for (const [id, p] of pI) {
    const g = gI.get(id)
    if (!g) A.push(`item \`${id}\` ("${p.name}") is in the planner but not in the converted data`)
  }
  for (const id of gI.keys()) if (!pI.has(id)) A.push(`item \`${id}\` is in the converted data but not in the planner`)
  for (const [id, g] of gI) {
    const p = pI.get(id)
    if (!p) continue
    if (p.name !== g.name) C.push(`name item \`${id}\`: planner "${p.name}", game "${g.name}"`)
    if (p.type !== g.type) C.push(`type item \`${id}\`: planner "${p.type}", converter default "${g.type}" (item category is curated)`)
  }
  counts.items = { game: gI.size, planner: pI.size }

  // corporations
  let levelsChecked = 0
  for (const [corpName, pc] of Object.entries(planner.corporations)) {
    const gc = game.corporations[corpName]
    if (!gc) {
      A.push(`corporation "${corpName}" is in the planner but not in the converted data`)
      continue
    }
    if (pc.description !== gc.description) C.push(`description "${corpName}": planner "${pc.description}", game "${gc.description}"`)
    if (pc.levels.length !== gc.levels.length) A.push(`corporation "${corpName}": ${pc.levels.length} levels in the planner, ${gc.levels.length} from the game`)
    for (const pl of pc.levels) {
      const gl = gc.levels.find((l) => l.level === pl.level)
      if (!gl) continue
      levelsChecked++
      if (pl.xp !== gl.xp) B.push(`xp ${corpName} level ${pl.level}: planner ${pl.xp}, game ${gl.xp}`)
      const pc2 = JSON.stringify(pl.components.map((c) => [c.id, c.points]).sort())
      const gc2 = JSON.stringify(gl.components.map((c) => [c.id, c.points]).sort())
      if (pc2 !== gc2) B.push(`points ${corpName} level ${pl.level}: planner ${pc2}, game ${gc2}`)
      else if (JSON.stringify(pl.components) !== JSON.stringify(gl.components)) C.push(`component order ${corpName} level ${pl.level} differs`)
      const pr = pl.rewards.map((r) => r.name).join(' | ')
      const gr = gl.rewards.map((r) => r.name).join(' | ')
      if (pr !== gr) C.push(`rewards ${corpName} level ${pl.level}: planner "${pr}", game-derived "${gr}"`)
    }
  }
  counts.corporationLevels = levelsChecked
  return { A, B, C, counts }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const extract = readExtract(args.extract)
  const idMap = JSON.parse(fs.readFileSync(args.idMap, 'utf8'))
  const planner = readPlannerVersion(args.planner)
  const converted = convertGameData({ extract, idMap }) // no prev: pure game data
  const { A, B, C, counts } = compareData(converted, planner)

  // converter-side findings that are class A by definition
  const r = converted.report
  for (const m of r.missingFromExtract) A.push(`${m.kind} \`${m.id}\` (${m.asset}) is in the id map but not in the extract`)
  for (const f of r.extractorRateFallbacks) A.push(`extractor rate fallback for ${f.building} ${f.recipe}`)

  const lines = []
  lines.push('# Data parity: game extract vs planner version')
  lines.push('')
  lines.push(`Extract \`${args.extract}\` converted without --prev, compared with \`${args.planner}\`.`)
  lines.push('')
  lines.push('| class | meaning | count |')
  lines.push('|---|---|---|')
  lines.push(`| A | extraction/converter bug (must be 0) | ${A.length} |`)
  lines.push(`| B | upstream hand-entry error (game value shown) | ${B.length} |`)
  lines.push(`| C | curation (names, grouping, order, descriptions, rewards) | ${C.length} |`)
  lines.push('')
  lines.push(
    `Checked: ${counts.buildings.game} converted vs ${counts.buildings.planner} planner buildings, ${counts.items.game} vs ${counts.items.planner} items, ${counts.recipes} planner recipes, ${counts.rates} per-recipe rates, ${counts.powerHeat} power/heat pairs, ${counts.corporationLevels} corporation levels (xp and component points).`,
  )
  lines.push('')
  lines.push(`Inferred, not read from the game: ${r.defaultedBuildTimes.length} recipes without a BuildTime use the 10 s default (${[...new Set(r.defaultedBuildTimes)].join(', ') || 'none'}). Their rates match the planner when no class B/A rate difference is listed below.`)
  lines.push('')
  for (const [title, list] of [
    ['A. Extraction / converter bugs', A],
    ['B. Upstream hand-entry errors', B],
    ['C. Curation', C],
  ]) {
    lines.push(`## ${title} (${list.length})`)
    lines.push('')
    if (list.length === 0) lines.push('None.')
    for (const x of list) lines.push(`- ${x}`)
    lines.push('')
  }
  fs.mkdirSync(path.dirname(path.resolve(args.report)), { recursive: true })
  fs.writeFileSync(args.report, `${lines.join('\n')}\n`)
  console.log(`class A ${A.length}, class B ${B.length}, class C ${C.length}; report ${args.report}`)
  if (A.length > 0) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
