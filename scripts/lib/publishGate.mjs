// Pure helpers for scripts/publish-game-data.mjs: the gate for a NEW build and the changelog.
//
// A new Steam build is allowed to differ in value from the previous version (a patch changes rates; that is
// the point of publishing). So the gate checks that the CONVERSION is sound, and the value differences become
// a changelog. Value equality against the same build stays a regression test (data-parity.mjs, compareData).
//
// Shapes: buildings = [{ id, name, type, power?, heat?, recipes?: [{ output: { id, amount_per_minute }, inputs: [{ id, amount_per_minute }] }] }]
//         items = [{ id, name, type }]
//         corporations = { <name>: { id, levels: [...] } }

/** Maximum fraction a kind may shrink by against the previous version before the gate stops the publish. */
export const MAX_DROP = 0.1

export const recipeKey = (buildingId, r) =>
  `${buildingId}: ${r.output.id} <- ${r.inputs.map((i) => i.id).sort().join(' + ') || 'nothing'}`

function recipeMap(buildings) {
  const out = new Map()
  for (const b of buildings) for (const r of b.recipes ?? []) out.set(recipeKey(b.id, r), r)
  return out
}

function counts({ buildings, items, corporations }) {
  return {
    buildings: buildings.length,
    items: items.length,
    recipes: recipeMap(buildings).size,
    corporations: Object.keys(corporations ?? {}).length,
  }
}

/**
 * The invariants a converted build must satisfy, whatever its values.
 * @param {{ result: { buildings, items, corporations, report }, prev?: { buildings, items, corporations }, manifest?: object, buildid?: string }} input
 * @returns {string[]} problems; empty = the gate passes
 */
export function checkInvariants({ result, prev, manifest, buildid }) {
  const problems = []
  const { buildings, items, report } = result

  // The extractor's own guard and the build it claims to be for.
  if (manifest) {
    const status = manifest.guard?.status
    if (status !== 'ok') problems.push(`the extractor guard status is "${status ?? 'missing'}", not ok`)
    if (buildid !== undefined && String(manifest.build) !== String(buildid)) problems.push(`the manifest is for build ${manifest.build}, not ${buildid}`)
    if (manifest.guard?.overridden) problems.push('the extractor guard was overridden')
    for (const p of manifest.guard?.dataProblems ?? []) problems.push(`extractor data problem: ${typeof p === 'string' ? p : JSON.stringify(p)}`)
  }

  // Every recipe maps: building, output and inputs all resolve to ids that exist in this output.
  const itemIds = new Set(items.map((i) => i.id))
  const dupItems = items.length - itemIds.size
  if (dupItems) problems.push(`${dupItems} duplicate item id(s) in the item catalog`)
  const buildingIds = new Set(buildings.map((b) => b.id))
  if (buildingIds.size !== buildings.length) problems.push('duplicate building ids')
  for (const b of buildings) {
    for (const r of b.recipes ?? []) {
      const where = `recipe ${recipeKey(b.id, r)}`
      if (!itemIds.has(r.output.id)) problems.push(`${where}: output item "${r.output.id}" is not in the item catalog`)
      for (const i of r.inputs) if (!itemIds.has(i.id)) problems.push(`${where}: input item "${i.id}" is not in the item catalog`)
      const rates = [r.output.amount_per_minute, ...r.inputs.map((i) => i.amount_per_minute)]
      if (rates.some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < 0)) problems.push(`${where}: a rate is not a finite, non-negative number`)
    }
  }

  // No unresolved references in the converter's own report.
  for (const f of report?.extractorRateFallbacks ?? []) problems.push(`extractor rate fallback for ${f.building} ${f.recipe}`)

  // Nothing collapses: no kind shrinks by more than MAX_DROP against the previous version.
  const now = counts(result)
  if (!now.buildings || !now.items || !now.recipes) problems.push(`empty output (${JSON.stringify(now)})`)
  if (prev) {
    const before = counts(prev)
    for (const k of Object.keys(before)) {
      if (before[k] > 0 && now[k] < before[k] * (1 - MAX_DROP)) {
        problems.push(`${k} dropped from ${before[k]} to ${now[k]} (more than ${Math.round(MAX_DROP * 100)}%)`)
      }
    }
  }
  return problems
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const delta = (before, after) => ({
  added: [...after.keys()].filter((k) => !before.has(k)),
  removed: [...before.keys()].filter((k) => !after.has(k)),
  changed: [...after.keys()].filter((k) => before.has(k) && !sameJson(before.get(k), after.get(k))),
})

/**
 * Value differences between two planner datasets: added, removed and changed recipes, items and buildings.
 * Buildings are compared WITHOUT their recipes (those are listed as recipes).
 */
export function buildChangelog(before, after) {
  const bare = ({ recipes: _recipes, ...rest }) => rest
  const mapOf = (list, f = (x) => x) => new Map(list.map((x) => [x.id, f(x)]))
  const log = {
    buildings: delta(mapOf(before.buildings, bare), mapOf(after.buildings, bare)),
    items: delta(mapOf(before.items), mapOf(after.items)),
    recipes: delta(recipeMap(before.buildings), recipeMap(after.buildings)),
  }
  const total = Object.values(log).reduce((n, d) => n + d.added.length + d.removed.length + d.changed.length, 0)
  return { ...log, total }
}

/**
 * Plain-text changelog for the log and for Discord. `max` bounds the ids listed per group.
 * @param {ReturnType<typeof buildChangelog>} log
 */
export function formatChangelog(log, max = 8) {
  if (!log.total) return 'No value changes.'
  const lines = []
  for (const kind of ['recipes', 'items', 'buildings']) {
    const d = log[kind]
    for (const [label, list] of [['added', d.added], ['removed', d.removed], ['changed', d.changed]]) {
      if (!list.length) continue
      const shown = list.slice(0, max).join('; ')
      lines.push(`${kind} ${label} (${list.length}): ${shown}${list.length > max ? `; and ${list.length - max} more` : ''}`)
    }
  }
  return lines.join('\n')
}
