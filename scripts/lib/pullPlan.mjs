// Pure logic of .github/workflows/publish-game-data.yml: which CI artifacts to trust and pull, which Steam news
// post names a build, and the Discord text. No I/O; scripts/plan-game-pull.mjs feeds it and the workflow acts on it.
import { classifyBranch, isLiveReleaseTitle, parseUpdateNumber } from './versionLogic.mjs'

// ---- who may produce the data ----------------------------------------------------------------------------------
// msantoro12/starrupture-ci is PUBLIC and what we pull ends up in production, so an artifact is only accepted
// when its run is provably ours: in that repo itself (no fork), on its main branch, started by an allowed event,
// from an allowed workflow, and finished with success. The same rules hold for the manual run_id / buildid paths.
export const CI_REPO = 'msantoro12/starrupture-ci'
export const CI_REPO_ID = 1438948256
export const TRUSTED_BRANCH = 'main'
/** workflow_call runs report the caller's event (schedule ...); it is allowed too in case GitHub reports it as such. */
export const ALLOWED_EVENTS = ['schedule', 'workflow_dispatch', 'push', 'workflow_call']
/** sr-watch.yml calls sr-data-extract.yml (a reusable workflow); a run's path is the workflow that started it. */
export const ALLOWED_WORKFLOW_PATHS = ['.github/workflows/sr-watch.yml', '.github/workflows/sr-data-extract.yml']

export const ARTIFACT_PREFIX = 'sr-data-'
// sr-data-<steam branch>-<buildid>; the branch is validated the same way the CI validates it.
const ARTIFACT_NAME = /^sr-data-([A-Za-z0-9_-]+)-(\d+)$/
const DAY = 86400

/** "sr-data-public_test_branch-26461198" -> { branch, buildid }. Anything else (map-mode-*, sr-data-tools-*, legacy sr-data-<id>) -> null. */
export function parseArtifactName(name) {
  const m = ARTIFACT_NAME.exec(String(name ?? ''))
  if (!m || !classifyBranch(m[1])) return null
  return { branch: m[1], buildid: m[2] }
}

/** The key a build is deduped and tagged on: its Steam branch plus its build id (a build promoted to public keeps its id). */
export const buildKey = (branch, buildid) => `${branch}:${buildid}`

/** A git tag suffix "<branch>-<buildid>" -> "branch:buildid" (null for anything else, e.g. the legacy digits-only form). */
export function keyOfTagSuffix(suffix) {
  const m = /^([A-Za-z0-9_-]+)-(\d+)$/.exec(String(suffix ?? '').trim())
  return m && classifyBranch(m[1]) ? buildKey(m[1], m[2]) : null
}

const sameId = (a, b) => a !== undefined && a !== null && String(a) === String(b)

/** What the artifact listing already tells about the run behind an artifact. Empty = acceptable so far. */
export function artifactProblems(a, { repoId = CI_REPO_ID } = {}) {
  const run = a?.workflow_run
  const problems = []
  if (!run) return ['the artifact has no workflow_run']
  if (!sameId(run.repository_id, repoId)) problems.push(`the run is in repository ${run.repository_id}, not ${repoId}`)
  if (!sameId(run.head_repository_id, repoId)) problems.push(`the run's head repository is ${run.head_repository_id}, not ${repoId} (a fork)`)
  if (run.head_branch !== TRUSTED_BRANCH) problems.push(`the run is on branch "${run.head_branch}", not ${TRUSTED_BRANCH}`)
  return problems
}

/**
 * The full check on the run (GET /repos/<CI repo>/actions/runs/<id>). Empty = the run may supply data.
 * @param {object} run  the API run object
 * @param {{ runId?: number|string, repo?: string, repoId?: number }} expect
 */
