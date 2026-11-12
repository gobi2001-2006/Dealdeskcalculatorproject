import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { RateCardPage } from '../features/ratecard/RateCardPage'
import * as ratesApi from '../api/ratesApi'
import * as catalogueApi from '../api/catalogueApi'
import * as packsApi from '../api/packsApi'

vi.mock('../api/ratesApi')
vi.mock('../api/catalogueApi')
vi.mock('../api/packsApi')

// Fixture values (calculation explained.xlsx, License Fee + AMC, Active Employees (with ESS)).
const ESS = { id: 1, code: 'employee', name: 'Active Employees (with ESS)', status: 'active' }
const TIERS = [
  { id: 11, name: 'Starter', employee_min: 0, status: 'active' },
  { id: 12, name: 'Growth', employee_min: 1000, status: 'active' },
  { id: 13, name: 'Scale', employee_min: 5000, status: 'active' },
]
const card = (id, tierId, licence, amc) => ({
  id, rate_card_version_id: 1, country_id: 1, deployment_model_id: 3, pricing_model_id: 7, tier_id: tierId,
  pack_version_id: 38, feature_id: null, uom_id: 1, uom: ESS, fixed_fee: null, unit_rate: licence, amc_percentage: amc,
})

function setup({ pricingModelName = 'License Fee + AMC', pricingModelCode = 'license_amc' } = {}) {
  ratesApi.getCountries.mockResolvedValue([{ id: 1, iso_code: 'IN', name: 'India', currency: { id: 1, code: 'INR', symbol: '₹' } }])
  ratesApi.getCustomerTiers.mockResolvedValue(TIERS)
  ratesApi.getDeploymentModels.mockResolvedValue([{ id: 3, code: 'on_premise', name: 'On-Premise' }])
  ratesApi.getDeploymentPricingOptions.mockResolvedValue([{ deployment_model_id: 3, pricing_model_id: 7 }])
  ratesApi.getPricingModels.mockResolvedValue([
    { id: 7, code: pricingModelCode, name: pricingModelName, has_fixed_component: false, has_unit_component: true, unit_rate_basis: 'one_time' },
  ])
  ratesApi.getAllowedUomsForPricingModel.mockResolvedValue([ESS])
  ratesApi.getUnitsOfMeasure.mockResolvedValue([ESS])
  ratesApi.getCurrencies.mockResolvedValue([{ id: 1, code: 'INR', symbol: '₹' }])
  ratesApi.getFxRates.mockResolvedValue([])
  ratesApi.getServiceRates.mockResolvedValue([])
  ratesApi.getActiveRateCardVersion.mockResolvedValue({ id: 1, version_no: 'RC-T-1', status: 'active' })
  ratesApi.getRateCardVersions.mockResolvedValue([{ id: 1, version_no: 'RC-T-1', status: 'active' }])
  ratesApi.getRateCards.mockResolvedValue([card(1, 11, 100000, 5), card(2, 12, 200000, 7), card(3, 13, 300000, 10)])
  ratesApi.saveRateCardTarget.mockResolvedValue([])
  catalogueApi.getCatalogueFamilies.mockResolvedValue([{ id: 1, code: 'TA', name: 'Talent Acquisition' }])
  catalogueApi.getCatalogueProducts.mockResolvedValue([{ id: 1, product_family_id: 1, code: 'TA_MAX', name: 'TA Max' }])
  catalogueApi.getCatalogueFeatures.mockResolvedValue([])
  packsApi.getPacks.mockResolvedValue([
    { id: 1, code: 'TA-STD', name: 'TA Standard', product_family_id: 1, pack_versions: [{ id: 38, version_no: 1, status: 'active', pack_items: [] }] },
  ])
  render(
    <BrowserRouter>
      <RateCardPage />
    </BrowserRouter>,
  )
}

describe('Rate Card — one-time unit rate + AMC layout (License Fee + AMC)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows licence fee per user and AMC % for every tier, loaded from the database', async () => {
    setup()
    await waitFor(() => expect(screen.getByLabelText('TA Standard Tier 1 Licence Fee per User')).toHaveValue(100000))
    expect(screen.getByLabelText('TA Standard Tier 2 Licence Fee per User')).toHaveValue(200000)
    expect(screen.getByLabelText('TA Standard Tier 3 AMC Percentage')).toHaveValue(10)
    expect(screen.queryByText(/Capex License Fee/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/AMC Rate/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Subscription Rate/i)).not.toBeInTheDocument()
  })

  it('saves AMC % as a percentage per tier, with no fixed fee', async () => {
    setup()
    const amc = await screen.findByLabelText('TA Standard Tier 2 AMC Percentage')
    fireEvent.change(amc, { target: { value: '7.5' } })
    await waitFor(() => expect(ratesApi.saveRateCardTarget).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const payload = ratesApi.saveRateCardTarget.mock.calls[0][0]
    expect(payload.unit_rate).toBeNull()
    expect(payload.tier_fees).toEqual([
      { tier_id: 11, unit_rate: 100000, amc_percentage: 5 },
      { tier_id: 12, unit_rate: 200000, amc_percentage: 7.5 },
      { tier_id: 13, unit_rate: 300000, amc_percentage: 10 },
    ])
  })

  it('rejects an AMC % above 100 before calling the backend', async () => {
    setup()
    fireEvent.change(await screen.findByLabelText('TA Standard Tier 1 AMC Percentage'), { target: { value: '150' } })
    await waitFor(() => expect(screen.getByText(/AMC % must be between 0 and 100/i)).toBeInTheDocument(), { timeout: 2000 })
    expect(ratesApi.saveRateCardTarget).not.toHaveBeenCalled()
  })

  it('chooses the layout from the pricing model data, not its name', async () => {
    setup({ pricingModelName: 'Perpetual Capex Model', pricingModelCode: 'capex_2027' })
    await waitFor(() => expect(screen.getByLabelText('TA Standard Tier 1 Licence Fee per User')).toHaveValue(100000))
  })
})
