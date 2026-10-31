// Two-browser-tab check for the cross-tab sync, in a hidden headless Chrome.
//   npm run e2e:tabs        (builds, serves dist with `vite preview`, runs this)
// Needs Chrome or Edge; set CHROME_PATH if it is not in a standard place.
//
// Scenarios, each with tab A open on a saved two-recipe plan and tab B opened on
// `/?add=rotor` (what the in-game launcher does):
//   hand-off    B asks A to take the item; A shows it without a reload.
//   storage     B cannot reach A (no BroadcastChannel), adds it itself and saves;
//               A picks it up from the `storage` event.
//   missed      as `storage`, but A never receives the event. A's next edit must
//               not write its older plan over B's.
// In each, an edit in A afterwards must leave the new recipe in the saved plan.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const POLL = { timeout: 5000, polling: 100 } // polling: a background tab gets no animation frames
const KEY = 'srp:state:v1'
const ADDED = 'Rotor'
const SEED = {
  plan: {
    version: 'update2_QoL',
    targetItemId: 'aerogel',
    targetRate: 30,
    overages: {},
    targets: [
      { targetItemId: 'aerogel', targetRate: 30, overages: {}, expandLevel: 2 },
      { targetItemId: 'airlock', targetRate: 12, overages: {}, expandLevel: 2 },
    ],
    activeTargetIndex: 0,
    tier: {},
    overrides: {},
    recipeOverrides: {},
  },
}

const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p))
if (!chrome) throw new Error('No Chrome or Edge found; set CHROME_PATH')

const freePort = () =>
  new Promise((ok, fail) => {
    const s = createServer()
    s.once('error', fail)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })

const port = await freePort()
const origin = `http://127.0.0.1:${port}`
const server = spawn(
  process.execPath,
  [
    resolve('node_modules/vite/bin/vite.js'),
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    port,
    '--strictPort',
  ],
  { stdio: 'ignore', windowsHide: true },
)
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-first-run', '--disable-extensions'],
})

const tabNames = (page) =>
  page.$$eval('[role="tab"]', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()))
const savedTargets = (page) =>
  page.evaluate((key) => {
    const p = JSON.parse(localStorage.getItem(key) ?? 'null')?.plan
    return (p?.targets ?? []).map((t) => `${t.targetItemId}@${t.targetRate}`)
  }, KEY)
const sees = (page, text) =>
  page.waitForFunction(
    (t) => [...document.querySelectorAll('[role="tab"]')].some((e) => e.textContent.includes(t)),
    POLL,
    text,
  )

async function openPlanner(url, setup) {
  const page = await browser.newPage()
  if (setup) await page.evaluateOnNewDocument(setup)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  return page
}

async function scenario(name, { beforeB, beforeA, deaf = false }) {
  const seed = await browser.newPage()
  await seed.goto(`${origin}/favicon.svg`)
  await seed.evaluate((k, v) => localStorage.setItem(k, v), KEY, JSON.stringify(SEED))
  await seed.close()

  const a = await openPlanner(origin, beforeA)
  await sees(a, 'Airlock')
  // Let A finish its own first save, so it has nothing pending when B writes.
  await a.waitForFunction((key) => localStorage.getItem(key)?.includes('"prefs"'), POLL, KEY)
  // A marker that survives only while A is never reloaded.
  await a.evaluate(() => (window.__noReload = true))

  const b = await openPlanner(`${origin}/?add=rotor`, beforeB)
  if (!deaf) {
    await sees(a, ADDED) // the new recipe appears in A, no reload
    const names = await tabNames(a)
    if (names.length !== 3) throw new Error(`expected 3 recipe tabs in A, got ${names}`)
  } else {
    // B has saved and A has not been told: wait for B's save, then check A still shows two.
    await b.waitForFunction((key) => localStorage.getItem(key)?.includes('rotor'), POLL, KEY)
    if ((await tabNames(a)).length !== 2) throw new Error('tab A was told about the add')
  }
  if (!(await a.evaluate(() => window.__noReload === true))) throw new Error('tab A was reloaded')

  // Edit in A: change the active tab's rate through the real input.
  await a.bringToFront()
  // The input sits right after the stepper's "decrease" button.
  const rate = (
    await a.evaluateHandle(
      () =>
        document.querySelector('button[title^="−"], button[title="decrease"]').nextElementSibling,
    )
  ).asElement()
  await rate.click()
  await a.keyboard.down('Control')
  await a.keyboard.press('a')
  await a.keyboard.up('Control')
  await a.keyboard.type('77')
  await a.keyboard.press('Tab')
  if (!deaf)
    await a.waitForFunction(() => document.body.textContent.includes('77/min'), {
      timeout: 5000,
      polling: 100,
    })
  const after = await a.evaluate(
    (key) =>
      new Promise((done) =>
        setTimeout(
          () =>
            done(
              JSON.parse(localStorage.getItem(key)).plan.targets.map(
                (t) => `${t.targetItemId}@${t.targetRate}`,
              ),
            ),
          900, // past the 300 ms save debounce
        ),
      ),
    KEY,
  )
  if (!after.some((t) => t.startsWith('rotor@')) || after.length !== 3)
    throw new Error(`edit in A lost B's recipe: ${after}`)
  if (!(await a.evaluate(() => window.__noReload === true))) throw new Error('tab A was reloaded')
  if (deaf) await sees(a, ADDED) // A caught up on its own instead of overwriting
  console.log(`ok   ${name}: A shows ${ADDED} without a reload, saved plan ${after.join(', ')}`)

  for (const p of [a, b]) if (!p.isClosed()) await p.close()
}

let failed = false
try {
  // Wait for the server before the first page.
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) break
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  const noChannel = () => {
    delete window.BroadcastChannel
  }
  // A tab whose `storage` events never arrive (a throttled, frozen or older tab).
  const deaf = () => {
    const add = window.addEventListener.bind(window)
    window.addEventListener = (type, ...rest) =>
      type === 'storage' ? undefined : add(type, ...rest)
  }
  await scenario('hand-off', {})
  await scenario('storage', { beforeB: noChannel })
  await scenario('missed', { beforeB: noChannel, beforeA: deaf, deaf: true })
} catch (e) {
  failed = true
  console.error(`FAIL ${e.stack}`)
} finally {
  await browser.close()
  server.kill()
}
process.exit(failed ? 1 : 0)
