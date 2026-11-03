import { test, expect } from '@playwright/test'
import { api, byCode, createProposal, loadMasters } from './helpers'

// Multi-region proposal: India is the primary country block and the United States is a second
// block. Each line is priced with its own country's rate card and currency, then consolidated
// into the USD reporting currency with the FX rate saved on the Rate Card page.
//   India : 380,000 + 80 x 250 x 12   = 620,000 INR (x 0.012 = 7,440 USD)
//   USA   : 100,000 + 5 x 1,000 x 12  = 160,000 USD
//   Total : 167,440 USD
// The rates are saved by this spec (Candidate Inflow schedule) so the totals do not depend on
// whatever other specs left behind. FX comes from the local test database.
const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

let m

test.beforeAll(async ({ request }) => {
  m = await loadMasters(request)
})

async function saveCandidateSchedule(request, country, packVersionId, fixedFee, unitRate) {
  await api(request, 'PUT', '/rates/rate-cards/target', {
    rate_card_version_id: m.version.id,
    country_id: country.id,
    deployment_model_id: byCode(m.deployments, 'shared_cloud').id,
    pricing_model_id: byCode(m.pricingModels, 'platform_subscription').id,
    pack_version_id: packVersionId,
    uom_id: byCode(m.uoms, 'candidate').id,
    unit_rate: String(unitRate),
    tier_fees: m.tiers.map((t) => ({ tier_id: t.id, fixed_fee: String(fixedFee) })),
  })
}

test('India + United States blocks are priced in their own currencies and consolidated on Page 6', async ({ page, request }) => {
  const india = m.countries.find((c) => c.name === 'India')
  const usa = m.countries.find((c) => c.name === 'United States')
  test.skip(!india || !usa, 'Needs India and United States country masters.')
  const pack = m.packs.find((p) => p.pack_versions?.some((v) => v.status === 'active'))
  const packVersionId = pack.pack_versions.find((v) => v.status === 'active').id
  const deployment = byCode(m.deployments, 'shared_cloud')
  const pricingModel = byCode(m.pricingModels, 'platform_subscription')
  const candidate = byCode(m.uoms, 'candidate')

  await saveCandidateSchedule(request, india, packVersionId, 380000, 80)
  await saveCandidateSchedule(request, usa, packVersionId, 100000, 5)

  // Primary block India with one pack line (no country link = primary block), reporting in USD.
  const pid = await createProposal(request, {
    suffix: 'MULTI', country: india, tier: m.tiers[0], deployment, pricingModel, packVersionId,
    uomId: candidate.id, quantity: 250, currencyId: usa.default_currency_id ?? usa.currency?.id,
  })
  const usBlock = await api(request, 'POST', `/proposals/${pid}/countries`, {
    country_id: usa.id, deployment_model_id: deployment.id, pricing_model_id: pricingModel.id,
    is_primary_deployment: false, user_headcount: 1000,
  })
  await api(request, 'POST', `/proposals/${pid}/line-items`, {
    proposal_country_id: usBlock.id, pack_version_id: packVersionId, uom_id: candidate.id, quantity: '1000',
  })

  const calc = await api(request, 'POST', `/proposals/${pid}/calculate`, { contract_term_months: 12 })
  const products = calc.snapshot_payload.products
  const inProduct = products.find((p) => p.country_id === india.id)
  const usProduct = products.find((p) => p.country_id === usa.id)
  expect([inProduct.native_currency_code, inProduct.product_native_total, inProduct.product_reporting_total]).toEqual(['INR', 620000, 7440])
  expect([usProduct.native_currency_code, usProduct.product_native_total, usProduct.product_reporting_total]).toEqual(['USD', 160000, 160000])
  expect(calc.snapshot_payload.total_proposal_reporting_currency).toBe(167440)

  // Page 6: both regions, each in its own currency, and the consolidated USD total.
  await page.goto(`/proposal-summary?proposalId=${pid}`)
  await expect(page.getByText('Delivered from India')).toBeVisible()
  await expect(page.getByText('Delivered from United States')).toBeVisible()
  await expect(page.locator('body')).toContainText('₹620,000.00')
  await expect(page.locator('body')).toContainText(usd(167440))

  // Page 5: the US block is priced (not "secondary / not priced") with its own USD rate.
  await page.goto(`/pricing-discounts?proposalId=${pid}`)
  await page.getByRole('button', { name: /United States/ }).first().click()
  await expect(page.getByText('Additional country')).toBeVisible()
  await expect(page.getByText(/Priced with United States's rate card/)).toBeVisible()
  await expect(page.locator('main')).toContainText('$5.00 / Candidate Inflow / mo')
})
