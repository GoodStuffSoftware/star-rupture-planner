// Pure decision logic for scripts/check-game-version.mjs: is the planner's data behind a
// newer Steam build, and has the grace period run out? No network, git or clock access here.
import { sortVersions, isTestVersion, pickDefaultVersion } from './versionLogic.mjs'

export const LIVE = 'public'
export const PTB = 'public_test_branch'
export const DAY = 86400 // seconds
export const DEFAULT_GRACE_DAYS = { [LIVE]: 1, [PTB]: 1 }

const BRANCH_LABEL = { [LIVE]: 'live', [PTB]: 'public test branch' }

// Steam announcement titles. A bare mention of the PTB inside a live post ("... now available!
// Thanks to everyone on the Public Test Branch") must not make it a PTB announcement, so the
// classification is by title pattern, in this order:
//  1. A PTB release phrase ("now on / live on / available on the Public Test Branch") -> PTB.
//  2. "now available" / "available now": PTB only when the PTB phrase is used as a label that
//     comes first ("Update 3 Public Test Branch - Hotfix 1 now available"), else live.
//  3. No live phrase: PTB when the PTB phrase is used as a label ("PTB Hotfix 2", "Public
//     Test Branch: Update 3"), otherwise nothing.
// Pre-announcements such as "... - announcement" match none of these.
const PTB_NAME = String.raw`(?:public test branch|\bptb\b)`
const PTB_RELEASE = new RegExp(
  String.raw`\b(?:now|available|live|released|out)\s+(?:now\s+)?(?:on|in)\s+(?:the\s+)?${PTB_NAME}`,
  'i',
)
const PTB_LABEL = new RegExp(
  String.raw`${PTB_NAME}\s*(?:[-:\u2013\u2014]|(?:hotfix|update|patch|build)\b)`,
  'i',
)
const LIVE_WORDS = /now available|available now/i

export function classifyAnnouncement(title) {
  if (PTB_RELEASE.test(title)) return PTB
  const label = PTB_LABEL.exec(title)
  const live = LIVE_WORDS.exec(title)
  if (live) return label && label.index < live.index ? PTB : LIVE
  return label ? PTB : null
}

