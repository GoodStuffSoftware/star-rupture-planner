import { describe, it, expect } from 'vitest'
import {
  alreadyPublished,
  artifactProblems,
  buildKey,
  keyOfTagSuffix,
  noNewsAction,
  parseArtifactName,
  pickCandidates,
  pickNewsTitle,
  pipelineProblems,
  publishedBuilds,
  renderNotice,
  runProblems,
  screenArtifacts,
  CI_REPO,
  CI_REPO_ID,
  type CiArtifact,
  type CiRun,
} from '../../scripts/lib/pullPlan.mjs'
import { buildChangelog, checkInvariants, formatChangelog } from '../../scripts/lib/publishGate.mjs'
import { decideVersionId } from '../../scripts/lib/versionLogic.mjs'
import type { PlannerBuilding, PlannerItem } from '../../scripts/lib/convertGameData.mjs'

/** An artifact of a genuine run: starrupture-ci itself, on main. */
const art = (id: number, name: string, extra: Partial<CiArtifact> = {}): CiArtifact => ({
  id,
  name,
  expired: false,
  created_at: `2026-11-0${(id % 9) + 1}T10:00:00Z`,
  workflow_run: {
    id: 1000 + id,
    repository_id: CI_REPO_ID,
    head_repository_id: CI_REPO_ID,
    head_branch: 'main',
  },
  ...extra,
})

/** A genuine run object as GET /repos/<CI repo>/actions/runs/<id> returns it. */
const goodRun = (extra: Partial<CiRun> = {}): CiRun => ({
  id: 1007,
  event: 'schedule',
  path: '.github/workflows/sr-watch.yml',
  status: 'completed',
  conclusion: 'success',
  head_branch: 'main',
  repository: { id: CI_REPO_ID, full_name: CI_REPO },
  head_repository: { id: CI_REPO_ID, full_name: CI_REPO },
  ...extra,
})

describe('parseArtifactName (sr-data-<branch>-<buildid>)', () => {
  it('reads the branch and the build id', () => {
    expect(parseArtifactName('sr-data-public-26461198')).toEqual({
      branch: 'public',
      buildid: '26461198',
    })
    expect(parseArtifactName('sr-data-public_test_branch-26461198')).toEqual({
      branch: 'public_test_branch',
      buildid: '26461198',
    })
  })

  it('refuses everything else', () => {
    expect(parseArtifactName('sr-data-26461198')).toBeNull() // the old name has no branch: dedupe could not tell builds apart
    expect(parseArtifactName('sr-data-tools-42399350787-1')).toBeNull() // not a Steam branch
    expect(parseArtifactName('map-mode-public_test_branch')).toBeNull()
    expect(parseArtifactName('sr-data-public-')).toBeNull()
    expect(parseArtifactName('sr-data-pub lic-1')).toBeNull()
    expect(parseArtifactName('sr-data-pub.lic-1')).toBeNull()
    expect(parseArtifactName('sr-data--1')).toBeNull()
    expect(parseArtifactName(undefined as unknown as string)).toBeNull()
  })

  it('keys and tags on branch plus build id', () => {
    expect(buildKey('public', 5)).toBe('public:5')
    expect(keyOfTagSuffix('public_test_branch-26461198')).toBe('public_test_branch:26461198')
    expect(keyOfTagSuffix('26461198')).toBeNull() // legacy tag without a branch: never matches a build
    expect(keyOfTagSuffix('tools-5')).toBeNull()
  })
})

