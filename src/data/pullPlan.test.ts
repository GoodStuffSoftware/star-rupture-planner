import { describe, it, expect } from 'vitest'
import {
  alreadyPublished,
  buildidOfArtifact,
  pickCandidates,
  pickNewsTitle,
  publishedBuilds,
  renderNotice,
  type CiArtifact,
} from '../../scripts/lib/pullPlan.mjs'
import { buildChangelog, checkInvariants, formatChangelog } from '../../scripts/lib/publishGate.mjs'
import type { PlannerBuilding, PlannerItem } from '../../scripts/lib/convertGameData.mjs'

const art = (id: number, name: string, extra: Partial<CiArtifact> = {}): CiArtifact => ({
  id,
  name,
  expired: false,
  created_at: `2026-11-0${(id % 9) + 1}T10:00:00Z`,
  workflow_run: { id: 1000 + id },
  ...extra,
})

describe('pickCandidates (which CI artifacts to pull)', () => {
  const artifacts = [
    art(1, 'map-mode-public_test_branch'),
    art(2, 'sr-data-26461198'),
    art(3, 'sr-data-tools-42399350787-1'),
    art(4, 'sr-data-25646882'),
    art(5, 'sr-data-25700000', { expired: true }),
    art(6, 'sr-data-26000000'),
  ]

  it('recognises only sr-data-<buildid> names', () => {
    expect(buildidOfArtifact('sr-data-26461198')).toBe('26461198')
    expect(buildidOfArtifact('sr-data-tools-1-1')).toBeNull()
    expect(buildidOfArtifact('map-mode-public_test_branch')).toBeNull()
    expect(buildidOfArtifact('sr-data-')).toBeNull()
  })

  it('returns the unexpired sr-data artifacts, oldest build first', () => {
    expect(pickCandidates({ artifacts }).map((c) => c.buildid)).toEqual([
      '25646882',
      '26000000',
      '26461198',
    ])
  })

  it('skips builds that were already handled', () => {
    const seen = new Set(['25646882', '26000000'])
    expect(pickCandidates({ artifacts, seen }).map((c) => c.buildid)).toEqual(['26461198'])
  })

  it('keeps the newest artifact when a build was uploaded twice, and carries the run id', () => {
    const twice = [
      art(7, 'sr-data-26461198', { created_at: '2026-11-01T00:00:00Z' }),
      art(8, 'sr-data-26461198', { created_at: '2026-11-02T00:00:00Z' }),
    ]
    const out = pickCandidates({ artifacts: twice })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ artifactId: 8, runId: 1008 })
  })

  it('limits how many builds one run handles', () => {
    expect(pickCandidates({ artifacts, limit: 2 }).map((c) => c.buildid)).toEqual([
      '25646882',
      '26000000',
    ])
  })

  it('a forced buildid ignores the handled list and the limit', () => {
    const seen = new Set(['26461198'])
    expect(
      pickCandidates({ artifacts, seen, buildid: '26461198', limit: 0 }).map((c) => c.buildid),
    ).toEqual(['26461198'])
    expect(pickCandidates({ artifacts, buildid: '999' })).toEqual([])
  })
})

describe('publishedBuilds / alreadyPublished (SOURCE.json per branch)', () => {
  const published = publishedBuilds([
    null,
    { source: 'upstream' },
    { source: 'game-extract', steamBranch: 'public_test_branch', buildid: '26461198' },
    { source: 'game-extract', steamBranch: 'public', buildid: '25646882' },
  ])

  it('knows the exact builds and the newest build per branch', () => {
    expect(published.keys.has('public_test_branch:26461198')).toBe(true)
    expect(published.newest.get('public')).toBe(25646882)
  })

  it('treats the same or an older build of the same branch as published, never another branch', () => {
    expect(alreadyPublished(published, 'public', '25646882')).toBe(true)
    expect(alreadyPublished(published, 'public', '25000000')).toBe(true) // never publish backwards
    expect(alreadyPublished(published, 'public', '25700000')).toBe(false)
    expect(alreadyPublished(published, 'public_test_branch', '26500000')).toBe(false)
    expect(alreadyPublished(published, 'public', '26461198')).toBe(false) // another branch's build does not count
  })

  it('folders without a game-extract SOURCE.json contribute nothing', () => {
    const none = publishedBuilds([null, { source: 'upstream' }, { source: 'unreadable' }])
    expect(none.keys.size).toBe(0)
    expect(alreadyPublished(none, 'public', '1')).toBe(false)
  })
})

