import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProposalSummaryPage } from '../features/proposals/ProposalSummaryPage'
import { CalculatorPage } from '../features/calculator/CalculatorPage'
import { PricingPage } from '../features/pricing/PricingPage'
import { ProposalProvider } from '../context/ProposalContext'
import { createDefaultCountryConfig } from '../features/calculator/calculatorData'

function renderProposalSummaryWithProposal(initialProposal = null, initialEntries = ['/proposals']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const router = createMemoryRouter(
    [
      {
        path: '/proposals',
        element: <ProposalSummaryPage />,
      },
      {
        path: '/proposal-summary',
        element: <ProposalSummaryPage />,
      },
      {
        path: '/pricing-discounts',
        element: <PricingPage />,
      },
      {
        path: '/calculator',
        element: <CalculatorPage />,
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

describe('Page 6 — Proposal Summary Feature Tests', () => {
  // 1. Page 6 renders with the correct active navigation
  it('renders Proposal Summary page with active navigation highlight on tab 6', () => {
    renderProposalSummaryWithProposal()

    const topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    const activeSummaryLink = within(topNav).getByRole('link', { name: /Proposal Summary/i })
    expect(activeSummaryLink).toBeInTheDocument()
    expect(activeSummaryLink.className).toContain('border-orange-500')
  })

  // 2. The existing commercial summary strip remains visible
  it('preserves the top navigation and commercial summary strip with proposal data', () => {
    renderProposalSummaryWithProposal({
      clientInfo: {
        clientName: 'Apex Cloud Solutions',
        dealCode: 'DEAL-APEX-01',
        reportingCurrency: 'USD',
        notes: '',
      },
      countryConfigs: [createDefaultCountryConfig('c-in', 1)],
    })

    const summaryStrip = screen.getByRole('region', { name: /Commercial Master Summary/i })
    expect(summaryStrip).toBeInTheDocument()
    expect(within(summaryStrip).getByText('Apex Cloud Solutions')).toBeInTheDocument()
    expect(within(summaryStrip).getByText(/Pricing FCV/i)).toBeInTheDocument()
    expect(within(summaryStrip).getByText(/Grand Total/i)).toBeInTheDocument()
  })

  // 3. The client name comes from shared proposal state
  it('displays the client name from shared proposal context in header', () => {
    renderProposalSummaryWithProposal({
      clientInfo: {
        clientName: 'Starlight Global Enterprises',
        dealCode: 'DEAL-STAR-99',
        reportingCurrency: 'USD',
        notes: '',
      },
      countryConfigs: [createDefaultCountryConfig('c-in', 1)],
    })

    expect(
      screen.getByRole('heading', {
        name: /Proposal Summary — Starlight Global Enterprises/i,
        level: 1,
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Consolidated pricing across all included products and countries/i)
    ).toBeInTheDocument()
  })

  // 4. Country and product-line counts follow the documented counting rules
  it('displays accurate country count and product lines in summary metric cards', () => {
    const country1 = createDefaultCountryConfig('c-in', 1)
    const country2 = createDefaultCountryConfig('c-ae', 2)
    country2.countryName = 'UAE'
    country2.currency = 'AED'
    country2.currencySymbol = 'AED'

    renderProposalSummaryWithProposal({
      countryConfigs: [country1, country2],
    })

    const countriesCard = screen.getByRole('region', { name: /Countries summary card/i })
    expect(within(countriesCard).getByText('2')).toBeInTheDocument()
    expect(within(countriesCard).getByText(/2 Configured Countries/i)).toBeInTheDocument()

    const productLinesCard = screen.getByRole('region', { name: /Product Lines summary card/i })
    expect(within(productLinesCard).getByText('2')).toBeInTheDocument()
  })

  // 5. Multiple countries render with their correct currency, deployment, pricing model, and term
  it('renders multiple countries with independent currency, deployment, pricing model, and contract term in table headers', () => {
    const country1 = createDefaultCountryConfig('c-in', 1)
    country1.id = 'cfg-in'
    country1.countryName = 'India'
    country1.currency = 'INR'
    country1.currencySymbol = '₹'
    country1.deploymentModelId = 'dep-shared'
    country1.pricingModelId = 'pm-pepm'
    country1.contractTerm = 36

    const country2 = createDefaultCountryConfig('c-ae', 2)
    country2.id = 'cfg-ae'
    country2.countryName = 'UAE'
    country2.currency = 'AED'
    country2.currencySymbol = 'AED'
    country2.deploymentModelId = 'dep-private'
    country2.pricingModelId = 'pm-platform'
    country2.contractTerm = 24

    renderProposalSummaryWithProposal({
      countryConfigs: [country1, country2],
    })

    const table = screen.getByRole('table', { name: /Detailed Proposal Commercial Summary/i })

    // Country 1 header
    expect(within(table).getByText(/Country 1: India/i)).toBeInTheDocument()
    expect(within(table).getByText(/INR \(₹\)/i)).toBeInTheDocument()
    expect(within(table).getByText(/Shared Cloud/i)).toBeInTheDocument()
    expect(within(table).getByText(/36 months/i)).toBeInTheDocument()

    // Country 2 header
    expect(within(table).getByText(/Country 2: UAE/i)).toBeInTheDocument()
    expect(within(table).getByText(/AED \(AED\)/i)).toBeInTheDocument()
    expect(within(table).getByText(/Private Cloud/i)).toBeInTheDocument()
    expect(within(table).getByText(/24 months/i)).toBeInTheDocument()
  })

  // 6. Product rows display the correct configured names, packs, and features
  it('displays configured pack and à la carte features under the respective country', () => {
    const customCountry = createDefaultCountryConfig('c-in', 1)
    customCountry.families[0].selectedFeatureIds = ['prod-ta-03']

    renderProposalSummaryWithProposal({
      countryConfigs: [customCountry],
    })

    const table = screen.getByRole('table', { name: /Detailed Proposal Commercial Summary/i })

    // Pack
    expect(within(table).getByText(/Talent Acquisition Growth Suite/i)).toBeInTheDocument()
    expect(within(table).getByText(/TA-GROWTH-01/i)).toBeInTheDocument()

    // Feature
    expect(within(table).getByText(/AI Resume Matcher & Ranking/i)).toBeInTheDocument()
    expect(within(table).getByText(/TA-AI-003/i)).toBeInTheDocument()
    expect(within(table).getByText(/À la carte/i)).toBeInTheDocument()
  })

  // 7. License, recurring, service, and total amounts display authoritative backend results or pending placeholders
  it('displays pending backend calculation placeholders for all financial figures without client math', () => {
    renderProposalSummaryWithProposal()

    const pendingMatches = screen.getAllByText(/Pending backend calculation/i)
    // Multiple metric cards and table cells should show pending backend calculation
    expect(pendingMatches.length).toBeGreaterThan(6)
  })

  // 8. Missing financial values are marked pending rather than replaced with zero
  it('does not substitute zero for missing financial figures', () => {
    renderProposalSummaryWithProposal()

    const grandTotalCard = screen.getByRole('region', { name: /Grand Total summary card/i })
    expect(within(grandTotalCard).queryByText('$0')).not.toBeInTheDocument()
    expect(within(grandTotalCard).queryByText('0')).not.toBeInTheDocument()
    expect(within(grandTotalCard).getByText(/Pending backend calculation/i)).toBeInTheDocument()
  })

  // 9. Gross margin is not fabricated when unavailable
  it('does not display a fabricated default 100% gross margin', () => {
    renderProposalSummaryWithProposal()

    // Query across the table for gross margin cells
    const table = screen.getByRole('table', { name: /Detailed Proposal Commercial Summary/i })
    expect(within(table).queryByText('100%')).not.toBeInTheDocument()
    expect(within(table).queryByText('100.0%')).not.toBeInTheDocument()
  })

  // 10. Show Discounts toggles discount-detail visibility without modifying discount data
  it('toggles discount-detail visibility on and off without altering underlying proposal data', () => {
    const country = createDefaultCountryConfig('c-in', 1)
    country.id = 'cfg-in'

    const packKey = `${country.id}:${country.families[0].id}:pack:${country.families[0].selectedPackId}`

    renderProposalSummaryWithProposal({
      countryConfigs: [country],
      lineItemDiscounts: {
        [packKey]: {
          type: 'percentage',
          value: '15',
          reason: 'Enterprise volume discount',
        },
      },
      overallDiscounts: {
        [country.id]: {
          type: 'percentage',
          value: '10',
          reason: 'Strategic customer concession',
        },
      },
    })

    const toggleBtn = screen.getByRole('switch', { name: /Show Discounts Toggle/i })
    expect(toggleBtn).toHaveAttribute('aria-checked', 'false')

    // Initially discount details are hidden
    expect(screen.queryByText(/Enterprise volume discount/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Strategic customer concession/i)).not.toBeInTheDocument()

    // 1. Toggle ON
    fireEvent.click(toggleBtn)
    expect(toggleBtn).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/Enterprise volume discount/i)).toBeInTheDocument()
    expect(screen.getByText(/Strategic customer concession/i)).toBeInTheDocument()
    expect(screen.getByText(/15%/i)).toBeInTheDocument()
    expect(screen.getByText(/10%/i)).toBeInTheDocument()

    // 2. Toggle OFF
    fireEvent.click(toggleBtn)
    expect(toggleBtn).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByText(/Enterprise volume discount/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Strategic customer concession/i)).not.toBeInTheDocument()
  })

  // 11. Reporting and native currencies are labelled correctly
  it('clearly labels native currency and proposal reporting currency', () => {
    const customCountry = createDefaultCountryConfig('c-in', 1)
    customCountry.currency = 'INR'

    renderProposalSummaryWithProposal({
      clientInfo: {
        clientName: 'Global Corp',
        dealCode: 'DEAL-GC-01',
        reportingCurrency: 'USD',
        notes: '',
      },
      countryConfigs: [customCountry],
    })

    // Header badge
    expect(screen.getAllByText('USD').length).toBeGreaterThanOrEqual(1)

    // Table contains native currency INR
    const table = screen.getByRole('table', { name: /Detailed Proposal Commercial Summary/i })
    expect(within(table).getAllByText(/INR/i).length).toBeGreaterThanOrEqual(1)
  })

  // 12. Country subtotal and grand-total rows render correctly
  it('renders distinct subtotal rows for each country and a prominent grand total row', () => {
    const country = createDefaultCountryConfig('c-in', 1)
    country.countryName = 'India'

    renderProposalSummaryWithProposal({
      clientInfo: {
        clientName: 'Acme Global',
        dealCode: 'DEAL-01',
        reportingCurrency: 'USD',
        notes: '',
      },
      countryConfigs: [country],
    })

    const table = screen.getByRole('table', { name: /Detailed Proposal Commercial Summary/i })

    // Subtotal row
    expect(within(table).getByText(/Subtotal — India/i)).toBeInTheDocument()

    // Grand total row
    expect(within(table).getByText(/Grand Total/i)).toBeInTheDocument()
  })

  // 13. Empty state when no proposal configuration exists
  it('displays a helpful empty state when no countries are configured, with link to Page 4', () => {
    renderProposalSummaryWithProposal({
      clientInfo: {
        clientName: 'Empty Scope Ltd',
        dealCode: 'DEAL-EMPTY',
        reportingCurrency: 'USD',
        notes: '',
      },
      countryConfigs: [],
    })

    expect(screen.getByText('No Proposal Scope Configured')).toBeInTheDocument()
    const configLink = screen.getByRole('link', { name: /Configure Proposal/i })
    expect(configLink).toBeInTheDocument()
    expect(configLink.getAttribute('href')).toBe('/calculator')
  })

  // 14. Save and export actions do not falsely report successful persistence or file generation
  it('handles Export PDF as disabled and Save Proposal as frontend prototype notice', async () => {
    renderProposalSummaryWithProposal()

    // PDF button is disabled with explanatory title
    const exportPdfBtn = screen.getByRole('button', { name: /Export PDF/i })
    expect(exportPdfBtn).toBeDisabled()
    expect(exportPdfBtn).toHaveAttribute(
      'title',
      'PDF export requires backend reporting service deployment (Wave 5)'
    )

    // Proposal Doc button is disabled
    const docBtn = screen.getByRole('button', { name: /Generate Proposal Doc/i })
    expect(docBtn).toBeDisabled()

    // Save Proposal button opens save modal
    const saveBtn = screen.getAllByRole('button', { name: /Save Proposal/i })[0]
    fireEvent.click(saveBtn)

    expect(screen.getByRole('dialog', { name: /Save Proposal Draft/i })).toBeInTheDocument()
  })

  // 15. Financial definitions footer displays definitions
  it('renders footer with definitions for License Fee, PEPM, Service Fees, and FCV', () => {
    renderProposalSummaryWithProposal()

    const footer = screen.getByRole('contentinfo', {
      name: /Proposal Financial Definitions and Governance Footnote/i,
    })
    expect(footer).toBeInTheDocument()
    expect(within(footer).getByText('License Fee')).toBeInTheDocument()
    expect(within(footer).getByText('Rental / PEPM')).toBeInTheDocument()
    expect(within(footer).getByText('Service Fees')).toBeInTheDocument()
    expect(within(footer).getByText('Full Contract Value (FCV)')).toBeInTheDocument()
  })

  // 16. Navigation back to Page 5 and Page 4
  it('provides navigation links back to Page 5 (Pricing & Discounts) and Page 4 (Proposal Configurator)', () => {
    renderProposalSummaryWithProposal()

    const backToPricing = screen.getByRole('link', { name: /Return to Pricing & Discounts/i })
    expect(backToPricing).toBeInTheDocument()
    expect(backToPricing.getAttribute('href')).toBe('/pricing-discounts')

    const editScope = screen.getByRole('link', { name: /Edit Configurator Scope/i })
    expect(editScope).toBeInTheDocument()
    expect(editScope.getAttribute('href')).toBe('/calculator')
  })
})
