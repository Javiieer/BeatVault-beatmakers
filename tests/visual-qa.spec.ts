import { expect, test, type Page } from "@playwright/test";

const routes = ["/dashboard", "/studio", "/library", "/beats", "/shorts", "/upload", "/plans", "/admin"];
const viewports = [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 768, height: 900 }, { name: "mobile", width: 390, height: 844 }];

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
      await page.goto(`/#${route}`);
      await expect(page.locator(".app-shell")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

test("plans and admin routes expose their critical mock boundaries", async ({ page }) => {
  await page.goto("/#/plans");
  await expect(page.getByRole("heading", { name: "Plans & Subscription" })).toBeVisible();
  await expect(page.getByText("DEMO · SIN PAGOS")).toBeVisible();
  await page.getByRole("link", { name: "Admin · Mock" }).click();
  await expect(page.getByRole("heading", { name: "Admin Control Center" })).toBeVisible();
  await expect(page.getByText(/autorización real debe ser server-side/)).toBeVisible();
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

test("theme selector changes all themes and persists after reload", async ({ page }) => {
  await openFreshPage(page, "/library");
  const picker = page.locator(".theme-picker");
  const themes = [
    ["Classic", "classic"],
    ["Ember Forge", "ember"],
    ["Ivory Studio", "ivory"],
    ["Verdant Signal", "verdant"],
  ] as const;

  for (const [label, value] of themes) {
    await picker.locator("summary").click();
    await picker.getByRole("menuitemradio", { name: new RegExp(label) }).click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", value);
  }

  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "verdant");
});

test("library keeps navigation available and fits the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshPage(page, "/library");
  await expect(page.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /Import assets/ })).toHaveAttribute("href", "#/upload");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("library exposes typed catalog sections without extra top-level routes", async ({ page }) => {
  await openFreshPage(page, "/library");
  const sections = page.getByRole("navigation", { name: "Library sections" });
  await expect(sections.getByRole("link", { name: "Beats" })).toHaveAttribute("href", "#/library?section=beats");
  await sections.getByRole("link", { name: "Sound Packs" }).click();
  await expect(page).toHaveURL(/#\/library\?section=sound-packs/);
  await expect(page.getByRole("strong").filter({ hasText: "FL Studio Demo Pack" })).toBeVisible();
  await expect(page.getByText(/Contents: FL 808 Kick/)).toBeVisible();
});
