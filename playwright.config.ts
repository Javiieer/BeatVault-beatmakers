import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./artifacts/playwright",
  reporter: [["html", { outputFolder: "artifacts/playwright-report", open: "never" }], ["list"]],
  workers: process.platform === 'win32' ? 1 : 2,
  use: { baseURL: "http://127.0.0.1:5187", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: "node --import tsx scripts/e2e-api.ts", url: "http://127.0.0.1:45174/api/health", reuseExistingServer: false, timeout: 120000 },
    { command: "npm run dev -- --host 127.0.0.1 --port 5187 --strictPort", url: "http://127.0.0.1:5187", env: { BEATVAULT_API_PROXY: 'http://127.0.0.1:45174', VITE_API_BASE_URL: '' }, reuseExistingServer: false, timeout: 120000 },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
