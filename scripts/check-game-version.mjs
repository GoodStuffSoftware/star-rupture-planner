// Opens a GitHub issue when Steam has a newer live or PTB build than the planner's data,
// after a grace period. Decision logic lives in scripts/lib/versionCheck.mjs; this file only
// does the network, git and gh calls.
//
//   node scripts/check-game-version.mjs [--dry-run] [--now <ISO date>]
//
// Env: CHECK_REPO (owner/name, default GITHUB_REPOSITORY, else the gh current repo),
//      GRACE_DAYS_LIVE (3), GRACE_DAYS_PTB (10), CHECK_LABEL (game-update, put on new issues),
//      DISCORD_WEBHOOK_URL (optional: a short notice is posted when an issue is opened or
//      commented on; a dry run never posts).
// Needs a full-history checkout (git log is used for when each version's data last changed)
// and an authenticated gh CLI (GH_TOKEN in Actions) with issues: write.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  decideAll,
  DEFAULT_GRACE_DAYS,
  LIVE,
  PTB,
  isoDate,
  renderNotice,
  trustedIssues,
} from './lib/versionCheck.mjs'

const APPID = 1631270
const root = fileURLToPath(new URL('..', import.meta.url))
const dataDir = `${root}public/game-data`
const label = process.env.CHECK_LABEL || 'game-update'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const nowIdx = args.indexOf('--now')
let now = Math.floor(Date.now() / 1000)
if (nowIdx !== -1) {
  const parsed = Date.parse(args[nowIdx + 1] ?? '')
  if (Number.isNaN(parsed)) fail('--now needs an ISO date, e.g. --now 2026-11-10T12:00:00Z')
  now = Math.floor(parsed / 1000)
}

function fail(msg) {
  console.error(`check-game-version: ${msg}`)
  process.exit(1)
}