// Third-party text (Steam announcement titles) goes into issue markdown: neutralize markdown,
// HTML comments (which could fake a dedupe marker), mentions and autolinked references.
export function escapeMarkdown(text, max = 200) {
  const flat = String(text ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max)
  return flat.replace(/[\\`*_{}[\]()<>#+!|~&]/g, '\\$&').replace(/@/g, '@\u200b')
}

// Only an https URL is linked; anything else from the feed is dropped.
function safeUrl(url) {
  try {
    const u = new URL(String(url))
    return u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

// The hidden dedupe marker. `updated` (unix seconds) is the build's Steam update time: a closed
// issue acknowledges the branch up to that time.
export function marker(branch, buildid, updated) {
  const u = updated === undefined || updated === null ? '' : ` updated=${Number(updated)}`
  return `<!-- game-version-check: branch=${branch} build=${buildid}${u} -->`
}

// Every marker found in a text (issue body or comment).
export function parseMarkers(text = '') {
  const out = []
  for (const m of text.matchAll(
    /<!-- game-version-check: branch=(\S+) build=(\S+?)(?: updated=(\d+))? -->/g,
  )) {
    out.push({ branch: m[1], build: m[2], ...(m[3] ? { updated: Number(m[3]) } : {}) })
  }
  return out
}

// Markers an issue (body plus comments) carries for a branch.
function issueMarkers(issue, branch) {
  const texts = [issue.body ?? '', ...(issue.comments ?? []).map((c) => c.body ?? '')]
  return texts.flatMap(parseMarkers).filter((m) => m.branch === branch)
}

// Dedupe reads issue text, so only text written by the workflow (github-actions) or by someone
// with write access counts; a stranger's issue or comment cannot fake a marker.
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])
export function isTrustedAuthor(item) {
  if (!item) return false
  if (TRUSTED_ASSOCIATIONS.has(String(item.authorAssociation ?? '').toUpperCase())) return true
  return /^(app\/)?github-actions(\[bot\])?$/.test(String(item.author?.login ?? ''))
}
export function trustedIssues(issues) {
  return issues
    .filter(isTrustedAuthor)
    .map((i) => ({ ...i, comments: (i.comments ?? []).filter(isTrustedAuthor) }))
}

const toSeconds = (iso) => (iso ? Date.parse(iso) / 1000 || 0 : 0)

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
//  issues: [{number, state, body, createdAt?, comments?: [{body}]}], all issues (found by marker,
//          not label), already passed through trustedIssues
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

  // Issues that carry a marker for this branch. A closed one acknowledges every build it names,
  // up to that build's Steam update time (the marker's `updated`; for the current build we know
  // it): the coverage date is max(data change, acknowledged build's update time).
  const mine = issues
    .map((i) => ({
      ...i,
      state: String(i.state).toLowerCase(),
      markers: issueMarkers(i, branch),
      // When the issue, or a later comment naming a build, was posted: the announcements up
      // to then were dealt with by it.
      handledAt: Math.max(
        toSeconds(i.createdAt),
        ...(i.comments ?? [])
          .filter((c) => parseMarkers(c.body ?? '').some((m) => m.branch === branch))
          .map((c) => toSeconds(c.createdAt)),
      ),
    }))
    .filter((i) => i.markers.length)
  const closed = mine.filter((i) => i.state === 'closed')
  let ackThrough = 0
  let ackIssue = null
  for (const issue of closed) {
    for (const m of issue.markers) {
      const through = Math.max(m.updated ?? 0, m.build === base.buildid ? updatedAt : 0)
      if (through > ackThrough) {
        ackThrough = through
        ackIssue = issue
      }
    }
  }
  if (ackThrough >= updatedAt) {
    return {
      ...base,
      status: 'covered',
      reason: `issue #${ackIssue.number} was closed for ${branch} up to build ${base.buildid}: acknowledged`,
    }
  }

  // Uncovered. Count the grace period from the earliest announcement for this branch after
  // the covering data's last change, so later hotfixes do not restart it. Announcements up to
  // the time a closed (acknowledged) issue was opened belong to the builds it dealt with: a
  // build's post comes after its update time, so the coverage date alone would not skip them.
  const announcedAfter = Math.max(cov.lastChange, ackThrough, ...closed.map((i) => i.handledAt))
  const announcement =
    news
      .filter((n) => classifyAnnouncement(n.title) === branch && n.date > announcedAfter)
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

  // Past grace: dedupe against open issues for this branch (found by marker, not by label).
  const open = mine.filter((i) => i.state === 'open').sort((a, b) => b.number - a.number)[0]
  if (open) {
    if (open.markers.some((m) => m.build === detail.buildid)) {
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
    const link = safeUrl(a.url)
    lines.push(
      `- First announcement since the planner's data last changed: "${escapeMarkdown(a.title)}" (${isoDate(a.date)})${link ? ` <${link}>` : ''}`,
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
  return `${marker(d.branch, d.buildid, d.updatedAt)}\n\nSteam reports a build newer than the planner's data.\n\n${facts(d)}\n\n${STEPS}\n`
}

export function renderComment(d) {
  return `${marker(d.branch, d.buildid, d.updatedAt)}\n\nA newer build is now on this Steam branch.\n\n${facts(d)}\n\n${STEPS}\n`
}

// Short Discord notice for an issue the check opened or commented on. Built only from our own
// values (branch, build id, issue link), never from Steam text.
export function renderNotice(d, issueUrl) {
  const what = d.action === 'comment' ? 'A newer build is on' : 'Planner data is behind'
  return `${what} Steam branch ${d.branch} (${BRANCH_LABEL[d.branch]}), build ${d.buildid}. Issue: ${issueUrl}`
}
