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

describe('Page 3 Feature Rate Isolation Regression Tests', () => {
  const mockFamily = { id: 50, code: 'DEV_TA', name: 'DEV Talent Acquisition' }
  const mockProduct = { id: 50, code: 'DEV_TA_MAX', name: 'DEV Talent Acquisition Max', product_family_id: 50 }

  const mockFeatures = [
    { id: 50, code: 'DEV_TA_RECRUIT', name: 'DEV Recruit', product_id: 50, classification: 'native' },
    { id: 51, code: 'DEV_TA_AGENT', name: 'DEV AI Agent', product_id: 50, classification: 'ai_enabled' },
    { id: 52, code: 'DEV_TA_SOLO', name: 'DEV Standalone Add-on', product_id: 50, classification: 'native' },
    { id: 67, code: 'DEV_TA-634-001', name: 'dev', product_id: 50, classification: 'native' },
  ]

  const mockTiers = [
    { id: 1, name: 'Tier 1', employee_min: 0, employee_max: 2000, status: 'active' },
    { id: 2, name: 'Tier 2', employee_min: 2001, employee_max: 5000, status: 'active' },
    { id: 3, name: 'Tier 3', employee_min: 5001, employee_max: null, status: 'active' },
  ]

  const mockDeployments = [
    { id: 1, code: 'SHARED_CLOUD', name: 'Shared Cloud' },
    { id: 2, code: 'PRIVATE_CLOUD', name: 'Private Cloud' },
  ]

  const mockPricingModels = [
    { id: 1, code: 'PEPM', name: 'Per Employee Per Month (PEPM)' },
    { id: 2, code: 'PLATFORM_SUBSCRIPTION', name: 'Platform + Subscription' },
  ]

  const mockRateCards = [
    // DEV Recruit rates (Feature 50): Tier 1 = 50, Tier 2 = 60, Tier 3 = 70
    { id: 1, feature_id: 50, country_id: 1, deployment_model_id: 1, pricing_model_id: 1, tier_id: 1, unit_rate: 50, fixed_fee: 0 },
    { id: 2, feature_id: 50, country_id: 1, deployment_model_id: 1, pricing_model_id: 1, tier_id: 2, unit_rate: 60, fixed_fee: 0 },
    { id: 3, feature_id: 50, country_id: 1, deployment_model_id: 1, pricing_model_id: 1, tier_id: 3, unit_rate: 70, fixed_fee: 0 },

    // DEV Standalone Add-on rates (Feature 52): Tier 1 = 100, Tier 2 = 1000, Tier 3 = 2000
    { id: 4, feature_id: 52, country_id: 1, deployment_model_id: 1, pricing_model_id: 1, tier_id: 1, unit_rate: 100, fixed_fee: 0 },
    { id: 5, feature_id: 52, country_id: 1, deployment_model_id: 1, pricing_model_id: 1, tier_id: 2, unit_rate: 1000, fixed_fee: 0 },
    { id: 6, feature_id: 52, country_id: 1, deployment_model_id: 1, pricing_model_id: 1, tier_id: 3, unit_rate: 2000, fixed_fee: 0 },

    // dev feature rates (Feature 67): Tier 1 = 123, Tier 2 = 12343, Tier 3 = 123456
    { id: 7, feature_id: 67, country_id: 1, deployment_model_id: 1, pricing_model_id: 1, tier_id: 1, unit_rate: 123, fixed_fee: 0 },
    { id: 8, feature_id: 67, country_id: 1, deployment_model_id: 1, pricing_model_id: 1, tier_id: 2, unit_rate: 12343, fixed_fee: 0 },
    { id: 9, feature_id: 67, country_id: 1, deployment_model_id: 1, pricing_model_id: 1, tier_id: 3, unit_rate: 123456, fixed_fee: 0 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    ratesApi.getCountries.mockResolvedValue([
      { id: 1, name: 'India', default_currency_id: 1, currency: { id: 1, code: 'INR', symbol: '₹' }, is_active: true },
    ])
    ratesApi.getCustomerTiers.mockResolvedValue(mockTiers)
    ratesApi.getDeploymentModels.mockResolvedValue(mockDeployments)
    ratesApi.getPricingModels.mockResolvedValue(mockPricingModels)
    ratesApi.getDeploymentPricingOptions.mockResolvedValue([
      { deployment_model_id: 1, pricing_model_id: 1 },
      { deployment_model_id: 1, pricing_model_id: 2 },
      { deployment_model_id: 2, pricing_model_id: 1 },
    ])
    ratesApi.getCurrencies.mockResolvedValue([{ id: 1, code: 'INR', symbol: '₹' }])
    ratesApi.getFxRates.mockResolvedValue([])
    ratesApi.getServiceRates.mockResolvedValue([])
    ratesApi.getRateCardVersions.mockResolvedValue([{ id: 1, version_no: 'RC-DEV-1', status: 'active' }])
    ratesApi.getActiveRateCardVersion.mockResolvedValue({ id: 1, version_no: 'RC-DEV-1', status: 'active' })
    ratesApi.getRateCards.mockResolvedValue(mockRateCards)
    ratesApi.upsertRateCard.mockImplementation(async (payload) => ({
      id: 999,
      ...payload,
    }))

    catalogueApi.getCatalogueFamilies.mockResolvedValue([mockFamily])
    catalogueApi.getCatalogueProducts.mockResolvedValue([mockProduct])
    catalogueApi.getCatalogueFeatures.mockResolvedValue(mockFeatures)
    packsApi.getPacks.mockResolvedValue([])
  })

  function renderPage() {
    return render(
      <BrowserRouter>
        <RateCardPage />
      </BrowserRouter>,
    )
  }

  it('renders distinct rate values for DEV Recruit, DEV Standalone Add-on, and dev without cross-copying', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('DEV Recruit')).toBeInTheDocument()
      expect(screen.getByText('DEV Standalone Add-on')).toBeInTheDocument()
      expect(screen.getByText('dev')).toBeInTheDocument()
    })

    // DEV Recruit inputs
    const recruitT1 = screen.getByLabelText(/DEV Recruit Tier 1 Rate/i)
    const recruitT2 = screen.getByLabelText(/DEV Recruit Tier 2 Rate/i)
    const recruitT3 = screen.getByLabelText(/DEV Recruit Tier 3 Rate/i)
    expect(recruitT1.value).toBe('50')
    expect(recruitT2.value).toBe('60')
    expect(recruitT3.value).toBe('70')

    // DEV Standalone Add-on inputs
    const soloT1 = screen.getByLabelText(/DEV Standalone Add-on Tier 1 Rate/i)
    const soloT2 = screen.getByLabelText(/DEV Standalone Add-on Tier 2 Rate/i)
    const soloT3 = screen.getByLabelText(/DEV Standalone Add-on Tier 3 Rate/i)
    expect(soloT1.value).toBe('100')
    expect(soloT2.value).toBe('1000')
    expect(soloT3.value).toBe('2000')

    // dev feature inputs
    const devT1 = screen.getByLabelText(/dev Tier 1 Rate/i)
    const devT2 = screen.getByLabelText(/dev Tier 2 Rate/i)
    const devT3 = screen.getByLabelText(/dev Tier 3 Rate/i)
    expect(devT1.value).toBe('123')
    expect(devT2.value).toBe('12343')
    expect(devT3.value).toBe('123456')
  })

  it('updating DEV Standalone Add-on changes only its own rate record and leaves DEV Recruit and dev unchanged', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('DEV Standalone Add-on')).toBeInTheDocument()
    })

    const soloT3 = screen.getByLabelText(/DEV Standalone Add-on Tier 3 Rate/i)
    fireEvent.change(soloT3, { target: { value: '2500' } })
    expect(soloT3.value).toBe('2500')

    // Verify DEV Recruit values remain strictly unchanged
    const recruitT1 = screen.getByLabelText(/DEV Recruit Tier 1 Rate/i)
    const recruitT2 = screen.getByLabelText(/DEV Recruit Tier 2 Rate/i)
    const recruitT3 = screen.getByLabelText(/DEV Recruit Tier 3 Rate/i)
    expect(recruitT1.value).toBe('50')
    expect(recruitT2.value).toBe('60')
    expect(recruitT3.value).toBe('70')

    // Verify dev feature values remain strictly unchanged
    const devT1 = screen.getByLabelText(/dev Tier 1 Rate/i)
    const devT2 = screen.getByLabelText(/dev Tier 2 Rate/i)
    const devT3 = screen.getByLabelText(/dev Tier 3 Rate/i)
    expect(devT1.value).toBe('123')
    expect(devT2.value).toBe('12343')
    expect(devT3.value).toBe('123456')
  })

  it('sends upsert payload targeted exclusively to DEV Standalone Add-on (feature_id = 52)', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('DEV Standalone Add-on')).toBeInTheDocument()
    })

    const soloT2 = screen.getByLabelText(/DEV Standalone Add-on Tier 2 Rate/i)
    fireEvent.change(soloT2, { target: { value: '1500' } })

    await waitFor(
      () => {
        expect(ratesApi.upsertRateCard).toHaveBeenCalledWith(
          expect.objectContaining({
            feature_id: 52,
            tier_id: 2,
            unit_rate: 1500,
          }),
        )
      },
      { timeout: 1500 },
    )

    // Ensure it was NOT called with feature_id: 50 (DEV Recruit)
    const calls = ratesApi.upsertRateCard.mock.calls
    for (const [callPayload] of calls) {
      if (callPayload.unit_rate === 1500) {
        expect(callPayload.feature_id).toBe(52)
        expect(callPayload.feature_id).not.toBe(50)
        expect(callPayload.feature_id).not.toBe(67)
      }
    }
  })

  it('does not duplicate DEV Recruit row in the table', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('DEV Recruit')).toBeInTheDocument()
    })

    const tableRows = screen.getAllByRole('row')
    const recruitRows = tableRows.filter((r) => r.textContent.includes('DEV Recruit'))
    expect(recruitRows.length).toBe(1)
  })

  it('failed saves do not falsely overwrite other features in the UI', async () => {
    ratesApi.upsertRateCard.mockRejectedValueOnce(new Error('Neon database timeout'))
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('DEV Standalone Add-on')).toBeInTheDocument()
    })

    const soloT1 = screen.getByLabelText(/DEV Standalone Add-on Tier 1 Rate/i)
    fireEvent.change(soloT1, { target: { value: '999' } })

    // Other features remain completely unaffected
    const recruitT1 = screen.getByLabelText(/DEV Recruit Tier 1 Rate/i)
    expect(recruitT1.value).toBe('50')
  })

  it('adds a feature without throwing ReferenceError: pmId is not defined and sends correct pricing_model_id', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('DEV Recruit')).toBeInTheDocument()
    })

    // Click "Add Feature" button
    const addFeatureButtons = screen.getAllByRole('button', { name: /Add Feature/i })
    fireEvent.click(addFeatureButtons[0])

    // Verify modal is open
    await waitFor(() => {
      expect(screen.getByText(/Add À la Carte Feature Rate/i)).toBeInTheDocument()
    })

    // Select DEV AI Agent (id: 51)
    const selectElem = screen.getByLabelText(/Select Feature/i)
    fireEvent.change(selectElem, { target: { value: '51' } })

    // Fill in tier rates in modal
    const t1Input = document.getElementById('feature-tier-input-1')
    fireEvent.change(t1Input, { target: { value: '25' } })

    // Click submit button "Add Feature Rate"
    const submitBtn = screen.getByRole('button', { name: /^Add Feature Rate$/i })
    fireEvent.click(submitBtn)

    // Wait for upsertRateCard to be called
    await waitFor(() => {
      expect(ratesApi.upsertRateCard).toHaveBeenCalled()
    })

    // Check payload sent to backend
    const matchingCall = ratesApi.upsertRateCard.mock.calls.find(
      ([payload]) => payload.feature_id === 51,
    )
    expect(matchingCall).toBeDefined()
    const payload = matchingCall[0]
    expect(payload.feature_id).toBe(51)
    expect(payload.pricing_model_id).toBe(1) // Confirms pmId is resolved to integer > 0
    expect(payload.deployment_model_id).toBe(1)
    expect(payload.unit_rate).toBe(25)

    // Verify no error toast with "pmid is not defined" appears
    expect(screen.queryByText(/pmid is not defined/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pmId is not defined/i)).not.toBeInTheDocument()
  })

  it('repeated additions of existing feature update in-place without creating duplicate rows', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('DEV Standalone Add-on')).toBeInTheDocument()
    })

    const initialRows = screen.getAllByRole('row')
    const initialSoloCount = initialRows.filter((r) => r.textContent.includes('DEV Standalone Add-on')).length
    expect(initialSoloCount).toBe(1)

    // Open add feature modal
    const addFeatureButtons = screen.getAllByRole('button', { name: /Add Feature/i })
    fireEvent.click(addFeatureButtons[0])

    await waitFor(() => {
      expect(screen.getByText(/Add À la Carte Feature Rate/i)).toBeInTheDocument()
    })

    const t1Input = document.getElementById('feature-tier-input-1')
    fireEvent.change(t1Input, { target: { value: '150' } })

    const submitBtn = screen.getByRole('button', { name: /^Add Feature Rate$/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(ratesApi.upsertRateCard).toHaveBeenCalled()
    })

    // Confirm row count for DEV Standalone Add-on remains exactly 1
    const finalRows = screen.getAllByRole('row')
    const finalSoloCount = finalRows.filter((r) => r.textContent.includes('DEV Standalone Add-on')).length
    expect(finalSoloCount).toBe(1)
  })
})

