export interface ItemFacts {
  extracted: Set<string>
  producers: Map<string, Set<string>>
  rawOnly: Set<string>
}
export function itemFacts(extract: { recipes: any[]; collections: any[]; buildings: any[] }): ItemFacts
export function deriveItemType(game: Record<string, any>, facts: ItemFacts): 'raw' | 'processed' | 'component' | 'material' | 'ammo'
export function deriveBuildingType(bd: Record<string, any>): string
