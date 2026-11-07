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

  it('links the build SHA to its GitHub commit', async () => {
    const root = await mountFooter()
    const a = root.querySelector<HTMLAnchorElement>('[data-testid="app-commit"]')
    if (!__APP_COMMIT__) {
      expect(a).toBeNull()
      return
    }
    expect(a?.getAttribute('href')).toBe(
      `https://github.com/GoodStuffSoftware/star-rupture-planner/commit/${__APP_COMMIT__}`,
    )
  })

  it('shows the Good Stuff Software logo linked to the company site', async () => {
    const root = await mountFooter()
    const img = root.querySelector<HTMLImageElement>('img[alt="Good Stuff Software"]')
    expect(img?.getAttribute('src')).toBe('/gss-logo.svg')
    expect(img?.closest('a')?.getAttribute('href')).toBe('https://goodstuffsoftware.com')
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
