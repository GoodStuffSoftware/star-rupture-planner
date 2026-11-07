// Pure logic of .github/workflows/publish-game-data.yml: which CI artifacts to pull, which Steam news post
// names a build, and the Discord text. No I/O; scripts/plan-game-pull.mjs feeds it and the workflow acts on it.
import { classifyBranch, parseUpdateNumber } from './versionLogic.mjs'

export const ARTIFACT_PREFIX = 'sr-data-'
const ARTIFACT_NAME = /^sr-data-(\d+)$/
const DAY = 86400

/** "sr-data-26461198" -> "26461198", anything else (map-mode-*, sr-data-tools-*) -> null. */
export function buildidOfArtifact(name) {
  return ARTIFACT_NAME.exec(String(name ?? ''))?.[1] ?? null
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
    keys.add(`${s.steamBranch}:${s.buildid}`)
    const n = Number(s.buildid)
    if (!(newest.get(s.steamBranch) >= n)) newest.set(s.steamBranch, n)
  }
  return { keys, newest }
}

/** True when a folder already holds this branch's build, or a newer one (never publish backwards). */
export function alreadyPublished(published, branch, buildid) {
  return published.keys.has(`${branch}:${buildid}`) || published.newest.get(branch) >= Number(buildid)
}

/**
 * Which artifacts of starrupture-ci to process, oldest build first.
 * @param {{ artifacts: Array<{id:number,name:string,expired?:boolean,created_at?:string,workflow_run?:{id:number}}>,
 *           seen?: Set<string>, buildid?: string, limit?: number }} input
 *   seen: buildids that were already handled (published, unchanged or reported). `buildid` forces one build
 *   (ignores seen and limit), for a manual dispatch.
 * @returns {Array<{ buildid: string, artifactId: number, runId: number|null, createdAt: string|null }>}
 */
export function pickCandidates({ artifacts, seen = new Set(), buildid, limit = 3 }) {
  const byBuild = new Map()
  for (const a of artifacts ?? []) {
    const id = buildidOfArtifact(a.name)
    if (!id || a.expired) continue
    if (buildid && id !== String(buildid)) continue
    const prev = byBuild.get(id)
    if (!prev || String(a.created_at ?? '') > String(prev.created_at ?? '')) byBuild.set(id, a)
  }
  let out = [...byBuild].map(([id, a]) => ({
    buildid: id,
    artifactId: a.id,
    runId: a.workflow_run?.id ?? null,
    createdAt: a.created_at ?? null,
  }))
  if (!buildid) out = out.filter((c) => !seen.has(c.buildid))
  out.sort((a, b) => Number(a.buildid) - Number(b.buildid))
  return buildid ? out : out.slice(0, limit)
}

const TEST_WORDS = /\b(ptb|public test branch|test branch|playtest|beta)\b/i

/**
 * The Steam news post that names a build: for a test branch the test-branch post closest in time to the build, with exactly one
 * "Update N" in its title, for the live branch the closest post that is not about the test branch. Posts dated
 * more than a day after the artifact was made, or more than a week before it, do not count.
 * @param {{ items: Array<{title:string,date:number,url?:string}>, branch: string, builtAt: string|number }} input
 *   builtAt: ISO time or epoch seconds of the artifact
 * @returns {{ title: string, date: number, url?: string } | null}
 */
export function pickNewsTitle({ items, branch, builtAt }) {
  const kind = classifyBranch(branch)
  const built = typeof builtAt === 'number' ? builtAt : Date.parse(builtAt) / 1000
  if (!kind || !Number.isFinite(built)) return null
  const fits = (n) =>
    n && typeof n.title === 'string' && n.date <= built + DAY && n.date >= built - 7 * DAY && parseUpdateNumber(n.title) !== null
  const wanted = (n) => (kind === 'test' ? TEST_WORDS.test(n.title) : !TEST_WORDS.test(n.title))
  // the post closest in time to the build; on a tie the one posted before it
  const rank = (n) => [Math.abs(n.date - built), n.date <= built ? 0 : 1]
  const hit = (items ?? []).filter((n) => fits(n) && wanted(n)).sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1])[0]
  return hit ? { title: hit.title, date: hit.date, url: hit.url } : null
}

const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 3)}...` : String(s))

/**
 * The Discord text for one finished build.
 * outcome: published | gate-failed | name-undecided | no-news | no-artifact-data | unchanged
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
      body = [`Game data NOT published: no Steam news post names ${head}. Publish by hand, or re-run the workflow once the post is up.`]
      break
    default:
      body = [`Game data NOT published: ${outcome}. ${head}.`]
  }
  return [...body, ...tail].join('\n')
}
