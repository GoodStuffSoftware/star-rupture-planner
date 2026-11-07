import { afterEach, describe, it, expect } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'
import AppFooter from './AppFooter.vue'
import pkg from '../../package.json'

let app: App | null = null
let el: HTMLElement | null = null

async function mountFooter() {
  el = document.createElement('div')
  document.body.appendChild(el)
  app = createApp(AppFooter).use(createPinia())
  app.mount(el)
  await nextTick()
  return el
}

afterEach(() => {
  app?.unmount()
  el?.remove()
  app = null
  el = null
})

describe('AppFooter', () => {
  it('shows the package version and links it to the changelog', async () => {
    const root = await mountFooter()
    const a = root.querySelector<HTMLAnchorElement>('[data-testid="app-version"]')
    expect(a?.textContent).toContain(`v${pkg.version}`)
    expect(a?.getAttribute('href')).toBe(
      'https://github.com/GoodStuffSoftware/star-rupture-planner/blob/main/CHANGELOG.md',
    )
  })

  it('shows only the version on the right: no commit hash and no game-data label', async () => {
    const root = await mountFooter()
    expect(root.querySelector('[data-testid="app-commit"]')).toBeNull()
    expect(root.querySelector('[data-testid="game-data-version"]')).toBeNull()
    expect(root.textContent).not.toContain('Game data:')
    expect(root.textContent).not.toMatch(/(^|[^0-9a-z])[0-9a-f]{7}([^0-9a-z]|$)/)
  })

  it('shows the Good Stuff Software logo as a link to the company site', async () => {
    const root = await mountFooter()
    const a = root.querySelector<HTMLAnchorElement>('[data-testid="gss-logo"]')
    expect(a?.getAttribute('href')).toBe('https://goodstuffsoftware.com')
    expect(a?.getAttribute('aria-label')).toBe('Good Stuff Software')
    const img = a?.querySelector('img')
    expect(img?.getAttribute('src')).toBe('/gss-lockup.svg')
    expect(img?.getAttribute('alt')).toBe('Good Stuff Software')
  })

  it('puts GitHub and Feedback links under the logo and drops the text site link', async () => {
    const root = await mountFooter()
    const nav = root.querySelector('nav[aria-label="Footer links"]')
    expect([...(nav?.querySelectorAll('a') ?? [])].map((a) => a.textContent?.trim())).toEqual([
      'GitHub',
      'Feedback',
    ])
    const texts = [...root.querySelectorAll('a')].map((a) => a.textContent?.trim())
    expect(texts).not.toContain('goodstuffsoftware.com')
  })

  it('keeps the brand, repo, attribution links and the non-affiliation note', async () => {
    const root = await mountFooter()
    const hrefs = [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('https://goodstuffsoftware.com')
    expect(hrefs).toContain('https://github.com/GoodStuffSoftware/star-rupture-planner')
    expect(hrefs).toContain('https://github.com/flexsurfer/starrupture-planner')
    expect(hrefs).toContain('https://starrupture.wiki.gg')
    expect(root.textContent).toContain('not affiliated with')
  })
})
