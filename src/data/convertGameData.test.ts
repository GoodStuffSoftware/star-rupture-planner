import { describe, it, expect } from 'vitest'
import { catalogIds, planIcons } from '../../scripts/lib/convertIcons.mjs'
import {
  assetName,
  carryRecipeCuration,
  convertGameData,
  ratePerMinute,
  slugify,
  toPlannerJson,
  uniqueSlug,
  type IdMap,
  type PlannerRecipe,
} from '../../scripts/lib/convertGameData.mjs'
import { compareData } from '../../scripts/data-parity.mjs'

// Small hand-written fixtures: not game files.
const I = (name: string) => `/Game/Chimera/Items/I_${name}`

function fixtureExtract() {
  return {
    recipes: [
      {
        id: 'CR_Gear',
        output: { item: I('Gear'), count: 2 },
        inputs: [{ item: I('Bar'), count: 1 }],
        buildTimeEffective: 4,
      },
      {
        id: 'CR_Slow',
        output: { item: I('Plate'), count: 1 },
        inputs: [{ item: I('Bar'), count: 3 }],
        buildTimeEffective: 10,
        buildTimeDefaulted: true,
      },
      {
        id: 'CR_Printer',
        output: { item: I('Gear'), count: 1 },
        inputs: [],
        buildTimeEffective: 0,
      },
      { id: 'CR_OreA', output: { item: I('Ore'), count: 4 }, inputs: [], buildTimeEffective: 2 },
    ],
    collections: [
      { id: 'CRC_Assembler', recipes: ['/x/CR_Gear', '/x/CR_Slow', '/x/CR_Printer'] },
      { id: 'CRC_Drill', recipes: ['/x/CR_OreA'] },
      { id: 'CRC_Exporter', recipes: ['/x/CR_Gear'] },
      { id: 'CRC_Press', recipes: ['/x/CR_Gear'] },
    ],
    buildings: [
      {
        id: 'BD_Assembler',
        asset: '/b/BD_Assembler',
        configAsset: '/b/DA_Assembler',
        displayName: 'Assembler',
        type: 'ECrBuildingType::Crafting',
        uiType: 'ECrBuildingUIType::Producing',
        isExtractor: false,
        power: { electricityValue: 60 },
        heat: 150,
        crafting: { RecipeCollection: '/x/CRC_Assembler' },
        recipeCollections: ['/x/CRC_Assembler'],
      },
      {
        id: 'BD_Drill',
        asset: '/b/BD_Drill',
        configAsset: '/b/DA_Drill',
        displayName: 'Drill',
        type: 'ECrBuildingType::Extraction',
        isExtractor: true,
        power: { electricityValue: 5 },
        heat: 3,
        crafting: { RecipeCollection: '/x/CRC_Drill' },
        recipeCollections: ['/x/CRC_Drill'],
      },
      {
        id: 'BD_Exporter',
        asset: '/b/BD_Exporter',
        configAsset: '/b/DA_Exporter',
        displayName: 'Exporter',
        type: 'ECrBuildingType::Transport',
        isExtractor: false,
        power: { electricityValue: 10 },
        heat: 5,
        crafting: { RecipeCollection: '/x/CRC_Exporter' },
        recipeCollections: ['/x/CRC_Exporter'],
      },
      // new, released production building: auto-added with a slug
      {
        id: 'BD_PressTier2',
        asset: '/b/BD_PressTier2',
        configAsset: '/b/DA_PressTier2',
        displayName: 'Press v2',
        type: 'ECrBuildingType::RawMaterialProcessing',
        uiType: 'ECrBuildingUIType::Producing',
        isExtractor: false,
        power: { electricityValue: 1 },
        heat: 2,
        unlockedBy: [{ corporation: 'CD_X', level: 2 }],
        crafting: { RecipeCollection: '/x/CRC_Press' },
        recipeCollections: ['/x/CRC_Press'],
      },
      // test content is never added
      {
        id: 'BD_TestRig',
        asset: '/b/BD_TestRig',
        configAsset: '/b/DA_TestRig',
        displayName: 'Test Rig',
        type: 'ECrBuildingType::Crafting',
        uiType: 'ECrBuildingUIType::Test',
        isExtractor: false,
        crafting: { RecipeCollection: '/x/CRC_Press' },
        recipeCollections: ['/x/CRC_Press'],
      },
    ],
    extractorRates: [
      {
        building: '/b/BD_Drill',
        resource: I('Ore'),
        purity: 'EOrePurityLevel::Regular',
        perMinute: 120,
      },
      {
        building: '/b/BD_Drill',
        resource: I('Ore'),
        purity: 'EOrePurityLevel::Impure',
        perMinute: 60,
      },
    ],
    items: [
      { id: 'I_Gear', displayName: 'Gear' },
      { id: 'I_Bar', displayName: 'Bar' },
      { id: 'I_Plate', displayName: 'Plate' },
      { id: 'I_Ore', displayName: 'Ore' },
      { id: 'I_Cut', displayName: '<MISSING STRING TABLE ENTRY>' },
      { id: 'I_Brand', displayName: 'Brand New' },
    ],
    corporations: {
      corporations: [
        {
          id: 'CD_FooCorp',
          asset: '/c/CD_FooCorp',
          displayName: 'Foo Corp',
          description: 'Game text',
          levels: [
            { Level: 1, ReputationRequired: 0, xp: 0, BuildingRewards: [], CollectionsForUI: [] },
            {
              Level: 2,
              ReputationRequired: 200,
              xp: 200,
              BuildingRewards: ['/b/BD_Assembler'],
              CollectionsForUI: [],
            },
          ],
        },
      ],
      componentPoints: {
        ExporterItemsDataTable: [
          { Item: I('Bar'), Level: 1, FooValue: 3, OtherValue: 9 },
          { Item: I('Gear'), Level: 1, FooValue: 0, OtherValue: 4 },
          { Item: I('Brand'), Level: 5, FooValue: 7 },
        ],
      },
      buildingCollections: {},
    },
  }
}

