import { test, expect } from '@playwright/test'
import { api, byCode, createProposal, loadMasters } from './helpers'

// Business decisions 2026-11-06 (docs/AUDIO_BUSINESS_RULE_DECISIONS.md):
//   1. The overall discount % is set per country.
//   2. PEPM may be charged per Active Employees (with ESS) or (non-ESS).
//
// Rates saved by this spec (Shared Cloud, PEPM, monthly, per tier 1 / 2 / 3):
//   India  ESS     3 / 4 / 5 INR        India non-ESS 1 / 2 / 3 INR
//   USA    non-ESS 2 / 3 / 4 USD
// Proposal (customer Tier 2, 24 months, reporting USD, FX 1 INR = 0.012 USD):
//   India ESS     : 4 x 20,000 x 24 = 1,920,000 INR, country discount 10% -> 1,728,000 INR -> 20,736 USD
//   USA   non-ESS : 3 x 15,000 x 24 = 1,080,000 USD, country discount  5% -> 1,026,000 USD
//   Contract total: 1,046,736 USD
const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

let m

test.beforeAll(async ({ request }) => {
  m = await loadMasters(request)
  test.skip(m.tiers.length < 3, 'Needs three customer tiers.')
})

async function savePepm(request, country, packVersionId, uomCode, rates) {
  await api(request, 'PUT', '/rates/rate-cards/target', {
    rate_card_version_id: m.version.id,
    country_id: country.id,
    deployment_model_id: byCode(m.deployments, 'shared_cloud').id,
    pricing_model_id: byCode(m.pricingModels, 'pepm').id,
    pack_version_id: packVersionId,
    uom_id: byCode(m.uoms, uomCode).id,
    tier_fees: m.tiers.slice(0, 3).map((t, i) => ({ tier_id: t.id, unit_rate: String(rates[i]) })),
  })
}

