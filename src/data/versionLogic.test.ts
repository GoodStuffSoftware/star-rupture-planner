import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  pickDefaultVersion,
  sortVersions,
  isTestVersion,
  decideVersionId,
  classifyBranch,
  parseUpdateNumber,
  isLiveReleaseTitle,
} from '../../scripts/lib/versionLogic.mjs'
import {
  readSource,
  refreshShouldSkip,
  listSkippedFolders,
  partitionVersions,
  gameExtractSource,
  writeSource,
} from '../../scripts/lib/provenance.mjs'
import { renderVersionsTs } from '../../scripts/lib/versionsFile.mjs'
import { newestFirst } from './versionOrder'
import { VERSIONS, DEFAULT_VERSION } from './versions'

const label = (id: string) => ({ id, label: id })

describe('default version', () => {
  it('skips PTB, playtest and test versions', () => {
    const ids = sortVersions([
      'update3_PTB',
      'update2_QoL',
      'update1_PTB',
      'update1',
      'playtest',
      'earlyaccess',
    ])
    expect(ids).toEqual([
      'playtest',
      'earlyaccess',
      'update1',
      'update1_PTB',
      'update2_QoL',
      'update3_PTB',
    ])
    expect(pickDefaultVersion(ids.map(label))).toBe('update2_QoL')
  })

  it('treats a PTB label as a test version too', () => {
    expect(isTestVersion('update4', 'Update 4 PTB')).toBe(true)
    expect(isTestVersion('update2_QoL', 'Update 2 QoL')).toBe(false)
  })

  it('picks a newer stable release once one exists', () => {
    const ids = sortVersions(['update2_QoL', 'update3_PTB', 'update3'])
    expect(pickDefaultVersion(ids.map(label))).toBe('update3')
  })

  it('keeps update2_QoL as the shipped default', () => {
    expect(DEFAULT_VERSION).toBe('update2_QoL')
    expect(pickDefaultVersion(VERSIONS)).toBe('update2_QoL')
  })
})

describe('selector order', () => {
  it('lists newest first without mutating VERSIONS', () => {
    const before = VERSIONS.map((v) => v.id)
    expect(newestFirst(VERSIONS).map((v) => v.id)).toEqual([...before].reverse())
    expect(newestFirst(VERSIONS)[0].id).toBe(sortVersions(before).at(-1))
    expect(VERSIONS.map((v) => v.id)).toEqual(before)
  })

  it('puts a future update3_PTB on top', () => {
    const ids = sortVersions([...VERSIONS.map((v) => v.id), 'update3_PTB'])
    expect(newestFirst(ids.map(label))[0].id).toBe('update3_PTB')
  })
})

