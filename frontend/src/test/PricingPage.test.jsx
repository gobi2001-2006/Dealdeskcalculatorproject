import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PricingPage } from '../features/pricing/PricingPage'
import { CalculatorPage } from '../features/calculator/CalculatorPage'
import { ProposalsPage } from '../features/proposals/ProposalsPage'
import { ProposalProvider } from '../context/ProposalContext'
import { createDefaultCountryConfig } from '../features/calculator/calculatorData'
import * as proposalsApi from '../api/proposalsApi'

vi.mock('../api/proposalsApi', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProposal: vi.fn(),
    calculateProposal: vi.fn(),
    getLatestCalculation: vi.fn(),
  }
})

function renderPricingPageWithProposal(
  initialProposal = { countryConfigs: [createDefaultCountryConfig('c-in', 1, true)] },
  initialEntries = ['/pricing-discounts']
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const router = createMemoryRouter(
    [
      {
        path: '/pricing-discounts',
        element: <PricingPage />,
      },
      {
        path: '/pricing',
        element: <PricingPage />,
      },
      {
        path: '/calculator',
        element: <CalculatorPage />,
      },
      {
        path: '/proposals',
        element: <ProposalsPage />,
      },
    ],
    { initialEntries }
  )

  return render(
    <QueryClientProvider client={queryClient}>
      <ProposalProvider initialProposal={initialProposal}>
        <RouterProvider router={router} />
      </ProposalProvider>
    </QueryClientProvider>
  )
}

