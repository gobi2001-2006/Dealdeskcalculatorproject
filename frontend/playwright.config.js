// Browser E2E tests (Playwright) for the Deal Desk app.
//
// They run against an already-running LOCAL stack (never Neon / production):
//   backend  : uvicorn on http://localhost:8000 with DATABASE_URL pointing at a local test database
//   frontend : `npm run dev` on http://localhost:5173 (VITE_DEALDESK_USER_ID set)
// The specs create their own test records through the API, using unique codes.
//
// Browsers are not downloaded: the installed Chrome is used (override with PW_CHANNEL=msedge).
// Run: npx playwright test
import { defineConfig } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173'
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseURL)) {
  throw new Error(`E2E_BASE_URL must be a local URL, got ${baseURL}`)
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    channel: process.env.PW_CHANNEL || 'chrome',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
