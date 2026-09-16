import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const pkgPath = path.resolve('package.json')
const changelogPath = path.resolve('CHANGELOG.md')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const version = pkg.version

console.log(`\n🔍 [Release Gate] Verifying version control integrity...`)
console.log(`   package.json version: v${version}`)

if (!version || version === '0.0.0') {
  console.error(`❌ [Gate Error] package.json version is invalid or default ("${version}").`)
  console.error(`   Please set a valid semver in package.json (e.g., 1.4.0).\n`)
  process.exit(1)
}

if (!fs.existsSync(changelogPath)) {
  console.error(`❌ [Gate Error] CHANGELOG.md file missing.`)
  process.exit(1)
}

const changelogContent = fs.readFileSync(changelogPath, 'utf8')
const expectedChangelogHeader = `## [${version}]`

if (!changelogContent.includes(expectedChangelogHeader)) {
  console.error(`❌ [Gate Error] CHANGELOG.md is missing an entry for version [${version}].`)
  console.error(`   Expected header "${expectedChangelogHeader}" in CHANGELOG.md.\n`)
  process.exit(1)
}

console.log(`  ✓ CHANGELOG.md entry for [${version}] confirmed.`)

try {
  const tags = execSync('git tag -l', { encoding: 'utf8' })
    .split('\n')
    .map((t) => t.trim())
  const expectedTag = `v${version}`
  if (!tags.includes(expectedTag)) {
    console.log(`  ℹ Note: Git tag "${expectedTag}" not found yet (create with: git tag -a ${expectedTag} -m "${expectedTag}: release")`)
  } else {
    console.log(`  ✓ Git tag "${expectedTag}" confirmed.`)
  }
} catch {
  // Non-fatal if git is not initialized or tags cannot be queried
}

console.log(`\n✅ [Release Gate Passed] Versioning, CHANGELOG, and package.json align for v${version}.\n`)
