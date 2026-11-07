// Pure decision logic for scripts/check-game-version.mjs: is the planner's data behind a
// newer Steam build, and has the grace period run out? No network, git or clock access here.
import { sortVersions, isTestVersion, pickDefaultVersion } from './versionLogic.mjs'

export const LIVE = 'public'
export const PTB = 'public_test_branch'
export const DAY = 86400 // seconds
export const DEFAULT_GRACE_DAYS = { [LIVE]: 3, [PTB]: 10 }

const BRANCH_LABEL = { [LIVE]: 'live', [PTB]: 'public test branch' }

// Steam announcement titles: PTB ones mention the Public Test Branch, live ones say
// "now available" (pre-announcements such as "... - announcement" match neither).
export function classifyAnnouncement(title) {
  if (/public test branch|\bPTB\b/i.test(title)) return PTB
  if (/now available|available now/i.test(title)) return LIVE
  return null
}

export function marker(branch, buildid) {
  return `<!-- game-version-check: branch=${branch} build=${buildid} -->`
}

// Every marker found in a text (issue body or comment).
export function parseMarkers(text = '') {
  const out = []
  for (const m of text.matchAll(/<!-- game-version-check: branch=(\S+) build=(\S+) -->/g)) {
    out.push({ branch: m[1], build: m[2] })
  }
  return out
}

// Builds an issue has already reported for a branch (its body plus its comments).
function reportedBuilds(issue, branch) {
  const texts = [issue.body ?? '', ...(issue.comments ?? []).map((c) => c.body ?? '')]
  return new Set(
    texts
      .flatMap(parseMarkers)
      .filter((m) => m.branch === branch)
      .map((m) => m.build),
  )
}