function fixtureMap(): IdMap {
  return {
    buildingOrder: ['assembler', 'drill'],
    carryForwardBuildings: [],
    buildings: { DA_Assembler: 'assembler', DA_Drill: 'drill', DA_Exporter: 'exporter' },
    items: { I_Gear: 'gear', I_Bar: 'bar_metal', I_Plate: 'plate', I_Ore: 'ore_x', I_Cut: 'cut' },
    corporations: { CD_FooCorp: 'foo' },
  }
}

describe('ids and rates', () => {
  it('takes the asset name from a package path, with or without object suffix', () => {
    expect(assetName('/Game/Chimera/Items/I_Gear')).toBe('I_Gear')
    expect(assetName('/Game/X/DA_Y.DA_Y')).toBe('DA_Y')
  })

  it('slugifies deterministically', () => {
    expect(slugify('I_Anti-RadiationCovers')).toBe('anti_radiationcovers')
    expect(slugify('DA_CrafterTier2')).toBe('craftertier2')
    expect(slugify('I_Wolfram Ore!')).toBe('wolfram_ore')
  })

  it('never reuses a taken slug', () => {
    const taken = new Set(['gear'])
    expect(uniqueSlug('I_Gear', taken)).toBe('gear_2')
    expect(uniqueSlug('I_GEAR', taken)).toBe('gear_3')
    expect(taken.has('gear_3')).toBe(true)
  })

  it('computes Count x 60 / BuildTime without float noise', () => {
    expect(ratePerMinute(1, 6)).toBe(10)
    expect(ratePerMinute(2, 4)).toBe(30)
    expect(ratePerMinute(1, 8)).toBe(7.5)
    expect(ratePerMinute(1, 7)).toBe(8.5714)
    expect(() => ratePerMinute(1, 0)).toThrow()
  })
})

