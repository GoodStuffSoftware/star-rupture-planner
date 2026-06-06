export interface VersionInfo {
  id: string
  label: string
}

export const VERSIONS: VersionInfo[] = [
  { id: 'playtest', label: 'Playtest' },
  { id: 'earlyaccess', label: 'Early Access' },
  { id: 'update1_PTB', label: 'Update 1 PTB' },
  { id: 'update1', label: 'Update 1' },
]

export const DEFAULT_VERSION = 'update1'
