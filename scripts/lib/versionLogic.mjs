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
