// Derives the planner's item type and building type from game fields in the raw extract, so a brand-new item or
// building comes out complete without manual curation. A curated value (carried forward from --prev) always wins:
// the converter only calls these for ids that --prev does not hold.
//
// Vocabulary: item  raw | processed | component | material | ammo   (src/types/game.ts ItemType)
//             building  production | temperature | defense | generator | habitat | transport | storage | core
//
// Measured against every item and building of public/game-data/update2_QoL (curated by hand) with the build-2
// extract: see the PR description. Pure: no I/O.

const nameOf = (path) => (typeof path === 'string' ? (path.split('/').pop() ?? '').split('.')[0] : '')

const RAW_ORE_PARENT = 'CrGoldOre' // ores and building materials; the valuables of the story share it but have no recipe
const SMELTING = 'ECrBuildingType::RawMaterialProcessing'

/**
 * What the recipes say about every item: which items an extractor outputs, which building types make each item, and
 * which items are made from extractor outputs only. Built once per extract.
 * @param {{ recipes: object[], collections: object[], buildings: object[] }} extract
 * @returns {{ extracted: Set<string>, producers: Map<string, Set<string>>, rawOnly: Set<string> }}  keys are item asset paths
 */
export function itemFacts(extract) {
  const recipeById = new Map(extract.recipes.map((r) => [r.id, r]))
  const collectionById = new Map(extract.collections.map((c) => [c.id, c]))
  const extracted = new Set()
  const producers = new Map()
  const madeBy = []
  for (const b of extract.buildings) {
    for (const colPath of b.recipeCollections ?? []) {
      for (const recPath of collectionById.get(nameOf(colPath))?.recipes ?? []) {
        const rec = recipeById.get(nameOf(recPath))
        if (!rec?.output) continue
        if (b.isExtractor) extracted.add(rec.output.item)
        if (!producers.has(rec.output.item)) producers.set(rec.output.item, new Set())
        producers.get(rec.output.item).add(b.type)
        madeBy.push(rec)
      }
    }
  }
  // "made from raw only": some recipe whose every input is an extractor output
  const rawOnly = new Set()
  for (const rec of madeBy) {
    if (rec.inputs?.length > 0 && rec.inputs.every((i) => extracted.has(i.item))) rawOnly.add(rec.output.item)
  }
  return { extracted, producers, rawOnly }
}

/**
 * @param {object} game  the raw item (items.json entry: asset, parentClass, uiItemType, uniqueItemName)
 * @param {ReturnType<typeof itemFacts>} facts
 * @returns {'raw'|'processed'|'component'|'material'|'ammo'}
 */
export function deriveItemType(game, facts) {
  // ammo is a plain item (no UI resource type) of the weapons folder
  if (!game.uiItemType && (/\/AmmoTypes\//.test(game.asset ?? '') || /Ammo/.test(game.uniqueItemName ?? ''))) return 'ammo'
  if (game.parentClass === RAW_ORE_PARENT) {
    // an ore is what an extractor yields; the other resources of that class (building materials) are crafted
    return facts.extracted.has(game.asset) ? 'raw' : 'material'
  }
  // a bar or block: made in a smelting building only, from extractor outputs alone
  const makers = facts.producers.get(game.asset)
  if (facts.rawOnly.has(game.asset) && makers && [...makers].every((t) => t === SMELTING)) return 'processed'
  return 'component'
}

/**
 * @param {object} bd  the raw building (type, uiType, uiSubType, isExtractor, configAsset)
 * @returns {string} the planner building type
 */
export function deriveBuildingType(bd) {
  switch (bd.type) {
    case 'ECrBuildingType::Crafting':
    case 'ECrBuildingType::RawMaterialProcessing':
    case 'ECrBuildingType::Extraction':
      return 'production'
    case 'ECrBuildingType::Power':
      return 'generator'
    case 'ECrBuildingType::Defensive':
      return 'defense'
    case 'ECrBuildingType::Habitat':
      return bd.uiSubType === 'ECrBuildingUISubType::BaseCore' ? 'core' : 'habitat'
    case 'ECrBuildingType::TemperatureManagement':
      // the pressurizer and refinery are listed under production; the coolers are the temperature buildings
      return bd.uiType === 'ECrBuildingUIType::Producing' ? 'production' : 'temperature'
    case 'ECrBuildingType::Transport':
      return /Storage|Redistributor/.test(nameOf(bd.configAsset)) ? 'storage' : 'transport'
    default:
      return 'production' // what the converter used for an unknown game type before
  }
}
