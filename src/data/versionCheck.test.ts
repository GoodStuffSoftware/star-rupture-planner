import { describe, it, expect } from 'vitest'
import {
  LIVE,
  PTB,
  classifyAnnouncement,
  coverage,
  decideBranch,
  marker,
  parseMarkers,
  type DecideContext,
  type IssueRecord,
} from '../../scripts/lib/versionCheck.mjs'

const t = (iso: string) => Math.floor(Date.parse(iso) / 1000)

const versions = [
  { id: 'playtest', label: 'Playtest' },
  { id: 'earlyaccess', label: 'Early Access' },
  { id: 'update1', label: 'Update 1' },
  { id: 'update1_PTB', label: 'Update 1 PTB' },
  { id: 'update2_QoL', label: 'Update 2 QoL' },
]

const news = [
  {
    title: 'Hotfix 0.3.5 - now available!',
    date: t('2026-10-05T07:00:00Z'),
    url: 'https://s/live',
  },
  {
    title: 'StarRupture Update 3: Custom Game - now on Public Test Branch',
    date: t('2026-10-29T10:00:00Z'),
    url: 'https://s/ptb1',
  },
  {
    title: 'StarRupture Update 3 Public Test Branch - Hotfix 1 now available',
    date: t('2026-11-06T09:00:00Z'),
    url: 'https://s/ptb2',
  },
]

// Planner data last changed 2026-10-26; PTB builds are newer than that.
const base: DecideContext = {
  branches: {
    [LIVE]: { buildid: '100', timeupdated: String(t('2026-10-05T06:54:00Z')) },
    [PTB]: { buildid: '200', timeupdated: String(t('2026-11-06T08:47:00Z')) },
  },
  news,
  versions,
  dataChanged: { update2_QoL: t('2026-10-26T12:27:59Z'), update1_PTB: t('2026-10-07T12:52:20Z') },
  issues: [],
  now: t('2026-11-10T12:00:00Z'),
}

const decide = (branch: string, over: Partial<DecideContext> = {}) =>
  decideBranch({ ...base, ...over, branch })

describe('live branch', () => {
  it('is covered when the default version changed after the public build', () => {
    const d = decide(LIVE)
    expect(d.status).toBe('covered')
    expect(d.action).toBe('none')
  })

  const hotfix = {
    branches: {
      ...base.branches,
      [LIVE]: { buildid: '101', timeupdated: String(t('2026-11-08T08:00:00Z')) },
    },
    news: [
      ...news,
      {
        title: 'Hotfix 0.3.6 - now available!',
        date: t('2026-11-08T09:00:00Z'),
        url: 'https://s/h6',
      },
    ],
  }

  it('uncovered hotfix inside the 3-day grace period does nothing', () => {
    const d = decide(LIVE, { ...hotfix, now: t('2026-11-10T12:00:00Z') })
    expect(d.status).toBe('grace')
    expect(d.action).toBe('none')
    expect(d.announcement?.title).toBe('Hotfix 0.3.6 - now available!')
  })

  it('opens an issue once the grace period has passed', () => {
    const d = decide(LIVE, { ...hotfix, now: t('2026-11-12T10:00:00Z') })
    expect(d.status).toBe('due')
    expect(d.action).toBe('open')
    expect(d.body).toContain(marker(LIVE, '101'))
    expect(d.title).toContain('101')
  })

  it('honours a grace override', () => {
    const d = decide(LIVE, {
      ...hotfix,
      now: t('2026-11-10T12:00:00Z'),
      graceDays: { [LIVE]: 1, [PTB]: 10 },
    })
    expect(d.action).toBe('open')
  })

  it('falls back to the branch update time when no announcement matches', () => {
    const d = decide(LIVE, {
      branches: hotfix.branches,
      news: [],
      now: t('2026-11-12T10:00:00Z'),
    })
    expect(d.since).toBe(t('2026-11-08T08:00:00Z'))
    expect(d.announcementSource).toBe('branch update time')
    expect(d.action).toBe('open')
  })
})

