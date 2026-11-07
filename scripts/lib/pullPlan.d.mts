import type { SourceInfo } from './provenance.mjs'

export const ARTIFACT_PREFIX: string
export interface CiArtifact {
  id: number
  name: string
  expired?: boolean
  created_at?: string
  workflow_run?: { id: number }
}
export interface Candidate {
  buildid: string
  artifactId: number
  runId: number | null
  createdAt: string | null
}
export interface NewsItem {
  title: string
  date: number
  url?: string
}
export interface Published {
  keys: Set<string>
  newest: Map<string, number>
}
export function buildidOfArtifact(name: string): string | null
export function publishedBuilds(sources: Array<SourceInfo | null | undefined>): Published
export function alreadyPublished(published: Published, branch: string, buildid: string | number): boolean
export function pickCandidates(input: { artifacts: CiArtifact[]; seen?: Set<string>; buildid?: string; limit?: number }): Candidate[]
export function pickNewsTitle(input: { items: NewsItem[]; branch: string; builtAt: string | number }): NewsItem | null
export function renderNotice(input: {
  outcome: string
  versionId?: string
  branch?: string
  buildid?: string
  title?: string
  changelog?: string
  links?: Record<string, string | undefined>
}): string