export function isoDate(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

// Which planner versions can cover this branch, and the data-change time to measure against.
//  live: the default version.  ptb: test versions sorting after the default version.
export function coverage(branch, versions, dataChanged) {
  const ids = sortVersions(versions.map((v) => v.id))
  const labelOf = Object.fromEntries(versions.map((v) => [v.id, v.label ?? v.id]))
  const sorted = ids.map((id) => ({ id, label: labelOf[id] }))
  const defaultId = pickDefaultVersion(sorted)
  const changed = (id) => dataChanged[id] ?? 0
  if (branch === LIVE) {
    return { defaultId, candidates: [defaultId], lastChange: changed(defaultId) }
  }
  const after = ids.slice(ids.indexOf(defaultId) + 1).filter((id) => isTestVersion(id, labelOf[id]))
  // With no later test version there is nothing to cover the PTB; measure announcements
  // from the default version's last data change so older PTB posts do not count.
  const lastChange = after.length ? Math.max(...after.map(changed)) : changed(defaultId)
  return { defaultId, candidates: after, lastChange }
}

// Decision for one Steam branch.
//  branches: { public: {buildid, timeupdated}, public_test_branch: {...} } (unix seconds)
//  news: [{title, date, url}]   versions: [{id, label}]   dataChanged: { id: unix seconds }
//  issues: [{number, state, body, comments?: [{body}]}] carrying the game-update label
//  now: unix seconds   graceDays: { public, public_test_branch }
export function decideBranch({
  branch,
  branches,
  news,
  versions,
  dataChanged,
  issues,
  now,
  graceDays = DEFAULT_GRACE_DAYS,
}) {
  const info = branches[branch]
  const base = {
    branch,
    buildid: String(info.buildid),
    updatedAt: Number(info.timeupdated),
    action: 'none',
  }

  if (branch === PTB) {
    const live = branches[LIVE]
    if (
      String(info.buildid) === String(live.buildid) ||
      Number(info.timeupdated) <= Number(live.timeupdated)
    ) {
      return {
        ...base,
        status: 'inactive',
        reason: 'no active PTB: it matches or is older than the public build',
      }
    }
  }

  const cov = coverage(branch, versions, dataChanged)
  const updatedAt = base.updatedAt
  const covering = cov.candidates.filter((id) => (dataChanged[id] ?? 0) >= updatedAt)
  if (covering.length) {
    return {
      ...base,
      status: 'covered',
      reason: `data for ${covering.join(', ')} changed on or after the ${branch} update`,
    }
  }

  // Uncovered. Count the grace period from the earliest announcement for this branch after
  // the covering data's last change, so later hotfixes do not restart it.
  const announcement =
    news
      .filter((n) => classifyAnnouncement(n.title) === branch && n.date > cov.lastChange)
      .sort((a, b) => a.date - b.date)[0] ?? null
  const since = announcement ? announcement.date : updatedAt
  const dueAt = since + (graceDays[branch] ?? DEFAULT_GRACE_DAYS[branch]) * DAY
  const detail = {
    ...base,
    since,
    dueAt,
    announcement,
    announcementSource: announcement ? 'announcement' : 'branch update time',
    defaultVersion: cov.defaultId,
  }
  if (now < dueAt) {
    return { ...detail, status: 'grace', reason: `inside grace period until ${isoDate(dueAt)}` }
  }

  // Past grace: dedupe against existing issues for this branch.
  const mine = issues
    .map((i) => ({ ...i, state: String(i.state).toLowerCase(), builds: reportedBuilds(i, branch) }))
    .filter((i) => i.builds.size)
  const acknowledged = mine.find((i) => i.state === 'closed' && i.builds.has(detail.buildid))
  if (acknowledged) {
    return {
      ...detail,
      status: 'due',
      reason: `issue #${acknowledged.number} was closed for build ${detail.buildid}: acknowledged`,
    }
  }
  const open = mine.filter((i) => i.state === 'open').sort((a, b) => b.number - a.number)[0]
  if (open) {
    if (open.builds.has(detail.buildid)) {
      return {
        ...detail,
        status: 'due',
        reason: `open issue #${open.number} already covers build ${detail.buildid}`,
      }
    }
    return {
      ...detail,
      status: 'due',
      action: 'comment',
      issueNumber: open.number,
      reason: `open issue #${open.number} exists for ${branch}; new build ${detail.buildid}`,
      comment: renderComment(detail),
    }
  }
  return {
    ...detail,
    status: 'due',
    action: 'open',
    reason: `no issue for ${branch} build ${detail.buildid}`,
    title: renderTitle(detail),
    body: renderBody(detail),
  }
}

export function decideAll(ctx) {
  return [LIVE, PTB].map((branch) => decideBranch({ ...ctx, branch }))
}

function facts(d) {
  const lines = [
    `- Steam branch: \`${d.branch}\` (${BRANCH_LABEL[d.branch]})`,
    `- Build id: ${d.buildid}`,
    `- Branch updated: ${isoDate(d.updatedAt)}`,
  ]
  if (d.announcement) {
    const a = d.announcement
    lines.push(
      `- First announcement since the planner's data last changed: "${a.title}" (${isoDate(a.date)})${a.url ? ` ${a.url}` : ''}`,
    )
  }
  lines.push(
    `- Planner data not updated since before this build; grace period ended ${isoDate(d.dueAt)}`,
  )
  return lines.join('\n')
}

const STEPS =
  'What to do: run `npm run refresh-data` (or the "Check for game data updates" workflow) and ' +
  'deploy. If the build does not change the game data, close this issue to acknowledge it.'

export function renderTitle(d) {
  return `Planner data is behind the Steam ${d.branch === PTB ? 'public test' : 'live'} build ${d.buildid}`
}

export function renderBody(d) {
  return `${marker(d.branch, d.buildid)}\n\nSteam reports a build newer than the planner's data.\n\n${facts(d)}\n\n${STEPS}\n`
}

export function renderComment(d) {
  return `${marker(d.branch, d.buildid)}\n\nA newer build is now on this Steam branch.\n\n${facts(d)}\n\n${STEPS}\n`
}
