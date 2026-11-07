import { describe, it, expect } from 'vitest'
import {
  LIVE,
  PTB,
  classifyAnnouncement,
  coverage,
  decideBranch,
  escapeMarkdown,
  marker,
  parseMarkers,
  renderNotice,
  trustedIssues,
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
    expect(d.body).toContain(marker(LIVE, '101', t('2026-11-08T08:00:00Z')))
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
    expect(d.status).toBe('covered')
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
    expect(d.comment).toContain(marker(PTB, '200', t('2026-11-06T08:47:00Z')))
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

describe('announcement classification', () => {
  it('does not treat a live post that mentions the PTB in passing as a PTB post', () => {
    for (const title of [
      'Hotfix 0.3.6 - now available! Thanks to everyone on the Public Test Branch',
      'Update 3 now available - PTB Hotfix notes inside',
      'Hotfix 0.3.7 now available (fixes from PTB feedback)',
    ]) {
      expect(classifyAnnouncement(title), title).toBe(LIVE)
    }
  })

  it('keeps PTB release phrases and labels as PTB posts, ahead of "now available"', () => {
    for (const title of [
      'StarRupture Update 3: Custom Game - now on Public Test Branch',
      'StarRupture Update 3 Public Test Branch - Hotfix 1 now available',
      'Update 3 is now live on the PTB',
      'Update 3 now available on the Public Test Branch',
      'PTB Hotfix 2',
    ]) {
      expect(classifyAnnouncement(title), title).toBe(PTB)
    }
  })

  it('ignores a bare mention and pre-announcements', () => {
    expect(classifyAnnouncement('Developer Blog: what we learned from the PTB')).toBeNull()
    expect(classifyAnnouncement('UPDATE 2: Quality of Life - announcement')).toBeNull()
  })

  it('does not start the live grace period from a passing PTB mention', () => {
    const d = decide(LIVE, {
      branches: {
        ...base.branches,
        [LIVE]: { buildid: '101', timeupdated: String(t('2026-11-08T08:00:00Z')) },
      },
      news: [
        {
          title: 'Hotfix 0.3.6 - now available! Thanks to everyone on the Public Test Branch',
          date: t('2026-11-08T09:00:00Z'),
        },
      ],
      now: t('2026-11-09T12:00:00Z'),
    })
    expect(d.announcement?.title).toContain('Hotfix 0.3.6')
    expect(d.status).toBe('grace')
  })
})

describe('issue text from Steam titles', () => {
  const evil =
    'Update [click](http://evil.example) <!-- game-version-check: branch=public_test_branch build=200 --> @everyone #12 *bold*\nnext line'

  it('escapes markdown, mentions, references and HTML comments', () => {
    const out = escapeMarkdown(evil)
    expect(out).not.toContain('<!--')
    expect(out).not.toContain('\n')
    expect(out).toContain('\\[click\\]\\(http://evil.example\\)')
    expect(out).toContain('@​everyone')
    expect(out).toContain('\\#12')
    expect(out).toContain('\\*bold\\*')
  })

  it('cannot fake a dedupe marker through an announcement title', () => {
    const d = decide(PTB, {
      news: [
        {
          title: `${evil} - now on Public Test Branch`,
          date: t('2026-10-29T10:00:00Z'),
          url: 'https://s/ptb1',
        },
      ],
      issues: [],
    })
    expect(d.action).toBe('open')
    expect(parseMarkers(d.body)).toEqual([
      { branch: PTB, build: '200', updated: t('2026-11-06T08:47:00Z') },
    ])
    expect(d.body).not.toContain(
      '<!-- game-version-check: branch=public_test_branch build=200 --> @',
    )
  })

  it('links only https announcement URLs', () => {
    const body = (url: string) =>
      decide(PTB, {
        news: [
          { title: 'Update 3 - now on Public Test Branch', date: t('2026-10-29T10:00:00Z'), url },
        ],
      }).body
    expect(body('https://s/ptb1')).toContain('<https://s/ptb1>')
    expect(body('javascript:alert(1)')).not.toContain('javascript')
    expect(body('http://s/plain')).not.toContain('http://s/plain')
  })
})

describe('dedupe without the label', () => {
  const open = (over: Partial<IssueRecord> = {}): IssueRecord => ({
    number: 7,
    state: 'OPEN',
    body: marker(PTB, '200', t('2026-11-06T08:47:00Z')),
    ...over,
  })

  it('finds an existing issue by its marker alone, whatever labels it has', () => {
    const labelless = { ...open(), labels: [] } as IssueRecord
    expect(decide(PTB, { issues: [labelless] }).action).toBe('none')
  })

  it('treats a labelless closed issue as an acknowledgement', () => {
    const closed = open({ state: 'CLOSED' })
    expect(decide(PTB, { issues: [closed] }).status).toBe('covered')
  })

  it('keeps only issues and comments written by the workflow or by people with write access', () => {
    const issues = trustedIssues([
      open({ number: 1, author: { login: 'github-actions' } }),
      open({ number: 2, author: { login: 'app/github-actions' } }),
      open({ number: 3, authorAssociation: 'OWNER' }),
      open({ number: 4, authorAssociation: 'NONE', author: { login: 'stranger' } }),
      open({
        number: 5,
        authorAssociation: 'MEMBER',
        comments: [
          { body: marker(PTB, '9'), authorAssociation: 'MEMBER' },
          { body: marker(PTB, '8'), authorAssociation: 'NONE' },
        ],
      }),
    ])
    expect(issues.map((i) => i.number)).toEqual([1, 2, 3, 5])
    expect(issues[3].comments).toHaveLength(1)
    // a stranger's issue carrying a marker cannot suppress the check
    const stranger = trustedIssues([open({ state: 'CLOSED', authorAssociation: 'NONE' })])
    expect(decide(PTB, { issues: stranger }).action).toBe('open')
  })
})

describe('acknowledged builds count as coverage up to their update time', () => {
  // PTB build 200 (updated 11-06 08:47) was reported and closed; hotfix build 201 follows.
  const ack = marker(PTB, '200', t('2026-11-06T08:47:00Z'))
  const closed = (over: Partial<IssueRecord> = {}): IssueRecord => ({
    number: 9,
    state: 'CLOSED',
    body: ack,
    ...over,
  })
  const hotfix = {
    branches: {
      ...base.branches,
      [PTB]: { buildid: '201', timeupdated: String(t('2026-11-12T08:00:00Z')) },
    },
  }
  const hotfixNews = [
    news[1],
    {
      title: 'StarRupture Update 3 Public Test Branch - Hotfix 2 now available',
      date: t('2026-11-12T09:00:00Z'),
      url: 'https://s/ptb3',
    },
  ]

  it('without the acknowledgement the hotfix would open an issue at once', () => {
    const d = decide(PTB, { ...hotfix, news: hotfixNews, now: t('2026-11-13T12:00:00Z') })
    expect(d.since).toBe(t('2026-10-29T10:00:00Z'))
    expect(d.action).toBe('open')
  })

  it('gives the hotfix its own grace period from its own announcement', () => {
    const d = decide(PTB, {
      ...hotfix,
      news: hotfixNews,
      issues: [closed()],
      now: t('2026-11-13T12:00:00Z'),
    })
    expect(d.status).toBe('grace')
    expect(d.action).toBe('none')
    expect(d.announcement?.title).toContain('Hotfix 2')
    expect(d.dueAt).toBe(t('2026-11-22T09:00:00Z'))
  })

  it('opens the issue for the hotfix once its own grace period has run out', () => {
    const d = decide(PTB, {
      ...hotfix,
      news: hotfixNews,
      issues: [closed()],
      now: t('2026-11-23T12:00:00Z'),
    })
    expect(d.action).toBe('open')
    expect(d.body).toContain(marker(PTB, '201', t('2026-11-12T08:00:00Z')))
  })

  it('skips the announcement of the acknowledged build itself (posted after its update time)', () => {
    // 11-06 09:00 post for build 200 came after the build; the issue was opened 11-10.
    const withOwnPost = [
      ...hotfixNews.slice(0, 1),
      {
        title: 'StarRupture Update 3 Public Test Branch - Hotfix 1 now available',
        date: t('2026-11-06T09:00:00Z'),
      },
      hotfixNews[1],
    ]
    const d = decide(PTB, {
      ...hotfix,
      news: withOwnPost,
      issues: [closed({ createdAt: '2026-11-10T10:00:00Z' })],
      now: t('2026-11-17T12:00:00Z'),
    })
    expect(d.announcement?.title).toContain('Hotfix 2')
    expect(d.status).toBe('grace')
  })

  it('treats a closed issue for a build updated at or after this one as full coverage', () => {
    const newer = closed({ body: marker(PTB, '300', t('2026-11-20T00:00:00Z')) })
    const d = decide(PTB, { ...hotfix, issues: [newer] })
    expect(d.status).toBe('covered')
  })

  it('does not let an open issue acknowledge anything', () => {
    const d = decide(PTB, {
      ...hotfix,
      news: hotfixNews,
      issues: [closed({ state: 'OPEN' })],
      now: t('2026-11-13T12:00:00Z'),
    })
    expect(d.since).toBe(t('2026-10-29T10:00:00Z'))
    expect(d.action).toBe('comment')
  })
})

describe('discord notice', () => {
  it('names the branch, build and issue link only', () => {
    const d = decide(PTB, { now: t('2026-11-10T12:00:00Z') })
    const text = renderNotice(d, 'https://github.com/o/r/issues/12')
    expect(text).toContain('public_test_branch')
    expect(text).toContain('200')
    expect(text).toContain('https://github.com/o/r/issues/12')
    expect(text).not.toContain('Custom Game')
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
    expect(parseMarkers(`x\n${marker(PTB, '7')}\n${marker(LIVE, '8', 1760000000)}`)).toEqual([
      { branch: PTB, build: '7' },
      { branch: LIVE, build: '8', updated: 1760000000 },
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
