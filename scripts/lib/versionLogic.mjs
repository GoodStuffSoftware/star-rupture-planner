// Pure version-ordering helpers shared by scripts/refresh-data.mjs and its tests.

// Sort key: playtest, earlyaccess, then updates by number (update1 < update1_PTB < update2_QoL).
export function versionSortKey(name) {
  if (name === 'playtest') return '0_playtest'
  if (name === 'earlyaccess') return '1_earlyaccess'
  const m = name.match(/update(\d+)(.*)/)
  if (m) return `2_${m[1].padStart(3, '0')}${m[2]}`
  return `3_${name}`
}

export function sortVersions(ids) {
  return [...ids].sort((a, b) => versionSortKey(a).localeCompare(versionSortKey(b)))
}

// A version is a test build when its id or label marks it as PTB, playtest or test.
export function isTestVersion(id, label = '') {
  return /(^|[^a-z])(ptb|playtest|test)([^a-z]|$)/i.test(`${id} ${label}`)
}

// Default = newest non-test version (input in chronological order). Falls back to the
// newest version overall only if every version is a test build.
export function pickDefaultVersion(versions) {
  const stable = versions.filter((v) => !isTestVersion(v.id, v.label))
  const pool = stable.length ? stable : versions
  return pool[pool.length - 1].id
}

// ---- Naming a new Steam build (used by scripts/publish-game-data.mjs) ----
//
// decideVersionId() picks the public/game-data/<id> folder from the Steam branch and the title of the
// Steam news post that announced the build. Pure: no I/O. null = cannot be decided; the caller must
// notify and NOT publish.
//
//   "Update 3: Custom Game ... now on Public Test Branch"  + test branch -> update3_PTB
//   "Update 3 ... now available"                          + public       -> update3
//   "Hotfix 0.3.5 - now available!" (no "Update N")       + public       -> the current default live version
//
// Rules (the id always agrees with isTestVersion above: a PTB id is a test version and anything else is
// not, so pickDefaultVersion never picks a PTB):
//  - Branch: "public" is live; a name containing test, ptb, beta, preview or experimental is a test
//    branch; any other branch name is undecidable.
//  - The title must name exactly one update number ("Update 3", "update3"); none, or two different
//    numbers, is undecidable.
//  - A live build whose title announces a test branch release ("now on Public Test Branch") is a conflict.
//  - Live: only a live-release title ("Update N ... now available / live / out", "released", with none of
//    the teaser words: announcement, preview, coming, soon, roadmap ...) can create or pick an update's
//    folder. Any other title, or none (a hotfix), maps to the current default live version: a hotfix updates
//    the version in place. An announcement or teaser post never names a live build.
//    For a live-release title: if exactly one non-test folder of that update number already exists, it maps
//    to it; if several exist, "update<N>" exactly when present, else undecidable. With none: "update<N>",
//    plus "_QoL" when the title says QoL / Quality of Life.
//  - Test: "update<N>_PTB", always (a PTB hotfix lands in the same folder).
const TEST_BRANCH = /test|ptb|beta|preview|experimental/i
// "now on the Public Test Branch", "live in PTB", a leading "PTB:" label: a post announcing a test build.
const TEST_ANNOUNCEMENT =
  /\b(now|live|available|released|out)\b[^.]*\b(on|in)\b[^.]*\b(public test branch|ptb|test branch)\b|^\s*(\[?ptb\]?|public test branch)\s*[:-]/i

// A live-release post: "Update 3 is now available", "Update 4: Quality of Life now live", "Update 3 released".
const LIVE_RELEASE = /\b(now\s+(available|live|out)|(is|are)\s+(live|available|out)|(available|live|out)\s+now|released)\b/i
// Forward-looking posts never name a live build, even with a release verb in them ("available soon").
const TEASER =
  /\b(announce(s|d|ment|ments)?|preview|previews|coming|soon|upcoming|roadmap|devlog|dev\s*diary|teaser|sneak\s*peek|next\s+update|will\s+be)\b/i

/** True when the title announces a LIVE release of exactly one update number (not a hotfix note, not a teaser). */
export function isLiveReleaseTitle(title) {
  const text = String(title ?? '')
  return parseUpdateNumber(text) !== null && LIVE_RELEASE.test(text) && !TEASER.test(text) && !TEST_ANNOUNCEMENT.test(text)
}

/** The version a live hotfix updates in place: the default (newest non-test) folder among existingIds, or null. */
export function currentLiveVersion(existingIds = []) {
  const live = sortVersions(existingIds).filter((id) => !isTestVersion(id))
  return live.length ? live[live.length - 1] : null
}

export function classifyBranch(branch) {
  const b = String(branch ?? '').trim()
  if (b === 'public') return 'live'
  if (b && TEST_BRANCH.test(b)) return 'test'
  return null
}

/** The single update number a title names ("Update 3", "update3", "Update #3"), or null. */
export function parseUpdateNumber(title) {
  const nums = new Set()
  for (const m of String(title ?? '').matchAll(/\bupdate\s*#?\s*(\d+)\b/gi)) nums.add(Number(m[1]))
  return nums.size === 1 ? [...nums][0] : null
}

/** existingIds = the folders under public/game-data. Returns the folder id, or null. */
export function decideVersionId({ branch, title, existingIds = [] }) {
  const kind = classifyBranch(branch)
  const n = parseUpdateNumber(title)
  if (!kind) return null
  const text = String(title ?? '')

  let id
  if (kind === 'test') {
    if (n === null) return null
    id = `update${n}_PTB`
  } else if (TEST_ANNOUNCEMENT.test(text)) {
    return null
  } else if (!isLiveReleaseTitle(text)) {
    // A hotfix, or a post that is not a live release (announcement, teaser): the current live version, in place.
    // Two different update numbers in one title is ambiguous, not a hotfix.
    if (n === null && new Set([...text.matchAll(/\bupdate\s*#?\s*(\d+)\b/gi)].map((m) => m[1])).size > 1) return null
    id = currentLiveVersion(existingIds)
    if (id === null) return null
  } else {
    const family = existingIds.filter((e) => new RegExp(`^update${n}(_|$)`).test(e) && !isTestVersion(e))
    if (family.length === 1) id = family[0]
    else if (family.length > 1) id = family.includes(`update${n}`) ? `update${n}` : null
    else id = `update${n}${/\bqol\b|quality of life/i.test(text) ? '_QoL' : ''}`
    if (id === null) return null
  }
  // Guard: the id is a test version exactly when the branch is a test branch.
  if (isTestVersion(id) !== (kind === 'test')) return null
  return id
}