describe('convertGameData', () => {
  it('converts recipes, power, heat and extractor rates in the planner shape', () => {
    const { buildings } = convertGameData({ extract: fixtureExtract(), idMap: fixtureMap() })
    const assembler = buildings.find((b) => b.id === 'assembler')!
    expect(Object.keys(assembler)).toEqual(['id', 'name', 'type', 'power', 'heat', 'recipes'])
    expect(assembler.power).toBe(60)
    expect(assembler.heat).toBe(150)
    // zero-build-time (instant) recipes are not planner recipes; the 10 s default gives 6 and 18
    expect(assembler.recipes).toEqual([
      {
        output: { id: 'gear', amount_per_minute: 30 },
        inputs: [{ id: 'bar_metal', amount_per_minute: 15 }],
      },
      {
        output: { id: 'plate', amount_per_minute: 6 },
        inputs: [{ id: 'bar_metal', amount_per_minute: 18 }],
      },
    ])
    // extractors use the Impure rate, not Count x 60 / BuildTime
    const drill = buildings.find((b) => b.id === 'drill')!
    expect(drill.recipes).toEqual([{ output: { id: 'ore_x', amount_per_minute: 60 }, inputs: [] }])
  })

  it('lists no recipes for transport buildings that merely reference a collection', () => {
    const { buildings } = convertGameData({ extract: fixtureExtract(), idMap: fixtureMap() })
    expect(buildings.some((b) => b.id === 'exporter')).toBe(false)
  })

  it('assigns a slug to a new released production building and skips test content', () => {
    const { idMap, report, buildings } = convertGameData({
      extract: fixtureExtract(),
      idMap: fixtureMap(),
    })
    expect(report.newBuildingIds).toEqual(['presstier2'])
    expect(idMap.buildings.DA_PressTier2).toBe('presstier2')
    expect(idMap.buildingOrder).toEqual(['assembler', 'drill', 'presstier2'])
    expect(report.skippedCraftingBuildings).toContain('BD_TestRig')
    expect(buildings.find((b) => b.id === 'presstier2')?.type).toBe('production')
    expect(report.uncurated.some((u) => u.id === 'presstier2')).toBe(true)
  })

  it('keeps existing ids stable and does not mutate the input map', () => {
    const map = fixtureMap()
    const before = JSON.stringify(map)
    const first = convertGameData({ extract: fixtureExtract(), idMap: map })
    expect(JSON.stringify(map)).toBe(before)
    const second = convertGameData({ extract: fixtureExtract(), idMap: first.idMap })
    expect(second.idMap).toEqual(first.idMap)
    expect(second.report.newItemIds).toEqual([])
    expect(first.idMap.items.I_Bar).toBe('bar_metal')
  })

  it('carries curated fields from --prev and reports new items without a curated value', () => {
    const prev = {
      buildings: [
        {
          id: 'assembler',
          name: 'Assembly Line',
          type: 'production',
          upgrade: 'drill',
          power: 0,
          heat: 0,
        },
      ],
      items: [{ id: 'gear', name: 'Gear (old)', type: 'component' }],
    }
    const { buildings, items, report } = convertGameData({
      extract: fixtureExtract(),
      idMap: fixtureMap(),
      prev,
    })
    const assembler = buildings.find((b) => b.id === 'assembler')!
    expect(assembler.name).toBe('Assembly Line')
    expect(assembler.upgrade).toBe('drill')
    expect(Object.keys(assembler)).toEqual([
      'id',
      'name',
      'upgrade',
      'type',
      'power',
      'heat',
      'recipes',
    ])
    expect(assembler.power).toBe(60) // game numbers always win
    // names come from the game; types are curated and default to component when unknown
    expect(items.find((i) => i.id === 'gear')).toEqual({
      id: 'gear',
      name: 'Gear',
      type: 'component',
    })
    expect(items.find((i) => i.id === 'plate')?.type).toBe('component')
    expect(report.uncurated.some((u) => u.kind === 'item' && u.id === 'plate')).toBe(true)
  })

  it('falls back to the previous name when the game name is a missing string table entry', () => {
    const prev = { items: [{ id: 'cut', name: 'Cut Item', type: 'material' }] }
    const { items } = convertGameData({ extract: fixtureExtract(), idMap: fixtureMap(), prev })
    expect(items.find((i) => i.id === 'cut')).toEqual({
      id: 'cut',
      name: 'Cut Item',
      type: 'material',
    })
  })

  it('adds an unmapped item referenced by a recipe', () => {
    const extract = fixtureExtract()
    extract.recipes[0].inputs.push({ item: I('Brand'), count: 1 })
    const { idMap, report } = convertGameData({ extract, idMap: fixtureMap() })
    expect(idMap.items.I_Brand).toBe('brand')
    expect(report.newItemIds).toContain('brand')
  })

  it('reports map entries missing from the extract', () => {
    const extract = fixtureExtract()
    extract.items = extract.items.filter((i) => i.id !== 'I_Plate')
    const { report } = convertGameData({ extract, idMap: fixtureMap() })
    expect(report.missingFromExtract).toContainEqual({
      kind: 'item',
      id: 'plate',
      asset: 'I_Plate',
    })
  })

  it('maps corporation levels: xp, points from the level-1 rows, derived rewards', () => {
    const { corporations, report } = convertGameData({
      extract: fixtureExtract(),
      idMap: fixtureMap(),
    })
    const foo = corporations['Foo Corp']
    expect(foo.id).toBe('foo')
    expect(foo.levels[0]).toEqual({ level: 1, xp: 0, components: [], rewards: [] })
    // planner level 2 = table rows with Level 1; zero-value rows are left out
    expect(foo.levels[1]).toEqual({
      level: 2,
      xp: 200,
      components: [{ id: 'bar_metal', points: 3 }],
      rewards: [{ name: 'Assembler' }],
    })
    expect(
      report.uncurated.some((u) => u.kind === 'corporation' && u.field.includes('rewards')),
    ).toBe(true)
  })
})