export function runProblems(run, { runId, repo = CI_REPO, repoId = CI_REPO_ID } = {}) {
  const problems = []
  if (!run || typeof run !== 'object') return ['no run object']
  if (runId !== undefined && !sameId(run.id, runId)) problems.push(`the run is ${run.id}, not ${runId}`)
  if (!sameId(run.repository?.id, repoId)) problems.push(`the run's repository is ${run.repository?.id}, not ${repoId}`)
  if (run.repository?.full_name !== repo) problems.push(`the run's repository is ${run.repository?.full_name}, not ${repo}`)
  if (!sameId(run.head_repository?.id, repoId) || run.head_repository?.full_name !== repo) {
    problems.push(`the run's head repository is ${run.head_repository?.full_name ?? '?'} (${run.head_repository?.id ?? '?'}), not ${repo}: no forks`)
  }
  if (run.head_branch !== TRUSTED_BRANCH) problems.push(`the run is on branch "${run.head_branch}", not ${TRUSTED_BRANCH}`)
  if (!ALLOWED_EVENTS.includes(run.event)) problems.push(`the run's event "${run.event}" is not one of ${ALLOWED_EVENTS.join(', ')}`)
  // "path" can carry a ref suffix (".github/workflows/x.yml@refs/heads/main")
  const path = String(run.path ?? '').replace(/@.*$/, '')
  if (!ALLOWED_WORKFLOW_PATHS.includes(path)) problems.push(`the run's workflow "${run.path}" is not one of ${ALLOWED_WORKFLOW_PATHS.join(', ')}`)
  if (run.status !== undefined && run.status !== 'completed') problems.push(`the run's status is "${run.status}", not completed`)
  if (run.conclusion !== 'success') problems.push(`the run's conclusion is "${run.conclusion}", not success`)
  return problems
}

/** The artifact's own pipeline.json must agree with its name and its run: branch, build id, run id. */
export function pipelineProblems(pipeline, { branch, buildid, runId }) {
  const problems = []
  if (!pipeline || typeof pipeline !== 'object') return ['pipeline.json is missing or not an object']
  if (pipeline.status !== 'ok') problems.push(`pipeline.json status is "${pipeline.status}", not ok`)
  if (pipeline.branch !== branch) problems.push(`pipeline.json is for branch "${pipeline.branch}", the artifact name says "${branch}"`)
  if (!sameId(pipeline.buildid, buildid)) problems.push(`pipeline.json is for build ${pipeline.buildid}, the artifact name says ${buildid}`)
  if (!sameId(pipeline.run_id ?? pipeline.runId, runId)) problems.push(`pipeline.json is from run ${pipeline.run_id ?? pipeline.runId}, the artifact's run is ${runId}`)
  return problems
}

/**
 * What the version folders already say they hold. sources = the parsed SOURCE.json of each folder.
 * A folder without one (upstream-owned) contributes nothing.
 * @returns {{ keys: Set<string>, newest: Map<string, number> }} "branch:buildid" keys, newest buildid per Steam branch
 */
export function publishedBuilds(sources) {
  const keys = new Set()
  const newest = new Map()
  for (const s of sources) {
    if (!s || s.source !== 'game-extract' || !s.buildid || !s.steamBranch) continue
    keys.add(buildKey(s.steamBranch, s.buildid))
    const n = Number(s.buildid)
    if (!(newest.get(s.steamBranch) >= n)) newest.set(s.steamBranch, n)
  }
  return { keys, newest }
}

/** True when a folder already holds this branch's build, or a newer one (never publish backwards). */
export function alreadyPublished(published, branch, buildid) {
  return published.keys.has(buildKey(branch, buildid)) || published.newest.get(branch) >= Number(buildid)
}

/**
 * Splits the CI repo's artifact listing into the ones we may use and the ones we refuse (with the reasons).
 * Only sr-data-<branch>-<buildid> names are looked at; of those, an expired one or one whose run fails
 * artifactProblems is refused, so a forged artifact can neither be picked nor outrank the genuine one.
 */
export function screenArtifacts(artifacts, { repoId = CI_REPO_ID } = {}) {
  const accepted = []
  const rejected = []
  for (const a of artifacts ?? []) {
    const parsed = parseArtifactName(a?.name)
    if (!parsed || a.expired) continue
    const problems = artifactProblems(a, { repoId })
    if (problems.length) rejected.push({ id: a.id, name: a.name, runId: a.workflow_run?.id ?? null, problems })
    else accepted.push({ ...parsed, artifact: a })
  }
  return { accepted, rejected }
}

/**
 * Which artifacts of starrupture-ci to process, oldest build first.
 * @param {{ artifacts: Array<object>, seen?: Set<string>, buildid?: string, branch?: string, limit?: number, repoId?: number }} input
 *   seen: "branch:buildid" keys that were already handled (published, unchanged or reported). `buildid` (and
 *   optionally `branch`) forces matching builds (ignores seen and limit), for a manual dispatch; it does NOT skip the provenance screen.
 * @returns {Array<{ key: string, branch: string, buildid: string, artifactId: number, runId: number|null, createdAt: string|null }>}
 */