describe('Page 5 — Pricing & Discounts Feature Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Page rendering and active Page 5 navigation
  it('renders Pricing & Discounts page with active navigation highlight', () => {
    renderPricingPageWithProposal()

    const topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    const activePricingLink = within(topNav).getByRole('link', { name: /Pricing & Discounts/i })
    expect(activePricingLink).toBeInTheDocument()
    expect(activePricingLink.className).toContain('border-orange-500')
  })

  // 2. Preservation of the top navigation and commercial summary strip
  it('preserves the six-page top navigation and commercial summary strip', () => {
    renderPricingPageWithProposal()

    const topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    expect(within(topNav).getByRole('link', { name: /Product Catalog/i })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: /Pack Builder/i })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: /Rate Card & Masters/i })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: /Proposal Configurator/i })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: /Pricing & Discounts/i })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: /Proposal Summary/i })).toBeInTheDocument()

    // Summary strip
    const summaryStrip = screen.getByRole('region', { name: /Commercial Master Summary/i })
    expect(summaryStrip).toBeInTheDocument()
    expect(within(summaryStrip).getByText(/Pricing FCV/i)).toBeInTheDocument()
    expect(within(summaryStrip).getByText(/Grand Total/i)).toBeInTheDocument()
  })

  // 3. Empty state when no proposal configuration exists
  it('displays a friendly empty state when no country configuration exists and provides a link to Page 4', () => {
    renderPricingPageWithProposal({
      clientInfo: {
        clientName: 'Empty Proposal Corp',
        dealCode: 'DEAL-EMPTY',
        reportingCurrency: 'USD',
        notes: '',
      },
      countryConfigs: [],
    })

    expect(screen.getByText('No Proposal Scope Configured')).toBeInTheDocument()
    const configureLink = screen.getByRole('link', { name: /Configure Proposal/i })
    expect(configureLink).toBeInTheDocument()
    expect(configureLink.getAttribute('href')).toBe('/calculator')
  })

  // 4. Display of configured countries and product families
  it('displays configured countries, currency, and product families in the left sidebar and editor', () => {
    renderPricingPageWithProposal()

    const sidebar = screen.getByRole('complementary', { name: /Included Products Navigation/i })
    expect(within(sidebar).getByText('India')).toBeInTheDocument()
    expect(within(sidebar).getByText('INR')).toBeInTheDocument()
    expect(within(sidebar).getByText('Talent Acquisition')).toBeInTheDocument()

    // Editor banner
    const banner = screen.getByRole('region', { name: /Country Scope Banner/i })
    expect(screen.getByRole('heading', { name: 'India', level: 2 })).toBeInTheDocument()
    expect(within(banner).getByText(/Shared Cloud/i)).toBeInTheDocument()
    expect(within(banner).getByText(/36 Months/i)).toBeInTheDocument()
  })

  // 5. Display of packs and selected features
  it('displays selected base pack and à la carte features in line-item pricing table', () => {
    const customCountry = createDefaultCountryConfig('c-in', 1)
    customCountry.families[0].selectedFeatureIds = ['prod-ta-03']

    renderPricingPageWithProposal({
      countryConfigs: [customCountry],
    })

    // Pack
    const packMatches = screen.getAllByText(/Talent Acquisition Growth Suite/i)
    expect(packMatches.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/TA-GROWTH-01/i)).toBeInTheDocument()

    // À la carte feature
    expect(screen.getByText(/AI Resume Matcher & Ranking/i)).toBeInTheDocument()
    expect(screen.getByText(/TA-AI-003/i)).toBeInTheDocument()
  })

  // 6. Editing and validation of line-item discounts
  it('allows entering line-item discounts and reasons', () => {
    renderPricingPageWithProposal()

    const discountInput = screen.getByLabelText(/Discount for Talent Acquisition Growth Suite/i)
    fireEvent.change(discountInput, { target: { value: '15' } })
    expect(discountInput.value).toBe('15')

    const reasonInput = screen.getByLabelText(/Discount reason for Talent Acquisition Growth Suite/i)
    fireEvent.change(reasonInput, { target: { value: 'Volume commitment discount' } })
    expect(reasonInput.value).toBe('Volume commitment discount')
  })

  // 7. Percentage validation from 0 to 100
  it('validates percentage discounts: rejects negative and >100 values with inline feedback', () => {
    renderPricingPageWithProposal()

    const discountInput = screen.getByLabelText(/Discount for Talent Acquisition Growth Suite/i)

    // Negative
    fireEvent.change(discountInput, { target: { value: '-5' } })
    expect(screen.getByText('Discount cannot be negative.')).toBeInTheDocument()

    // Over 100
    fireEvent.change(discountInput, { target: { value: '105' } })
    expect(screen.getByText('Percentage discount cannot exceed 100%.')).toBeInTheDocument()

    // Valid
    fireEvent.change(discountInput, { target: { value: '20' } })
    expect(screen.queryByText('Percentage discount cannot exceed 100%.')).not.toBeInTheDocument()
    expect(screen.queryByText('Discount cannot be negative.')).not.toBeInTheDocument()
  })

  // 8. Fixed-amount validation when supported
  it('supports fixed amount discounts and validates non-negative input', () => {
    renderPricingPageWithProposal()

    const fixedBtn = screen.getByRole('button', { name: /Fixed amount discount/i })
    fireEvent.click(fixedBtn)

    const discountInput = screen.getByLabelText(/Discount for Talent Acquisition Growth Suite/i)

    // Negative fixed discount
    fireEvent.change(discountInput, { target: { value: '-250' } })
    expect(screen.getByText('Discount cannot be negative.')).toBeInTheDocument()

    // Valid positive fixed discount
    fireEvent.change(discountInput, { target: { value: '500' } })
    expect(screen.queryByText('Discount cannot be negative.')).not.toBeInTheDocument()
    expect(discountInput.value).toBe('500')
  })

  // 9. Preservation of discount inputs while switching countries and sections
  it('preserves discount inputs when switching between multiple countries', () => {
    const country1 = createDefaultCountryConfig('c-in', 1)
    country1.id = 'cfg-in'
    country1.countryName = 'India'

    const country2 = createDefaultCountryConfig('c-ae', 2)
    country2.id = 'cfg-ae'
    country2.countryName = 'UAE'
    country2.currency = 'AED'
    country2.currencySymbol = 'AED'

    renderPricingPageWithProposal({
      countryConfigs: [country1, country2],
    })

    // 1. Enter discount on India (active country)
    const discountInputIndia = screen.getByLabelText(/Discount for Talent Acquisition Growth Suite/i)
    fireEvent.change(discountInputIndia, { target: { value: '18' } })
    expect(discountInputIndia.value).toBe('18')

    // 2. Switch to UAE via sidebar
    const sidebar = screen.getByRole('complementary', { name: /Included Products Navigation/i })
    const uaeBtn = within(sidebar).getByRole('button', { name: /UAE/i })
    fireEvent.click(uaeBtn)

    // Editor now displays UAE
    expect(screen.getByRole('heading', { name: 'UAE', level: 2 })).toBeInTheDocument()

    // 3. Switch back to India
    const indiaBtn = within(sidebar).getByRole('button', { name: /India/i })
    fireEvent.click(indiaBtn)

    // Discount value is preserved!
    const restoredInput = screen.getByLabelText(/Discount for Talent Acquisition Growth Suite/i)
    expect(restoredInput.value).toBe('18')
  })

  // 10. Adding, editing, and removing service lines
  it('allows adding and removing professional service lines', () => {
    renderPricingPageWithProposal()

    // Initial service line exists
    expect(screen.getByText('Enterprise Solution Architecture')).toBeInTheDocument()

    // Open add service line form
    const addSrvBtn = screen.getByRole('button', { name: /Add Service Line/i })
    fireEvent.click(addSrvBtn)

    const roleInput = screen.getByLabelText(/Role \/ Scope Description \*/i)
    fireEvent.change(roleInput, { target: { value: 'Custom Data Migration' } })

    const hoursInput = screen.getByLabelText(/Effort \(Hours\) \*/i)
    fireEvent.change(hoursInput, { target: { value: '80' } })

    const confirmBtn = screen.getByRole('button', { name: 'Add Service Line' })
    fireEvent.click(confirmBtn)

    // New service line rendered in table
    expect(screen.getByText('Custom Data Migration')).toBeInTheDocument()

    // Remove the service line
    const removeBtn = screen.getByRole('button', { name: /Remove service line Custom Data Migration/i })
    fireEvent.click(removeBtn)

    expect(screen.queryByText('Custom Data Migration')).not.toBeInTheDocument()
  })

  // 11. Required-field and quantity validation for service lines
  it('validates required description and non-negative effort for service lines', () => {
    renderPricingPageWithProposal()

    const addSrvBtn = screen.getByRole('button', { name: /Add Service Line/i })
    fireEvent.click(addSrvBtn)

    // Clear description and put negative effort
    const roleInput = screen.getByLabelText(/Role \/ Scope Description \*/i)
    fireEvent.change(roleInput, { target: { value: '' } })

    const hoursInput = screen.getByLabelText(/Effort \(Hours\) \*/i)
    fireEvent.change(hoursInput, { target: { value: '-10' } })

    const confirmBtn = screen.getByRole('button', { name: 'Add Service Line' })
    fireEvent.click(confirmBtn)

    expect(screen.getByText('Service description or role is required.')).toBeInTheDocument()
    expect(screen.getByText('Quantity / hours must be a non-negative number.')).toBeInTheDocument()
  })

  // 12. Pending-backend financial values
  it('displays pending backend calculation for all financial figures without client math', () => {
    renderPricingPageWithProposal()

    const pendingPlaceholders = screen.getAllByText(/Pending backend calculation/i)
    expect(pendingPlaceholders.length).toBeGreaterThan(4)
  })

  // 13. Demo-only approval threshold labelling
  it('displays approval thresholds prominently labelled as demo settings — not enforced', () => {
    renderPricingPageWithProposal()

    const policiesCard = screen.getByRole('region', { name: /Approval Governance Policies/i })
    expect(policiesCard).toBeInTheDocument()
    expect(within(policiesCard).getByText('Demo settings — not enforced')).toBeInTheDocument()
    expect(within(policiesCard).getByText(/Gross-Margin Floor/i)).toBeInTheDocument()
    expect(within(policiesCard).getByText(/30.0%/i)).toBeInTheDocument()
    expect(within(policiesCard).getByText(/15.0%/i)).toBeInTheDocument()
    expect(within(policiesCard).getByText(/20.0%/i)).toBeInTheDocument()
  })

  // 14. No fabricated gross margin or approval decision
  it('does not display fabricated 100% margin or fake approval decisions', () => {
    renderPricingPageWithProposal()

    const summaryCard = screen.getByRole('region', { name: /Commercial Summary and Financial Metrics/i })
    expect(within(summaryCard).getByText(/Gross Margin/i)).toBeInTheDocument()
    // Should NOT be 100% or fabricated number
    expect(within(summaryCard).queryByText('100%')).not.toBeInTheDocument()
    expect(within(summaryCard).getAllByText('Pending backend calculation').length).toBeGreaterThanOrEqual(1)

    // Approval status should be pending configuration, not Approved
    expect(within(summaryCard).getByText('Pending backend configuration')).toBeInTheDocument()
    expect(within(summaryCard).queryByText('Approved')).not.toBeInTheDocument()
    expect(within(summaryCard).queryByText('Rejected')).not.toBeInTheDocument()
  })

  // 15. Summary-card handling of long currency amounts
  it('renders commercial summary card with responsive two-column metrics and word-break support', () => {
    renderPricingPageWithProposal({
      clientInfo: {
        clientName: 'Enterprise Mega Corp with Extremely Long Customer Name for Testing Layout',
        dealCode: 'DEAL-9999-EXTREME-ENTERPRISE-TRANCHE-01',
        reportingCurrency: 'USD',
        notes: '',
      },
    })

    const summaryCard = screen.getByRole('region', { name: /Commercial Summary and Financial Metrics/i })
    expect(summaryCard).toBeInTheDocument()
    expect(within(summaryCard).getByText(/Total Contract Revenue/i)).toBeInTheDocument()
    expect(within(summaryCard).getByText('USD')).toBeInTheDocument()
  })

  // 16. Navigation back to Page 4
  it('provides navigation links back to Page 4 — Proposal Configurator', () => {
    renderPricingPageWithProposal()

    const backLink = screen.getByRole('link', { name: /Page 4 Config/i })
    expect(backLink).toBeInTheDocument()
    expect(backLink.getAttribute('href')).toBe('/calculator')

    const sidebarLink = screen.getByRole('link', { name: /Edit Configurator Scope/i })
    expect(sidebarLink).toBeInTheDocument()
    expect(sidebarLink.getAttribute('href')).toBe('/calculator')
  })

  // 17. Navigation forward to Page 6
  it('provides navigation forward to Page 6 — Proposal Summary', () => {
    renderPricingPageWithProposal()

    const nextLink = screen.getByRole('link', { name: /Page 6 Summary/i })
    expect(nextLink).toBeInTheDocument()
    expect(nextLink.getAttribute('href')).toBe('/proposals')
  })

  // 18. Saving pricing configuration updates frontend prototype state
  it('allows saving pricing configuration draft as frontend prototype without claiming PostgreSQL persistence', () => {
    renderPricingPageWithProposal()

    const saveDraftBtn = screen.getByRole('button', { name: /Save Pricing Draft/i })
    fireEvent.click(saveDraftBtn)

    expect(
      screen.getByText(/Pricing & discount configuration saved in frontend state \(not persisted to PostgreSQL\)\./i)
    ).toBeInTheDocument()
  })

  // 19. Displays authoritative calculated amounts when a calculation snapshot exists
  it('displays authoritative calculation snapshot metrics and status badge', () => {
    const mockSnapshot = {
      snapshot_id: 101,
      total_proposal_contract_reporting_currency: 125000,
      reporting_currency_code: 'INR',
      snapshot_payload: {
        products: [
          {
            product_code: 'CORE',
            contract_subscription_before_discount: 120000,
            contract_subscription_total_after_discount: 108000,
          },
        ],
        all_subscription_line_items: [
          {
            pack_id: 'pack-core',
            rate_per_unit: 20,
            contract_subscription_before_discount: 120000,
            contract_subscription_after_discount: 108000,
          },
        ],
        all_service_lines: [
          {
            role_name: 'Implementation Consultant',
            service_line_total: 17000,
          },
        ],
      },
    }

    renderPricingPageWithProposal({
      clientInfo: { proposalId: 42, clientName: 'Adrenalin Demo Corp' },
      countryConfigs: [createDefaultCountryConfig('c-in', 1, true)],
      calcApiResult: {
        status: 'success',
        proposalId: 42,
        data: mockSnapshot,
        isBackendCalculation: true,
      },
    })

    expect(screen.getByText(/FastAPI Calculated \(Snapshot #101\)/i)).toBeInTheDocument()
    expect(screen.getAllByText(/₹ 108,000.00/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/₹ 125,000.00/i).length).toBeGreaterThan(0)
  })

  // 20. Triggers calculateProposal and displays PostgreSQL persistence confirmation for an active proposal
  it('calls calculateProposal API and displays PostgreSQL persistence toast when Save Pricing Draft is clicked for an active proposal', async () => {
    const mockCalcResult = {
      snapshot_id: 202,
      total_proposal_contract_reporting_currency: 95000,
      snapshot_payload: {
        products: [],
        all_subscription_line_items: [],
        all_service_lines: [],
      },
    }
    proposalsApi.calculateProposal.mockResolvedValueOnce(mockCalcResult)

    renderPricingPageWithProposal({
      clientInfo: { proposalId: 99, clientName: 'Enterprise Client' },
      countryConfigs: [createDefaultCountryConfig('c-in', 1, true)],
    })

    const saveDraftBtn = screen.getByRole('button', { name: /Save Pricing Draft/i })
    fireEvent.click(saveDraftBtn)

    await waitFor(() => {
      expect(proposalsApi.calculateProposal).toHaveBeenCalledWith(
        99,
        expect.objectContaining({
          contract_term_months: expect.any(Number),
        })
      )
    })

    expect(
      screen.getByText(/Pricing & discounts successfully calculated and saved to PostgreSQL\./i)
    ).toBeInTheDocument()
  })

  // 21. Recalculates pricing against backend calculation engine when Recalculate button is clicked
  it('triggers recalculation against backend pricing engine when onRecalculate is triggered', async () => {
    const mockSnapshot = {
      snapshot_id: 101,
      total_proposal_contract_reporting_currency: 120000,
      snapshot_payload: { products: [], all_subscription_line_items: [], all_service_lines: [] },
    }
    const recalculatedSnapshot = {
      snapshot_id: 102,
      total_proposal_contract_reporting_currency: 100000,
      snapshot_payload: { products: [], all_subscription_line_items: [], all_service_lines: [] },
    }
    proposalsApi.calculateProposal.mockResolvedValueOnce(recalculatedSnapshot)

    renderPricingPageWithProposal({
      clientInfo: { proposalId: 55, clientName: 'Recalc Client' },
      countryConfigs: [createDefaultCountryConfig('c-in', 1, true)],
      calcApiResult: {
        status: 'success',
        proposalId: 55,
        data: mockSnapshot,
        isBackendCalculation: true,
      },
    })

    const recalcBtn = screen.getByRole('button', { name: /Recalculate with Discounts/i })
    fireEvent.click(recalcBtn)

    await waitFor(() => {
      expect(proposalsApi.calculateProposal).toHaveBeenCalledWith(55, expect.any(Object))
    })

    expect(screen.getByText(/Pricing recalculation completed\./i)).toBeInTheDocument()
  })

  // 22. Handles backend calculation error gracefully with error notification
  it('displays an error toast when backend calculation fails', async () => {
    proposalsApi.calculateProposal.mockRejectedValueOnce({
      response: { data: { detail: 'Rate card lookup failed for pack' } },
    })

    renderPricingPageWithProposal({
      clientInfo: { proposalId: 88, clientName: 'Error Client' },
      countryConfigs: [createDefaultCountryConfig('c-in', 1, true)],
    })

    const saveDraftBtn = screen.getByRole('button', { name: /Save Pricing Draft/i })
    fireEvent.click(saveDraftBtn)

    await waitFor(() => {
      expect(screen.getByText(/Rate card lookup failed for pack/i)).toBeInTheDocument()
    })
  })

  // 23. Correctly maps overall country discount to real proposal product codes (e.g. SKU-509) for recalculation
  it('correctly maps country overall discount to backend product codes from snapshot', async () => {
    const mockSnapshot = {
      snapshot_id: 19,
      total_proposal_contract_reporting_currency: 540000000,
      reporting_currency_code: 'INR',
      snapshot_payload: {
        products: [
          {
            product_code: 'SKU-509',
            product_name: 'DEV TA Premium v1',
            subscription_subtotal_before_discount: 540000000,
            contract_subscription_subtotal_before_discount: 540000000,
            subscription_discount_pct: 0,
            contract_subscription_total_after_discount: 540000000,
            service_total_after_discount: 0,
          },
        ],
        all_subscription_line_items: [
          {
            pack_version_id: 38,
            product_code: 'SKU-509',
            target_name: 'DEV TA Premium v1',
            rate_per_unit: 3000,
            contract_subscription_before_discount: 540000000,
            contract_subscription_after_discount: 540000000,
          },
        ],
        all_service_lines: [],
      },
    }

    const discountedSnapshot = {
      snapshot_id: 20,
      total_proposal_contract_reporting_currency: 459000000,
      reporting_currency_code: 'INR',
      snapshot_payload: {
        products: [
          {
            product_code: 'SKU-509',
            product_name: 'DEV TA Premium v1',
            subscription_subtotal_before_discount: 540000000,
            contract_subscription_subtotal_before_discount: 540000000,
            subscription_discount_pct: 15,
            contract_subscription_total_after_discount: 459000000,
            service_total_after_discount: 0,
          },
        ],
        all_subscription_line_items: [
          {
            pack_version_id: 38,
            product_code: 'SKU-509',
            target_name: 'DEV TA Premium v1',
            rate_per_unit: 3000,
            contract_subscription_before_discount: 540000000,
            contract_subscription_after_discount: 459000000,
          },
        ],
        all_service_lines: [],
      },
    }

    proposalsApi.calculateProposal.mockResolvedValueOnce(discountedSnapshot)

    const countryConfig = createDefaultCountryConfig('c-in', 1, false)
    countryConfig.families = [
      {
        id: 'fam-1',
        familyId: 1,
        selectedPackId: 38,
        selectedFeatureIds: [],
        headcount: 5000,
      },
    ]
    countryConfig.contractTerm = 36
    countryConfig.currency = 'INR'
    countryConfig.currencySymbol = '₹'

    renderPricingPageWithProposal({
      clientInfo: { proposalId: 22, clientName: 'Demo Technologies', reportingCurrency: 'INR' },
      countryConfigs: [countryConfig],
      calcApiResult: {
        status: 'success',
        proposalId: 22,
        data: mockSnapshot,
        isBackendCalculation: true,
      },
    })

    // Enter 15% discount
    const discountInput = screen.getByLabelText(/Overall Country Discretionary Discount \(%\)/i)
    fireEvent.change(discountInput, { target: { value: '15' } })

    const recalcBtn = screen.getByRole('button', { name: /Recalculate with Discounts/i })
    fireEvent.click(recalcBtn)

    await waitFor(() => {
      expect(proposalsApi.calculateProposal).toHaveBeenCalledWith(22, {
        contract_term_months: 36,
        product_subscription_discounts: {
          'SKU-509': 15,
        },
        product_service_discounts: {},
      })
    })

    // Confirm that the UI updates with the authoritative net subtotal and grand total
    await waitFor(() => {
      expect(screen.getAllByText(/459,000,000\.00/).length).toBeGreaterThanOrEqual(1)
    })
  })

  // 24. Professional services and grand total display zero accurately when calculation has 0 services
  it('displays ₹ 0.00 for services and does not show Pending when backend calculation has 0 services', () => {
    const mockSnapshot = {
      snapshot_id: 20,
      total_proposal_contract_reporting_currency: 459000000,
      reporting_currency_code: 'INR',
      snapshot_payload: {
        products: [
          {
            product_code: 'SKU-509',
            product_name: 'DEV TA Premium v1',
            contract_subscription_total_after_discount: 459000000,
            service_total_after_discount: 0,
          },
        ],
        all_subscription_line_items: [],
        all_service_lines: [],
      },
    }

    const countryConfig = createDefaultCountryConfig('c-in', 1, false)
    countryConfig.serviceLines = []
    countryConfig.currency = 'INR'
    countryConfig.currencySymbol = '₹'

    renderPricingPageWithProposal({
      clientInfo: { proposalId: 22, clientName: 'Demo Technologies', reportingCurrency: 'INR' },
      countryConfigs: [countryConfig],
      calcApiResult: {
        status: 'success',
        proposalId: 22,
        data: mockSnapshot,
        isBackendCalculation: true,
      },
    })

    // CommercialSummaryCard should show ₹ 0.00 for services rather than Pending backend calculation
    const commercialSection = screen.getByRole('region', { name: /Commercial Summary and Financial Metrics/i })
    const servicesRow = within(commercialSection).getByText(/Professional Services:/i).closest('div')
    expect(within(servicesRow).getByText(/₹ 0\.00/i)).toBeInTheDocument()
    expect(within(servicesRow).queryByText(/Pending backend calculation/i)).not.toBeInTheDocument()
  })

  // 25. Hydrates proposal metadata and latest calculation on mount when proposalId is in URL
  it('hydrates proposal details and latest calculation snapshot from backend on mount', async () => {
    const mockProposal = {
      id: 22,
      code: 'PROP-2026-0089-3174',
      customer_id: 5,
      customer: { id: 5, name: 'Demo Technologies', customer_tier_id: 'tier-3' },
      currency_id: 1,
      currency: { code: 'INR', symbol: '₹' },
      countries: [
        {
          id: 10,
          country_id: 1,
          country: { name: 'India', currency: { code: 'INR', symbol: '₹' } },
          deployment_model_id: 'dep-onprem',
          pricing_model_id: 'pm-pepm',
          term_months: 36,
          user_headcount: 5000,
        },
      ],
      versions: [
        {
          id: 30,
          status: 'draft',
          line_items: [
            {
              id: 40,
              pack_version_id: 38,
              pack_version: { pack: { product_family_id: 1 } },
            },
          ],
          service_lines: [],
        },
      ],
    }

    const mockLatestSnapshot = {
      snapshot_id: 20,
      total_proposal_contract_reporting_currency: 459000000,
      reporting_currency_code: 'INR',
      snapshot_payload: {
        products: [
          {
            product_code: 'SKU-509',
            product_name: 'DEV TA Premium v1',
            subscription_discount_pct: 15,
            contract_subscription_total_after_discount: 459000000,
            service_total_after_discount: 0,
          },
        ],
        all_subscription_line_items: [],
        all_service_lines: [],
      },
    }

    proposalsApi.getProposal.mockResolvedValue(mockProposal)
    proposalsApi.getLatestCalculation.mockResolvedValue(mockLatestSnapshot)

    renderPricingPageWithProposal(
      { clientInfo: {}, countryConfigs: [] },
      ['/pricing-discounts?proposalId=22']
    )

    await waitFor(() => {
      expect(proposalsApi.getProposal).toHaveBeenCalledWith('22')
      expect(proposalsApi.getLatestCalculation).toHaveBeenCalledWith('22')
    })

    await waitFor(() => {
      expect(screen.getAllByText('Demo Technologies').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('India').length).toBeGreaterThanOrEqual(1)
    })
  })
})