describe('recipe curation carry-forward', () => {
  const r = (out: string, ins: string[], extra: Record<string, string> = {}): PlannerRecipe => ({
    ...extra,
    output: { id: out, amount_per_minute: 1 },
    inputs: ins.map((id) => ({ id, amount_per_minute: 1 })),
  })

  it('keeps the previous order and the id/variant keys, with the previous key order', () => {
    const game = [r('b', ['x']), r('a', ['y']), r('a', ['z'])]
    const prev = [
      r('a', ['z'], { variant: 'alternative' }),
      r('a', ['y']),
      r('b', ['x'], { id: 'b_v2' }),
    ]
    const out = carryRecipeCuration(game, prev)
    expect(out.map((x) => x.output.id + x.inputs[0].id)).toEqual(['az', 'ay', 'bx'])
    expect(Object.keys(out[0])).toEqual(['variant', 'output', 'inputs'])
    expect(out[2].id).toBe('b_v2')
  })

  it('appends recipes the previous version did not have, in game order', () => {
    const out = carryRecipeCuration([r('n', ['q']), r('a', ['y'])], [r('a', ['y'])])
    expect(out.map((x) => x.output.id)).toEqual(['a', 'n'])
  })
})

describe('output format and parity comparison', () => {
  it('writes 2-space JSON with CRLF line endings and a trailing newline', () => {
    expect(toPlannerJson([{ id: 'a' }])).toBe('[\r\n  {\r\n    "id": "a"\r\n  }\r\n]\r\n')
  })

  it('puts a rate difference into class B and a name difference into class C', () => {
    const planner = {
      buildings: [
        {
          id: 'a',
          name: 'Alpha',
          type: 'production',
          power: 5,
          heat: 1,
          recipes: [{ output: { id: 'g', amount_per_minute: 10 }, inputs: [] }],
        },
      ],
      items: [{ id: 'g', name: 'Gear', type: 'component' }],
      corporations: {},
    }
    const game = {
      buildings: [
        {
          id: 'a',
          name: 'Alpha v1',
          type: 'production',
          power: 5,
          heat: 1,
          recipes: [{ output: { id: 'g', amount_per_minute: 12 }, inputs: [] }],
        },
      ],
      items: [{ id: 'g', name: 'Gear', type: 'component' }],
      corporations: {},
    }
    const { A, B, C } = compareData(game, planner)
    expect(A).toEqual([])
    expect(B).toHaveLength(1)
    expect(B[0]).toContain('planner 10, game 12')
    expect(C.some((x: string) => x.includes('Alpha v1'))).toBe(true)
  })

  it('flags an item that is in the planner but not in the converted data as class A', () => {
    const planner = {
      buildings: [],
      items: [{ id: 'g', name: 'Gear', type: 'component' }],
      corporations: {},
    }
    const { A } = compareData({ buildings: [], items: [], corporations: {} }, planner)
    expect(A).toHaveLength(1)
  })
})

describe('planIcons', () => {
  const extract = {
    items: [
      { id: 'I_Foo', asset: '/Game/Items/I_Foo', icon: '/Game/UI/T_Foo_Icon' },
      { id: 'I_Bar', asset: '/Game/Items/I_Bar', icon: '/Game/UI/T_Bar_Icon' },
      { id: 'I_NoIcon', asset: '/Game/Items/I_NoIcon' },
    ],
    buildings: [
      { configAsset: '/Game/B/DA_Maker', icon: '/Game/UI/T_Maker_Icon' },
      { configAsset: '/Game/B/DA_Maker', icon: '/Game/UI/T_MakerVariant_Icon' },
    ],
  }
  const idMap = {
    items: { I_Foo: 'foo', I_Bar: 'bar', I_NoIcon: 'noicon', I_Gone: 'gone' },
    buildings: { DA_Maker: 'maker', DA_Unknown: 'unknown' },
  }

  it('names icons by planner id and texture, first building per config', () => {
    const { icons, missing } = planIcons({ extract, idMap })
    expect(icons).toContainEqual({ kind: 'items', id: 'foo', texture: 'T_Foo_Icon' })
    expect(icons).toContainEqual({ kind: 'buildings', id: 'maker', texture: 'T_Maker_Icon' })
    expect(missing.map((m) => `${m.kind}/${m.id}`).sort()).toEqual([
      'buildings/unknown',
      'items/gone',
      'items/noicon',
    ])
  })

  it('writes only ids in the converted catalog when asked', () => {
    const ids = catalogIds({
      items: [{ id: 'foo', name: 'Foo', type: 'component' }],
      buildings: [],
    })
    const { icons, missing } = planIcons({ extract, idMap, ids })
    expect(icons).toEqual([{ kind: 'items', id: 'foo', texture: 'T_Foo_Icon' }])
    expect(missing).toEqual([])
  })
})
