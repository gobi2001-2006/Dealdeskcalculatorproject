import { test, expect } from '@playwright/test'
import { api, byCode, createProposal, inr, loadMasters } from './helpers'

// calculation explained.xlsx examples, configured through the rate-card API, priced by the backend,
// and checked in the browser. Expected totals are the workbook inputs worked out by hand.
const YEARS = 5
const QTY = [10000, 20000, 30000]
const PLATFORM_ESS = { fee: [100000, 200000, 300000], rate: [3, 4, 5], combined: [2300000, 5800000, 10500000] }
const LICENCE_NON_ESS = { fee: [25000, 40000, 50000], amc: [5, 7, 10], total: [312500000, 1080000000, 2250000000] }

let m

test.beforeAll(async ({ request }) => {
  m = await loadMasters(request)
  test.skip(m.tiers.length < 3, 'The workbook has three tiers; create three customer tiers first.')
})

async function saveSchedule(request, deploymentCode, pricingCode, uomCode, tierFees) {
  const india = m.countries.find((c) => c.name === 'India')
  const pack = m.packs.find((p) => p.pack_versions?.some((v) => v.status === 'active'))
  const packVersionId = pack.pack_versions.find((v) => v.status === 'active').id
  await api(request, 'PUT', '/rates/rate-cards/target', {
    rate_card_version_id: m.version.id,
    country_id: india.id,
    deployment_model_id: byCode(m.deployments, deploymentCode).id,
    pricing_model_id: byCode(m.pricingModels, pricingCode).id,
    pack_version_id: packVersionId,
    uom_id: byCode(m.uoms, uomCode).id,
    tier_fees: tierFees,
  })
  return { india, pack, packVersionId }
}

test('Platform + Subscription (with ESS): per-tier fees and rates in the grid, Tier 2 total on Page 6', async ({ page, request }) => {
  const { india, pack, packVersionId } = await saveSchedule(request, 'shared_cloud', 'platform_subscription', 'employee',
    m.tiers.slice(0, 3).map((t, i) => ({ tier_id: t.id, fixed_fee: String(PLATFORM_ESS.fee[i]), unit_rate: String(PLATFORM_ESS.rate[i]) })))

  // Page 3: the ESS schedule is its own row, with a subscription rate per tier.
  await page.goto('/rate-cards')
  await page.getByRole('combobox', { name: 'Deployment Architecture' }).selectOption({ label: 'Shared Cloud' })
  await page.getByRole('combobox', { name: 'Commercial Pricing Model' }).selectOption({ label: 'Platform + Subscription' })
  const essRow = page.locator('tr', { has: page.locator(`select[aria-label="${pack.name} Unit of Measure"] >> option:checked`, { hasText: 'Active Employees (with ESS)' }) })
  await expect(essRow.getByLabel(`${pack.name} Tier 2 Platform Fee`)).toHaveValue(String(PLATFORM_ESS.fee[1]))
  await expect(essRow.getByLabel(`${pack.name} Tier 2 Subscription Rate`)).toHaveValue(String(PLATFORM_ESS.rate[1]))

  // Price Tier 2 through the backend and check Page 6 shows the same contract total.
  const pid = await createProposal(request, {
    suffix: 'PLAT-T2', country: india, tier: m.tiers[1], deployment: byCode(m.deployments, 'shared_cloud'),
    pricingModel: byCode(m.pricingModels, 'platform_subscription'), packVersionId,
    uomId: byCode(m.uoms, 'employee').id, quantity: QTY[1], currencyId: india.default_currency_id ?? india.currency?.id,
  })
  const calc = await api(request, 'POST', `/proposals/${pid}/calculate`, { contract_term_months: YEARS * 12 })
  expect(calc.total_proposal_contract_reporting_currency).toBe(PLATFORM_ESS.combined[1])

  await page.goto(`/proposals?proposalId=${pid}`)
  await expect(page.locator('body')).toContainText(inr(PLATFORM_ESS.combined[1]))
})

test('License Fee + AMC (non-ESS): licence and AMC % per tier in the grid, Tier 3 total on Page 6', async ({ page, request }) => {
  const { india, pack, packVersionId } = await saveSchedule(request, 'on_premise', 'license_amc', 'active_employees_non_ess',
    m.tiers.slice(0, 3).map((t, i) => ({ tier_id: t.id, unit_rate: String(LICENCE_NON_ESS.fee[i]), amc_percentage: String(LICENCE_NON_ESS.amc[i]) })))

  await page.goto('/rate-cards')
  await page.getByRole('combobox', { name: 'Deployment Architecture' }).selectOption({ label: 'On-Premise' })
  const row = page.locator('tr', { has: page.locator(`select[aria-label="${pack.name} Unit of Measure"] >> option:checked`, { hasText: 'Active Employees (non-ESS)' }) })
  await expect(row.getByLabel(`${pack.name} Tier 3 Licence Fee per User`)).toHaveValue(String(LICENCE_NON_ESS.fee[2]))
  await expect(row.getByLabel(`${pack.name} Tier 3 AMC Percentage`)).toHaveValue(String(LICENCE_NON_ESS.amc[2]))
  await expect(page.getByText('AMC Rate', { exact: false })).toHaveCount(0)

  const pid = await createProposal(request, {
    suffix: 'LIC-T3', country: india, tier: m.tiers[2], deployment: byCode(m.deployments, 'on_premise'),
    pricingModel: byCode(m.pricingModels, 'license_amc'), packVersionId,
    uomId: byCode(m.uoms, 'active_employees_non_ess').id, quantity: QTY[2], currencyId: india.default_currency_id ?? india.currency?.id,
  })
  const calc = await api(request, 'POST', `/proposals/${pid}/calculate`, { contract_term_months: YEARS * 12 })
  expect(calc.total_proposal_contract_reporting_currency).toBe(LICENCE_NON_ESS.total[2])

  await page.goto(`/proposals?proposalId=${pid}`)
  await expect(page.locator('body')).toContainText(inr(LICENCE_NON_ESS.total[2]))
})
