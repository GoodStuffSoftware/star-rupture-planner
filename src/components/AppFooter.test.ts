import { describe, it, expect } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import AppFooter from './AppFooter.vue'
import pkg from '../../package.json'

async function mountFooter() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  createApp(AppFooter).use(createPinia()).mount(el)
  await nextTick()
  return el
}

describe('AppFooter', () => {
  it('shows the package version and links it to the changelog', async () => {
    const el = await mountFooter()
    const a = el.querySelector<HTMLAnchorElement>('[data-testid="app-version"]')
    expect(a?.textContent?.trim()).toBe(`v${pkg.version}`)
    expect(a?.getAttribute('href')).toBe(
      'https://github.com/GoodStuffSoftware/star-rupture-planner/blob/main/CHANGELOG.md',
    )
  })

  it('keeps the brand, repo, attribution links and the non-affiliation note', async () => {
    const el = await mountFooter()
    const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('https://goodstuffsoftware.com')
    expect(hrefs).toContain('https://github.com/GoodStuffSoftware/star-rupture-planner')
    expect(hrefs).toContain('https://github.com/flexsurfer/starrupture-planner')
    expect(hrefs).toContain('https://starrupture.wiki.gg')
    expect(el.textContent).toContain('not affiliated with')
  })
})
