import type { SourceInfo } from './provenance.mjs'

export const CI_REPO: string
export const CI_REPO_ID: number
export const TRUSTED_BRANCH: string
export const ALLOWED_EVENTS: string[]
export const ALLOWED_WORKFLOW_PATHS: string[]
export const ARTIFACT_PREFIX: string
export interface CiArtifact {
  id: number
  name: string
  expired?: boolean
  created_at?: string
  workflow_run?: {
    id: number
    repository_id?: number
    head_repository_id?: number
    head_branch?: string
    head_sha?: string
  }
}
export interface CiRun {
  id: number
  event?: string
  path?: string
  status?: string
  conclusion?: string | null
  head_branch?: string
  repository?: { id?: number; full_name?: string }
  head_repository?: { id?: number; full_name?: string } | null
}
export interface Candidate {
  key: string
  branch: string
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
export function parseArtifactName(name: string): { branch: string; buildid: string } | null
export function buildKey(branch: string, buildid: string | number): string
export function keyOfTagSuffix(suffix: string): string | null
export function artifactProblems(a: CiArtifact, opts?: { repoId?: number }): string[]
export function runProblems(run: CiRun | null | undefined, expect?: { runId?: number | string; repo?: string; repoId?: number }): string[]
export function pipelineProblems(
  pipeline: Record<string, unknown> | null | undefined,
  expect: { branch: string; buildid: string; runId: number | string | null },
): string[]
export function publishedBuilds(sources: Array<SourceInfo | null | undefined>): Published
export function alreadyPublished(published: Published, branch: string, buildid: string | number): boolean
export function screenArtifacts(
  artifacts: CiArtifact[],
  opts?: { repoId?: number },
): {
  accepted: Array<{ branch: string; buildid: string; artifact: CiArtifact }>
  rejected: Array<{ id: number; name: string; runId: number | null; problems: string[] }>
}
export function pickCandidates(input: {
  artifacts: CiArtifact[]
  seen?: Set<string>
  buildid?: string
  branch?: string
  limit?: number
  repoId?: number
}): Candidate[]
export function pickNewsTitle(input: { items: NewsItem[]; branch: string; builtAt: string | number }): NewsItem | null
export function noNewsAction(input: { builtAt: string | number; now: string | number }): 'wait' | 'give-up'
export function renderNotice(input: {
  outcome: string
  versionId?: string
  branch?: string
  buildid?: string
  title?: string
  changelog?: string
  links?: Record<string, string | undefined>
}): string
