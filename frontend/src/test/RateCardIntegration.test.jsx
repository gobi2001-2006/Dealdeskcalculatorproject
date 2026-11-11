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

describe('Rate Card & Masters Integration Tests (Live Backend Wiring)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default successful responses from backend
    ratesApi.getCountries.mockResolvedValue([
      {
        id: 1,
        iso_code: 'IND',
        name: 'India',
        default_currency_id: 1,
        currency: { id: 1, code: 'INR', symbol: '₹' },
        is_active: true,
      },
      {
        id: 2,
        iso_code: 'USA',
        name: 'United States',
        default_currency_id: 2,
        currency: { id: 2, code: 'USD', symbol: '$' },
        is_active: true,
      },
    ])

    ratesApi.getCustomerTiers.mockResolvedValue([
      {
        id: 1,
        name: 'Enterprise',
        employee_min: 10000,
        employee_max: null,
        default_multiplier: 1.0,
        status: 'active',
      },
      {
        id: 2,
        name: 'Mid-Market',
        employee_min: 2500,
        employee_max: 9999,
        default_multiplier: 1.1,
        status: 'active',
      },
    ])

    ratesApi.getDeploymentModels.mockResolvedValue([
      {
        id: 1,
        code: 'SHARED_CLOUD',
        name: 'Shared Cloud',
        description: 'Multi-tenant cloud architecture',
        status: 'active',
      },
      {
        id: 2,
        code: 'PRIVATE_CLOUD',
        name: 'Private Cloud',
        description: 'Single-tenant isolated cloud',
        status: 'active',
      },
      {
        id: 3,
        code: 'ON_PREMISE',
        name: 'On-Premise',
        description: 'Customer data center',
        status: 'active',
      },
    ])

    ratesApi.getDeploymentPricingOptions.mockResolvedValue([
      { deployment_model_id: 1, pricing_model_id: 1 },
      { deployment_model_id: 1, pricing_model_id: 2 },
      { deployment_model_id: 2, pricing_model_id: 1 },
      { deployment_model_id: 2, pricing_model_id: 2 },
    ])

    ratesApi.getPricingModels.mockResolvedValue([
      {
        id: 1,
        code: 'PEPM',
        name: 'Per Employee Per Month (PEPM)',
        description: 'Recurring seat pricing',
        has_unit_component: true,
        unit_rate_basis: 'monthly',
        uom_locked_id: 1,
        uom_locked: { id: 1, code: 'employee', name: 'Active Employees (with ESS)' },
        status: 'active',
      },
      {
        id: 2,
        code: 'PLATFORM_SUBSCRIPTION',
        name: 'Platform + Subscription',
        description: 'Platform access fee plus per-employee subscription',
        has_fixed_component: true,
        has_unit_component: true,
        fixed_fee_basis: 'annual',
        unit_rate_basis: 'monthly',
        uom_locked_id: 1,
        status: 'active',
      },
    ])

    ratesApi.getCurrencies.mockResolvedValue([
      { id: 1, code: 'INR', symbol: '₹', name: 'Indian Rupee' },
      { id: 2, code: 'USD', symbol: '$', name: 'US Dollar' },
    ])

    ratesApi.getFxRates.mockResolvedValue([
      {
        id: 1,
        from_currency_id: 2,
        to_currency_id: 1,
        rate: 83.25,
        effective_date: '2026-04-01',
        source: 'Corporate Treasury',
        from_currency: { code: 'USD' },
        to_currency: { code: 'INR' },
      },
    ])

    ratesApi.getServiceRates.mockResolvedValue([
      {
        id: 1,
        country_id: 1,
        role_name: 'Integration Architect',
        hourly_rate: 4500,
        daily_rate: 36000,
        hours_per_day: 8,
        is_active: true,
        country: { name: 'India', currency: { code: 'INR' } },
        currency: { id: 1, code: 'INR', symbol: '₹' },
      },
    ])

    ratesApi.getActiveRateCardVersion.mockResolvedValue({
      id: 1,
      version_no: 'RC-DEV-1',
      name: 'Development Master Rate Card',
      status: 'active',
    })

    ratesApi.getRateCardVersions.mockResolvedValue([
      {
        id: 1,
        version_no: 'RC-DEV-1',
        name: 'Development Master Rate Card',
        status: 'active',
      },
    ])

    ratesApi.getRateCards.mockResolvedValue([
      {
        id: 1,
        rate_card_version_id: 1,
        country_id: 1,
        deployment_model_id: 1,
        pricing_model_id: 1,
        tier_id: 1,
        pack_version_id: 38,
        feature_id: null,
        uom_id: 1,
        uom: { id: 1, code: 'employee', name: 'Active Employees (with ESS)' },
        unit_rate: 85.0,
      },
      {
        id: 2,
        rate_card_version_id: 1,
        country_id: 1,
        deployment_model_id: 1,
        pricing_model_id: 2,
        tier_id: 1,
        pack_version_id: 38,
        feature_id: null,
        unit_rate: 65.0,
        fixed_fee: 120000.0,
      },
    ])

    catalogueApi.getCatalogueFamilies.mockResolvedValue([
      { id: 1, code: 'CORE', name: 'Core HR', status: 'active' },
    ])

    catalogueApi.getCatalogueProducts.mockResolvedValue([
      { id: 1, product_family_id: 1, code: 'HRM', name: 'Human Resource Management', status: 'active' },
    ])

    catalogueApi.getCatalogueFeatures.mockResolvedValue([
      { id: 52, product_id: 1, code: 'FEAT-001', name: 'DEV Standalone Add-on', classification: 'native', status: 'active' },
    ])

    packsApi.getPacks.mockResolvedValue([
      {
        id: 1,
        code: 'DEV-TA-PREMIUM',
        name: 'DEV TA Premium',
        variant: 'premium',
        product_family_id: 1,
        versions: [{ id: 38, version_number: 1, pack_id: 1, status: 'active' }],
      },
    ])
  })

  it('loads live master data and displays PostgreSQL live database banner', async () => {
    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    // Should indicate live connection
    await waitFor(() => {
      expect(
        screen.getByText(/Live rate card/i),
      ).toBeInTheDocument()
    })

    // Confirms live rate card version badge
    expect(screen.getAllByText(/RC-DEV-1/i).length).toBeGreaterThan(0)

    // Confirms live service rate is mapped and displayed
    expect(screen.getAllByText('Integration Architect').length).toBeGreaterThan(0)
  })

  it('displays connection error when API fails and shows Reconnect button', async () => {
    ratesApi.getCountries.mockRejectedValueOnce(new Error('Connection refused'))

    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Rate card service unavailable: Connection refused/i),
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument()
  })

  it('persists a new country to PostgreSQL via createCountry API', async () => {
    ratesApi.createCountry.mockResolvedValue({
      id: 3,
      iso_code: 'AE',
      name: 'United Arab Emirates',
      default_currency_id: 3,
      currency: { id: 3, code: 'AED', symbol: 'AED' },
    })

    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Live rate card/i)).toBeInTheDocument()
    })

    // Open add country modal
    const addCountryBtns = screen.getAllByRole('button', { name: /Add Country/i })
    fireEvent.click(addCountryBtns[0])

    // Fill form
    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getByPlaceholderText(/e\.g\. Singapore, Japan, Australia/i)
    const currencyInput = within(dialog).getByPlaceholderText(/e\.g\. SGD, JPY/i)
    fireEvent.change(nameInput, { target: { value: 'United Arab Emirates' } })
    fireEvent.change(currencyInput, { target: { value: 'AED' } })

    // Submit
    const submitBtn = within(dialog).getByRole('button', { name: /^Add Country$/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(ratesApi.createCountry).toHaveBeenCalledWith({
        name: 'United Arab Emirates',
        currency_code: 'AED',
        currency_symbol: 'AED',
      })
    })
  })

  it('persists service rate deletion to PostgreSQL via deleteServiceRate API', async () => {
    ratesApi.deleteServiceRate.mockResolvedValue()

    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Integration Architect').length).toBeGreaterThan(0)
    })

    // Click delete service rate button
    const deleteBtn = screen.getByLabelText('Delete Integration Architect')
    fireEvent.click(deleteBtn)

    // Confirm deletion dialog appears with Cancel and Delete
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/Delete Service Rate/i)).toBeInTheDocument()

    // Test Cancel path: clicking Cancel closes dialog without deleting
    const cancelBtn = within(dialog).getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelBtn)
    expect(ratesApi.deleteServiceRate).not.toHaveBeenCalled()
    expect(screen.getAllByText('Integration Architect').length).toBeGreaterThan(0)

    // Test Delete path: clicking Delete confirms deletion
    fireEvent.click(deleteBtn)
    const confirmBtn = within(screen.getByRole('dialog')).getByRole('button', { name: /^Delete$/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(ratesApi.deleteServiceRate).toHaveBeenCalledWith(1)
    })
  })

  it('persists pack rate row removal to PostgreSQL via deleteRateCardGroup API with confirmation', async () => {
    ratesApi.deleteRateCardGroup.mockResolvedValue()

    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('DEV TA Premium')).toBeInTheDocument()
    })

    // Click remove pack rate button
    const removeBtn = screen.getByLabelText('Remove DEV TA Premium rate')
    fireEvent.click(removeBtn)

    // Confirm deletion dialog appears with Cancel and Delete
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/Delete Pack Rate/i)).toBeInTheDocument()

    // Test Cancel path: clicking Cancel closes dialog without deleting
    const cancelBtn = within(dialog).getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelBtn)
    expect(ratesApi.deleteRateCardGroup).not.toHaveBeenCalled()

    // Test Delete path: clicking Delete sends delete request
    fireEvent.click(removeBtn)
    const confirmBtn = within(screen.getByRole('dialog')).getByRole('button', { name: /^Delete$/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(ratesApi.deleteRateCardGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          rate_card_version_id: 1,
          pack_version_id: 38,
        }),
      )
    })
  })

  it('protects retired rate card version snapshots in read-only mode', async () => {
    ratesApi.getRateCardVersions.mockResolvedValue([
      { id: 1, version_no: 'RC-DEV-1', name: 'Development Master Rate Card', status: 'active' },
      { id: 2, version_no: 'RC-HIST-2025', name: 'Historical 2025 Rate Card', status: 'retired' },
    ])
    ratesApi.getRateCards.mockResolvedValue([
      {
        id: 1,
        rate_card_version_id: 2,
        country_id: 1,
        deployment_model_id: 1,
        pricing_model_id: 1,
        tier_id: 1,
        pack_version_id: 38,
        feature_id: null,
        unit_rate: 75.0,
      },
    ])

    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Live rate card/i)).toBeInTheDocument()
    })

    // Switch version to retired version
    const versionSelect = screen.getByLabelText('Rate Card Version')
    fireEvent.change(versionSelect, { target: { value: '2' } })

    await waitFor(() => {
      expect(
        screen.getByText(/RETIRED \/ LOCKED/i),
      ).toBeInTheDocument()
    })

    // Confirms Locked / Read-Only badges appear
    expect(screen.getAllByText(/Locked \/ Read-Only/i).length).toBeGreaterThan(0)
  })

  it('displays service rate with correct currency and backend derived day rate', async () => {
    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('Integration Architect').length).toBeGreaterThan(0)
    })

    // Confirms correct currency is displayed (India (INR), not India (USD))
    expect(screen.getAllByText('India (INR)').length).toBeGreaterThanOrEqual(2)

    // Confirms derived day rate from backend daily_rate is displayed
    expect(screen.getByText('INR 36,000.00/day')).toBeInTheDocument()
  })

  it('displays PEPM contract pricing explanation banner and Active Employees UOM', async () => {
    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Total = Rate per Active Employees \(with ESS\) per month × Quantity × Contract months/i),
      ).toBeInTheDocument()
    })

    // The UOM label comes from the saved rate card's unit of measure (not a hardcoded label)
    expect(screen.getAllByText('Active Employees (with ESS)').length).toBeGreaterThan(0)
  })

  it('filters commercial pricing models by selected deployment according to deployment_pricing_options', async () => {
    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Live rate card/i)).toBeInTheDocument()
    })

    const deploymentSelect = screen.getByRole('combobox', { name: /Deployment Architecture/i })
    const pricingSelect = screen.getByRole('combobox', { name: /Commercial Pricing Model/i })

    // On Shared Cloud: PEPM and Platform + Subscription available
    expect(within(pricingSelect).getByRole('option', { name: /Per Employee Per Month/i })).toBeInTheDocument()
    expect(within(pricingSelect).getByRole('option', { name: /Platform \+ Subscription/i })).toBeInTheDocument()

    // Switch to On-Premise (which has no deployment_pricing_options in backend)
    fireEvent.change(deploymentSelect, { target: { value: 'On-Premise' } })

    // Should indicate no configured pricing methods and display the On-Premise status card
    await waitFor(() => {
      expect(screen.getByText(/No pricing model is configured for On-Premise/i)).toBeInTheDocument()
      expect(screen.getByText(/Configure a deployment and pricing model combination in master data/i)).toBeInTheDocument()
    })
  })

  it('switches to Platform + Subscription and renders dual-component rate matrix with Tier cards removed', async () => {
    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Live rate card/i)).toBeInTheDocument()
    })

    const pricingSelect = screen.getByRole('combobox', { name: /Commercial Pricing Model/i })
    fireEvent.change(pricingSelect, { target: { value: 'PLATFORM_SUBSCRIPTION' } })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Platform \+ Subscription Commercial Model/i })).toBeInTheDocument()
    })

    // Confirms prototype cards are removed
    expect(screen.queryByLabelText(/Tier 1 Annual Platform Fee/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Tier 1 Monthly Subscription Fee/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Tier 1 Number of Employees/i)).not.toBeInTheDocument()

    // Platform fee per tier, then one UOM and one subscription rate for the pack
    expect(screen.getByLabelText(/DEV TA Premium Tier 1 Platform Fee/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/DEV TA Premium Tier 2 Platform Fee/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/DEV TA Premium Tier 1 Subscription Rate/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^DEV TA Premium Subscription Rate$/i)).toHaveValue(65)
    expect(screen.getByLabelText(/DEV TA Premium Unit of Measure/i)).toBeInTheDocument()
    expect(ratesApi.getAllowedUomsForPricingModel).toHaveBeenCalledWith(2)
  })

  it('persists Platform + Subscription rate edits as one row save (tier fees + UOM + rate)', async () => {
    ratesApi.saveRateCardTarget.mockResolvedValue([])

    render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/Live rate card/i)).toBeInTheDocument()
    })

    const pricingSelect = screen.getByRole('combobox', { name: /Commercial Pricing Model/i })
    fireEvent.change(pricingSelect, { target: { value: 'PLATFORM_SUBSCRIPTION' } })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Platform \+ Subscription Commercial Model/i })).toBeInTheDocument()
    })

    const platformFeeInput = screen.getByLabelText(/DEV TA Premium Tier 1 Platform Fee/i)
    fireEvent.change(platformFeeInput, { target: { value: '150000' } })

    await waitFor(() => {
      expect(ratesApi.saveRateCardTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          rate_card_version_id: 1,
          pricing_model_id: 2,
          pack_version_id: 38,
          uom_id: 1, // locked by the pricing model in this fixture
          unit_rate: 65,
          tier_fees: [
            { tier_id: 1, fixed_fee: 150000 },
            { tier_id: 2, fixed_fee: null },
          ],
        }),
      )
    }, { timeout: 2000 })
    expect(ratesApi.upsertRateCard).not.toHaveBeenCalled()
  })
})
