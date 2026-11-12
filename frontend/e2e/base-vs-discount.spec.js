import { test, expect } from '@playwright/test'
import { api, byCode, createProposal, loadMasters } from './helpers'

// Proposal 31 regression, on an ISOLATED local copy (the real proposal 31 is never touched):
// US, Shared Cloud, Platform + Subscription (with ESS), customer Tier 2, 20,000 employees,
// platform fee 200,000 / year, 4 per employee per month, 5 years, 10% overall discount for the US.
// Reference: calculation explained.xlsx Tier 2 (test data only; nothing here is in the application).
//   Year 1 base 200,000 + 4 x 20,000 x 12 = 1,160,000     Contract base  1,000,000 + 4,800,000 = 5,800,000
//   Year 1 net  1,160,000 x 0.90           = 1,044,000     Contract net   5,800,000 x 0.90       = 5,220,000
//   3 years: base 600,000 + 2,880,000 = 3,480,000 ; net 3,132,000
const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

let m
let usa
let packVersionId
const ctx = {}

test.beforeAll(async ({ request }) => {
  m = await loadMasters(request)
  test.skip(m.tiers.length < 3, 'Needs three customer tiers.')
  usa = m.countries.find((c) => c.name === 'United States')
  const pack = m.packs.find((p) => p.pack_versions?.some((v) => v.status === 'active'))
  packVersionId = pack.pack_versions.find((v) => v.status === 'active').id
  ctx.deployment = byCode(m.deployments, 'shared_cloud')
  ctx.platform = byCode(m.pricingModels, 'platform_subscription')
  ctx.ess = byCode(m.uoms, 'employee')
  // US Platform + Subscription (ESS) rates per tier (workbook values).
  await api(request, 'PUT', '/rates/rate-cards/target', {
    rate_card_version_id: m.version.id, country_id: usa.id, deployment_model_id: ctx.deployment.id,
    pricing_model_id: ctx.platform.id, pack_version_id: packVersionId, uom_id: ctx.ess.id,
    tier_fees: m.tiers.slice(0, 3).map((t, i) => ({ tier_id: t.id, fixed_fee: String([100000, 200000, 300000][i]), unit_rate: String([3, 4, 5][i]) })),
  })
})

async function newUsProposal(request, suffix, discountPct) {
  const pid = await createProposal(request, {
    suffix, country: usa, tier: m.tiers[1], deployment: ctx.deployment, pricingModel: ctx.platform, packVersionId,
    uomId: ctx.ess.id, quantity: 20000, currencyId: usa.default_currency_id ?? usa.currency?.id,
  })
  await api(request, 'PATCH', `/proposals/${pid}`, { contract_term_months: 60 })
  if (discountPct) {
    const block = (await api(request, 'GET', `/proposals/${pid}`)).countries[0]
    await api(request, 'PATCH', `/proposals/${pid}/countries/${block.id}`, {
      subscription_discount_pct: discountPct, subscription_discount_reason: 'Proposal 31 regression',
    })
  }
  return pid
}

const strip = (page) => page.getByRole('region', { name: /Commercial Master Summary/i })

test('Page 4 shows base pricing, Page 5 applies the saved 10% once, Page 6 shows the net result', async ({ page, request }, testInfo) => {
  const pid = await newUsProposal(request, 'P31-COPY', 10)

  // Page 4: base only, duration in years.
  await page.goto(`/calculator?proposalId=${pid}`)
  await expect(page.getByLabel('Contract Duration (Years)')).toHaveValue('5')
  await expect(strip(page)).toContainText(`${usd(5800000)} (base)`)
  await expect(strip(page)).not.toContainText(usd(5220000))
  await page.getByRole('button', { name: /Calculate Pricing/i }).click()
  await expect(page.getByTestId('fcv-label')).toHaveText(/Full Contract Value \(USD, 5 years\)$/i)
  await expect(page.getByTestId('fcv-value')).toHaveText(usd(5800000))
  await expect(page.getByTestId('year1-value')).toContainText(usd(1160000))
  await expect(page.getByText('Base pricing — before discounts')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('11-page4-base-pricing-5-years.png'), fullPage: true })

  // Page 4 must not have touched the saved discount.
  const block = (await api(request, 'GET', `/proposals/${pid}`)).countries[0]
  expect(Number(block.subscription_discount_pct)).toBe(10)

  // Page 5: the proposal's own 10% is loaded and applied once by the backend.
  await page.goto(`/pricing-discounts?proposalId=${pid}`)
  await expect(page.getByLabel('Overall subscription discount', { exact: true })).toHaveValue('10')
  await page.getByRole('button', { name: /Save Discounts & Recalculate/i }).click()
  await expect(page.getByText(/Discounts saved and proposal recalculated/)).toBeVisible()
  const latest = await api(request, 'GET', `/proposals/${pid}/calculations/latest`)
  const p = latest.snapshot_payload
  expect([p.total_proposal_base_annual_reporting_currency, p.total_proposal_annual_reporting_currency]).toEqual([1160000, 1044000])
  expect([p.total_proposal_base_contract_reporting_currency, p.total_proposal_contract_reporting_currency]).toEqual([5800000, 5220000])
  expect(p.products[0].subscription_discount_pct).toBe(10)
  expect(p.all_subscription_line_items[0].item_discount_pct).toBe(0) // applied once: no line discount on top
  await page.screenshot({ path: testInfo.outputPath('12-page5-net-after-10pct.png'), fullPage: true })

  // Page 6: net figures and the duration in years.
  await page.goto(`/proposals?proposalId=${pid}`)
  await expect(page.locator('main')).toContainText(usd(5220000))
  await expect(page.locator('main')).toContainText('Subscription (5 years)')
  await page.screenshot({ path: testInfo.outputPath('13-page6-net-5-years.png'), fullPage: true })

  // Back on Page 4 the base pricing is unchanged by the Page 5 discount.
  await page.goto(`/calculator?proposalId=${pid}`)
  await expect(strip(page)).toContainText(`${usd(5800000)} (base)`)
})