describe('public test branch', () => {
  it('is inactive when its build equals the public build', () => {
    const d = decide(PTB, {
      branches: { ...base.branches, [PTB]: { ...base.branches[LIVE] } },
    })
    expect(d.status).toBe('inactive')
    expect(d.action).toBe('none')
  })

  it('is inactive when it is not newer than public', () => {
    const d = decide(PTB, {
      branches: {
        ...base.branches,
        [PTB]: { buildid: '99', timeupdated: String(t('2026-10-01T00:00:00Z')) },
      },
    })
    expect(d.status).toBe('inactive')
  })

  it('is covered by a test version sorting after the default version', () => {
    const d = decide(PTB, {
      versions: [...versions, { id: 'update3_PTB', label: 'Update 3 PTB' }],
      dataChanged: { ...base.dataChanged, update3_PTB: t('2026-11-07T00:00:00Z') },
    })
    expect(d.status).toBe('covered')
  })

  it('is not covered by an older test version, even if newer than the PTB build', () => {
    const d = decide(PTB, {
      dataChanged: { ...base.dataChanged, update1_PTB: t('2026-11-09T00:00:00Z') },
    })
    expect(d.status).not.toBe('covered')
  })

  it('counts the grace period from the first announcement, not the later hotfix', () => {
    // First PTB post 10-29 + 10 days = 11-08; the 11-06 hotfix must not push it later.
    const d = decide(PTB, { now: t('2026-11-10T12:00:00Z') })
    expect(d.since).toBe(t('2026-10-29T10:00:00Z'))
    expect(d.dueAt).toBe(t('2026-11-08T10:00:00Z'))
    expect(d.announcement?.title).toContain('Custom Game')
    expect(d.status).toBe('due')
    expect(d.action).toBe('open')
    expect(d.body).toContain('https://s/ptb1')
    expect(d.body).not.toContain('https://s/ptb2')
  })

  it('is inside grace before the first announcement plus 10 days', () => {
    const d = decide(PTB, { now: t('2026-11-07T12:00:00Z') })
    expect(d.status).toBe('grace')
    expect(d.action).toBe('none')
  })

  it('ignores announcements dated before the covering data change', () => {
    const d = decide(PTB, {
      news: [
        { title: 'Update 1 Public Test Branch - now live', date: t('2026-10-01T00:00:00Z') },
        ...news,
      ],
    })
    expect(d.since).toBe(t('2026-10-29T10:00:00Z'))
  })
})

describe('issue dedupe', () => {
  const issue = (over: Partial<IssueRecord>): IssueRecord => ({
    number: 5,
    state: 'OPEN',
    body: marker(PTB, '200'),
    ...over,
  })

  it('skips a branch whose exact build has a closed (acknowledged) issue', () => {
    const d = decide(PTB, { issues: [issue({ state: 'CLOSED' })] })
    expect(d.status).toBe('due')
    expect(d.action).toBe('none')
    expect(d.reason).toContain('acknowledged')
  })

  it('does nothing when an open issue already covers this build', () => {
    const d = decide(PTB, { issues: [issue({})] })
    expect(d.action).toBe('none')
  })

  it('comments on the open issue when the build changed', () => {
    const d = decide(PTB, { issues: [issue({ body: marker(PTB, '150') })] })
    expect(d.action).toBe('comment')
    expect(d.issueNumber).toBe(5)
    expect(d.comment).toContain(marker(PTB, '200'))
  })

  it('does not comment twice for a build already noted in a comment', () => {
    const d = decide(PTB, {
      issues: [issue({ body: marker(PTB, '150'), comments: [{ body: marker(PTB, '200') }] })],
    })
    expect(d.action).toBe('none')
  })

  it('opens a new issue after a closed issue for an older build', () => {
    const d = decide(PTB, { issues: [issue({ state: 'CLOSED', body: marker(PTB, '150') })] })
    expect(d.action).toBe('open')
  })

  it('ignores issues for the other branch', () => {
    const d = decide(PTB, { issues: [issue({ body: marker(LIVE, '200') })] })
    expect(d.action).toBe('open')
  })
})

describe('helpers', () => {
  it('classifies announcements', () => {
    expect(
      classifyAnnouncement('StarRupture Update 3: Custom Game - now on Public Test Branch'),
    ).toBe(PTB)
    expect(classifyAnnouncement('Update 3 PTB - Hotfix 1')).toBe(PTB)
    expect(classifyAnnouncement('Update 2: Quality of Life - now available! [notes]')).toBe(LIVE)
    expect(classifyAnnouncement('UPDATE 2: Quality of Life - announcement')).toBeNull()
  })

  it('round-trips markers', () => {
    expect(parseMarkers(`x\n${marker(PTB, '7')}\n${marker(LIVE, '8')}`)).toEqual([
      { branch: PTB, build: '7' },
      { branch: LIVE, build: '8' },
    ])
  })

  it('picks the default version and later test versions for coverage', () => {
    const v = [...versions, { id: 'update3_PTB', label: 'Update 3 PTB' }]
    expect(coverage(LIVE, v, {}).defaultId).toBe('update2_QoL')
    expect(coverage(PTB, v, {}).candidates).toEqual(['update3_PTB'])
  })

  it('keeps issue text to public Steam facts', () => {
    const d = decide(PTB)
    expect(d.body).toContain('Build id: 200')
    expect(d.body).toContain('Custom Game')
    expect(d.body).toContain('refresh-data')
    expect(d.body).toContain('close this issue')
  })
})
