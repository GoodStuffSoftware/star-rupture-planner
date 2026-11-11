// Moves a staged publish into the project (used by scripts/publish-game-data.mjs).
import fs from 'node:fs'
import path from 'node:path'

/**
 * Moves a staged publish into the project. The version folder is swapped by renames (the old one is parked aside
 * and restored on failure); the other files are written to a sibling temp name and renamed over the target.
 */
export function swapIn({ stage, targetDir, staged, iconRoot, idMapFile, versionsFile }) {
  const undo = []
  try {
    // version folder
    const parked = fs.existsSync(targetDir) ? path.join(stage, 'old-data') : null
    if (parked) {
      fs.renameSync(targetDir, parked)
      undo.push(() => fs.renameSync(parked, targetDir))
    }
    fs.renameSync(staged.data, targetDir)
    undo.push(() => fs.rmSync(targetDir, { recursive: true, force: true }))
    // icons: a publish stages only new icons; an adopt also stages replacements (an overwritten file is backed up
    // in the stage and put back on failure)
    if (fs.existsSync(staged.icons)) {
      for (const kind of fs.readdirSync(staged.icons)) {
        fs.mkdirSync(path.join(iconRoot, kind), { recursive: true })
        for (const file of fs.readdirSync(path.join(staged.icons, kind))) {
          const dest = path.join(iconRoot, kind, file)
          if (fs.existsSync(dest)) {
            const backup = path.join(stage, 'old-icons', kind, file)
            fs.mkdirSync(path.dirname(backup), { recursive: true })
            fs.copyFileSync(dest, backup)
            undo.push(() => fs.copyFileSync(backup, dest))
          } else {
            undo.push(() => fs.rmSync(dest, { force: true }))
          }
          fs.renameSync(path.join(staged.icons, kind, file), dest)
        }
      }
    }
    // single files: id map, versions.ts
    for (const [from, to] of [[staged.idMap, idMapFile], [staged.versionsTs, versionsFile]]) {
      if (!to || !fs.existsSync(from)) continue
      const backup = fs.existsSync(to) ? fs.readFileSync(to) : null
      const tmp = `${to}.tmp-${process.pid}`
      fs.copyFileSync(from, tmp)
      fs.renameSync(tmp, to)
      undo.push(() => (backup ? fs.writeFileSync(to, backup) : fs.rmSync(to, { force: true })))
    }
  } catch (e) {
    for (const u of undo.reverse()) {
      try {
        u()
      } catch {
        /* best effort: the workflow also cleans the tree after a failed build */
      }
    }
    throw e
  }
}

