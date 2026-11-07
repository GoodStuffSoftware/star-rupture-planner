// Turns the game-extract PNG icons into the planner's WebP icons (public/icons/<kind>/<id>.webp).
// planIcons() is pure; writeIcons() does the file I/O with sharp.
//
// Naming follows the committed set: the file is named by planner id, in "items" or "buildings".
// Extractor PNGs are named by texture ("T_Accumulator_Icon.png"); item.icon / building.icon give
// the texture, and scripts/data/id-map.json maps game assets to planner ids.
import fs from 'node:fs'
import path from 'node:path'
import { assetName } from './convertGameData.mjs'

// Lossy quality close to the committed upstream set (measured in glue.md); alpha stays lossless.
export const WEBP_OPTIONS = { quality: 90, alphaQuality: 100, effort: 6 }

/**
 * Which PNG becomes which planner icon.
 * `ids` ({ items, buildings }: Sets of planner ids) restricts the plan to those ids; undefined = every id in the map.
 * Returns { icons: [{ kind, id, texture }], missing: [{ kind, id, asset, why }] }.
 */
export function planIcons({ extract, idMap, ids }) {
  const icons = []
  const missing = []
  const itemByName = new Map(extract.items.map((i) => [assetName(i.asset ?? i.id), i]))
  for (const [key, id] of Object.entries(idMap.items)) {
    if (ids && !ids.items.has(id)) continue
    const item = itemByName.get(key)
    const texture = item?.icon ? assetName(item.icon) : ''
    if (!texture) missing.push({ kind: 'items', id, asset: key, why: item ? 'no icon texture' : 'not in extract' })
    else icons.push({ kind: 'items', id, texture })
  }
  // several BDs share one DA config; the first one with an icon wins (same rule as the converter's first-BD pick)
  const buildingByConfig = new Map()
  for (const b of extract.buildings) {
    const key = assetName(b.configAsset)
    if (key && b.icon && !buildingByConfig.has(key)) buildingByConfig.set(key, b)
  }
  for (const [key, id] of Object.entries(idMap.buildings)) {
    if (ids && !ids.buildings.has(id)) continue
    const b = buildingByConfig.get(key)
    const texture = b?.icon ? assetName(b.icon) : ''
    if (!texture) missing.push({ kind: 'buildings', id, asset: key, why: b ? 'no icon texture' : 'not in extract' })
    else icons.push({ kind: 'buildings', id, texture })
  }
  return { icons, missing }
}

/** Planner ids present in the converted catalog (the converter's result.items / result.buildings). */
export function catalogIds({ items, buildings }) {
  return { items: new Set(items.map((i) => i.id)), buildings: new Set(buildings.map((b) => b.id)) }
}

/**
 * Converts the planned PNGs to WebP under outDir/<kind>/<id>.webp.
 * overwrite=false keeps files that already exist. Returns { written, kept, noPng }.
 */
export async function writeIcons({ plan, extractDir, outDir, overwrite = true }) {
  // loaded on demand (keeps the pure planIcons importable where the native sharp binary is not wanted)
  const sharpModule = 'sharp'
  const { default: sharp } = await import(sharpModule)
  const written = []
  const kept = []
  const noPng = []
  for (const ic of plan.icons) {
    const src = path.join(extractDir, 'icons', ic.kind, `${ic.texture}.png`)
    const dest = path.join(outDir, ic.kind, `${ic.id}.webp`)
    if (!fs.existsSync(src)) {
      noPng.push({ ...ic, src })
      continue
    }
    if (!overwrite && fs.existsSync(dest)) {
      kept.push(ic)
      continue
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    await sharp(src).webp(WEBP_OPTIONS).toFile(dest)
    written.push(ic)
  }
  return { written, kept, noPng }
}
