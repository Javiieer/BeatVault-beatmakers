import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { modules } from '../src/app/modules'

const account = { id: 'theme-route-audit', email: 'theme-audit@beatvault.local', role: 'admin', verificationState: 'verified' }
const profile = { accountId: account.id, displayName: 'Tema QA', bio: '', location: '', website: '', instagram: '', genres: ['Trap'], coverId: 'lo-fi', avatarId: 'initials', publicProfile: true }
const modes = [
  { name: 'dark', value: { theme: 'dark', customTheme: { background: '#101318', card: '#1b222b', button: '#4bd8c2', link: '#76b9ff' } } },
  { name: 'light', value: { theme: 'light', customTheme: { background: '#101318', card: '#1b222b', button: '#4bd8c2', link: '#76b9ff' } } },
  { name: 'custom-rgb', value: { theme: 'custom', customTheme: { background: '#e9eef2', card: '#ffffff', button: '#087f78', link: '#174f9b' } } },
] as const
const extremePalettes = [
  { name: 'custom-inverted', value: { theme: 'custom', customTheme: { background: '#000000', card: '#ffffff', button: '#ffff00', link: '#ffffff' } } },
  { name: 'custom-saturated', value: { theme: 'custom', customTheme: { background: '#f00000', card: '#00f000', button: '#0000ff', link: '#111111' } } },
  { name: 'custom-nearby', value: { theme: 'custom', customTheme: { background: '#111111', card: '#181818', button: '#202020', link: '#171717' } } },
]
const viewports = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]