describe('provenance: only our own main runs may supply data', () => {
  it('accepts an artifact of a run in the CI repo itself on main', () => {
    expect(artifactProblems(art(1, 'sr-data-public-5'))).toEqual([])
    expect(runProblems(goodRun(), { runId: 1007 })).toEqual([])
  })

  it('refuses a forged fork pull-request run', () => {
    const fork = art(2, 'sr-data-public-99', {
      workflow_run: {
        id: 5,
        repository_id: CI_REPO_ID,
        head_repository_id: 777,
        head_branch: 'main',
      },
    })
    expect(artifactProblems(fork).join()).toMatch(/a fork/)
    const forkRun = goodRun({
      id: 5,
      event: 'pull_request',
      head_repository: { id: 777, full_name: 'attacker/starrupture-ci' },
      head_branch: 'feature',
      conclusion: 'success',
    })
    const problems = runProblems(forkRun, { runId: 5 }).join('\n')
    expect(problems).toMatch(/no forks/)
    expect(problems).toMatch(/event "pull_request"/)
    expect(problems).toMatch(/branch "feature"/)
  })

  it('refuses a run that is not on main', () => {
    const other = art(3, 'sr-data-public-99', {
      workflow_run: {
        id: 6,
        repository_id: CI_REPO_ID,
        head_repository_id: CI_REPO_ID,
        head_branch: 'feat/data-extract',
      },
    })
    expect(artifactProblems(other).join()).toMatch(/not main/)
    expect(runProblems(goodRun({ head_branch: 'feat/data-extract' })).join()).toMatch(/not main/)
  })

  it('refuses a run in another repository, even with a main branch', () => {
    expect(
      runProblems(goodRun({ repository: { id: 9, full_name: 'someone/starrupture-ci' } })).join(),
    ).toMatch(/repository/)
    expect(
      artifactProblems(
        art(4, 'sr-data-public-9', {
          workflow_run: { id: 7, repository_id: 9, head_repository_id: 9, head_branch: 'main' },
        }),
      ).join(),
    ).toMatch(/repository 9/)
  })

  it('refuses an artifact with no run information', () => {
    expect(artifactProblems({ id: 1, name: 'sr-data-public-1' })).toEqual([
      'the artifact has no workflow_run',
    ])
  })

  it('allows only schedule, workflow_dispatch, push and workflow_call events', () => {
    for (const event of ['schedule', 'workflow_dispatch', 'push', 'workflow_call'])
      expect(runProblems(goodRun({ event }))).toEqual([])
    for (const event of [
      'pull_request',
      'pull_request_target',
      'workflow_run',
      'issue_comment',
      'repository_dispatch',
      undefined,
    ]) {
      expect(runProblems(goodRun({ event: event as string })).join()).toMatch(/event/)
    }
  })

  it('allows only sr-watch.yml and sr-data-extract.yml, with or without a ref suffix', () => {
    expect(runProblems(goodRun({ path: '.github/workflows/sr-data-extract.yml' }))).toEqual([])
    expect(
      runProblems(goodRun({ path: '.github/workflows/sr-watch.yml@refs/heads/main' })),
    ).toEqual([])
    expect(runProblems(goodRun({ path: '.github/workflows/evil.yml' })).join()).toMatch(/workflow/)
    expect(runProblems(goodRun({ path: undefined })).join()).toMatch(/workflow/)
    expect(runProblems(goodRun({ path: 'x/.github/workflows/sr-watch.yml' })).join()).toMatch(
      /workflow/,
    )
  })

  it('needs a finished, successful run', () => {
    for (const conclusion of ['failure', 'cancelled', 'skipped', null]) {
      expect(runProblems(goodRun({ conclusion: conclusion as string })).join()).toMatch(
        /conclusion/,
      )
    }
    expect(runProblems(goodRun({ status: 'in_progress', conclusion: null })).join()).toMatch(
      /not completed/,
    )
  })

  it('checks that the run is the one that was asked for', () => {
    expect(runProblems(goodRun({ id: 1 }), { runId: 2 }).join()).toMatch(/not 2/)
  })

  it('checks pipeline.json against the artifact name and run', () => {
    const want = { branch: 'public', buildid: '5', runId: 1007 }
    const ok = { status: 'ok', branch: 'public', buildid: '5', run_id: 1007 }
    expect(pipelineProblems(ok, want)).toEqual([])
    expect(pipelineProblems({ ...ok, run_id: '1007' }, want)).toEqual([]) // string or number
    expect(pipelineProblems({ ...ok, branch: 'public_test_branch' }, want).join()).toMatch(/branch/)
    expect(pipelineProblems({ ...ok, buildid: '6' }, want).join()).toMatch(/build 6/)
    expect(pipelineProblems({ ...ok, run_id: 1008 }, want).join()).toMatch(/run 1008/)
    expect(pipelineProblems({ status: 'ok', branch: 'public', buildid: '5' }, want).join()).toMatch(
      /run undefined/,
    )
    expect(pipelineProblems({ ...ok, status: 'extract-failed' }, want).join()).toMatch(/status/)
    expect(pipelineProblems(null, want)).toHaveLength(1)
  })
})