function run(cmd, cmdArgs, input) {
  return execFileSync(cmd, cmdArgs, {
    cwd: root,
    encoding: 'utf8',
    input,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

async function getJson(url) {
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      lastErr = err
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  fail(`could not fetch ${url}: ${lastErr?.message ?? lastErr}`)
}

async function steamBranches() {
  const json = await getJson(`https://api.steamcmd.net/v1/info/${APPID}`)
  const b = json?.data?.[String(APPID)]?.depots?.branches
  for (const name of [LIVE, PTB]) {
    if (!b?.[name]?.buildid || !b[name].timeupdated) fail(`Steam response has no ${name} branch`)
  }
  return {
    [LIVE]: { buildid: b[LIVE].buildid, timeupdated: b[LIVE].timeupdated },
    [PTB]: { buildid: b[PTB].buildid, timeupdated: b[PTB].timeupdated },
  }
}

async function steamNews() {
  const json = await getJson(
    `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${APPID}&count=50&maxlength=200`,
  )
  return (json?.appnews?.newsitems ?? []).map((n) => ({ title: n.title, date: n.date, url: n.url }))
}

// Version ids come from the folders in public/game-data; labels from the generated
// src/data/versions.ts when it lists them (a label can mark a PTB the id does not).
function plannerVersions() {
  const ids = readdirSync(dataDir).filter((d) => statSync(`${dataDir}/${d}`).isDirectory())
  const labels = {}
  const file = `${root}src/data/versions.ts`
  if (existsSync(file)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/id:\s*'([^']+)',\s*label:\s*'([^']*)'/g)) {
      labels[m[1]] = m[2]
    }
  }
  return ids.map((id) => ({ id, label: labels[id] ?? id }))
}

function dataChangedTimes(versions) {
  if (run('git', ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    fail('shallow clone: git log cannot date the data; check out with fetch-depth: 0')
  }
  const out = {}
  for (const { id } of versions) {
    const ct = run('git', ['log', '-1', '--format=%ct', '--', `public/game-data/${id}/`]).trim()
    if (ct) out[id] = Number(ct)
  }
  return out
}

// Discord notice through scripts/notify-discord.mjs (always exits 0; no webhook set = no post).
// Only called outside dry runs.
function notify(text) {
  try {
    const out = run(process.execPath, [`${root}scripts/notify-discord.mjs`, text])
    console.log(`  ${out.trim()}`)
  } catch (err) {
    console.warn(`  could not run notify-discord: ${err.message}`)
  }
}

function targetRepo() {
  if (process.env.CHECK_REPO) return process.env.CHECK_REPO
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  return run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim()
}

// Every issue, not just the labelled ones: the hidden marker in the text is what identifies
// ours, so removing the label cannot cause a duplicate. Only text from the workflow or from
// people with write access is kept (see trustedIssues; gh gives an association for comments
// only, so an issue counts when the workflow's github-actions account wrote it).
function listIssues(repo) {
  try {
    const out = run('gh', [
      'issue',
      'list',
      '--repo',
      repo,
      '--state',
      'all',
      '--limit',
      '1000',
      '--json',
      'number,state,body,comments,createdAt,author',
    ])
    return trustedIssues(JSON.parse(out))
  } catch (err) {
    if (!dryRun) fail(`gh issue list failed: ${err.stderr || err.message}`)
    console.warn(`(dry run) could not list issues, assuming none: ${err.stderr || err.message}`)
    return []
  }
}

const graceDays = {
  [LIVE]: Number(process.env.GRACE_DAYS_LIVE ?? DEFAULT_GRACE_DAYS[LIVE]),
  [PTB]: Number(process.env.GRACE_DAYS_PTB ?? DEFAULT_GRACE_DAYS[PTB]),
}
for (const [k, v] of Object.entries(graceDays)) {
  if (!Number.isFinite(v) || v < 0) fail(`grace days for ${k} must be a non-negative number`)
}

const [branches, news] = await Promise.all([steamBranches(), steamNews()])
const versions = plannerVersions()
const dataChanged = dataChangedTimes(versions)
const repo = targetRepo()
const issues = listIssues(repo)

console.log(`now: ${new Date(now * 1000).toISOString()}  repo: ${repo}  dry run: ${dryRun}`)
console.log(
  `planner data last changed: ${versions.map((v) => `${v.id} ${dataChanged[v.id] ? isoDate(dataChanged[v.id]) : 'n/a'}`).join(', ')}`,
)

const decisions = decideAll({ branches, news, versions, dataChanged, issues, now, graceDays })

let labelReady = false
for (const d of decisions) {
  console.log(`\n[${d.branch}] build ${d.buildid} updated ${isoDate(d.updatedAt)}`)
  console.log(`  status: ${d.status}; action: ${d.action}; ${d.reason}`)
  if (d.since) {
    console.log(
      `  uncovered since ${isoDate(d.since)} (${d.announcementSource}); due ${isoDate(d.dueAt)}`,
    )
  }
  if (d.action === 'none') continue

  const text = d.action === 'open' ? d.body : d.comment
  console.log(
    d.action === 'open'
      ? `  would open issue: ${d.title}`
      : `  would comment on issue #${d.issueNumber}`,
  )
  if (dryRun) {
    console.log(text.replace(/^/gm, '    | '))
    continue
  }
  if (d.action === 'open') {
    if (!labelReady) {
      run('gh', [
        'label',
        'create',
        label,
        '--repo',
        repo,
        '--force',
        '--color',
        '1d76db',
        '--description',
        'Steam has a newer build than the planner data',
      ])
      labelReady = true
    }
    const url = run(
      'gh',
      ['issue', 'create', '--repo', repo, '--title', d.title, '--label', label, '--body-file', '-'],
      d.body,
    ).trim()
    console.log(`  opened ${url}`)
    notify(renderNotice(d, url))
  } else {
    run(
      'gh',
      ['issue', 'comment', String(d.issueNumber), '--repo', repo, '--body-file', '-'],
      d.comment,
    )
    console.log(`  commented on #${d.issueNumber}`)
    notify(renderNotice(d, `https://github.com/${repo}/issues/${d.issueNumber}`))
  }
}