test('navigation QA bot renders every menu URL in dark, light and custom RGB on desktop and mobile', async ({ page }) => {
  test.setTimeout(300000)
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/chat/events') return route.abort()
    const data = path === '/api/auth/me' ? account
      : path === '/api/profile' ? profile
        : path === '/api/catalog' ? { entries: [], total: 0 }
          : path === '/api/projects' ? []
            : path === '/api/feed' || path.startsWith('/api/profiles/') && path.endsWith('/posts') ? { posts: [] }
              : path === '/api/account/social-state' ? { followedAccountIds: [], bookmarkedPostIds: [] }
            : path === '/api/friends' ? { friends: [], incoming: [], outgoing: [] }
              : path === '/api/chat/conversations' || path === '/api/notifications/social' ? [] : null
    return route.fulfill({ json: { ok: true, data, requestId: 'theme-route-audit' } })
  })

  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const shotsRoot = join(process.cwd(), 'artifacts', 'theme-route-audit')
  for (const mode of modes) {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/#/home')
      await page.evaluate(({ accountId, settings }) => localStorage.setItem(`beatvault:settings:${accountId}`, JSON.stringify({
        ...settings,
        language: 'es',
        notifications: { messages: true, friendRequests: true, comments: true, reactions: true, reviews: true },
        reducedMotion: false,
      })), { accountId: account.id, settings: mode.value })
      await page.reload()

      for (const route of modules) {
        await page.goto(`/#${route.path}`)
        if (route.path === '/forgot-password' || route.path === '/password-reset') {
          await expect(page.locator('.login-page')).toBeVisible()
        } else {
          await expect(page.locator('.app-shell')).toBeVisible()
          await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', mode.value.theme)
        }
        if (mode.value.theme === 'custom' && route.path !== '/forgot-password' && route.path !== '/password-reset') {
          const contrast = await page.locator('.app-shell').evaluate(element => {
            const style = getComputedStyle(element)
            const colorChannels = (value: string) => value.startsWith('#')
              ? value.slice(1).match(/../g)!.map(channel => Number.parseInt(channel, 16))
              : value.match(/[\d.]+/g)!.slice(0, 3).map(Number)
            const rgb = (value: string) => colorChannels(value).map(channel => {
              const normalized = channel / 255
              return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
            }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
            const ratio = (first: string, second: string) => {
              const values = [rgb(first), rgb(second)].sort((a, b) => b - a)
              return (values[0] + 0.05) / (values[1] + 0.05)
            }
            return {
              body: ratio(style.getPropertyValue('--text'), style.getPropertyValue('--bg')),
              card: ratio(style.getPropertyValue('--surface-text'), style.getPropertyValue('--surface')),
              button: ratio(style.getPropertyValue('--on-primary'), style.getPropertyValue('--primary')),
              linkBg: ratio(style.getPropertyValue('--link'), style.getPropertyValue('--bg')),
              linkCard: ratio(style.getPropertyValue('--surface-link'), style.getPropertyValue('--surface')),
              semantic: ['success', 'warning', 'error', 'info', 'violet'].every(token =>
                ratio(style.getPropertyValue(`--${token}`), style.getPropertyValue('--bg')) >= 4.5
                && ratio(style.getPropertyValue(`--surface-${token}`), style.getPropertyValue('--surface')) >= 4.5),
            }
          })
          expect(contrast, `${mode.name} ${viewport.name} ${route.path}`).toEqual({
            body: expect.any(Number), card: expect.any(Number), button: expect.any(Number), linkBg: expect.any(Number), linkCard: expect.any(Number), semantic: true,
          })
          expect(Object.entries(contrast).filter(([key]) => key !== 'semantic').every(([, value]) => typeof value === 'number' && value >= 4.5), `${mode.name} ${viewport.name} ${route.path} contrast ${JSON.stringify(contrast)}`).toBe(true)
        }
        if (route.path === '/home') {
          const images = page.locator('.home-stories img, .home-post-media img, .home-rail img')
          for (const image of await images.all()) {
            await image.scrollIntoViewIfNeeded()
            await expect.poll(() => image.evaluate(element => {
              const img = element as HTMLImageElement
              return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0
            })).toBe(true)
          }
          await page.evaluate(() => window.scrollTo(0, 0))
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${mode.name} ${viewport.name} ${route.path} overflowed`).toBe(true)
        const filename = `${route.path.replaceAll('/', '_').replace(/^_/, '') || 'home'}.png`
        const screenshot = join(shotsRoot, mode.name, viewport.name, filename)
        mkdirSync(dirname(screenshot), { recursive: true })
        await page.screenshot({ path: screenshot })
      }
    }
  }
  const sampleRoutes = modules.filter(route => ['/home', '/settings', '/messages', '/upload', '/profile'].includes(route.path))
  for (const mode of extremePalettes) {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.evaluate(({ accountId, settings }) => localStorage.setItem(`beatvault:settings:${accountId}`, JSON.stringify({
        ...settings,
        language: 'es',
        notifications: { messages: true, friendRequests: true, comments: true, reactions: true, reviews: true },
        reducedMotion: false,
      })), { accountId: account.id, settings: mode.value })
      await page.reload()
      for (const route of sampleRoutes) {
        await page.goto(`/#${route.path}`)
        await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'custom')
        const contrast = await page.locator('.app-shell').evaluate(element => {
          const style = getComputedStyle(element)
          const colorChannels = (value: string) => value.startsWith('#')
            ? value.slice(1).match(/../g)!.map(channel => Number.parseInt(channel, 16))
            : value.match(/[\d.]+/g)!.slice(0, 3).map(Number)
          const rgb = (value: string) => colorChannels(value).map(channel => {
            const normalized = channel / 255
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
          }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
          const ratio = (first: string, second: string) => {
            const values = [rgb(first), rgb(second)].sort((a, b) => b - a)
            return (values[0] + 0.05) / (values[1] + 0.05)
          }
          return [
            ratio(style.getPropertyValue('--text'), style.getPropertyValue('--bg')),
            ratio(style.getPropertyValue('--surface-text'), style.getPropertyValue('--surface')),
            ratio(style.getPropertyValue('--on-primary'), style.getPropertyValue('--primary')),
            ratio(style.getPropertyValue('--link'), style.getPropertyValue('--bg')),
            ratio(style.getPropertyValue('--surface-link'), style.getPropertyValue('--surface')),
            ...['success', 'warning', 'error', 'info', 'violet'].flatMap(token => [
              ratio(style.getPropertyValue(`--${token}`), style.getPropertyValue('--bg')),
              ratio(style.getPropertyValue(`--surface-${token}`), style.getPropertyValue('--surface')),
            ]),
          ]
        })
        expect(contrast.every(value => value >= 4.5), `${mode.name} ${viewport.name} ${route.path} contrast ${JSON.stringify(contrast)}`).toBe(true)
        const screenshot = join(shotsRoot, mode.name, viewport.name, `${route.path.slice(1)}.png`)
        mkdirSync(dirname(screenshot), { recursive: true })
        await page.screenshot({ path: screenshot })
      }
    }
  }
  expect(pageErrors).toEqual([])
})
