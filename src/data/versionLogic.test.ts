import { describe, it, expect } from 'vitest'
import { pickDefaultVersion, sortVersions, isTestVersion } from '../../scripts/lib/versionLogic.mjs'
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
    expect(newestFirst(VERSIONS)[0].id).toBe('update2_QoL')
    expect(VERSIONS.map((v) => v.id)).toEqual(before)
  })

  it('puts a future update3_PTB on top', () => {
    const ids = sortVersions([...VERSIONS.map((v) => v.id), 'update3_PTB'])
    expect(newestFirst(ids.map(label))[0].id).toBe('update3_PTB')
  })
})
