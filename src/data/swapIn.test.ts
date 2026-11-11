import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { swapIn } from '../../scripts/lib/swapIn.mjs'

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const read = (file: string) => fs.readFileSync(file, 'utf8')

/** A project with one existing version folder, an icon, an id map and versions.ts, plus a staged publish. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'srp-swap-'))
  const project = {
    targetDir: path.join(root, 'public', 'game-data', 'update3'),
    iconRoot: path.join(root, 'public', 'icons'),
    idMap: path.join(root, 'scripts', 'data', 'id-map.json'),
    versionsTs: path.join(root, 'src', 'data', 'versions.ts'),
  }
  write(path.join(project.targetDir, 'items_catalog.json'), 'OLD items')
  write(path.join(project.iconRoot, 'items', 'old.webp'), 'old icon')
  write(project.idMap, 'OLD map')
  write(project.versionsTs, 'OLD versions')
  const stage = path.join(root, '.stage')
  const staged = {
    data: path.join(stage, 'data'),
    icons: path.join(stage, 'icons'),
    idMap: path.join(stage, 'id-map.json'),
    versionsTs: path.join(stage, 'versions.ts'),
  }
  write(path.join(staged.data, 'items_catalog.json'), 'NEW items')
  write(path.join(staged.data, 'SOURCE.json'), 'NEW source')
  write(path.join(staged.icons, 'items', 'new.webp'), 'new icon')
  write(staged.idMap, 'NEW map')
  write(staged.versionsTs, 'NEW versions')
  return { root, stage, staged, project }
}

describe('swapIn (atomic publish)', () => {
  it('moves the staged folder, icons, id map and versions.ts into place', () => {
    const { stage, staged, project } = setup()
    swapIn({
      stage,
      targetDir: project.targetDir,
      staged,
      iconRoot: project.iconRoot,
      idMapFile: project.idMap,
      versionsFile: project.versionsTs,
    })
    expect(read(path.join(project.targetDir, 'items_catalog.json'))).toBe('NEW items')
    expect(read(path.join(project.targetDir, 'SOURCE.json'))).toBe('NEW source')
    expect(read(path.join(project.iconRoot, 'items', 'new.webp'))).toBe('new icon')
    expect(read(path.join(project.iconRoot, 'items', 'old.webp'))).toBe('old icon')
    expect(read(project.idMap)).toBe('NEW map')
    expect(read(project.versionsTs)).toBe('NEW versions')
  })

  it('leaves the id map alone when it did not change (idMapFile null)', () => {
    const { stage, staged, project } = setup()
    swapIn({
      stage,
      targetDir: project.targetDir,
      staged,
      iconRoot: project.iconRoot,
      idMapFile: null,
      versionsFile: project.versionsTs,
    })
    expect(read(project.idMap)).toBe('OLD map')
  })

  it('creates a new version folder', () => {
    const { stage, staged, project } = setup()
    fs.rmSync(project.targetDir, { recursive: true })
    swapIn({
      stage,
      targetDir: project.targetDir,
      staged,
      iconRoot: project.iconRoot,
      idMapFile: null,
      versionsFile: project.versionsTs,
    })
    expect(read(path.join(project.targetDir, 'SOURCE.json'))).toBe('NEW source')
  })

  it('rolls everything back when a late step fails: no half-written tree', () => {
    const { stage, staged, project } = setup()
    // the versions.ts directory does not exist and cannot be created by copyFileSync: the last step throws
    const brokenVersions = path.join(project.targetDir, '..', 'no-such-dir', 'versions.ts')
    expect(() =>
      swapIn({
        stage,
        targetDir: project.targetDir,
        staged,
        iconRoot: project.iconRoot,
        idMapFile: project.idMap,
        versionsFile: brokenVersions,
      }),
    ).toThrow()
    expect(read(path.join(project.targetDir, 'items_catalog.json'))).toBe('OLD items')
    expect(fs.existsSync(path.join(project.targetDir, 'SOURCE.json'))).toBe(false)
    expect(fs.existsSync(path.join(project.iconRoot, 'items', 'new.webp'))).toBe(false)
    expect(read(path.join(project.iconRoot, 'items', 'old.webp'))).toBe('old icon')
    expect(read(project.idMap)).toBe('OLD map')
  })

  it('removes a brand-new folder again when a late step fails', () => {
    const { stage, staged, project } = setup()
    fs.rmSync(project.targetDir, { recursive: true })
    const brokenVersions = path.join(project.targetDir, '..', 'no-such-dir', 'versions.ts')
    expect(() =>
      swapIn({
        stage,
        targetDir: project.targetDir,
        staged,
        iconRoot: project.iconRoot,
        idMapFile: null,
        versionsFile: brokenVersions,
      }),
    ).toThrow()
    expect(fs.existsSync(project.targetDir)).toBe(false)
  })

  it('replaces a committed icon (adopt) and puts the old bytes back when a late step fails', () => {
    const ok = setup()
    write(path.join(ok.project.iconRoot, 'items', 'new.webp'), 'upstream art')
    swapIn({
      stage: ok.stage,
      targetDir: ok.project.targetDir,
      staged: ok.staged,
      iconRoot: ok.project.iconRoot,
      idMapFile: null,
      versionsFile: ok.project.versionsTs,
    })
    expect(read(path.join(ok.project.iconRoot, 'items', 'new.webp'))).toBe('new icon')

    const bad = setup()
    write(path.join(bad.project.iconRoot, 'items', 'new.webp'), 'upstream art')
    const brokenVersions = path.join(bad.project.targetDir, '..', 'no-such-dir', 'versions.ts')
    expect(() =>
      swapIn({
        stage: bad.stage,
        targetDir: bad.project.targetDir,
        staged: bad.staged,
        iconRoot: bad.project.iconRoot,
        idMapFile: null,
        versionsFile: brokenVersions,
      }),
    ).toThrow()
    expect(read(path.join(bad.project.iconRoot, 'items', 'new.webp'))).toBe('upstream art')
  })
})
