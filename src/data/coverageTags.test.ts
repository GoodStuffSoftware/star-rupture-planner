import { describe, it, expect } from 'vitest'
import {
  coverageKind,
  coverageTagFor,
  coverageTagName,
  parseCoverageTag,
  taggedKeys,
} from '../../scripts/lib/coverageTags.mjs'

describe('coverageKind', () => {
  it('published, verified unchanged and already-published builds are covered', () => {
    for (const o of ['published', 'unchanged', 'already-published'])
      expect(coverageKind(o)).toBe('covered')
  })

  it('a planner-side failure is failed, never covered', () => {
    for (const o of [
      'gate-failed',
      'name-undecided',
      'bad-extract',
      'publish-failed',
      'bad-artifact',
      'no-news-final',
      'none',
    ]) {
      expect(coverageKind(o)).toBe('failed')
    }
  })

  it('a build waiting for its news post gets no tag', () => {
    expect(coverageKind('no-news-wait')).toBe('none')
  })

  it('an outcome nobody has heard of is a failure, not coverage', () => {
    expect(coverageKind('')).toBe('failed')
    expect(coverageKind('whatever')).toBe('failed')
  })
})

describe('tag names', () => {
  it('builds the covered and failed names', () => {
    expect(coverageTagFor('published', 'public_test_branch', '26461198')).toBe(
      'srdata-public_test_branch-26461198',
    )
    expect(coverageTagFor('gate-failed', 'public', '25646882')).toBe(
      'srdata-failed-public-25646882',
    )
  })

  it('records nothing for none', () => {
    expect(coverageTagFor('no-news-wait', 'public_test_branch', '1')).toBeNull()
    expect(coverageTagName('none', 'x', 'y')).toBeNull()
  })

  it('refuses a branch or build id that could not be real', () => {
    expect(() => coverageTagName('covered', 'not a branch', '1')).toThrow()
    expect(() => coverageTagName('covered', 'public', '12a')).toThrow()
    expect(() => coverageTagName('covered', 'failed-public', '1')).toThrow()
  })
})

describe('parseCoverageTag', () => {
  it('reads both kinds, with or without refs/tags/', () => {
    expect(parseCoverageTag('srdata-public-25646882')).toEqual({
      kind: 'covered',
      branch: 'public',
      buildid: '25646882',
    })
    expect(parseCoverageTag('refs/tags/srdata-failed-public_test_branch-26461198')).toEqual({
      kind: 'failed',
      branch: 'public_test_branch',
      buildid: '26461198',
    })
  })

  it('ignores the no-news notice tag, the legacy digits-only tag and strangers', () => {
    expect(parseCoverageTag('srnonews-public_test_branch-26461198')).toBeNull()
    expect(parseCoverageTag('srdata-26461198')).toBeNull()
    expect(parseCoverageTag('srdata-tools-5')).toBeNull()
    expect(parseCoverageTag('v1.6.0')).toBeNull()
  })

  it('round-trips every name it builds', () => {
    for (const o of ['published', 'gate-failed']) {
      const tag = coverageTagFor(o, 'public_test_branch', '7')!
      expect(parseCoverageTag(tag)).toMatchObject({
        branch: 'public_test_branch',
        buildid: '7',
        kind: coverageKind(o),
      })
    }
  })
})

describe('taggedKeys', () => {
  const names = [
    'srdata-public-1',
    'srdata-failed-public-2',
    'srnonews-public-3',
    'srdata-9',
    'srdata-public_test_branch-4',
  ]
  it('handled = covered and failed', () => {
    expect([...taggedKeys(names)].sort()).toEqual(['public:1', 'public:2', 'public_test_branch:4'])
  })
  it('can ask for covered only', () => {
    expect([...taggedKeys(names, ['covered'])].sort()).toEqual(['public:1', 'public_test_branch:4'])
  })
})