test('PEPM offers ESS and non-ESS, prices each by its own rate, and each country keeps its own discount', async ({ page, request }, testInfo) => {
  const india = m.countries.find((c) => c.name === 'India')
  const usa = m.countries.find((c) => c.name === 'United States')
  const pepm = byCode(m.pricingModels, 'pepm')
  const deployment = byCode(m.deployments, 'shared_cloud')
  const pack = m.packs.find((p) => p.pack_versions?.some((v) => v.status === 'active'))
  const packVersionId = pack.pack_versions.find((v) => v.status === 'active').id

  // 1. Allowed units come from the database: exactly ESS (default) and non-ESS.
  const allowed = await api(request, 'GET', `/masters/pricing-models/${pepm.id}/allowed-uoms`)
  expect(allowed.map((u) => u.code)).toEqual(['employee', 'active_employees_non_ess'])

  // 2. Tier 1/2/3 rates for each unit, saved independently.
  await savePepm(request, india, packVersionId, 'employee', [3, 4, 5])
  await savePepm(request, india, packVersionId, 'active_employees_non_ess', [1, 2, 3])
  await savePepm(request, usa, packVersionId, 'active_employees_non_ess', [2, 3, 4])

  // Page 3: Shared Cloud + PEPM shows one row per unit of measure with its own tier rates.
  await page.goto('/rate-cards')
  await page.getByRole('combobox', { name: 'Deployment Architecture' }).selectOption({ label: deployment.name })
  await page.getByRole('combobox', { name: 'Commercial Pricing Model' }).selectOption({ label: pepm.name })
  const essRow = page.locator('tr', { hasText: 'UOM: Active Employees (with ESS)' }).filter({ hasText: pack.name })
  const nonRow = page.locator('tr', { hasText: 'UOM: Active Employees (non-ESS)' }).filter({ hasText: pack.name })
  await expect(essRow.getByLabel(`${pack.name} Tier 2 Rate`)).toHaveValue('4')
  await expect(nonRow.getByLabel(`${pack.name} Tier 2 Rate`)).toHaveValue('2')
  await page.screenshot({ path: testInfo.outputPath('08-ratecard-pepm-ess-and-non-ess.png'), fullPage: true })

  // 3. Proposal: India (primary) on ESS, United States on non-ESS, each with its own overall discount.
  const pid = await createProposal(request, {
    suffix: 'PEPM-CD', country: india, tier: m.tiers[1], deployment, pricingModel: pepm, packVersionId,
    uomId: byCode(m.uoms, 'employee').id, quantity: 20000, currencyId: usa.default_currency_id ?? usa.currency?.id,
  })
  const detail = await api(request, 'GET', `/proposals/${pid}`)
  const inBlock = detail.countries.find((c) => c.country_id === india.id)
  const usBlock = await api(request, 'POST', `/proposals/${pid}/countries`, {
    country_id: usa.id, deployment_model_id: deployment.id, pricing_model_id: pepm.id,
    is_primary_deployment: false, user_headcount: 15000,
  })
  await api(request, 'POST', `/proposals/${pid}/line-items`, {
    proposal_country_id: usBlock.id, pack_version_id: packVersionId,
    uom_id: byCode(m.uoms, 'active_employees_non_ess').id, quantity: '15000',
  })
  await api(request, 'PATCH', `/proposals/${pid}/countries/${inBlock.id}`, {
    subscription_discount_pct: 10, subscription_discount_reason: 'India volume commitment',
  })
  await api(request, 'PATCH', `/proposals/${pid}/countries/${usBlock.id}`, {
    subscription_discount_pct: 5, subscription_discount_reason: 'US launch partner',
  })

  const calc = await api(request, 'POST', `/proposals/${pid}/calculate`, { contract_term_months: 24 })
  const byCountry = Object.fromEntries(calc.snapshot_payload.products.map((p) => [p.country_id, p]))
  const inLine = byCountry[india.id].line_items[0]
  const usLine = byCountry[usa.id].line_items[0]
  expect([inLine.uom_code, inLine.rate_per_unit, inLine.contract_subscription_before_discount]).toEqual(['employee', 4, 1920000])
  expect([usLine.uom_code, usLine.rate_per_unit, usLine.contract_subscription_before_discount]).toEqual(['active_employees_non_ess', 3, 1080000])
  expect(byCountry[india.id].subscription_discount_pct).toBe(10)
  expect(byCountry[usa.id].subscription_discount_pct).toBe(5)
  expect(byCountry[india.id].contract_product_reporting_total).toBe(20736)
  expect(byCountry[usa.id].contract_product_reporting_total).toBe(1026000)
  expect(calc.total_proposal_contract_reporting_currency).toBe(1046736)

  // Page 5: the US block is priced per non-ESS employee and shows its own discount.
  await page.goto(`/pricing-discounts?proposalId=${pid}`)
  await page.getByRole('button', { name: /United States/ }).first().click()
  await expect(page.getByText('Overall Subscription Discount — United States')).toBeVisible()
  await expect(page.getByLabel('Overall subscription discount', { exact: true })).toHaveValue('5')
  await expect(page.getByLabel('Overall subscription discount reason')).toHaveValue('US launch partner')
  await expect(page.locator('main')).toContainText('$3.00 / Active Employees (non-ESS) / mo')
  await page.getByRole('button', { name: /India/ }).first().click()
  await expect(page.getByLabel('Overall subscription discount', { exact: true })).toHaveValue('10')
  await page.screenshot({ path: testInfo.outputPath('09-page5-country-discount-india.png'), fullPage: true })

  // Page 6: each country's discount and justification, and the consolidated contract total.
  await page.goto(`/proposals?proposalId=${pid}`)
  await page.getByRole('switch', { name: 'Show Discounts Toggle' }).click()
  await expect(page.getByText(/India overall subscription discount 10%/)).toBeVisible()
  await expect(page.getByText(/United States overall subscription discount 5%/)).toBeVisible()
  await expect(page.getByText(/India volume commitment/)).toBeVisible()
  await expect(page.locator('main')).toContainText(usd(1046736))
  await page.screenshot({ path: testInfo.outputPath('10-page6-country-discounts.png'), fullPage: true })

  // Reload: the stored country discounts come back.
  await page.goto(`/pricing-discounts?proposalId=${pid}`)
  await expect(page.getByLabel('Overall subscription discount', { exact: true })).toHaveValue('10')
  await expect(page.getByLabel('Overall subscription discount reason')).toHaveValue('India volume commitment')
})
