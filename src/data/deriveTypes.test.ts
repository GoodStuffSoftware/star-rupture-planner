import { describe, it, expect } from 'vitest'
import { deriveBuildingType, deriveItemType, itemFacts } from '../../scripts/lib/deriveTypes.mjs'

const I = (n: string) => `/Game/Chimera/Items/I_${n}`
const item = (n: string, extra: Record<string, unknown> = {}) => ({
  id: `I_${n}`,
  asset: I(n),
  uniqueItemName: n,
  parentClass: 'CrResourceItemBase',
  uiItemType: 'EUIItemType::Resource',
  ...extra,
})

// Ore -> (smelter) Bar -> (assembler) Gear; Fuel = ore + water in a pressurizer; Mat = ore, crafted in a smelter.
const extract = {
  recipes: [
    { id: 'CR_Ore', output: { item: I('Ore'), count: 1 }, inputs: [] },
    { id: 'CR_Water', output: { item: I('Water'), count: 1 }, inputs: [] },
    { id: 'CR_Bar', output: { item: I('Bar'), count: 1 }, inputs: [{ item: I('Ore'), count: 1 }] },
    {
      id: 'CR_Gear',
      output: { item: I('Gear'), count: 1 },
      inputs: [{ item: I('Bar'), count: 1 }],
    },
    {
      id: 'CR_Fuel',
      output: { item: I('Fuel'), count: 1 },
      inputs: [
        { item: I('Ore'), count: 1 },
        { item: I('Water'), count: 1 },
      ],
    },
    { id: 'CR_Mat', output: { item: I('Mat'), count: 1 }, inputs: [{ item: I('Ore'), count: 2 }] },
  ],
  collections: [
    { id: 'CRC_Drill', recipes: ['/x/CR_Ore', '/x/CR_Water'] },
    { id: 'CRC_Smelter', recipes: ['/x/CR_Bar', '/x/CR_Mat'] },
    { id: 'CRC_Assembler', recipes: ['/x/CR_Gear'] },
    { id: 'CRC_Pressurizer', recipes: ['/x/CR_Fuel'] },
  ],
  buildings: [
    {
      id: 'BD_Drill',
      type: 'ECrBuildingType::Extraction',
      isExtractor: true,
      recipeCollections: ['/x/CRC_Drill'],
    },
    {
      id: 'BD_Smelter',
      type: 'ECrBuildingType::RawMaterialProcessing',
      recipeCollections: ['/x/CRC_Smelter'],
    },
    {
      id: 'BD_Assembler',
      type: 'ECrBuildingType::Crafting',
      recipeCollections: ['/x/CRC_Assembler'],
    },
    {
      id: 'BD_Pressurizer',
      type: 'ECrBuildingType::TemperatureManagement',
      recipeCollections: ['/x/CRC_Pressurizer'],
    },
  ],
}
const facts = itemFacts(extract)
const ore = { parentClass: 'CrGoldOre' }

describe('deriveItemType', () => {
  it('an extractor output of the ore class is raw', () => {
    expect(deriveItemType(item('Ore', ore), facts)).toBe('raw')
  })
  it('an ore-class resource no extractor yields is a (building) material', () => {
    expect(deriveItemType(item('Mat', ore), facts)).toBe('material')
  })
  it('a smelted item made from extractor outputs only is processed', () => {
    expect(deriveItemType(item('Bar'), facts)).toBe('processed')
  })
  it('an item made from a crafted one is a component', () => {
    expect(deriveItemType(item('Gear'), facts)).toBe('component')
  })
  it('an item made in a non-smelting building is a component even from raw inputs', () => {
    expect(deriveItemType(item('Fuel'), facts)).toBe('component')
  })
  it('a plain item of the ammo folder, or named Ammo, is ammo', () => {
    expect(
      deriveItemType(
        { id: 'I_X', asset: '/Game/Chimera/Weapons/AmmoTypes/I_X', parentClass: 'CrItemDataBase' },
        facts,
      ),
    ).toBe('ammo')
    expect(
      deriveItemType(
        { id: 'I_P', asset: I('P'), uniqueItemName: 'PistolAmmo', parentClass: 'CrItemDataBase' },
        facts,
      ),
    ).toBe('ammo')
  })
  it('an unknown item is a component', () => {
    expect(deriveItemType(item('Whatever'), facts)).toBe('component')
  })
})

describe('deriveBuildingType', () => {
  const t = (type: string, extra: Record<string, unknown> = {}) =>
    deriveBuildingType({ type, ...extra })
  it('maps the game building types', () => {
    expect(t('ECrBuildingType::Crafting')).toBe('production')
    expect(t('ECrBuildingType::RawMaterialProcessing')).toBe('production')
    expect(t('ECrBuildingType::Extraction')).toBe('production')
    expect(t('ECrBuildingType::Power')).toBe('generator')
    expect(t('ECrBuildingType::Defensive')).toBe('defense')
    expect(t('ECrBuildingType::Habitat')).toBe('habitat')
    expect(t('ECrBuildingType::Transport')).toBe('transport')
  })
  it('splits the types that share one game type by uiType, uiSubType and name', () => {
    expect(
      t('ECrBuildingType::TemperatureManagement', { uiType: 'ECrBuildingUIType::Producing' }),
    ).toBe('production')
    expect(
      t('ECrBuildingType::TemperatureManagement', { uiType: 'ECrBuildingUIType::Defensive' }),
    ).toBe('temperature')
    expect(t('ECrBuildingType::Habitat', { uiSubType: 'ECrBuildingUISubType::BaseCore' })).toBe(
      'core',
    )
    expect(
      t('ECrBuildingType::Transport', {
        configAsset: '/b/DA_UniversalStorage.DA_UniversalStorage',
      }),
    ).toBe('storage')
  })
  it('falls back to production for an unknown game type', () => {
    expect(t('ECrBuildingType::Brand')).toBe('production')
  })
})
