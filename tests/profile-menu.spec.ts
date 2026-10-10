import { expect, test } from '@playwright/test';

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: administrator profile menu stays usable and logs out explicitly`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let loggedOut = false;
    let logoutAttempts = 0;
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
      const path = new URL(route.request().url()).pathname;
      let status = 200;
      let payload: unknown = { ok: true, data: null };
      if (path === '/api/auth/me') {
        payload = { ok: true, data: { id: 'admin-fixture', email: 'administrator-with-a-long-address@example.test', role: 'admin', verificationState: 'unverified' } };
      } else if (path === '/api/auth/logout') {
        logoutAttempts++;
        if (logoutAttempts === 1) { status = 503; payload = { ok: false, error: { code: 'UNAVAILABLE', message: 'Temporary failure' } }; }
        else loggedOut = true;
      } else if (path === '/api/catalog') payload = { ok: true, data: { entries: [], total: 0 } };
      else if (path === '/api/projects') payload = { ok: true, data: [] };
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await page.goto('/#/studio');
    const trigger = page.getByRole('button', { name: 'Menu de perfil' });
    await trigger.click();
    await expect(page.getByRole('menuitem', { name: 'Panel de administracion' })).toHaveAttribute('href', '#/admin');
    await expect(page.locator('.profile-identity')).toContainText('Administrador');
    expect(loggedOut).toBe(false);
    const popover = await page.locator('.profile-popover').boundingBox();
    expect(popover).not.toBeNull();
    expect(popover!.x).toBeGreaterThanOrEqual(0);
    expect(popover!.x + popover!.width).toBeLessThanOrEqual(viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/visual-qa/${viewport.name}-profile-menu.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await trigger.click();
    await page.getByRole('button', { name: 'Cerrar menú de perfil' }).click({ position: { x: 10, y: viewport.height - 15 } });
    await expect(page.getByRole('menu')).toHaveCount(0);
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Subir audio' }).click();
    await expect(page).toHaveURL(/#\/upload$/);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Cerrar sesion' }).click();
    await expect(page.getByRole('alert')).toContainText('No se pudo cerrar la sesion');
    expect(loggedOut).toBe(false);
    await page.getByRole('menuitem', { name: 'Cerrar sesion' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to BeatVault' })).toBeVisible();
    expect(loggedOut).toBe(true);
  });
}