test('a proposal without a discount shows none, and two tabs never share discounts', async ({ browser, request }) => {
  const withDiscount = await newUsProposal(request, 'ISO-A', 10)
  const without = await newUsProposal(request, 'ISO-B', null)
  const context = await browser.newContext()
  const tabA = await context.newPage()
  const tabB = await context.newPage()
  await tabA.goto(`/pricing-discounts?proposalId=${withDiscount}`)
  await tabB.goto(`/pricing-discounts?proposalId=${without}`)
  await expect(tabA.getByLabel('Overall subscription discount', { exact: true })).toHaveValue('10')
  await expect(tabB.getByLabel('Overall subscription discount', { exact: true })).toHaveValue('')

  // Change A in its tab; B (and its database rows) stay untouched.
  await tabA.getByLabel('Overall subscription discount', { exact: true }).fill('12')
  await tabA.getByRole('button', { name: /Save Discounts & Recalculate/i }).click()
  await expect(tabA.getByText(/Discounts saved and proposal recalculated/)).toBeVisible()
  await tabB.reload()
  await expect(tabB.getByLabel('Overall subscription discount', { exact: true })).toHaveValue('')
  const blockB = (await api(request, 'GET', `/proposals/${without}`)).countries[0]
  expect(blockB.subscription_discount_pct).toBeNull()

  // B priced on Page 5: net equals base (no discount configured).
  await tabB.getByRole('button', { name: /Save Discounts & Recalculate/i }).click()
  await expect(tabB.getByText(/Discounts saved and proposal recalculated/)).toBeVisible()
  const b = (await api(request, 'GET', `/proposals/${without}/calculations/latest`)).snapshot_payload
  expect(b.total_proposal_contract_reporting_currency).toBe(5800000)

  // Reload A: its new 12% is restored.
  await tabA.reload()
  await expect(tabA.getByLabel('Overall subscription discount', { exact: true })).toHaveValue('12')
  await context.close()
})

test('changing the duration on Page 4 re-prices the base and marks the saved calculation outdated', async ({ page, request }) => {
  const pid = await newUsProposal(request, 'DUR-3Y', 10)
  await api(request, 'POST', `/proposals/${pid}/calculate`, {}) // saved net calculation for 5 years

  await page.goto(`/calculator?proposalId=${pid}`)
  await expect(page.getByLabel('Contract Duration (Years)')).toHaveValue('5')
  await page.getByLabel('Contract Duration (Years)').fill('3')
  await page.getByRole('button', { name: /Calculate Pricing/i }).click()
  await expect(page.getByTestId('fcv-label')).toHaveText(/Full Contract Value \(USD, 3 years\)$/i)
  await expect(page.getByTestId('fcv-value')).toHaveText(usd(3480000))

  expect((await api(request, 'GET', `/proposals/${pid}`)).contract_term_months).toBe(36)
  expect((await api(request, 'GET', `/proposals/${pid}/calculations/latest`)).is_stale).toBe(true)

  // Page 5 re-prices with the saved 3 years and the same 10% (save only once its discounts have loaded).
  await page.goto(`/pricing-discounts?proposalId=${pid}`)
  await expect(page.getByLabel('Overall subscription discount', { exact: true })).toHaveValue('10')
  await expect(page.getByText(/Contract duration 3 years/)).toBeVisible()
  await page.getByRole('button', { name: /Save Discounts & Recalculate/i }).click()
  await expect(page.getByText(/Discounts saved and proposal recalculated/)).toBeVisible()
  const latest = await api(request, 'GET', `/proposals/${pid}/calculations/latest`)
  expect(latest.is_stale).toBe(false)
  expect(latest.snapshot_payload.total_proposal_contract_reporting_currency).toBe(3132000)
})
