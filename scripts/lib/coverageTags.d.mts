export const COVERED_PREFIX: string
export const FAILED_PREFIX: string
export const NONEWS_PREFIX: string
export type CoverageKind = 'covered' | 'failed' | 'none'
export function coverageKind(outcome: string): CoverageKind
export function coverageTagName(kind: CoverageKind, branch: string, buildid: string | number): string | null
export function coverageTagFor(outcome: string, branch: string, buildid: string | number): string | null
export function parseCoverageTag(name: string): { kind: 'covered' | 'failed'; branch: string; buildid: string } | null
export function taggedKeys(names: Iterable<string>, kinds?: Array<'covered' | 'failed'>): Set<string>
