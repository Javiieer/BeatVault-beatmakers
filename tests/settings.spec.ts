import { expect, test } from '@playwright/test'

const account = { id: 'settings-creator', email: 'creator@beatvault.local', role: 'creator', verificationState: 'unverified' }
const profile = { accountId: account.id, displayName: 'Productor QA', bio: '', location: '', website: '', instagram: '', genres: [], coverId: 'lo-fi', avatarId: 'initials', publicProfile: false }

test('settings controls persist account preferences and fit on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(url => new URL(url).pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const data = path === '/api/auth/me' ? account
      : path === '/api/profile' ? profile
        : path === '/api/catalog' ? { entries: [], total: 0 }
          : path === '/api/projects' ? []
            : path === '/api/friends' ? { friends: [], incoming: [], outgoing: [] }
              : path === '/api/chat/conversations' ? []
                : path === '/api/notifications/social' ? []
                : null
    if (path === '/api/chat/events') return route.abort()
    if (path === '/api/profile' && method === 'PUT') {
      const submitted = route.request().postDataJSON()
      return route.fulfill({ json: { ok: true, data: { ...profile, ...submitted }, requestId: 'settings-test' } })
    }
    return route.fulfill({ json: { ok: true, data, requestId: 'settings-test' } })
  })

  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await page.getByRole('button', { name: 'Preferencias' }).click()
  await page.getByLabel('Tema visual').selectOption('light')
  await page.getByLabel('Idioma preferido').selectOption('en')
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light')
  await page.getByLabel('Tema visual').selectOption('custom')
  await page.getByLabel('Color botones').fill('#e34b77')
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'custom')
  await expect(page.locator('.app-shell')).toHaveCSS('--primary', 'rgb(227 75 119)')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('beatvault:settings:settings-creator') || '{}'))).toMatchObject({ theme: 'custom', customTheme: { button: '#e34b77' }, language: 'en' })
  await page.getByRole('button', { name: 'Seguridad' }).click()
  await expect(page.getByRole('heading', { name: 'Cambiar contraseña' })).toBeVisible()
  await page.locator('.notification-trigger').click()
  await expect(page.getByText('Estás al día')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver amigos y solicitudes' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar notificaciones' }).click()
  await page.goto('/#/home')
  await expect(page.locator('.home-stories')).toBeVisible()
  await page.locator('.notification-trigger').click()
  await expect(page.locator('.notification-panel')).toBeVisible()
  await expect(page.locator('.notification-trigger-label')).toBeHidden()
  await expect(page.locator('.notification-trigger')).toHaveAccessibleName(/Notificaciones/)
  await expect(page.locator('.theme-picker')).toHaveCount(0)
  expect(await page.evaluate(() => document.elementFromPoint(120, 110)?.closest('.notification-panel') !== null)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