export function pickCandidates({ artifacts, seen = new Set(), buildid, branch, limit = 3, repoId = CI_REPO_ID }) {
  const byKey = new Map()
  for (const { branch: b, buildid: id, artifact: a } of screenArtifacts(artifacts, { repoId }).accepted) {
    if (buildid && id !== String(buildid)) continue
    if (branch && b !== branch) continue
    const key = buildKey(b, id)
    const prev = byKey.get(key)
    if (!prev || String(a.created_at ?? '') > String(prev.created_at ?? '')) byKey.set(key, { ...a, branch: b, buildid: id })
  }
  let out = [...byKey].map(([key, a]) => ({
    key,
    branch: a.branch,
    buildid: a.buildid,
    artifactId: a.id,
    runId: a.workflow_run?.id ?? null,
    createdAt: a.created_at ?? null,
  }))
  const forced = Boolean(buildid)
  if (!forced) out = out.filter((c) => !seen.has(c.key))
  out.sort((a, b) => Number(a.buildid) - Number(b.buildid) || a.branch.localeCompare(b.branch))
  return forced ? out : out.slice(0, limit)
}

// "Beta" is not a test word here: "Update 4 is out of beta" is a live post. The branch name is classified separately.
const TEST_WORDS = /\b(ptb|public test branch|test branch|playtest)\b/i

/**
 * The Steam news post that names a build. Test branch: the test-branch post closest in time to the build, with exactly
 * one "Update N" in its title. Live branch: the closest LIVE-RELEASE post ("Update N ... now available/live", see
 * isLiveReleaseTitle): an announcement or teaser never names a live build, and no such post means a hotfix (the
 * caller maps it to the current live version). Posts dated more than a day after the artifact was made, or more
 * than a week before it, do not count.
 * @param {{ items: Array<{title:string,date:number,url?:string}>, branch: string, builtAt: string|number }} input
 *   builtAt: ISO time or epoch seconds of the artifact
 * @returns {{ title: string, date: number, url?: string } | null}
 */
export function pickNewsTitle({ items, branch, builtAt }) {
  const kind = classifyBranch(branch)
  const built = typeof builtAt === 'number' ? builtAt : Date.parse(builtAt) / 1000
  if (!kind || !Number.isFinite(built)) return null
  const inWindow = (n) => n && typeof n.title === 'string' && n.date <= built + DAY && n.date >= built - 7 * DAY
  const wanted = (n) =>
    kind === 'test' ? parseUpdateNumber(n.title) !== null && TEST_WORDS.test(n.title) : isLiveReleaseTitle(n.title) && !TEST_WORDS.test(n.title)
  // the post closest in time to the build; on a tie the one posted before it
  const rank = (n) => [Math.abs(n.date - built), n.date <= built ? 0 : 1]
  const hit = (items ?? []).filter((n) => inWindow(n) && wanted(n)).sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1])[0]
  return hit ? { title: hit.title, date: hit.date, url: hit.url } : null
}

/**
 * What to do with a build that has no news post (test branch only: a live build without one is a hotfix).
 * 'wait': a post may still appear inside the window (the artifact is under a day old): do not tag the build as handled.
 * 'give-up': the window is closed; a re-run would give the same answer, so tag it and ask for a manual title.
 */
export function noNewsAction({ builtAt, now }) {
  const built = typeof builtAt === 'number' ? builtAt : Date.parse(builtAt) / 1000
  const t = typeof now === 'number' ? now : Date.parse(now) / 1000
  if (!Number.isFinite(built) || !Number.isFinite(t)) return 'give-up'
  return t < built + DAY ? 'wait' : 'give-up'
}

const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 3)}...` : String(s))

/**
 * The Discord text for one finished build.
 * outcome: published | gate-failed | name-undecided | no-news | no-news-final | no-artifact-data | unchanged
 * (publish-game-data.mjs itself already posts for gate-failed and name-undecided; the workflow uses this for
 * published, no-news and unusable artifacts.)
 */
export function renderNotice({ outcome, versionId, branch, buildid, title, changelog, links = {} }) {
  const head = `Steam ${branch ?? '?'} build ${buildid}${title ? ` ("${clip(title, 100)}")` : ''}`
  const tail = Object.entries(links)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
  let body
  switch (outcome) {
    case 'published':
      body = [`Game data published as ${versionId}, deploy started. ${head}.`, `Changes vs the previous data:\n${clip(changelog || 'No value changes.', 900)}`]
      break
    case 'no-news':
      body = [`Game data not published yet: no Steam news post names ${head}. It is retried every run for a day; no action needed unless the post stays missing.`]
      break
    case 'no-news-final':
      body = [`Game data NOT published: no Steam news post names ${head}. Publish by hand: dispatch the workflow with buildid, branch and title.`]
      break
    default:
      body = [`Game data NOT published: ${outcome}. ${head}.`]
  }
  return [...body, ...tail].join('\n')
}
