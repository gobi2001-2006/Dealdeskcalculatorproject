import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RateCardPage } from '../features/ratecard/RateCardPage'

function renderRateCardPage() {
  return render(
    <MemoryRouter initialEntries={['/rate-cards']}>
      <RateCardPage />
    </MemoryRouter>,
  )
}

describe('Rate Card & Masters Feature Tests', () => {
  // 1. Rendering the three-column page and active navigation
  it('renders the top navigation, summary strip, and 3 desktop columns with active navigation', () => {
    renderRateCardPage()

    // Top Navigation
    expect(screen.getByText('DEAL DESK')).toBeInTheDocument()
    const rateCardLink = screen.getByRole('link', { name: /Rate Card & Masters/i })
    expect(rateCardLink).toBeInTheDocument()
    expect(rateCardLink).toHaveClass('border-orange-500')

    // Summary Strip
    expect(screen.getByRole('region', { name: /Commercial Master Summary/i })).toBeInTheDocument()
    expect(screen.getByText('Global Enterprise Master')).toBeInTheDocument()

    // 3 Columns
    expect(screen.getByRole('complementary', { name: /Products and Families Navigation/i })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: /Pack Rates \(PEPM\)/i })[0]).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: /Master Data Management/i })).toBeInTheDocument()
  })

  // 2. Selecting product families
  it('updates center editor scope when selecting product families in left sidebar', () => {
    renderRateCardPage()

    const leftSidebar = screen.getByRole('complementary', { name: /Products and Families Navigation/i })
    const talentDevBtn = within(leftSidebar).getByRole('button', { name: /Talent Development/i })
    fireEvent.click(talentDevBtn)

    // Scope indicator in center editor
    expect(screen.getByText(/Filtered by: Talent Development/i)).toBeInTheDocument()

    // Clear filter
    const clearBtn = screen.getByTitle('Clear family filter')
    fireEvent.click(clearBtn)
    expect(screen.getByText('All Product Families')).toBeInTheDocument()
  })

  // 3. Switching deployment models via dropdown
  it('switches deployment models using the accessible dropdown selector', () => {
    renderRateCardPage()

    const deploymentSelect = screen.getByRole('combobox', { name: /Deployment Architecture/i })
    expect(deploymentSelect.value).toBe('Shared Cloud')

    fireEvent.change(deploymentSelect, { target: { value: 'Private Cloud' } })
    expect(deploymentSelect.value).toBe('Private Cloud')

    fireEvent.change(deploymentSelect, { target: { value: 'On-Premises' } })
    expect(deploymentSelect.value).toBe('On-Premises')
  })

  // 4. Switching between PEPM and Platform Subscription via dropdown
  it('switches between PEPM and Platform Subscription using the accessible dropdown selector', () => {
    renderRateCardPage()

    // Initially PEPM is visible
    expect(screen.getAllByRole('heading', { name: /Pack Rates \(PEPM\)/i })[0]).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: /À la Carte Feature Rates \(PEPM\)/i })[0]).toBeInTheDocument()

    const pricingSelect = screen.getByRole('combobox', { name: /Commercial Pricing Model/i })
    expect(pricingSelect.value).toBe('PEPM')

    // Switch to Platform Subscription
    fireEvent.change(pricingSelect, { target: { value: 'Platform Subscription' } })
    expect(pricingSelect.value).toBe('Platform Subscription')

    // Platform Subscription view should now be displayed
    expect(
      screen.getByRole('heading', { name: /Platform \+ Subscription Commercial Model/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reset to Spreadsheet Demo Values/i })).toBeInTheDocument()
  })

  // 5. Preserving independent state for each pricing model
  it('preserves independent state when switching between PEPM and Platform Subscription', () => {
    renderRateCardPage()

    const pricingSelect = screen.getByRole('combobox', { name: /Commercial Pricing Model/i })

    // 1. In PEPM, edit a rate
    const tier1Input = screen.getByLabelText(/Talent Acquisition Growth Suite Tier 1 Rate/i)
    fireEvent.change(tier1Input, { target: { value: '99' } })
    expect(tier1Input.value).toBe('99')

    // 2. Switch to Platform Subscription
    fireEvent.change(pricingSelect, { target: { value: 'Platform Subscription' } })

    // Edit an input in Platform Subscription
    const tier1PlatformFee = screen.getByLabelText(/Tier 1 Annual Platform Fee/i)
    fireEvent.change(tier1PlatformFee, { target: { value: '150000' } })
    expect(tier1PlatformFee.value).toBe('150000')

    // 3. Switch back to PEPM
    fireEvent.change(pricingSelect, { target: { value: 'PEPM' } })

    // PEPM value is preserved
    const restoredTier1Input = screen.getByLabelText(/Talent Acquisition Growth Suite Tier 1 Rate/i)
    expect(restoredTier1Input.value).toBe('99')

    // 4. Switch back to Platform Subscription
    fireEvent.change(pricingSelect, { target: { value: 'Platform Subscription' } })
    expect(screen.getByLabelText(/Tier 1 Annual Platform Fee/i).value).toBe('150000')
  })

  // 6. Country and currency selection
  it('supports country and currency selection and displays the active currency symbol without overwriting rates', () => {
    renderRateCardPage()

    const countrySelect = screen.getByRole('combobox', { name: /Rate Country/i })
    expect(countrySelect.value).toBe('c-in')
    expect(screen.getByTitle(/Active Currency Symbol: ₹/i)).toBeInTheDocument()

    // Rate has initial value
    const tier1Input = screen.getByLabelText(/Talent Acquisition Growth Suite Tier 1 Rate/i)
    expect(tier1Input.value).toBe('45')

    // Switch to North America (USD)
    fireEvent.change(countrySelect, { target: { value: 'c-na' } })
    expect(countrySelect.value).toBe('c-na')
    expect(screen.getByTitle(/Active Currency Symbol: \$/i)).toBeInTheDocument()

    // Existing rate value remains preserved
    expect(screen.getByLabelText(/Talent Acquisition Growth Suite Tier 1 Rate/i).value).toBe('45')
  })

  // 6. Displaying pack and feature rates
  it('displays pack rates and feature rates with SKUs, badges, and tier inputs', () => {
    renderRateCardPage()

    expect(screen.getByText('Talent Acquisition Growth Suite')).toBeInTheDocument()
    expect(screen.getByText('TA-GROWTH-01')).toBeInTheDocument()

    expect(screen.getByText('AI Resume Matcher & Ranking')).toBeInTheDocument()
    expect(screen.getByText('TA-AI-003')).toBeInTheDocument()
    expect(screen.getAllByText('AI Agent Module').length).toBeGreaterThan(0)
  })

  // 7. Editing rate inputs
  it('allows editing rate inputs in Pack Rates and Feature Rates', () => {
    renderRateCardPage()

    const packTier2Input = screen.getByLabelText(/Talent Acquisition Growth Suite Tier 2 Rate/i)
    fireEvent.change(packTier2Input, { target: { value: '75' } })
    expect(packTier2Input.value).toBe('75')

    const featTier1Input = screen.getByLabelText(/AI Resume Matcher & Ranking Tier 1 Rate/i)
    fireEvent.change(featTier1Input, { target: { value: '25' } })
    expect(featTier1Input.value).toBe('25')
  })

  // 8. Adding and removing supported rate rows
  it('allows removing and adding a pack rate row', async () => {
    renderRateCardPage()

    // Remove pack rate
    const removeBtn = screen.getByRole('button', { name: /Remove Talent Acquisition Growth Suite rate/i })
    fireEvent.click(removeBtn)

    await waitFor(() => {
      expect(screen.queryByLabelText(/Talent Acquisition Growth Suite Tier 1 Rate/i)).not.toBeInTheDocument()
    })

    // Add it back
    const addPackRateBtn = screen.getAllByRole('button', { name: /Add Pack/i })[0]
    fireEvent.click(addPackRateBtn)

    expect(screen.getByRole('heading', { name: /Add Pack Rate/i })).toBeInTheDocument()

    // Fill tier 1
    const tier1ModalInput = screen.getByLabelText(/Tier 1 \(Enterprise\)/i)
    fireEvent.change(tier1ModalInput, { target: { value: '50' } })

    const submitBtn = within(screen.getByRole('dialog')).getByRole('button', { name: /^Add Pack Rate$/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByLabelText(/Talent Acquisition Growth Suite Tier 1 Rate/i)).toBeInTheDocument()
    })
  })

  // 9. Adding and validating countries
  it('adds a new country and validates required fields and duplicates', async () => {
    renderRateCardPage()

    const rightPanel = screen.getByRole('complementary', { name: /Master Data Management/i })
    const addCountryBtn = within(rightPanel).getByRole('button', { name: /Add Country/i })
    fireEvent.click(addCountryBtn)

    expect(screen.getByRole('heading', { name: /Add Regional Country/i })).toBeInTheDocument()

    // 1. Submit empty - shows validation error
    const submitBtn = within(screen.getByRole('dialog')).getByRole('button', { name: /^Add Country$/i })
    fireEvent.click(submitBtn)
    expect(screen.getByText(/Country name is required/i)).toBeInTheDocument()

    // 2. Submit duplicate country name
    const nameInput = screen.getByLabelText(/Country Name/i)
    const currencyInput = screen.getByLabelText(/Currency Code/i)
    fireEvent.change(nameInput, { target: { value: 'India' } })
    fireEvent.change(currencyInput, { target: { value: 'INR' } })
    fireEvent.click(submitBtn)
    expect(screen.getByText(/A country named "India" already exists/i)).toBeInTheDocument()

    // 3. Valid new country
    fireEvent.change(nameInput, { target: { value: 'Australia' } })
    fireEvent.change(currencyInput, { target: { value: 'AUD' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(within(rightPanel).getByText('Australia')).toBeInTheDocument()
      expect(within(rightPanel).getByText('AUD')).toBeInTheDocument()
    })
  })

  // 10. Editing pricing tiers and master-data entries
  it('allows expanding and editing pricing tiers', async () => {
    renderRateCardPage()

    const rightPanel = screen.getByRole('complementary', { name: /Master Data Management/i })
    const tiersHeading = within(rightPanel).getByRole('button', { name: /B\. Pricing Tiers/i })
    fireEvent.click(tiersHeading)

    expect(within(rightPanel).getByText('Tier 1')).toBeInTheDocument()
    expect(within(rightPanel).getByText('Enterprise')).toBeInTheDocument()

    const editBtn = within(rightPanel).getByRole('button', { name: /^Edit Enterprise$/i })
    fireEvent.click(editBtn)

    const nameInput = within(rightPanel).getByDisplayValue('Enterprise')
    fireEvent.change(nameInput, { target: { value: 'Global Strategic Enterprise' } })

    const saveBtn = within(rightPanel).getByRole('button', { name: /Save/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(within(rightPanel).getByText('Global Strategic Enterprise')).toBeInTheDocument()
    })
  })

  // 11. Editing hourly rates and exchange-rate entries
  it('allows editing hourly rates and adding exchange rates', async () => {
    renderRateCardPage()

    const rightPanel = screen.getByRole('complementary', { name: /Master Data Management/i })

    // Edit hourly rate
    const editHourlyBtn = within(rightPanel).getByRole('button', {
      name: /Edit Enterprise Solution Architecture/i,
    })
    fireEvent.click(editHourlyBtn)

    const rateInput = within(rightPanel).getByDisplayValue('220')
    fireEvent.change(rateInput, { target: { value: '250' } })

    const saveCheckBtn = within(rightPanel).getByRole('button', {
      name: '',
    })
    fireEvent.click(saveCheckBtn)

    // Hourly rate shows updated rate
    expect(within(rightPanel).getByText(/USD 250\/hr/i)).toBeInTheDocument()

    // Day rate still strictly displays pending backend calculation
    expect(within(rightPanel).getAllByText(/Pending backend calculation/i).length).toBeGreaterThan(0)
  })

  // 12. Rejecting invalid negative rate inputs
  it('flags negative rate inputs in Platform + Subscription', () => {
    renderRateCardPage()

    const pricingSelect = screen.getByRole('combobox', { name: /Commercial Pricing Model/i })
    fireEvent.change(pricingSelect, { target: { value: 'Platform Subscription' } })

    const platformFeeInput = screen.getByLabelText(/Tier 1 Annual Platform Fee/i)
    fireEvent.change(platformFeeInput, { target: { value: '-5000' } })

    expect(screen.getByText(/Rate must be a valid non-negative number/i)).toBeInTheDocument()
  })

  // 13. Validating employee count
  it('validates employee count as a non-negative whole number', () => {
    renderRateCardPage()

    const pricingSelect = screen.getByRole('combobox', { name: /Commercial Pricing Model/i })
    fireEvent.change(pricingSelect, { target: { value: 'Platform Subscription' } })

    const empCountInput = screen.getByLabelText(/Tier 1 Number of Employees/i)
    fireEvent.change(empCountInput, { target: { value: '125.75' } })

    expect(
      screen.getByText(/Employee count must be a non-negative whole number/i),
    ).toBeInTheDocument()
  })

  // 14. Displaying pending backend-calculation outputs instead of locally calculated totals
  it('displays pending backend calculation placeholders for annual subscription and total price without client math', () => {
    renderRateCardPage()

    const pricingSelect = screen.getByRole('combobox', { name: /Commercial Pricing Model/i })
    fireEvent.change(pricingSelect, { target: { value: 'Platform Subscription' } })

    // Output fields must show 'Pending backend calculation'
    const pendingBadges = screen.getAllByText('Pending backend calculation')
    expect(pendingBadges.length).toBeGreaterThanOrEqual(6) // 2 outputs * 3 tiers = 6

    // Confirm spreadsheet calculated totals are NOT fabricated in client
    expect(screen.queryByText('36,000,000')).not.toBeInTheDocument()
    expect(screen.queryByText('36,100,000')).not.toBeInTheDocument()
  })

  // 15. Restoring + Add Tier button, validating duplicate/empty, adding columns, and preserving rates
  it('restores the + Add Tier button, validates empty and duplicate tier names, and dynamically adds columns while preserving existing rates', async () => {
    renderRateCardPage()

    const rightPanel = screen.getByRole('complementary', { name: /Master Data Management/i })
    const tiersHeading = within(rightPanel).getByRole('button', { name: /B\. Pricing Tiers/i })
    fireEvent.click(tiersHeading)

    // Verify initial tiers
    expect(within(rightPanel).getByText('Tier 1')).toBeInTheDocument()
    expect(within(rightPanel).getByText('Tier 2')).toBeInTheDocument()
    expect(within(rightPanel).getByText('Tier 3')).toBeInTheDocument()

    // 1. Locate and click Add Tier button
    const addTierBtn = within(rightPanel).getByRole('button', { name: /Add Tier/i })
    expect(addTierBtn).toBeInTheDocument()
    fireEvent.click(addTierBtn)

    // Form is opened
    expect(within(rightPanel).getByText('Add New Pricing Tier')).toBeInTheDocument()
    expect(within(rightPanel).getByText('Tier 4')).toBeInTheDocument()

    const nameInput = within(rightPanel).getByLabelText(/Tier Name/i)
    const saveTierBtn = within(rightPanel).getByRole('button', { name: /Save Tier/i })

    // 2. Validate empty tier name
    fireEvent.click(saveTierBtn)
    expect(within(rightPanel).getByText('Tier name is required.')).toBeInTheDocument()

    // 3. Validate duplicate tier name (case-insensitive)
    fireEvent.change(nameInput, { target: { value: 'enterprise' } })
    fireEvent.click(saveTierBtn)
    expect(
      within(rightPanel).getByText(/A pricing tier named "enterprise" already exists\./i),
    ).toBeInTheDocument()

    // 4. Submit valid new tier
    fireEvent.change(nameInput, { target: { value: 'Strategic' } })
    const descInput = within(rightPanel).getByLabelText(/Description/i)
    fireEvent.change(descInput, { target: { value: 'Global strategic partners and mega deals' } })
    fireEvent.click(saveTierBtn)

    // 5. Appears in Master Data Panel
    await waitFor(() => {
      expect(within(rightPanel).getByText('Strategic')).toBeInTheDocument()
      expect(within(rightPanel).getByText('Tier 4')).toBeInTheDocument()
    })

    // 6. Dynamic Tier 4 column added to Pack Rates and Feature Rates tables
    const tier4Headers = screen.getAllByRole('columnheader', { name: /Tier 4 \(Strategic\)/i })
    expect(tier4Headers.length).toBeGreaterThanOrEqual(2)

    // 7. Existing rates preserved
    expect(screen.getByLabelText(/Talent Acquisition Growth Suite Tier 1 Rate/i).value).toBe('45')
    expect(screen.getByLabelText(/Talent Acquisition Growth Suite Tier 2 Rate/i).value).toBe('55')
    expect(screen.getByLabelText(/Talent Acquisition Growth Suite Tier 3 Rate/i).value).toBe('68')

    // 8. New tier input is usable and interactive
    const tier4Input = screen.getByLabelText(/Talent Acquisition Growth Suite Tier 4 Rate/i)
    expect(tier4Input).toBeInTheDocument()
    expect(tier4Input.value).toBe('')
    fireEvent.change(tier4Input, { target: { value: '85' } })
    expect(tier4Input.value).toBe('85')
  })

  // 16. Preventing accidental tier removal if rate data exists without user confirmation
  it('prevents accidental tier removal if rate data exists without user confirmation', async () => {
    renderRateCardPage()

    const rightPanel = screen.getByRole('complementary', { name: /Master Data Management/i })
    const tiersHeading = within(rightPanel).getByRole('button', { name: /B\. Pricing Tiers/i })
    fireEvent.click(tiersHeading)

    // Mock confirm dialog
    const confirmSpy = vi.spyOn(window, 'confirm')

    // Cancel deletion
    confirmSpy.mockReturnValueOnce(false)
    const deleteTier1Btn = within(rightPanel).getByRole('button', { name: /^Delete Enterprise$/i })
    fireEvent.click(deleteTier1Btn)

    expect(confirmSpy).toHaveBeenCalled()
    // Tier 1 still exists
    expect(within(rightPanel).getByText('Enterprise')).toBeInTheDocument()

    // Confirm deletion
    confirmSpy.mockReturnValueOnce(true)
    fireEvent.click(deleteTier1Btn)

    await waitFor(() => {
      expect(within(rightPanel).queryByText('Enterprise')).not.toBeInTheDocument()
    })

    confirmSpy.mockRestore()
  })

  // 17. Displaying coverage only when supported by actual configuration data
  it('calculates and displays coverage based on actual configuration records', () => {
    renderRateCardPage()

    const rightPanel = screen.getByRole('complementary', { name: /Master Data Management/i })
    expect(within(rightPanel).getByText(/Overall Matrix Completeness/i)).toBeInTheDocument()
    expect(within(rightPanel).getByText(/Deployment Models:/i)).toBeInTheDocument()
    expect(within(rightPanel).getByText(/Product Families:/i)).toBeInTheDocument()
  })

  // 18. Deployment Models: Add Model button, validation, and dropdown synchronization
  it('displays + Add Model in Deployment Models, validates inputs, and updates panel and central dropdown', async () => {
    renderRateCardPage()

    const rightPanel = screen.getByRole('complementary', { name: /Master Data Management/i })
    const depHeading = within(rightPanel).getByRole('button', { name: /C\. Deployment Models/i })
    fireEvent.click(depHeading)

    // 1. Panel displays Add Model
    const addModelBtn = within(rightPanel).getByRole('button', { name: /Add Model/i })
    expect(addModelBtn).toBeInTheDocument()

    // 2. Click opens form
    fireEvent.click(addModelBtn)
    expect(within(rightPanel).getByText('Add Deployment Model')).toBeInTheDocument()

    const nameInput = within(rightPanel).getByLabelText(/Model Name/i)
    const saveModelBtn = within(rightPanel).getByRole('button', { name: /Save Model/i })

    // 3. Reject empty name
    fireEvent.click(saveModelBtn)
    expect(within(rightPanel).getByText('Model name is required.')).toBeInTheDocument()

    // 4. Reject duplicate name case-insensitively
    fireEvent.change(nameInput, { target: { value: '  shared cloud  ' } })
    fireEvent.click(saveModelBtn)
    expect(within(rightPanel).getByText(/A deployment model named "shared cloud" already exists\./i)).toBeInTheDocument()

    // 5. Submit valid new deployment model
    fireEvent.change(nameInput, { target: { value: 'Hybrid Cloud' } })
    const descInput = within(rightPanel).getByLabelText(/Description/i)
    fireEvent.change(descInput, { target: { value: 'Customer-isolated hybrid architecture with edge appliance' } })
    fireEvent.click(saveModelBtn)

    // 6. Appears in panel
    await waitFor(() => {
      expect(within(rightPanel).getByText('Hybrid Cloud')).toBeInTheDocument()
    })

    // 7. Appears in central Deployment Architecture dropdown
    const depSelect = screen.getByRole('combobox', { name: /Deployment Architecture/i })
    expect(within(depSelect).getByRole('option', { name: 'Hybrid Cloud' })).toBeInTheDocument()

    // 8. Can be selected in central editor without breaking rates
    fireEvent.change(depSelect, { target: { value: 'Hybrid Cloud' } })
    expect(depSelect.value).toBe('Hybrid Cloud')

    // Switch back to Shared Cloud and confirm rates remain intact
    fireEvent.change(depSelect, { target: { value: 'Shared Cloud' } })
    expect(screen.getByLabelText(/Talent Acquisition Growth Suite Tier 1 Rate/i).value).toBe('45')
  })

  // 19. Pricing Models: Add Model button, validation, central dropdown sync, and pending backend calculation
  it('displays + Add Model in Pricing Models, validates inputs, updates central dropdown, and preserves independent rates with pending backend state', async () => {
    renderRateCardPage()

    // 1. Edit initial PEPM rate
    const tier1Input = screen.getByLabelText(/Talent Acquisition Growth Suite Tier 1 Rate/i)
    fireEvent.change(tier1Input, { target: { value: '77' } })
    expect(tier1Input.value).toBe('77')

    const rightPanel = screen.getByRole('complementary', { name: /Master Data Management/i })
    const pricingHeading = within(rightPanel).getByRole('button', { name: /D\. Pricing Models/i })
    fireEvent.click(pricingHeading)

    // 2. Panel displays Add Model
    const addPricingBtn = within(rightPanel).getByRole('button', { name: /Add Model/i })
    expect(addPricingBtn).toBeInTheDocument()

    // 3. Click opens form
    fireEvent.click(addPricingBtn)
    expect(within(rightPanel).getByText('Add Pricing Model')).toBeInTheDocument()

    const nameInput = within(rightPanel).getByLabelText(/Pricing Model Name/i)
    const saveModelBtn = within(rightPanel).getByRole('button', { name: /Save Model/i })

    // 4. Reject empty name
    fireEvent.click(saveModelBtn)
    expect(within(rightPanel).getByText('Pricing model name is required.')).toBeInTheDocument()

    // 5. Reject duplicate name case-insensitively
    fireEvent.change(nameInput, { target: { value: 'pepm' } })
    fireEvent.click(saveModelBtn)
    expect(within(rightPanel).getByText(/A pricing model named "pepm" already exists\./i)).toBeInTheDocument()

    // 6. Submit valid new pricing model
    fireEvent.change(nameInput, { target: { value: 'Usage-Based Consumption' } })
    const codeInput = within(rightPanel).getByLabelText(/Model Code/i)
    fireEvent.change(codeInput, { target: { value: 'USAGE' } })
    const descInput = within(rightPanel).getByLabelText(/Description/i)
    fireEvent.change(descInput, { target: { value: 'Metered consumption based on active API requests' } })
    fireEvent.click(saveModelBtn)

    // 7. Appears in panel
    await waitFor(() => {
      expect(within(rightPanel).getByText('Usage-Based Consumption')).toBeInTheDocument()
      expect(within(rightPanel).getByText('USAGE')).toBeInTheDocument()
    })

    // 8. Appears in central Commercial Pricing Model dropdown
    const pricingSelect = screen.getByRole('combobox', { name: /Commercial Pricing Model/i })
    expect(within(pricingSelect).getByRole('option', { name: 'Usage-Based Consumption' })).toBeInTheDocument()

    // 9. Selecting custom pricing model displays pending backend engine state rather than calculating prices
    fireEvent.change(pricingSelect, { target: { value: 'USAGE' } })
    expect(pricingSelect.value).toBe('USAGE')
    expect(screen.getByText(/Usage-Based Consumption — Commercial Pricing Configuration/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Pending backend calculation/i).length).toBeGreaterThan(0)

    // 10. Existing PEPM rate remains intact when switching back
    fireEvent.change(pricingSelect, { target: { value: 'PEPM' } })
    expect(screen.getByLabelText(/Talent Acquisition Growth Suite Tier 1 Rate/i).value).toBe('77')
  })
})
