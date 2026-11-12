import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { RateCardPage } from '../features/ratecard/RateCardPage'
import * as ratesApi from '../api/ratesApi'
import * as catalogueApi from '../api/catalogueApi'
import * as packsApi from '../api/packsApi'

vi.mock('../api/ratesApi')
vi.mock('../api/catalogueApi')
vi.mock('../api/packsApi')

// Test fixtures only: ids and amounts are arbitrary and come from the mocked backend.
const TIERS = [
  { id: 11, name: 'Starter', employee_min: 0, employee_max: 999, status: 'active' },
  { id: 12, name: 'Growth', employee_min: 1000, employee_max: 4999, status: 'active' },
  { id: 13, name: 'Scale', employee_min: 5000, employee_max: null, status: 'active' },
]
const ALLOWED_UOMS = [
  { id: 1, code: 'employee', name: 'Active Employees (with ESS)', status: 'active' },
  { id: 5, code: 'candidate', name: 'Candidate Inflow', status: 'active' },
  { id: 6, code: 'gb_data', name: 'GB of Data', status: 'active' },
]

function platformCard(id, tierId, fixed, unit, extra = {}) {
  return {
    id,
    rate_card_version_id: 1,
    country_id: 1,
    deployment_model_id: 1,
    pricing_model_id: 2,
    tier_id: tierId,
    pack_version_id: 38,
    feature_id: null,
    uom_id: 1,
    uom: ALLOWED_UOMS[0],
    fixed_fee: fixed,
    unit_rate: unit,
    currency: { code: 'INR' },
    ...extra,
  }
}

const SAVED_CARDS = [
  platformCard(1, 11, 562500, 310),
  platformCard(2, 12, 375000, 310),
  platformCard(3, 13, 262500, 310),
  platformCard(4, 11, 168800, 93, { pack_version_id: null, feature_id: 52 }),
]

function renderPage() {
  return render(
    <BrowserRouter>
      <RateCardPage />
    </BrowserRouter>,
  )
}

async function openPlatformModel() {
  renderPage()
  await waitFor(() => {
    expect(screen.getByText(/Live rate card/i)).toBeInTheDocument()
  })
  fireEvent.change(screen.getByRole('combobox', { name: /Commercial Pricing Model/i }), {
    target: { value: 'platform_subscription' },
  })
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /Platform \+ Subscription Commercial Model/i })).toBeInTheDocument()
  })
  await waitFor(() => {
    expect(within(screen.getAllByLabelText('TA Standard Unit of Measure')[0]).getAllByRole('option').length).toBeGreaterThan(1)
  })
}

