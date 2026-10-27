import { expect, test, type Page } from "@playwright/test";
import { modules } from "../src/app/modules";

const routes = modules.map(item => item.path);
const viewports = [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 768, height: 900 }, { name: "mobile", width: 390, height: 844 }];

test.beforeEach(async ({ page }) => {
  // These tests cover the local UI boundary, independently of any developer API.
  await page.route(url => url.pathname.startsWith('/api/'), route => route.abort('connectionrefused'));
});

async function openFreshPage(page: Page, route: string) {
  await page.goto("/#/dashboard");
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/#${route}`);
  await expect(page.locator(".app-shell")).toBeVisible();
}

for (const viewport of viewports) {
  for (const route of routes) {
    test(`${viewport.name} ${route} has no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`/#${route}`);
      await expect(page.locator(["/forgot-password", "/password-reset"].includes(route) ? ".login-page" : ".app-shell")).toBeVisible();
      if (["/home", "/studio", "/upload", "/dashboard"].includes(route)) {
        const images = page.locator(route === "/home" ? ".home-stories img, .home-post-media img, .home-rail img" : "img");
        for (const image of await images.all()) {
          await image.scrollIntoViewIfNeeded();
          await expect.poll(() => image.evaluate(element => {
            const img = element as HTMLImageElement;
            return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
          })).toBe(true);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      await page.screenshot({ path: `artifacts/visual-qa/${viewport.name}${route.replaceAll("/", "-") || "-home"}.png`, fullPage: true });
    });
  }
}

test("mobile drawer opens and closes with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/dashboard");
  const menu = page.getByRole("button", { name: "Toggle navigation" });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("desktop sidebar fills the viewport after removing the fixed player", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/home");
  const bounds = await page.locator(".sidebar").boundingBox();
  expect(bounds?.y).toBe(0);
  expect(bounds?.height).toBe(900);
});

test("home feed shows a creator profile preview on hover and keeps its link reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/home");
  const profile = page.locator(".home-profile-hover").filter({ hasText: "Milo North" }).first();
  await profile.hover();
  const preview = profile.getByRole("region", { name: "Vista previa del perfil de Milo North" });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Trap");
  await expect(preview.getByRole("link", { name: "Descubrir creadores" })).toHaveAttribute("href", "#/friends");
});

test("plans and admin routes expose their critical mock boundaries", async ({ page }) => {
  await page.goto("/#/plans");
  await expect(page.getByRole("heading", { name: "Plans", exact: true })).toBeVisible();
  await expect(page.getByText("PRICING PROPOSAL · PAYMENTS OFF")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estimate your platform fee" })).toBeVisible();
  await expect(page.getByText("No sales or payouts are active yet.")).toBeVisible();
  await page.goto("/#/admin");
  await expect(page.getByRole("heading", { name: "Administración" })).toBeVisible();
  await expect(page.getByText(/Autorización validada en servidor/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cola de revisión" })).toBeVisible();
});

test("primary navigation contains the selected creator workflows", async ({ page }) => {
  await openFreshPage(page, "/dashboard");
  const links = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link");
  await expect(links).toHaveText(["Home", "Friends", "Messages", "My uploads", "Marketplace", "Upload", "Plans"]);
});

test("friends shows a clear retry state while the local API is offline", async ({ page }) => {
  await page.goto("/#/friends");
  await expect(page.getByRole("heading", { name: "Conecta con BeatVault local" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No encontramos creadores" })).toHaveCount(0);
});

test("upload accepts multiple synthetic supported files in the queue", async ({ page }) => {
  await openFreshPage(page, "/upload");
  await page.locator("#upload-file").setInputFiles([
    { name: "synthetic-kick.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFFsynthetic") },
    { name: "synthetic-loop.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("synthetic") },
  ]);

  const queue = page.locator(".upload-queue");
  await expect(queue).toContainText("synthetic-kick.wav");
  await expect(queue).toContainText("synthetic-loop.mp3");
  await expect(queue.locator(".check")).toHaveCount(2);
});

test("upload rejects an unsupported file with an accessible error", async ({ page }) => {
  await openFreshPage(page, "/upload");
  await page.locator("#upload-file").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not audio"),
  });

  await expect(page.getByRole("alert")).toContainText("Formato o MIME no soportado");
  await expect(page.locator(".upload-queue")).toContainText("notes.txt");
});

test("upload removes one queue item without removing the others", async ({ page }) => {
  await openFreshPage(page, "/upload");
  await page.locator("#upload-file").setInputFiles([
    { name: "remove-me.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFFsynthetic") },
    { name: "keep-me.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFFsynthetic") },
  ]);

  await page.getByRole("button", { name: "Remove remove-me.wav" }).click();
  const queue = page.locator(".upload-queue");
  await expect(queue).not.toContainText("remove-me.wav");
  await expect(queue).toContainText("keep-me.wav");
});

test("theme preferences change dark, light and custom RGB colors and persist", async ({ page }) => {
  await page.unrouteAll();
  const account = { id: "theme-creator", email: "theme@beatvault.local", role: "creator", verificationState: "unverified" };
  const profile = { accountId: account.id, displayName: "Theme Creator", bio: "", location: "", website: "", instagram: "", genres: [], coverId: "lo-fi", avatarId: "initials", publicProfile: false };
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/chat/events") return route.abort();
    const data = path === "/api/auth/me" ? account
      : path === "/api/profile" ? profile
        : path === "/api/catalog" ? { entries: [], total: 0 }
          : path === "/api/projects" ? []
            : path === "/api/friends" ? { friends: [], incoming: [], outgoing: [] }
              : path === "/api/chat/conversations" || path === "/api/notifications/social" ? [] : null;
    return route.fulfill({ json: { ok: true, data, requestId: "theme-test" } });
  });
  await openFreshPage(page, "/settings");
  await page.getByRole("button", { name: "Preferencias" }).click();
  await page.getByLabel("Tema visual").selectOption("dark");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Tema visual").selectOption("light");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Tema visual").selectOption("custom");
  await page.getByLabel("Color tarjetas").fill("#243144");
  await page.getByLabel("Color enlaces").fill("#55c7ff");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "custom");
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "custom");
  await page.getByRole("button", { name: "Preferencias" }).click();
  await expect(page.getByLabel("Color tarjetas")).toHaveValue("#243144");
  await expect(page.getByLabel("Color enlaces")).toHaveValue("#55c7ff");
  await expect(page.locator(".theme-picker")).toHaveCount(0);
});

test("legacy library opens the unified Marketplace and fits the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshPage(page, "/library");
  await expect(page).toHaveURL(/#\/marketplace\?tab=library/);
  await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Marketplace' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'My library', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Marketplace combines its sections without duplicate top-level discovery links", async ({ page }) => {
  await openFreshPage(page, "/library");
  const sections = page.getByRole('navigation', { name: 'Marketplace sections' });
  await expect(sections.getByRole('button', { name: 'Explore', exact: true })).toBeVisible();
  await sections.getByRole('button', { name: 'My purchases', exact: true }).click();
  await expect(page).toHaveURL(/tab=purchases/);
  await expect(page.getByRole('heading', { name: 'Sign in to access your purchases' })).toBeVisible();
  const primary = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(primary.getByRole('link', { name: 'Library', exact: true })).toHaveCount(0);
  await expect(primary.getByRole('link', { name: 'Beats', exact: true })).toHaveCount(0);
});
