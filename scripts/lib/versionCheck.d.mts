export const LIVE: 'public'
export const PTB: 'public_test_branch'
export const DAY: number
export const DEFAULT_GRACE_DAYS: Record<string, number>

export interface BranchInfo {
  buildid: string | number
  timeupdated: string | number
}
export interface NewsItem {
  title: string
  date: number
  url?: string
}
export interface IssueRecord {
  number: number
  state: string
  body?: string
  comments?: { body?: string }[]
}
export interface Decision {
  branch: string
  buildid: string
  updatedAt: number
  status: 'inactive' | 'covered' | 'grace' | 'due'
  action: 'none' | 'open' | 'comment'
  reason: string
  since?: number
  dueAt?: number
  announcement?: NewsItem | null
  announcementSource?: string
  defaultVersion?: string
  issueNumber?: number
  title?: string
  body?: string
  comment?: string
}
export interface DecideContext {
  branches: Record<string, BranchInfo>
  news: NewsItem[]
  versions: { id: string; label?: string }[]
  dataChanged: Record<string, number>
  issues: IssueRecord[]
  now: number
  graceDays?: Record<string, number>
}

export function classifyAnnouncement(title: string): 'public' | 'public_test_branch' | null
export function marker(branch: string, buildid: string | number): string
export function parseMarkers(text?: string): { branch: string; build: string }[]
export function isoDate(seconds: number): string
export function coverage(
  branch: string,
  versions: { id: string; label?: string }[],
  dataChanged: Record<string, number>,
): { defaultId: string; candidates: string[]; lastChange: number }
export function decideBranch(ctx: DecideContext & { branch: string }): Decision
export function decideAll(ctx: DecideContext): Decision[]
export function renderTitle(d: Decision): string
export function renderBody(d: Decision): string
export function renderComment(d: Decision): string