describe('decideVersionId (naming a new Steam build)', () => {
  const existing = ['playtest', 'earlyaccess', 'update1', 'update1_PTB', 'update2_QoL']
  const PTB_POST = 'StarRupture Update 3: Custom Game - now on Public Test Branch'

  it('names a test-branch build from the PTB post update3_PTB', () => {
    expect(
      decideVersionId({ branch: 'public_test_branch', title: PTB_POST, existingIds: existing }),
    ).toBe('update3_PTB')
  })

  it('names a live "now available" post update3', () => {
    expect(
      decideVersionId({
        branch: 'public',
        title: 'StarRupture Update 3 is now available',
        existingIds: existing,
      }),
    ).toBe('update3')
  })

  it('adds _QoL for a new live QoL update that has no folder yet', () => {
    expect(
      decideVersionId({ branch: 'public', title: 'Update 4: Quality of Life now available' }),
    ).toBe('update4_QoL')
  })

  it('maps a live hotfix to the folder of that update that is already published', () => {
    expect(
      decideVersionId({
        branch: 'public',
        title: 'Update 2 Hotfix 1 now available',
        existingIds: existing,
      }),
    ).toBe('update2_QoL')
    expect(
      decideVersionId({
        branch: 'public',
        title: 'Update 2 Quality of Life now available',
        existingIds: existing,
      }),
    ).toBe('update2_QoL')
  })

  it('maps a PTB hotfix to the same PTB folder', () => {
    expect(
      decideVersionId({
        branch: 'public_test_branch',
        title: 'Update 3 PTB Hotfix 2',
        existingIds: [...existing, 'update3_PTB'],
      }),
    ).toBe('update3_PTB')
  })

  it('does not map a live build onto a PTB folder', () => {
    expect(
      decideVersionId({
        branch: 'public',
        title: 'Update 3 now available',
        existingIds: [...existing, 'update3_PTB'],
      }),
    ).toBe('update3')
  })

  it('returns null when the name cannot be decided', () => {
    expect(
      decideVersionId({
        branch: 'public',
        title: 'Update 2 and Update 3 roadmap',
        existingIds: existing,
      }),
    ).toBeNull()
    expect(
      decideVersionId({ branch: 'mystery_branch', title: 'Update 3 now available' }),
    ).toBeNull()
    expect(decideVersionId({ branch: '', title: 'Update 3 now available' })).toBeNull()
    expect(decideVersionId({ branch: 'public', title: '' })).toBeNull() // a hotfix, but no live version exists to update
    expect(
      decideVersionId({
        branch: 'public',
        title: 'Update 2 and Update 3 roadmap',
        existingIds: existing,
      }),
    ).toBeNull()
    // live build, but the post announces the test branch: conflict
    expect(decideVersionId({ branch: 'public', title: PTB_POST, existingIds: existing })).toBeNull()
    // two live folders of one update and none exactly named update2
    expect(
      decideVersionId({
        branch: 'public',
        title: 'Update 2 is now available',
        existingIds: ['update2_QoL', 'update2_Other'],
      }),
    ).toBeNull()
  })

  it('maps a live build without a live-release title (a hotfix) to the current live version', () => {
    for (const title of [
      'Hotfix 0.3.5 - now available!',
      'Hotfix 2 notes',
      'Update 2 Hotfix 1',
      'Update 2 hotfix',
      '',
      'Patch notes 0.3.5',
    ]) {
      expect(decideVersionId({ branch: 'public', title, existingIds: existing })).toBe(
        'update2_QoL',
      )
    }
    // the current live version is the newest non-test folder, whatever PTB folders exist
    expect(
      decideVersionId({
        branch: 'public',
        title: 'Hotfix',
        existingIds: [...existing, 'update3_PTB'],
      }),
    ).toBe('update2_QoL')
    expect(
      decideVersionId({ branch: 'public', title: 'Hotfix', existingIds: [...existing, 'update3'] }),
    ).toBe('update3')
  })

  it('only a live-release title creates a new live version', () => {
    for (const title of [
      'StarRupture Update 3 is now available',
      'Update 3 now live',
      'Update 3 is out now',
      'Update 3 released',
    ]) {
      expect(decideVersionId({ branch: 'public', title, existingIds: existing })).toBe('update3')
    }
    expect(isLiveReleaseTitle('Update 3 Hotfix 1')).toBe(false)
    expect(isLiveReleaseTitle('Update 3 and Update 4 now available')).toBe(false)
  })

  it('an announcement or teaser never names a live build: it never creates a version', () => {
    for (const title of [
      'Update 4 Announcement: coming soon',
      'Update 4 preview',
      'Update 4 - available soon',
      'Update 4 roadmap',
      'Announcing Update 4',
      'Update 4 teaser trailer now available', // a release verb, but a teaser
      'Update 4 devlog now live',
    ]) {
      const id = decideVersionId({ branch: 'public', title, existingIds: existing })
      expect(id, title).toBe('update2_QoL') // the live hotfix lands on the current version, not on update4
      expect(isLiveReleaseTitle(title), title).toBe(false)
    }
  })

  it('agrees with isTestVersion and pickDefaultVersion: a PTB is never the default', () => {
    const cases: [string, string][] = [
      ['public_test_branch', PTB_POST],
      ['public_test_branch', 'Update 5 PTB'],
      ['public', 'Update 3 now available'],
      ['public', 'Update 4: Quality of Life now available'],
      ['public', 'Update 2 hotfix'],
    ]
    for (const [branch, title] of cases) {
      const id = decideVersionId({ branch, title, existingIds: existing })
      expect(id).not.toBeNull()
      expect(isTestVersion(id as string)).toBe(classifyBranch(branch) === 'test')
      const ids = sortVersions([...new Set([...existing, id as string])])
      const def = pickDefaultVersion(ids.map(label))
      if (classifyBranch(branch) === 'test') expect(def).toBe('update2_QoL')
      else expect(def).toBe(id)
    }
  })

  it('parses the update number', () => {
    expect(parseUpdateNumber('Update 3: Custom Game')).toBe(3)
    expect(parseUpdateNumber('update3')).toBe(3)
    expect(parseUpdateNumber('Update 3 follows Update 3 PTB')).toBe(3)
    expect(parseUpdateNumber('Updated servers')).toBeNull()
  })
})

describe('provenance: the refresh skips game-extract folders', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'srp-prov-'))

  it('treats a folder without SOURCE.json as upstream-owned', () => {
    const root = tmp()
    fs.mkdirSync(path.join(root, 'update2_QoL'))
    expect(readSource(path.join(root, 'update2_QoL'))).toBeNull()
    expect(refreshShouldSkip(null)).toBe(false)
    expect(listSkippedFolders(root)).toEqual([])
  })

  it('skips folders whose SOURCE.json says game-extract, and only those', () => {
    const root = tmp()
    for (const v of ['update2_QoL', 'update3_PTB', 'update1']) fs.mkdirSync(path.join(root, v))
    writeSource(
      path.join(root, 'update3_PTB'),
      gameExtractSource({
        branch: 'public_test_branch',
        buildid: 26461198,
        extractorVersion: '0.1.0',
        versionId: 'update3_PTB',
        generatedAt: '2026-11-07T00:00:00Z',
      }),
    )
    writeSource(path.join(root, 'update1'), { source: 'upstream' })
    expect(readSource(path.join(root, 'update3_PTB'))).toMatchObject({
      source: 'game-extract',
      steamBranch: 'public_test_branch',
      buildid: '26461198',
      extractorVersion: '0.1.0',
    })
    expect(listSkippedFolders(root)).toEqual(['update3_PTB'])
  })

  it('skips a folder with an unreadable SOURCE.json rather than overwrite it', () => {
    const root = tmp()
    fs.mkdirSync(path.join(root, 'update3'))
    fs.writeFileSync(path.join(root, 'update3', 'SOURCE.json'), '{ not json')
    expect(refreshShouldSkip(readSource(path.join(root, 'update3')))).toBe(true)
    expect(listSkippedFolders(root)).toEqual(['update3'])
  })

  it('partitions versions: refresh the rest, keep owned folders in the final list', () => {
    const p = partitionVersions(['update1', 'update2_QoL'], ['update2_QoL', 'update3_PTB'])
    expect(p.refresh).toEqual(['update1'])
    expect(p.skipped).toEqual(['update2_QoL', 'update3_PTB'])
    expect(p.all).toEqual(['update1', 'update2_QoL', 'update3_PTB'])
  })

  it('keeps a skipped PTB in versions.ts without making it the default', () => {
    const { text, defaultVersion } = renderVersionsTs(['update1', 'update2_QoL', 'update3_PTB'])
    expect(defaultVersion).toBe('update2_QoL')
    expect(text).toContain("{ id: 'update3_PTB', label: 'Update 3 PTB' },")
  })
})
