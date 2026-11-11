// The coverage tags of .github/workflows/publish-game-data.yml, as pure rules (no I/O). The mod CI's reconcile
// (msantoro12/starrupture-ci, sr-watch.yml) reads them with `git ls-remote --tags` to find a playable build that has
// no planner data yet, so their meaning is a contract:
//
//   srdata-<branch>-<buildid>          COVERED: the planner has data from exactly this build (published, or verified
//                                      unchanged against the folder it would replace).
//   srdata-failed-<branch>-<buildid>   FAILED: the planner looked at this build and could not cover it (converter gate,
//                                      no version name, unusable artifact, publish error, news post missing for a day).
//                                      Discord is told. It is never the covered tag. Reconcile treats it as handled and
//                                      does not re-dispatch; a person retries by deleting the tag or dispatching the
//                                      workflow with the buildid.
//   (no tag)                           A test build waiting for its Steam news post (retried every run for a day), and
//                                      a build never looked at. srnonews-<branch>-<buildid> only records that Discord
//                                      was told about the wait; it is not a coverage record.
import { classifyBranch } from './versionLogic.mjs'

export const COVERED_PREFIX = 'srdata-'
export const FAILED_PREFIX = 'srdata-failed-'
export const NONEWS_PREFIX = 'srnonews-'

/** The outcomes of one build in the workflow, grouped by what they mean for coverage. */
const COVERED_OUTCOMES = new Set([
  'published', // data committed to main
  'unchanged', // converted, identical to the folder it would replace
  'already-published', // a SOURCE.json already holds this build, or a newer one of its branch (the older build is superseded, so it counts)
])
const NO_TAG_OUTCOMES = new Set([
  'no-news-wait', // a news post may still appear: retried
])

/**
 * @param {string} outcome  publish-game-data.mjs outcome (published, unchanged, already-published, gate-failed,
 *   name-undecided, bad-extract, publish-failed ...) or a workflow-level one: no-news-wait, no-news-final, bad-artifact
 * @returns {'covered'|'failed'|'none'} which tag to record. Anything unknown is a failure: never covered by default.
 */
export function coverageKind(outcome) {
  if (COVERED_OUTCOMES.has(outcome)) return 'covered'
  if (NO_TAG_OUTCOMES.has(outcome)) return 'none'
  return 'failed'
}

const BRANCH = /^[A-Za-z0-9_-]+$/

/** The tag for a kind, or null for 'none'. Throws on a branch or build id that could not be a real tag. */
export function coverageTagName(kind, branch, buildid) {
  if (kind === 'none') return null
  if (!classifyBranch(branch) || !BRANCH.test(branch)) throw new Error(`not a Steam branch: ${JSON.stringify(branch)}`)
  if (!/^\d+$/.test(String(buildid))) throw new Error(`not a build id: ${JSON.stringify(buildid)}`)
  if (kind === 'covered') return `${COVERED_PREFIX}${branch}-${buildid}`
  if (kind === 'failed') return `${FAILED_PREFIX}${branch}-${buildid}`
  throw new Error(`unknown coverage kind ${JSON.stringify(kind)}`)
}

/** The tag to record for an outcome, or null when none is recorded. */
export const coverageTagFor = (outcome, branch, buildid) => coverageTagName(coverageKind(outcome), branch, buildid)

/**
 * "srdata-public-26461198" -> { kind: 'covered', branch, buildid }; "srdata-failed-public-26461198" -> kind 'failed';
 * anything else (srnonews-*, the legacy digits-only tag, other tools) -> null. A leading refs/tags/ is accepted.
 */
export function parseCoverageTag(name) {
  const tag = String(name ?? '').trim().replace(/^refs\/tags\//, '')
  if (!tag.startsWith(COVERED_PREFIX)) return null
  const failed = tag.startsWith(FAILED_PREFIX)
  const m = /^([A-Za-z0-9_-]+)-(\d+)$/.exec(tag.slice(failed ? FAILED_PREFIX.length : COVERED_PREFIX.length))
  if (!m || !classifyBranch(m[1])) return null
  return { kind: failed ? 'failed' : 'covered', branch: m[1], buildid: m[2] }
}

/** "branch:buildid" keys of the builds with a tag of the given kinds (default both: what is already handled). */
export function taggedKeys(names, kinds = ['covered', 'failed']) {
  const keys = new Set()
  for (const n of names) {
    const t = parseCoverageTag(n)
    if (t && kinds.includes(t.kind)) keys.add(`${t.branch}:${t.buildid}`)
  }
  return keys
}