describe('pickNewsTitle (the Steam post that names a build)', () => {
  const T = Date.parse('2026-11-05T12:00:00Z') / 1000
  const items = [
    {
      title: 'StarRupture Update 3: Custom Game - now on Public Test Branch',
      date: T - 3600,
      url: 'u3',
    },
    {
      title: 'StarRupture Update 2: Quality of Life now available',
      date: T - 20 * 86400,
      url: 'u2',
    },
    { title: 'Dev diary #9', date: T - 1000 },
    { title: 'Update 3 PTB Hotfix 1', date: T + 3600, url: 'h1' },
  ]

  it('names a test-branch build from the test post closest in time', () => {
    expect(
      pickNewsTitle({
        items,
        branch: 'public_test_branch',
        builtAt: new Date((T + 3000) * 1000).toISOString(),
      })?.url,
    ).toBe('h1')
    expect(
      pickNewsTitle({ items, branch: 'public_test_branch', builtAt: T - 1800 })?.title,
    ).toMatch(/Update 3: Custom Game/)
  })

  it('never names a live build from a test-branch post', () => {
    expect(pickNewsTitle({ items, branch: 'public', builtAt: T })).toBeNull()
  })

  it('names a live build from a live post inside the window, ignoring old posts', () => {
    const near = Date.parse('2026-10-16T12:00:00Z') / 1000
    expect(pickNewsTitle({ items, branch: 'public', builtAt: near })?.url).toBe('u2')
  })

  it('returns null for an unknown branch, a bad time, or no post with one update number', () => {
    expect(pickNewsTitle({ items, branch: 'weird', builtAt: T })).toBeNull()
    expect(pickNewsTitle({ items, branch: 'public', builtAt: 'not a date' })).toBeNull()
    expect(
      pickNewsTitle({ items: [{ title: 'Dev diary', date: T }], branch: 'public', builtAt: T }),
    ).toBeNull()
  })
})

describe('renderNotice', () => {
  it('describes a published build with the changelog and links', () => {
    const text = renderNotice({
      outcome: 'published',
      versionId: 'update3_PTB',
      branch: 'public_test_branch',
      buildid: '26461198',
      title: 'Update 3 PTB',
      changelog: 'recipes changed (1): assembler: gear',
      links: { commit: 'https://x/commit/1', run: 'https://x/run/2', skipped: undefined },
    })
    expect(text).toContain('update3_PTB')
    expect(text).toContain('26461198')
    expect(text).toContain('assembler: gear')
    expect(text).toContain('commit: https://x/commit/1')
    expect(text).not.toContain('skipped')
  })

  it('says plainly when nothing was published', () => {
    expect(renderNotice({ outcome: 'no-news', branch: 'public', buildid: '1' })).toMatch(
      /NOT published/,
    )
  })
})

// ---- the converter gate and the changelog ----
const rec = (out: string, inputs: string[], rate = 10) => ({
  output: { id: out, amount_per_minute: rate },
  inputs: inputs.map((id) => ({ id, amount_per_minute: rate })),
})
const bld = (id: string, recipes: ReturnType<typeof rec>[], power = 5): PlannerBuilding =>
  ({ id, name: id, type: 'production', power, heat: 1, recipes }) as unknown as PlannerBuilding
const item = (id: string): PlannerItem => ({ id, name: id, type: 'component' }) as PlannerItem
const data = () => ({
  buildings: [
    bld('assembler', [rec('gear', ['bar']), rec('plate', ['bar'])]),
    bld('smelter', [rec('bar', ['ore'])]),
  ],
  items: ['gear', 'plate', 'bar', 'ore'].map(item),
  corporations: { A: { id: 'a' } },
})
type Dataset = {
  buildings: PlannerBuilding[]
  items: PlannerItem[]
  corporations: Record<string, unknown>
}
const converted = (d: Dataset = data()) => ({
  ...d,
  corporations: d.corporations as Record<string, unknown>,
  report: { extractorRateFallbacks: [] as unknown[] },
})

