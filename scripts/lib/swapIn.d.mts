export function swapIn(input: {
  stage: string
  targetDir: string
  staged: { data: string; icons: string; idMap: string; versionsTs: string }
  iconRoot: string
  idMapFile: string | null
  versionsFile: string
}): void
