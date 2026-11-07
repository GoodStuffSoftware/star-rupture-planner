#!/usr/bin/env node
// Thin command line over scripts/lib/pullPlan.mjs for .github/workflows/publish-game-data.yml.
//
//   plan-game-pull.mjs candidates --artifacts <api.json> --seen <file, one git tag suffix "<branch>-<buildid>" per line> [--buildid N] [--branch b] [--limit N]
//       prints a JSON array of { key, branch, buildid, artifactId, runId, createdAt }, oldest build first.
//       --artifacts is the JSON of GET /repos/msantoro12/starrupture-ci/actions/artifacts (or a run's artifacts),
//       one or several pages concatenated as JSON values. Only artifacts named sr-data-<branch>-<buildid> from a
//       run on starrupture-ci main in that repo are listed (refused ones are reported on stderr). Builds (Steam
//       branch plus build id) already in a SOURCE.json under public/game-data are never returned (unless
//       --buildid forces them).
//   plan-game-pull.mjs verify-run --run <run.json> --run-id N
//       checks the run object (GET /repos/msantoro12/starrupture-ci/actions/runs/N): same repo, no fork, main,
//       allowed event and workflow, success. Exit 4 with the reasons on stderr when it fails.
//   plan-game-pull.mjs verify-pipeline --pipeline <pipeline.json> --branch b --buildid N --run-id N
//       checks the artifact's pipeline.json against its name and run. Exit 4 on a mismatch.
//   plan-game-pull.mjs title --news <steam-news.json> --branch <b> --built-at <iso>
//       prints the Steam news title that names the build. Test branch: exit 3 when there is none. Live branch: no
//       live-release post means a hotfix, which prints an empty title (the publisher maps it to the live version).
//   plan-game-pull.mjs no-news-action --built-at <iso> [--now <iso>]
//       prints wait (a post may still appear: do not tag the build as handled) or give-up.
//   plan-game-pull.mjs notice --result <publish-game-data --result file> [--outcome o] [--link name=url ...]
//       prints the Discord text.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSource } from './lib/provenance.mjs'
import { classifyBranch } from './lib/versionLogic.mjs'
import {
  keyOfTagSuffix,
  noNewsAction,
  pickCandidates,
  pickNewsTitle,
  pipelineProblems,
  publishedBuilds,
  renderNotice,
  runProblems,
  screenArtifacts,
} from './lib/pullPlan.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const DATA_ROOT = path.join(here, '..', 'public', 'game-data')

function flags(argv) {
  const out = { link: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`)
    const key = a.slice(2)
    const value = argv[++i]
    if (value === undefined) throw new Error(`--${key} needs a value`)
    if (key === 'link') out.link.push(value)
    else out[key] = value
  }
  return out
}

/** Reads one or more concatenated JSON documents (gh api --paginate prints one per page). */
function readJsonDocs(file) {
  const text = fs.readFileSync(file, 'utf8')
  const docs = []
  let depth = 0
  let start = -1
  let inStr = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{' || c === '[') {
      if (depth++ === 0) start = i
    } else if (c === '}' || c === ']') {
      if (--depth === 0) docs.push(JSON.parse(text.slice(start, i + 1)))
    }
  }
  return docs
}

function publishedFromDisk() {
  const sources = fs
    .readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readSource(path.join(DATA_ROOT, d.name)))
  return publishedBuilds(sources)
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const f = flags(rest)
  if (cmd === 'candidates') {
    const artifacts = readJsonDocs(f.artifacts).flatMap((d) => (Array.isArray(d) ? d : (d.artifacts ?? [])))
    const tags = fs.existsSync(f.seen ?? '') ? fs.readFileSync(f.seen, 'utf8').split(/\s+/).filter(Boolean) : []
    const seen = new Set(tags.map(keyOfTagSuffix).filter(Boolean))
    for (const k of publishedFromDisk().keys) seen.add(k)
    const limit = f.limit ? Number(f.limit) : undefined
    for (const r of screenArtifacts(artifacts).rejected) {
      console.error(`::warning::refused artifact ${r.name} (id ${r.id}, run ${r.runId}): ${r.problems.join('; ')}`)
    }
    console.log(JSON.stringify(pickCandidates({ artifacts, seen, buildid: f.buildid, branch: f.branch, limit })))
  } else if (cmd === 'verify-run') {
    const problems = runProblems(JSON.parse(fs.readFileSync(f.run, 'utf8')), { runId: f['run-id'] })
    if (problems.length) {
      console.error(`run ${f['run-id']} is not trusted: ${problems.join('; ')}`)
      process.exit(4)
    }
  } else if (cmd === 'verify-pipeline') {
    const problems = pipelineProblems(JSON.parse(fs.readFileSync(f.pipeline, 'utf8')), {
      branch: f.branch,
      buildid: f.buildid,
      runId: f['run-id'],
    })
    if (problems.length) {
      console.error(`pipeline.json does not match its artifact: ${problems.join('; ')}`)
      process.exit(4)
    }
  } else if (cmd === 'no-news-action') {
    console.log(noNewsAction({ builtAt: f['built-at'], now: f.now ?? new Date().toISOString() }))
  } else if (cmd === 'title') {
    const items = readJsonDocs(f.news).flatMap((d) => d?.appnews?.newsitems ?? (Array.isArray(d) ? d : []))
    const hit = pickNewsTitle({ items, branch: f.branch, builtAt: f['built-at'] })
    if (hit) {
      console.log(hit.title)
    } else if (classifyBranch(f.branch) === 'live') {
      console.error(`no live-release post names the ${f.branch} build made at ${f['built-at']}: a hotfix, the current live version is updated in place`)
      console.log('')
    } else {
      console.error(`no Steam news post names a ${f.branch} build made at ${f['built-at']}`)
      process.exit(3)
    }
  } else if (cmd === 'notice') {
    const links = Object.fromEntries(f.link.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
    const r = JSON.parse(fs.readFileSync(f.result, 'utf8'))
    console.log(renderNotice({ ...r, outcome: f.outcome ?? r.outcome, links }))
  } else {
    console.error('usage: plan-game-pull.mjs candidates|verify-run|verify-pipeline|title|no-news-action|notice ... (see the header of this file)')
    process.exit(2)
  }
}

try {
  main()
} catch (e) {
  console.error(`plan-game-pull: ${e.message}`)
  process.exit(2)
}
