// Pure conversion of the game-extract raw output into the planner's game-data JSON.
// No file or network access here: the CLI (scripts/convert-game-data.mjs) does the I/O.
// See tools/game-extract/README.md for the raw layout and scripts/data/id-map.json for the id map.

/** Last path segment of an asset path ("/Game/Chimera/Items/I_Foo" -> "I_Foo"). */
export function assetName(path) {
  if (typeof path !== 'string') return ''
  const tail = path.split('/').pop() ?? ''
  return tail.split('.')[0]
}

/** Deterministic slug: lower case, runs of non-alphanumerics become "_". The I_/DA_/BD_/CD_ prefix is stripped first. */
export function slugify(raw) {
  const base = String(raw)
    .replace(/^(I|DA|BD|CD)_/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || 'unnamed'
}

/** Collision-safe slug: appends _2, _3 ... until the slug is not in `taken`. Adds the result to `taken`. */
export function uniqueSlug(raw, taken) {
  const base = slugify(raw)
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}_${n}`
  taken.add(slug)
  return slug
}

/** Count x 60 / BuildTime, rounded to 4 decimals so float noise never reaches the JSON. */
export function ratePerMinute(count, buildTime) {
  if (!(buildTime > 0)) throw new Error(`invalid build time ${buildTime}`)
  return Math.round(((count * 60) / buildTime) * 1e4) / 1e4
}

const GAME_TYPE_TO_PLANNER = {
  'ECrBuildingType::Crafting': 'production',
  'ECrBuildingType::RawMaterialProcessing': 'production',
  'ECrBuildingType::Extraction': 'production',
  'ECrBuildingType::Power': 'generator',
  'ECrBuildingType::Defensive': 'defense',
  'ECrBuildingType::Habitat': 'habitat',
  'ECrBuildingType::Transport': 'transport',
  'ECrBuildingType::TemperatureManagement': 'temperature',
}

function corpColumn(corpAsset) {
  // CD_FutureCorp -> FutureValue, CD_SelenianCorp -> SelenianValue
  return `${assetName(corpAsset).replace(/^CD_/, '').replace(/Corp$/, '')}Value`
}

/** A building lists recipes in the planner when it crafts or extracts (the exporter etc. also reference collections). */
function producesRecipes(b) {
  return (b.recipeCollections ?? []).length > 0 && b.type !== 'ECrBuildingType::Transport' && (Boolean(b.crafting?.RecipeCollection) || b.isExtractor === true)
}

const recipeKey = (r) => `${r.output.id}<-${r.inputs.map((i) => i.id).sort().join(',')}`

/**
 * The planner hand-curates recipe order and two optional recipe keys (id, variant). Carry them from the
 * previous version where a recipe with the same output and input set exists; the rest follow in game order.
 */
export function carryRecipeCuration(recipes, prevRecipes) {
  if (prevRecipes.length === 0) return recipes
  const prevByKey = new Map()
  prevRecipes.forEach((r, i) => {
    if (!prevByKey.has(recipeKey(r))) prevByKey.set(recipeKey(r), { r, i })
  })
  const ranked = recipes.map((r, gameIndex) => {
    const hit = prevByKey.get(recipeKey(r))
    if (!hit) return { r, rank: Number.MAX_SAFE_INTEGER, gameIndex }
    const merged = {}
    for (const k of Object.keys(hit.r)) merged[k] = k === 'output' ? r.output : k === 'inputs' ? r.inputs : hit.r[k]
    return { r: merged, rank: hit.i, gameIndex }
  })
  ranked.sort((x, y) => x.rank - y.rank || x.gameIndex - y.gameIndex)
  return ranked.map((x) => x.r)
}

function round4(n) {
  return Math.round(n * 1e4) / 1e4
}

/**
 * @param {object} args
 * @param {object} args.extract  parsed extractor files: recipes, collections, buildings, extractorRates, items, corporations
 * @param {object} args.idMap    committed id map (see scripts/data/id-map.json); not mutated
 * @param {object} [args.prev]   previous planner version { buildings, items, corporations } (parsed JSON), for curated fields
 * @returns {{ buildings: object[], items: object[], corporations: object, idMap: object, report: object }}
 */
export function convertGameData({ extract, idMap, prev }) {
  const map = structuredClone(idMap)
  map.carryForwardBuildings ??= []
  const report = {
    newItemIds: [],
    newBuildingIds: [],
    uncurated: [], // { kind, id, field, note }: new thing with no curated value
    missingFromExtract: [], // map entries whose asset is not in the extract
    extractorRateFallbacks: [],
    defaultedBuildTimes: [],
    skippedCraftingBuildings: [], // have a recipe collection but are not production buildings (food processor, item printer ...)
    skippedRecipes: [], // zero build time
  }
  const prevBuildings = new Map((prev?.buildings ?? []).map((b) => [b.id, b]))
  const prevItems = new Map((prev?.items ?? []).map((i) => [i.id, i]))
  const prevCorps = prev?.corporations ?? {}

  const recipeById = new Map(extract.recipes.map((r) => [r.id, r]))
  const collectionById = new Map(extract.collections.map((c) => [c.id, c]))
  const itemById = new Map(extract.items.map((i) => [i.id, i]))
  const buildingByAsset = new Map(extract.buildings.map((b) => [b.asset, b]))
  // first BD per DA config (several BDs share one DA)
  const buildingByConfig = new Map()
  for (const b of extract.buildings) {
    const key = assetName(b.configAsset)
    if (key && !buildingByConfig.has(key)) buildingByConfig.set(key, b)
  }

  // ---- ids -------------------------------------------------------------------------------
  const takenItemIds = new Set(Object.values(map.items))
  const takenBuildingIds = new Set(Object.values(map.buildings).concat(map.carryForwardBuildings))
  const itemId = (assetPath) => {
    const key = assetName(assetPath)
    if (!map.items[key]) {
      map.items[key] = uniqueSlug(key, takenItemIds)
      report.newItemIds.push(map.items[key])
    }
    return map.items[key]
  }

  // ---- buildings ---------------------------------------------------------------------------
  // New buildings are only added when they craft or extract; decoration and the rest stay out.
  const newConfigs = []
  for (const [config, b] of buildingByConfig) {
    if (map.buildings[config] || !producesRecipes(b)) continue
    const recs = b.recipeCollections.flatMap((p) => collectionById.get(assetName(p))?.recipes ?? []).map((p) => recipeById.get(assetName(p)))
    const timed = recs.length > 0 && recs.every((r) => r && r.buildTimeEffective > 0)
    const producing = b.isExtractor || ['ECrBuildingType::Crafting', 'ECrBuildingType::RawMaterialProcessing', 'ECrBuildingType::Extraction'].includes(b.type)
    // test/cut content has uiType Test and no corporation unlock; Tier2 variants have no unlock data either
    const released = b.uiType !== 'ECrBuildingUIType::Test' && ((b.unlockedBy ?? []).length > 0 || /Tier\d/.test(config))
    if (timed && producing && released) newConfigs.push(config)
    else report.skippedCraftingBuildings.push(assetName(b.id))
  }
  newConfigs.sort()
  for (const config of newConfigs) {
    const id = uniqueSlug(config, takenBuildingIds)
    map.buildings[config] = id
    map.buildingOrder.push(id)
    report.newBuildingIds.push(id)
  }

  // extractor rate rows grouped by the DA config of their building
  const ratesByConfig = new Map()
  for (const row of extract.extractorRates ?? []) {
    const bd = buildingByAsset.get(row.building)
    const config = bd ? assetName(bd.configAsset) : assetName(row.building)
    if (!ratesByConfig.has(config)) ratesByConfig.set(config, [])
    ratesByConfig.get(config).push(row)
  }
  // The planner has one rate per ore and extractor: the Impure rate (60 and 180 per minute for
  // the drills); buildings with a single rate row have that one.
  const pickRate = (rows, resource) => {
    const mine = rows.filter((r) => r.resource === resource)
    return mine.find((r) => String(r.purity).endsWith('Impure')) ?? mine[0]
  }

  const configById = Object.fromEntries(Object.entries(map.buildings).map(([c, id]) => [id, c]))

  const buildingsOut = []
  for (const id of map.buildingOrder) {
    const before = prevBuildings.get(id)
    if (map.carryForwardBuildings.includes(id)) {
      if (before) buildingsOut.push(structuredClone(before))
      else report.uncurated.push({ kind: 'building', id, field: '*', note: 'carry-forward-only building missing from --prev' })
      continue
    }
    const config = configById[id]
    const bd = buildingByConfig.get(config)
    if (!bd) {
      report.missingFromExtract.push({ kind: 'building', id, asset: config })
      continue
    }
    // base_core style entries (no power/heat/recipes in the planner file) are curated whole
    if (before && before.power === undefined && before.heat === undefined) {
      buildingsOut.push(structuredClone(before))
      continue
    }

    const out = { id, name: before?.name ?? bd.displayName }
    if (!before) {
      report.uncurated.push({ kind: 'building', id, field: 'name,type,upgrade', note: `new building, name from the game: "${bd.displayName}"` })
    }
    if (before?.upgrade) out.upgrade = before.upgrade
    out.type = before?.type ?? GAME_TYPE_TO_PLANNER[bd.type] ?? 'production'
    out.power = bd.power?.electricityValue ?? 0
    out.heat = bd.heat ?? 0
    if (before?.coreHeatCapacity !== undefined) out.coreHeatCapacity = before.coreHeatCapacity

    const collections = producesRecipes(bd) ? bd.recipeCollections : []
    if (collections.length > 0) {
      const rateRows = ratesByConfig.get(config)
      const recipes = []
      for (const colPath of collections) {
        const col = collectionById.get(assetName(colPath))
        if (!col) continue
        for (const recPath of col.recipes) {
          const rec = recipeById.get(assetName(recPath))
          if (!rec || !rec.output) continue
          if (!(rec.buildTimeEffective > 0)) {
            report.skippedRecipes.push(rec.id)
            continue
          }
          if (rec.buildTimeDefaulted) report.defaultedBuildTimes.push(rec.id)
          let outRate = ratePerMinute(rec.output.count, rec.buildTimeEffective)
          if (rateRows) {
            const row = pickRate(rateRows, rec.output.item)
            if (row) outRate = round4(row.perMinute)
            else report.extractorRateFallbacks.push({ building: id, recipe: rec.id })
          }
          recipes.push({
            output: { id: itemId(rec.output.item), amount_per_minute: outRate },
            inputs: rec.inputs.map((inp) => ({
              id: itemId(inp.item),
              amount_per_minute: ratePerMinute(inp.count, rec.buildTimeEffective),
            })),
          })
        }
      }
      out.recipes = carryRecipeCuration(recipes, before?.recipes ?? [])
    }
    buildingsOut.push(out)
  }

  // ---- corporations ------------------------------------------------------------------------
  const corpByAsset = new Map(extract.corporations.corporations.map((c) => [c.id, c]))
  const exporterRows = extract.corporations.componentPoints?.ExporterItemsDataTable ?? []
  const corporations = {}
  for (const [corpAssetId, corpSlug] of Object.entries(map.corporations)) {
    const corp = corpByAsset.get(corpAssetId)
    if (!corp) {
      report.missingFromExtract.push({ kind: 'corporation', id: corpSlug, asset: corpAssetId })
      continue
    }
    const before = prevCorps[corp.displayName]
    const column = corpColumn(corp.asset)
    const levels = corp.levels.map((lvl) => {
      const planLevel = lvl.Level
      const beforeLvl = before?.levels?.find((l) => l.level === planLevel)
      const components = exporterRows
        .filter((r) => r.Level === planLevel - 1 && r[column] > 0)
        .map((r) => ({ id: itemId(r.Item), points: r[column] }))
      let rewards = beforeLvl?.rewards
      if (!rewards) {
        rewards = [
          ...(lvl.BuildingRewards ?? []).map((p) => buildingByAsset.get(p)?.displayName ?? assetName(p)),
          ...(lvl.CollectionsForUI ?? []).map((p) => extract.corporations.buildingCollections?.[p]?.Name ?? assetName(p)),
        ].map((name) => ({ name }))
        report.uncurated.push({ kind: 'corporation', id: corpSlug, field: `level ${planLevel} rewards`, note: 'derived from the game, not curated' })
      }
      return { level: planLevel, xp: lvl.xp ?? lvl.ReputationRequired, components, rewards }
    })
    if (!before) report.uncurated.push({ kind: 'corporation', id: corpSlug, field: 'description', note: `game text used: "${corp.description}"` })
    corporations[corp.displayName] = {
      id: before?.id ?? corpSlug,
      description: before?.description ?? corp.description,
      levels,
    }
  }

  // ---- items (after buildings and corporations so every referenced item has an id) -------
  const assetById = Object.fromEntries(Object.entries(map.items).map(([a, id]) => [id, a]))
  const itemsOut = []
  for (const id of Object.keys(assetById).sort()) {
    const game = itemById.get(assetById[id])
    const before = prevItems.get(id)
    if (!game) {
      report.missingFromExtract.push({ kind: 'item', id, asset: assetById[id] })
      if (before) itemsOut.push({ ...before })
      continue
    }
    const gameName = game.displayName && !game.displayName.includes('MISSING STRING TABLE') ? game.displayName : undefined
    if (!before) {
      report.uncurated.push({ kind: 'item', id, field: 'type', note: `new item "${gameName ?? id}", type defaulted to "component"` })
    }
    itemsOut.push({ id, name: gameName ?? before?.name ?? id, type: before?.type ?? 'component' })
  }

  // the committed catalog order is hand-kept: previous order first, new items after it by display name
  const prevIndex = new Map((prev?.items ?? []).map((i, n) => [i.id, n]))
  const rankOf = (i) => prevIndex.get(i.id) ?? Number.MAX_SAFE_INTEGER
  itemsOut.sort((a, b) => rankOf(a) - rankOf(b) || a.name.localeCompare(b.name, 'en') || (a.id < b.id ? -1 : 1))

  return { buildings: buildingsOut, items: itemsOut, corporations, idMap: map, report }
}

/** Planner JSON text: 2-space indent, CRLF line endings, trailing newline (as the committed files). */
export function toPlannerJson(value) {
  return `${JSON.stringify(value, null, 2).replace(/\n/g, '\r\n')}\r\n`
}
