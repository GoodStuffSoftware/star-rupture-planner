import type { CraftNode, Item, Totals, VersionOverrides } from '../types/game'
import { pickProducer, getCandidates, type ProducerEntry } from './recipeIndex'

export interface ResolverContext {
  itemsById: Map<string, Item>
  producerIndex: Map<string, ProducerEntry[]>
  fullProducerIndex: Map<string, ProducerEntry[]>
  overrides: VersionOverrides
}

function _resolve(
  itemId: string,
  ratePerMin: number,
  ctx: ResolverContext,
  ancestry: Set<string>,
  depth: number,
): CraftNode {
  const item = ctx.itemsById.get(itemId)
  const node: CraftNode = {
    itemId,
    itemName: item?.name ?? itemId,
    itemType: item?.type ?? 'component',
    ratePerMin,
    isRaw: false,
    isCycle: false,
    children: [],
  }

  // Determine producer: check override first, fall back to global default
  let producer: ProducerEntry | undefined
  const ovId = ctx.overrides[itemId]
  if (ovId) {
    producer = ctx.fullProducerIndex.get(itemId)?.find((e) => e.building.id === ovId)
  }
  if (!producer) {
    producer = pickProducer(itemId, ctx.producerIndex)
  }
  node.isOverridden = !!(ovId && producer && producer.building.id === ovId)

  // Set candidates from the full index so UI can show all options
  node.candidates = getCandidates(itemId, ctx.fullProducerIndex)

  if (!producer) {
    node.isRaw = true
    return node // no recipe -> raw leaf
  }

  node.building = producer.building
  node.recipe = producer.recipe
  const outRate = producer.recipe.output.amount_per_minute
  node.buildingsNeeded = outRate > 0 ? ratePerMin / outRate : 0

  if (producer.recipe.inputs.length === 0) {
    node.isRaw = true
    return node // extractor -> leaf
  }

  if (ancestry.has(itemId) || depth > 50) {
    node.isCycle = true
    return node // guard: stop, do not recurse
  }

  const nextAncestry = new Set(ancestry)
  nextAncestry.add(itemId)

  for (const input of producer.recipe.inputs) {
    const childRate = (node.buildingsNeeded ?? 0) * input.amount_per_minute
    node.children.push(_resolve(input.id, childRate, ctx, nextAncestry, depth + 1))
  }

  return node
}

export function resolveTree(
  itemId: string,
  ratePerMin: number,
  ctx: ResolverContext,
): CraftNode {
  return _resolve(itemId, ratePerMin, ctx, new Set(), 0)
}

export interface TotalsOptions {
  showExtractors: boolean
}

export function aggregateTotals(root: CraftNode, opts: TotalsOptions = { showExtractors: false }): Totals {
  const rawMap = new Map<string, { itemName: string; ratePerMin: number }>()
  const buildingMap = new Map<string, { buildingName: string; count: number }>()
  let totalPower = 0
  let totalHeat = 0

  function walk(node: CraftNode) {
    if (node.isRaw) {
      const existing = rawMap.get(node.itemId)
      if (existing) {
        existing.ratePerMin += node.ratePerMin
      } else {
        rawMap.set(node.itemId, { itemName: node.itemName, ratePerMin: node.ratePerMin })
      }
    }

    // Include building in totals when:
    // - node has a building and buildingsNeeded
    // - AND either it is NOT a raw node, OR showExtractors is on (for extractor machines)
    if (
      node.building &&
      node.buildingsNeeded !== undefined &&
      (!node.isRaw || opts.showExtractors)
    ) {
      const existing = buildingMap.get(node.building.id)
      if (existing) {
        existing.count += node.buildingsNeeded
      } else {
        buildingMap.set(node.building.id, {
          buildingName: node.building.name,
          count: node.buildingsNeeded,
        })
      }
      totalPower += node.buildingsNeeded * (node.building.power ?? 0)
      totalHeat += node.buildingsNeeded * (node.building.heat ?? 0)
    }

    for (const child of node.children) {
      walk(child)
    }
  }

  walk(root)

  const rawMaterials = [...rawMap.entries()]
    .map(([itemId, v]) => ({ itemId, itemName: v.itemName, ratePerMin: v.ratePerMin }))
    .sort((a, b) => b.ratePerMin - a.ratePerMin)

  const buildings = [...buildingMap.entries()]
    .map(([buildingId, v]) => ({
      buildingId,
      buildingName: v.buildingName,
      count: v.count,
      ceilCount: Math.ceil(v.count),
    }))
    .sort((a, b) => b.count - a.count)

  return { rawMaterials, buildings, totalPower, totalHeat }
}
