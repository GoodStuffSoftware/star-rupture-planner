import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  classifyStagedIcons,
  iconsWithoutGameCounterpart,
} from '../../scripts/lib/convertIcons.mjs'
import { listSkippedFolders } from '../../scripts/lib/provenance.mjs'

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

describe('publish --adopt: icons', () => {
  it('sorts staged icons into added, replaced and unchanged, and drops the unchanged ones from the stage', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'srp-adopt-'))
    const iconRoot = path.join(root, 'icons')
    const stagedDir = path.join(root, 'stage')
    write(path.join(iconRoot, 'items', 'same.webp'), 'A')
    write(path.join(iconRoot, 'items', 'differs.webp'), 'old')
    write(path.join(iconRoot, 'buildings', 'upstream-only.webp'), 'U')
    write(path.join(stagedDir, 'items', 'same.webp'), 'A')
    write(path.join(stagedDir, 'items', 'differs.webp'), 'new')
    write(path.join(stagedDir, 'buildings', 'fresh.webp'), 'F')

    const res = classifyStagedIcons({ stagedDir, iconRoot })
    expect(res.unchanged).toEqual(['items/same.webp'])
    expect(res.replaced).toEqual(['items/differs.webp'])
    expect(res.added).toEqual(['buildings/fresh.webp'])
    expect(fs.existsSync(path.join(stagedDir, 'items', 'same.webp'))).toBe(false)
    expect(fs.existsSync(path.join(stagedDir, 'items', 'differs.webp'))).toBe(true)

    // committed icons the plan has no game icon for stay untouched and are reported
    const plan = {
      icons: [
        { kind: 'items' as const, id: 'same', texture: 'T_Same' },
        { kind: 'items' as const, id: 'differs', texture: 'T_Differs' },
      ],
      missing: [],
    }
    expect(iconsWithoutGameCounterpart({ plan, iconRoot })).toEqual([
      'buildings/upstream-only.webp',
    ])
  })
})

describe('update2_QoL is owned by the game extract', () => {
  it('the upstream refresh skips the committed update2_QoL and update3_PTB folders', () => {
    const skipped = listSkippedFolders(path.resolve(__dirname, '../../public/game-data'))
    expect(skipped).toContain('update2_QoL')
    expect(skipped).toContain('update3_PTB')
    // folders that still come from upstream are not skipped
    expect(skipped).not.toContain('earlyaccess')
  })
})