describe('pickCandidates (which CI artifacts to pull)', () => {
  const artifacts = [
    art(1, 'map-mode-public_test_branch'),
    art(2, 'sr-data-public-26461198'),
    art(3, 'sr-data-tools-42399350787-1'),
    art(4, 'sr-data-public-25646882'),
    art(5, 'sr-data-public-25700000', { expired: true }),
    art(6, 'sr-data-public_test_branch-26000000'),
  ]

  it('returns the unexpired sr-data artifacts, oldest build first, with branch and key', () => {
    expect(pickCandidates({ artifacts }).map((c) => c.key)).toEqual([
      'public:25646882',
      'public_test_branch:26000000',
      'public:26461198',
    ])
  })

  it('skips builds that were already handled, per branch and build id', () => {
    const seen = new Set(['public:25646882', 'public_test_branch:26000000'])
    expect(pickCandidates({ artifacts, seen }).map((c) => c.key)).toEqual(['public:26461198'])
  })

  it('keeps the newest artifact when a build was uploaded twice, and carries the run id', () => {
    const twice = [
      art(7, 'sr-data-public-26461198', { created_at: '2026-11-01T00:00:00Z' }),
      art(8, 'sr-data-public-26461198', { created_at: '2026-11-02T00:00:00Z' }),
    ]
    const out = pickCandidates({ artifacts: twice })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      artifactId: 8,
      runId: 1008,
      branch: 'public',
      buildid: '26461198',
    })
  })

  it('limits how many builds one run handles', () => {
    expect(pickCandidates({ artifacts, limit: 2 }).map((c) => c.key)).toEqual([
      'public:25646882',
      'public_test_branch:26000000',
    ])
  })

  it('a forced buildid ignores the handled list and the limit, and can be narrowed by branch', () => {
    const seen = new Set(['public:26461198'])
    expect(
      pickCandidates({ artifacts, seen, buildid: '26461198', limit: 0 }).map((c) => c.key),
    ).toEqual(['public:26461198'])
    expect(pickCandidates({ artifacts, buildid: '999' })).toEqual([])
    const both = [art(10, 'sr-data-public-77'), art(11, 'sr-data-public_test_branch-77')]
    expect(pickCandidates({ artifacts: both, buildid: '77' }).map((c) => c.key)).toEqual([
      'public:77',
      'public_test_branch:77',
    ])
    expect(
      pickCandidates({ artifacts: both, buildid: '77', branch: 'public' }).map((c) => c.key),
    ).toEqual(['public:77'])
  })

  it('never picks a forged artifact, and a forged one cannot outrank the genuine one', () => {
    const forgedFork = art(20, 'sr-data-public-26461198', {
      created_at: '2026-12-31T00:00:00Z', // newer than the genuine one
      workflow_run: {
        id: 99,
        repository_id: CI_REPO_ID,
        head_repository_id: 777,
        head_branch: 'main',
      },
    })
    const forgedBranch = art(21, 'sr-data-public-26461198', {
      created_at: '2026-12-30T00:00:00Z',
      workflow_run: {
        id: 98,
        repository_id: CI_REPO_ID,
        head_repository_id: CI_REPO_ID,
        head_branch: 'some-pr',
      },
    })
    const genuine = art(22, 'sr-data-public-26461198', { created_at: '2026-11-01T00:00:00Z' })
    const out = pickCandidates({ artifacts: [forgedFork, forgedBranch, genuine] })
    expect(out.map((c) => c.artifactId)).toEqual([22])
    // the same on the manual buildid path
    expect(pickCandidates({ artifacts: [forgedFork, forgedBranch], buildid: '26461198' })).toEqual(
      [],
    )
    const screened = screenArtifacts([forgedFork, forgedBranch, genuine])
    expect(screened.rejected.map((r) => r.id)).toEqual([20, 21])
    expect(screened.accepted).toHaveLength(1)
  })

  it('a forged huge build id is refused, so it cannot block later genuine builds', () => {
    const forged = art(30, 'sr-data-public-999999999', {
      workflow_run: {
        id: 55,
        repository_id: CI_REPO_ID,
        head_repository_id: 777,
        head_branch: 'main',
      },
    })
    expect(
      pickCandidates({ artifacts: [forged, art(31, 'sr-data-public-100')] }).map((c) => c.buildid),
    ).toEqual(['100'])
  })
})