describe('checkInvariants (the gate for a new build)', () => {
  const manifest = { build: '100', guard: { status: 'ok', overridden: false, dataProblems: [] } }

  it('passes sound data, even when values differ from the previous version', () => {
    const changed = data()
    changed.buildings[0].recipes![0].output.amount_per_minute = 99
    expect(
      checkInvariants({ result: converted(changed), prev: data(), manifest, buildid: '100' }),
    ).toEqual([])
  })

  it('stops a recipe that references an item the catalog lacks', () => {
    const d = data()
    d.items = d.items.filter((i) => i.id !== 'ore')
    const problems = checkInvariants({ result: converted(d), prev: data(), manifest })
    expect(problems.join('\n')).toMatch(/input item "ore" is not in the item catalog/)
  })

  it('stops a failed or overridden extractor guard and a manifest for another build', () => {
    expect(
      checkInvariants({
        result: converted(),
        manifest: { build: '100', guard: { status: 'failed' } },
      }).join(),
    ).toMatch(/guard status is "failed"/)
    expect(
      checkInvariants({
        result: converted(),
        manifest: { ...manifest, guard: { status: 'ok', overridden: true } },
      }).join(),
    ).toMatch(/overridden/)
    expect(checkInvariants({ result: converted(), manifest, buildid: '101' }).join()).toMatch(
      /not 101/,
    )
  })

  it('stops a kind that shrinks by more than 10%, and allows a small drop', () => {
    const big = {
      buildings: data().buildings,
      items: Array.from({ length: 20 }, (_, i) => item(`i${i}`)),
      corporations: { A: {} },
    }
    const bigWithRecipes = { ...big, buildings: [bld('m', [rec('i0', ['i1'])])] }
    const shrunk = { ...bigWithRecipes, items: big.items.slice(0, 17) }
    expect(checkInvariants({ result: converted(shrunk), prev: bigWithRecipes }).join()).toMatch(
      /items dropped from 20 to 17/,
    )
    expect(
      checkInvariants({
        result: converted({ ...bigWithRecipes, items: big.items.slice(0, 19) }),
        prev: bigWithRecipes,
      }),
    ).toEqual([])
  })

  it('stops an empty output, a rate fallback, and a non-finite rate', () => {
    expect(
      checkInvariants({ result: converted({ buildings: [], items: [], corporations: {} }) }).join(),
    ).toMatch(/empty output/)
    const withFallback = {
      ...converted(),
      report: { extractorRateFallbacks: [{ building: 'drill', recipe: 'r' }] },
    }
    expect(checkInvariants({ result: withFallback }).join()).toMatch(/rate fallback for drill r/)
    const nan = data()
    nan.buildings[0].recipes![0].output.amount_per_minute = Number.NaN
    expect(checkInvariants({ result: converted(nan) }).join()).toMatch(/not a finite/)
  })
})

describe('buildChangelog (value differences are a changelog, not a gate)', () => {
  it('is empty for the same build: the same-build parity stays exact', () => {
    const log = buildChangelog(data(), data())
    expect(log.total).toBe(0)
    expect(formatChangelog(log)).toBe('No value changes.')
  })

  it('lists added, removed and changed recipes, items and buildings', () => {
    const after = data()
    after.buildings[0].recipes![0].output.amount_per_minute = 30 // changed recipe
    after.buildings[0].recipes!.pop() // removed recipe (plate)
    after.buildings.push(bld('press', [rec('plate', ['bar'])])) // added building + added recipe
    after.items.push(item('foam')) // added item
    after.items = after.items.filter((i) => i.id !== 'ore') // removed item
    after.buildings[1].power = 9 // changed building
    const log = buildChangelog(data(), after)
    expect(log.recipes.changed).toEqual(['assembler: gear <- bar'])
    expect(log.recipes.removed).toEqual(['assembler: plate <- bar'])
    expect(log.recipes.added).toEqual(['press: plate <- bar'])
    expect(log.items).toMatchObject({ added: ['foam'], removed: ['ore'], changed: [] })
    expect(log.buildings).toMatchObject({ added: ['press'], removed: [], changed: ['smelter'] })
    const text = formatChangelog(log)
    expect(text).toContain('recipes changed (1): assembler: gear <- bar')
    expect(text).toContain('items removed (1): ore')
    expect(text).toContain('buildings added (1): press')
  })

  it('bounds a long list', () => {
    const before = { buildings: [], items: [] }
    const after = { buildings: [], items: Array.from({ length: 12 }, (_, i) => item(`n${i}`)) }
    expect(formatChangelog(buildChangelog(before, after), 3)).toBe(
      'items added (12): n0; n1; n2; and 9 more',
    )
  })
})