describe('Rate Card — Platform + Subscription (tier fees, UOM, subscription rate)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ratesApi.getCountries.mockResolvedValue([
      { id: 1, iso_code: 'IN', name: 'India', default_currency_id: 1, currency: { id: 1, code: 'INR', symbol: '₹' } },
    ])
    ratesApi.getCustomerTiers.mockResolvedValue(TIERS)
    ratesApi.getDeploymentModels.mockResolvedValue([{ id: 1, code: 'shared_cloud', name: 'Shared Cloud' }])
    ratesApi.getDeploymentPricingOptions.mockResolvedValue([
      { deployment_model_id: 1, pricing_model_id: 1 },
      { deployment_model_id: 1, pricing_model_id: 2 },
    ])
    ratesApi.getPricingModels.mockResolvedValue([
      { id: 1, code: 'pepm', name: 'Per Employee Per Month', has_unit_component: true, uom_locked_id: 1, unit_rate_basis: 'monthly' },
      {
        id: 2,
        code: 'platform_subscription',
        name: 'Platform + Subscription',
        has_fixed_component: true,
        has_unit_component: true,
        fixed_fee_basis: 'annual',
        unit_rate_basis: 'monthly',
        uom_locked_id: null,
      },
    ])
    ratesApi.getAllowedUomsForPricingModel.mockImplementation(async (pmId) =>
      pmId === 1 ? [ALLOWED_UOMS[0]] : ALLOWED_UOMS,
    )
    ratesApi.getUnitsOfMeasure.mockResolvedValue(ALLOWED_UOMS)
    ratesApi.getCurrencies.mockResolvedValue([{ id: 1, code: 'INR', symbol: '₹' }])
    ratesApi.getFxRates.mockResolvedValue([])
    ratesApi.getServiceRates.mockResolvedValue([])
    ratesApi.getActiveRateCardVersion.mockResolvedValue({ id: 1, version_no: 'RC-T-1', status: 'active' })
    ratesApi.getRateCardVersions.mockResolvedValue([{ id: 1, version_no: 'RC-T-1', status: 'active' }])
    ratesApi.getRateCards.mockResolvedValue(SAVED_CARDS)
    ratesApi.saveRateCardTarget.mockResolvedValue([])
    catalogueApi.getCatalogueFamilies.mockResolvedValue([{ id: 1, code: 'TA', name: 'Talent Acquisition' }])
    catalogueApi.getCatalogueProducts.mockResolvedValue([{ id: 1, product_family_id: 1, code: 'TA_MAX', name: 'TA Max' }])
    catalogueApi.getCatalogueFeatures.mockResolvedValue([
      { id: 52, product_id: 1, code: 'TA_MAX_RECRUIT', name: 'TA Max Recruit', classification: 'native' },
      { id: 53, product_id: 1, code: 'TA_MICRO', name: 'TA Candidate Microsite', classification: 'native' },
    ])
    packsApi.getPacks.mockResolvedValue([
      {
        id: 1,
        code: 'TA-STD-001',
        name: 'TA Standard',
        product_family_id: 1,
        pack_versions: [
          {
            id: 38,
            version_no: 1,
            status: 'active',
            pack_items: [{ id: 1, feature_id: 52, is_required: true, feature: { name: 'TA Max Recruit' } }],
          },
        ],
      },
    ])
  })

  it('shows one platform fee column per backend tier, one UOM and one subscription rate per row', async () => {
    await openPlatformModel()

    // Tier columns come from the tier master (names are fixture values, not hardcoded labels)
    expect(screen.getAllByText('Starter').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Growth').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Scale').length).toBeGreaterThan(0)

    // Saved values are loaded back into the pack row
    expect(screen.getByLabelText('TA Standard Tier 1 Platform Fee')).toHaveValue(562500)
    expect(screen.getByLabelText('TA Standard Tier 2 Platform Fee')).toHaveValue(375000)
    expect(screen.getByLabelText('TA Standard Tier 3 Platform Fee')).toHaveValue(262500)
    expect(screen.getByLabelText('TA Standard Subscription Rate')).toHaveValue(310)
    expect(screen.getByLabelText('TA Standard Unit of Measure')).toHaveValue('1')

    // Standalone feature row has its own values
    expect(screen.getByLabelText('TA Max Recruit Tier 1 Platform Fee')).toHaveValue(168800)
    expect(screen.getByLabelText('TA Max Recruit Subscription Rate')).toHaveValue(93)

    // Billing basis text comes from the pricing model
    expect(screen.getAllByText(/Subscription = ₹ per unit per month/).length).toBeGreaterThan(0)
  })

  it('lists UOM options from the allowed-UOM API of the selected pricing model', async () => {
    await openPlatformModel()
    expect(ratesApi.getAllowedUomsForPricingModel).toHaveBeenCalledWith(2)
    const options = within(screen.getByLabelText('TA Standard Unit of Measure'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Select UOM', 'Active Employees (with ESS)', 'Candidate Inflow', 'GB of Data'])
  })

  it('saves a UOM change for every tier of the pack in one request', async () => {
    await openPlatformModel()
    fireEvent.change(screen.getByLabelText('TA Standard Unit of Measure'), { target: { value: '5' } })

    await waitFor(
      () =>
        expect(ratesApi.saveRateCardTarget).toHaveBeenCalledWith({
          current_uom_id: 1, // the schedule being moved from Active Employees (with ESS)
          rate_card_version_id: 1,
          country_id: 1,
          deployment_model_id: 1,
          pricing_model_id: 2,
          pack_version_id: 38,
          uom_id: 5,
          unit_rate: 310,
          tier_fees: [
            { tier_id: 11, fixed_fee: 562500 },
            { tier_id: 12, fixed_fee: 375000 },
            { tier_id: 13, fixed_fee: 262500 },
          ],
        }),
      { timeout: 2000 },
    )
  })

  it('edits tier fees and the subscription rate independently', async () => {
    await openPlatformModel()
    fireEvent.change(screen.getByLabelText('TA Standard Tier 2 Platform Fee'), { target: { value: '400000' } })
    fireEvent.change(screen.getByLabelText('TA Standard Subscription Rate'), { target: { value: '320' } })

    await waitFor(() => expect(ratesApi.saveRateCardTarget).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const payload = ratesApi.saveRateCardTarget.mock.calls[0][0]
    expect(payload.unit_rate).toBe(320)
    expect(payload.tier_fees).toEqual([
      { tier_id: 11, fixed_fee: 562500 },
      { tier_id: 12, fixed_fee: 400000 },
      { tier_id: 13, fixed_fee: 262500 },
    ])
  })

  it('does not send a negative subscription rate', async () => {
    await openPlatformModel()
    fireEvent.change(screen.getByLabelText('TA Standard Subscription Rate'), { target: { value: '-4' } })
    await waitFor(() => expect(screen.getByText(/Subscription rate must be a non-negative number/i)).toBeInTheDocument(), {
      timeout: 2000,
    })
    expect(ratesApi.saveRateCardTarget).not.toHaveBeenCalled()
  })

  it('locks the UOM picker when the pricing model prescribes a UOM', async () => {
    ratesApi.getPricingModels.mockResolvedValue([
      { id: 2, code: 'platform_subscription', name: 'Platform + Subscription', has_fixed_component: true, has_unit_component: true, fixed_fee_basis: 'annual', unit_rate_basis: 'monthly', uom_locked_id: 5 },
    ])
    ratesApi.getDeploymentPricingOptions.mockResolvedValue([{ deployment_model_id: 1, pricing_model_id: 2 }])
    ratesApi.getAllowedUomsForPricingModel.mockResolvedValue([ALLOWED_UOMS[1]])
    renderPage()
    await waitFor(() => expect(screen.getByLabelText('TA Standard Unit of Measure')).toBeDisabled())
    expect(screen.getByLabelText('TA Standard Unit of Measure')).toHaveValue('5')
    await waitFor(() =>
      expect(screen.getAllByText(/Locked by pricing model: Candidate Inflow/).length).toBeGreaterThan(0),
    )
  })

  it('shows a rate per tier when saved tiers have different subscription rates (workbook layout)', async () => {
    ratesApi.getRateCards.mockResolvedValue([
      platformCard(1, 11, 100000, 3),
      platformCard(2, 12, 200000, 4),
      platformCard(3, 13, 300000, 5),
    ])
    await openPlatformModel()
    expect(screen.getByLabelText('TA Standard Tier 1 Subscription Rate')).toHaveValue(3)
    expect(screen.getByLabelText('TA Standard Tier 2 Subscription Rate')).toHaveValue(4)
    expect(screen.getByLabelText('TA Standard Tier 3 Subscription Rate')).toHaveValue(5)

    fireEvent.change(screen.getByLabelText('TA Standard Tier 2 Subscription Rate'), { target: { value: '4.5' } })
    await waitFor(() => expect(ratesApi.saveRateCardTarget).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const payload = ratesApi.saveRateCardTarget.mock.calls[0][0]
    expect(payload.unit_rate).toBeNull()
    expect(payload.tier_fees).toEqual([
      { tier_id: 11, fixed_fee: 100000, unit_rate: 3 },
      { tier_id: 12, fixed_fee: 200000, unit_rate: 4.5 },
      { tier_id: 13, fixed_fee: 300000, unit_rate: 5 },
    ])
  })

  it('shows one row per UOM schedule (ESS and non-ESS) and saves each on its own', async () => {
    const nonEss = { id: 2, code: 'active_employees_non_ess', name: 'Active Employees (non-ESS)', status: 'active' }
    ratesApi.getAllowedUomsForPricingModel.mockResolvedValue([...ALLOWED_UOMS, nonEss])
    ratesApi.getRateCards.mockResolvedValue([
      platformCard(1, 11, 100000, 3),
      platformCard(2, 11, 25000, 3, { uom_id: 2, uom: nonEss }),
    ])
    await openPlatformModel()
    const fees = screen.getAllByLabelText('TA Standard Tier 1 Platform Fee').map((el) => el.value)
    expect(fees.sort()).toEqual(['100000', '25000'])

    const rows = screen.getAllByLabelText('TA Standard Tier 1 Platform Fee')
    const nonEssInput = rows.find((el) => el.value === '25000')
    fireEvent.change(nonEssInput, { target: { value: '30000' } })
    await waitFor(() => expect(ratesApi.saveRateCardTarget).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const payload = ratesApi.saveRateCardTarget.mock.calls[0][0]
    expect(payload.uom_id).toBe(2)
    expect(payload.current_uom_id).toBeUndefined()
    expect(payload.tier_fees[0]).toEqual({ tier_id: 11, fixed_fee: 30000 })
  })

  it('removes only the selected UOM schedule', async () => {
    const nonEss = { id: 2, code: 'active_employees_non_ess', name: 'Active Employees (non-ESS)', status: 'active' }
    ratesApi.getAllowedUomsForPricingModel.mockResolvedValue([...ALLOWED_UOMS, nonEss])
    ratesApi.getRateCards.mockResolvedValue([
      platformCard(1, 11, 100000, 3),
      platformCard(2, 11, 25000, 3, { uom_id: 2, uom: nonEss }),
    ])
    ratesApi.deleteRateCardGroup.mockResolvedValue(undefined)
    await openPlatformModel()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove TA Standard rate' })[1])
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Delete$/ }))
    await waitFor(() => expect(ratesApi.deleteRateCardGroup).toHaveBeenCalledTimes(1))
    expect([1, 2]).toContain(ratesApi.deleteRateCardGroup.mock.calls[0][0].uom_id)
    expect(ratesApi.deleteRateCardGroup.mock.calls[0][0].pack_version_id).toBe(38)
  })

  it('adds a pack rate from the modal with tier fees, UOM and subscription rate', async () => {
    ratesApi.getRateCards.mockResolvedValue([platformCard(4, 11, 168800, 93, { pack_version_id: null, feature_id: 52 })])
    renderPage()
    await waitFor(() => expect(screen.getByText(/Live rate card/i)).toBeInTheDocument())
    fireEvent.change(screen.getByRole('combobox', { name: /Commercial Pricing Model/i }), {
      target: { value: 'platform_subscription' },
    })
    await waitFor(() => expect(ratesApi.getAllowedUomsForPricingModel).toHaveBeenCalledWith(2))

    fireEvent.click(screen.getAllByRole('button', { name: /Add Pack/i })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/Configured Customer Tier Rates/i)).not.toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText(/Unit of Measure/i), { target: { value: '5' } })
    fireEvent.change(within(dialog).getByLabelText('Tier 1 (Starter)'), { target: { value: '500000' } })
    fireEvent.change(within(dialog).getByLabelText('Tier 3 (Scale)'), { target: { value: '250000' } })
    fireEvent.change(within(dialog).getByLabelText(/Subscription Rate/i), { target: { value: '75' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Add Pack Rate$/i }))

    await waitFor(() =>
      expect(ratesApi.saveRateCardTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          pack_version_id: 38,
          pricing_model_id: 2,
          uom_id: 5,
          unit_rate: 75,
          tier_fees: [
            { tier_id: 11, fixed_fee: 500000 },
            { tier_id: 12, fixed_fee: null },
            { tier_id: 13, fixed_fee: 250000 },
          ],
        }),
      ),
    )
    expect(ratesApi.upsertRateCard).not.toHaveBeenCalled()
  })

  it('keeps the PEPM grid unchanged (no UOM picker or tier platform fees)', async () => {
    ratesApi.getRateCards.mockResolvedValue([
      { ...platformCard(9, 11, null, 85), pricing_model_id: 1 },
    ])
    renderPage()
    await waitFor(() => expect(screen.getByText(/Live rate card/i)).toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: /Commercial Pricing Model/i })).toHaveValue('pepm')
    await waitFor(() => expect(screen.getByLabelText(/TA Standard Tier 1 Rate/i)).toHaveValue(85))
    expect(screen.queryByLabelText('TA Standard Unit of Measure')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('TA Standard Tier 1 Platform Fee')).not.toBeInTheDocument()
  })
})