describe('promotion: a test build that goes public keeps its build id and is published live', () => {
  const sources = [
    {
      source: 'game-extract',
      steamBranch: 'public_test_branch',
      buildid: '26461198',
      version: 'update3_PTB',
    },
  ]
  const published = publishedBuilds(sources)
  const artifacts = [
    art(1, 'sr-data-public_test_branch-26461198'),
    art(2, 'sr-data-public-26461198'),
  ]

  it('the PTB build counts as published for the test branch only', () => {
    expect(alreadyPublished(published, 'public_test_branch', '26461198')).toBe(true)
    expect(alreadyPublished(published, 'public', '26461198')).toBe(false)
  })

  it('the public artifact with the same build id is still a candidate', () => {
    const seen = new Set(published.keys)
    expect(pickCandidates({ artifacts, seen }).map((c) => c.key)).toEqual(['public:26461198'])
  })

  it('the tag of the PTB build does not hide the public one', () => {
    const seen = new Set(['public_test_branch-26461198'].map((t) => keyOfTagSuffix(t) as string))
    expect(pickCandidates({ artifacts, seen }).map((c) => c.key)).toEqual(['public:26461198'])
  })

  it('and it is named for the live version, never the PTB folder', () => {
    const existing = ['update2_QoL', 'update3_PTB']
    expect(
      decideVersionId({
        branch: 'public',
        title: 'Update 3 is now available',
        existingIds: existing,
      }),
    ).toBe('update3')
    expect(decideVersionId({ branch: 'public', title: '', existingIds: existing })).toBe(
      'update2_QoL',
    )
    expect(
      decideVersionId({
        branch: 'public_test_branch',
        title: 'Update 3 PTB',
        existingIds: existing,
      }),
    ).toBe('update3_PTB')
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

  it('names a live build from a live-release post inside the window, ignoring old posts', () => {
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

  it('an announcement or teaser post never names a live build', () => {
    const teasers = [
      'Update 4 Announcement: coming soon',
      'Update 4 preview',
      'StarRupture Update 4 - available soon!',
      'Update 4 roadmap: what is next',
      'Update 4 sneak peek',
      'Update 4 devlog',
      'Announcing Update 4',
      'Update 4 will be available next week',
    ]
    for (const title of teasers) {
      expect(
        pickNewsTitle({ items: [{ title, date: T - 60 }], branch: 'public', builtAt: T }),
      ).toBeNull()
    }
  })

  it('a release post wins over a nearer teaser, and a hotfix post without "Update N" is no name', () => {
    const mixed = [
      { title: 'Update 4 Announcement: coming soon', date: T - 10 },
      { title: 'Update 4 is now available', date: T - 5000, url: 'rel' },
      { title: 'Hotfix 0.3.5 - now available!', date: T - 20 },
    ]
    expect(pickNewsTitle({ items: mixed, branch: 'public', builtAt: T })?.url).toBe('rel')
    expect(pickNewsTitle({ items: [mixed[2]], branch: 'public', builtAt: T })).toBeNull()
  })

  it('"out of beta" is a live post (the word beta does not make it a test post)', () => {
    const post = { title: 'Update 4 is now live - out of beta!', date: T - 60, url: 'b' }
    expect(pickNewsTitle({ items: [post], branch: 'public', builtAt: T })?.url).toBe('b')
  })
})

describe('noNewsAction (a missing post is not "handled" while one can still appear)', () => {
  const built = '2026-11-05T12:00:00Z'
  it('waits inside the first day, gives up after it', () => {
    expect(noNewsAction({ builtAt: built, now: '2026-11-05T12:30:00Z' })).toBe('wait')
    expect(noNewsAction({ builtAt: built, now: '2026-11-06T11:59:00Z' })).toBe('wait')
    expect(noNewsAction({ builtAt: built, now: '2026-11-06T12:00:00Z' })).toBe('give-up')
    expect(noNewsAction({ builtAt: built, now: '2026-11-09T12:00:00Z' })).toBe('give-up')
  })

  it('gives up on a time it cannot read', () => {
    expect(noNewsAction({ builtAt: 'nope', now: built })).toBe('give-up')
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
    expect(renderNotice({ outcome: 'no-news-final', branch: 'public', buildid: '1' })).toMatch(
      /NOT published.*title/,
    )
    expect(
      renderNotice({ outcome: 'no-news', branch: 'public_test_branch', buildid: '1' }),
    ).toMatch(/not published yet.*retried/)
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

  it('stops a zero or negative rate (the resolver would silently build nothing)', () => {
    for (const bad of [0, -1, -0.5]) {
      const zeroOut = data()
      zeroOut.buildings[0].recipes![0].output.amount_per_minute = bad
      expect(checkInvariants({ result: converted(zeroOut) }).join()).toMatch(/positive number/)
      const zeroIn = data()
      zeroIn.buildings[0].recipes![0].inputs[0].amount_per_minute = bad
      expect(checkInvariants({ result: converted(zeroIn) }).join()).toMatch(/positive number/)
    }
    expect(checkInvariants({ result: converted() })).toEqual([])
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
