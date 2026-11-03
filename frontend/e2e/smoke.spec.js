import { test, expect } from '@playwright/test'

// Every page loads its data from the API without console errors or failed requests.
const PAGES = [
  ['/catalogue', /Products|Catalog/i],
  ['/packs', /Pack/i],
  ['/rate-cards', /Commercial Pricing Model/i],
  ['/calculator', /Client & Commercial Specifications/i],
  ['/pricing-discounts', /Pricing|Discount/i],
  ['/proposals', /Proposal/i],
]

for (const [path, marker] of PAGES) {
  test(`page ${path} loads cleanly`, async ({ page }) => {
    const consoleErrors = []
    const failedApi = []
    page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()))
    page.on('response', (res) => {
      if (res.url().includes('/api/') && res.status() >= 400) failedApi.push(`${res.status()} ${res.url()}`)
    })
    page.on('requestfailed', (req) => req.url().includes('/api/') && failedApi.push(`failed ${req.url()}`))

    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText(marker)
    expect(failedApi, 'failed API requests').toEqual([])
    expect(consoleErrors, 'console errors').toEqual([])
  })
}
