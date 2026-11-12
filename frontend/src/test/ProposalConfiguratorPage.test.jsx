import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import apiClient from '../api/client'
import { ProposalProvider } from '../context/ProposalContext'
import { CalculatorPage } from '../features/calculator/CalculatorPage'
import { CalculationModal } from '../features/calculator/components/CalculationModal'
import { installFakeApi } from './fixtures/fakeApi'
import * as fx from './fixtures/backendRecords'

vi.mock('../api/client')

function masterRoutes(overrides = {}) {
  return {
    'GET /masters/countries': () => fx.countries,
    'GET /masters/currencies': () => fx.currencies,
    'GET /masters/customer-tiers': () => fx.tiers,
    'GET /masters/deployment-models': () => fx.deployments,
    'GET /masters/deployment-pricing-options': () => fx.deploymentPricingOptions,
    'GET /masters/pricing-models': () => fx.pricingModels,
    'GET /catalogue/families': () => fx.families,
    'GET /packs/': () => fx.packs,
    'GET /catalogue/products': () => fx.products,
    'GET /catalogue/features': () => fx.features,
    'GET /rates/service-rates': () => fx.serviceRates,
    'GET /customers/': () => [],
    // Page 4 prices at base level (no discounts, nothing saved).
    'POST /proposals/:id/calculate/base': () => fx.basePricingResult(),
    'POST /rates/resolve': (body) => ({
      rate_card_id: 5, uom_id: 13, currency_code: 'INR',
      fixed_fee: body.pack_version_id ? '380000' : '50000', unit_rate: body.pack_version_id ? '80' : '10',
    }),
    ...overrides,
  }
}

function renderPage(url = '/calculator', initialProposal = null) {
  return render(
    <ProposalProvider initialProposal={initialProposal}>
      <MemoryRouter initialEntries={[url]}>
        <CalculatorPage />
      </MemoryRouter>
    </ProposalProvider>,
  )
}

describe('Page 4 — Proposal Configurator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_DEALDESK_USER_ID', '4')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('starts empty: no demo client, deal, country or prices', async () => {
    installFakeApi(apiClient, masterRoutes())
    renderPage()
    await waitFor(() => expect(screen.getByLabelText(/Client \/ Customer Name/i)).toBeInTheDocument())
    expect(screen.getByLabelText(/Client \/ Customer Name/i)).toHaveValue('')
    expect(screen.queryByText(/Acme/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/DEAL-2026-0042/)).not.toBeInTheDocument()
    expect(screen.getByText(/No Countries Configured/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Reporting Currency/i })).toHaveValue('')
  })

  it('reports master data that failed to load instead of substituting demo lists', async () => {
    installFakeApi(apiClient, masterRoutes({
      'GET /masters/customer-tiers': () => {
        throw Object.assign(new Error('boom'), { response: { status: 500, data: { detail: 'Internal Server Error' } } })
      },
    }))
    renderPage()
    expect(await screen.findByText(/Some master data could not be loaded/i)).toBeInTheDocument()
    expect(screen.getByText(/customer tiers: Internal Server Error/i)).toBeInTheDocument()
    expect(screen.getByText('OFFLINE / DISCONNECTED')).toBeInTheDocument()
  })

  it('reloads a saved proposal with its real pack version, features and man-day services', async () => {
    installFakeApi(apiClient, masterRoutes({
      'GET /proposals/:id': () => fx.savedProposal(),
      'GET /proposals/:id/calculations/latest': () => fx.calculationResult(),
    }))
    renderPage('/calculator?proposalId=900')

    const packSelect = await screen.findByLabelText(/Pack Selection/i)
    await waitFor(() => expect(packSelect).toHaveValue('42'))
    // Only the ACTIVE version is offered (v1 is superseded).
    expect(within(packSelect).getByRole('option', { name: /TA Premium .* Version 2/ })).toBeInTheDocument()
    expect(within(packSelect).queryByRole('option', { name: /Version 1/ })).not.toBeInTheDocument()

    // The features table lists catalogue FEATURES; pack contents are locked.
    const table = screen.getByRole('table', { name: /À la carte features/i })
    expect(within(table).getByLabelText('Select Recruit')).toBeDisabled()
    expect(within(table).getByLabelText('Select AI Agent')).toBeDisabled()
    expect(within(table).getByLabelText('Select Standalone Add-on')).toBeChecked()
    expect(within(table).queryByText('TA Max', { selector: 'div' })).not.toBeInTheDocument()

    // Services are man-days, priced from the country's saved rate.
    expect(screen.getByRole('columnheader', { name: /Effort \(Man-days\)/i })).toBeInTheDocument()
    expect(screen.getByText('12 days')).toBeInTheDocument()

    // The duration is shown in years: 24 months from the latest snapshot -> 2 years.
    expect(screen.getByLabelText(/Contract Duration \(Years\)/i)).toHaveValue(2)
  })

  it('labels quantities with the rate card unit of measure and billing period, not employees', async () => {
    installFakeApi(apiClient, masterRoutes({
      'GET /proposals/:id': () => fx.savedProposal(),
      'GET /proposals/:id/calculations/latest': () => fx.calculationResult(),
      'POST /rates/resolve': (body) => ({
        rate_card_id: 5, uom_id: 13, currency_code: 'INR',
        uom_name: body.pack_version_id ? 'Interviews' : 'GB of Data',
        fixed_fee_basis: 'annual', unit_rate_basis: 'monthly',
        fixed_fee: body.pack_version_id ? '300000' : '50000', unit_rate: body.pack_version_id ? '85' : '10',
      }),
    }))
    renderPage('/calculator?proposalId=900')

    // The country volume is the pack quantity, labelled with the pack's unit
    expect(await screen.findByLabelText('Interviews — Country Deployment Volume', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('Interviews / month')).toBeInTheDocument()
    expect(screen.queryByText(/Active Employees \(with ESS\)/)).not.toBeInTheDocument()
    expect(screen.queryByText('Users')).not.toBeInTheDocument()

    // Pack and feature rates are described with their own unit and period
    // Locale-independent grouping (3,00,000 in en-IN, 300,000 in en-US).
    const fee = Number(300000).toLocaleString()
    expect(await screen.findByText(`platform fee INR ${fee} / year + INR 85.00 per Interviews / month`, { exact: false }, { timeout: 5000 })).toBeInTheDocument()
    const table = screen.getByRole('table', { name: /À la carte features/i })
    expect(await within(table).findByText('GB of Data / month', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(within(table).getByText('INR 10.00 per GB of Data / month')).toBeInTheDocument()
  })

  it('keeps the volume label generic when the rate card gives no unit of measure', async () => {
    installFakeApi(apiClient, masterRoutes({
      'GET /proposals/:id': () => fx.savedProposal(),
      'GET /proposals/:id/calculations/latest': () => fx.calculationResult(),
    }))
    renderPage('/calculator?proposalId=900')
    // Without a uom_name from the backend the label stays generic instead of assuming employees.
    expect(await screen.findByLabelText('Pack Quantity — Country Deployment Volume', {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('offers only service rates of the selected country', async () => {
    installFakeApi(apiClient, masterRoutes({
      'GET /proposals/:id': () => fx.savedProposal(),
      'GET /proposals/:id/calculations/latest': () => fx.calculationResult(),
    }))
    renderPage('/calculator?proposalId=900')
    fireEvent.click(await screen.findByRole('button', { name: /Add Service Line/i }))
    const rateSelect = screen.getByLabelText(/Service Rate/i)
    expect(within(rateSelect).getByRole('option', { name: /Implementation Consultant/ })).toBeInTheDocument()
    expect(within(rateSelect).queryByRole('option', { name: /US Architect/ })).not.toBeInTheDocument()
  })

  it('saves before calculating and shows the backend totals', async () => {
    const saved = fx.savedProposal()
    const api = installFakeApi(apiClient, masterRoutes({
      'GET /proposals/:id': () => saved,
      'GET /proposals/:id/calculations/latest': () => fx.calculationResult(),
      'GET /customers/:id': () => ({ id: 700, customer_tier_id: 7 }),
      'PATCH /proposals/:id': (body) => ({ id: 900, ...body }),
      // Lines saved before multi-region support are attached to their country block on save.
      'PATCH /proposals/:id/line-items/:lineId': (body) => body,
      'PATCH /proposals/:id/service-lines/:lineId': (body) => body,
    }))
    renderPage('/calculator?proposalId=900')
    await waitFor(() => expect(screen.getByLabelText(/Pack Selection/i)).toHaveValue('42'))
    const loads = api.calls.filter((c) => c.path === '/proposals/900/calculate/base').length

    fireEvent.click(screen.getByRole('button', { name: /Calculate Pricing/i }))
    await waitFor(() => expect(api.calls.filter((c) => c.path === '/proposals/900/calculate/base')).toHaveLength(loads + 1))

    const paths = api.calls.map((c) => `${c.method} ${c.path}`)
    expect(paths.lastIndexOf('PATCH /proposals/900')).toBeLessThan(paths.lastIndexOf('POST /proposals/900/calculate/base'))
    // The duration (2 years) is saved on the proposal in months; Page 4 never calls the discounted calculation.
    expect(api.calls.filter((c) => c.method === 'PATCH' && c.path === '/proposals/900').at(-1).body.contract_term_months).toBe(24)
    expect(api.calls.some((c) => c.path === '/proposals/900/calculate')).toBe(false)

    // Base figures (no discounts): 18,096.00 contract, 1,728.00 services; never the net 16,963.44.
    const strip = screen.getByRole('region', { name: /Commercial Master Summary/i })
    await waitFor(() => expect(within(strip).getAllByText(/18,096\.00/).length).toBeGreaterThan(0))
    expect(within(strip).getByText(/1,728\.00/)).toBeInTheDocument()
    expect(within(strip).queryByText(/16,963\.44/)).not.toBeInTheDocument()
  })

  it('does not crash when returning to Page 4 with existing country and families while masters load', async () => {
    installFakeApi(apiClient, masterRoutes())
    const initialProposal = {
      clientInfo: { proposalId: 900, clientName: 'Retail Co' },
      countryConfigs: [
        {
          id: 'cfg-country-1',
          countryId: 1,
          countryName: 'India',
          pricingTierId: 7,
          deploymentModelId: 11,
          pricingModelId: 12,
          headcount: 250,
          contractYears: 2,
          families: [
            {
              id: 'fam-cfg-1-1',
              familyId: 10,
              selectedPackId: 42,
              selectedFeatureIds: [32],
              featureHeadcounts: { 32: 100 },
            },
          ],
        },
      ],
    }
    renderPage('/calculator', initialProposal)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'India' })).toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText(/Pricing Model/i)).toHaveValue('12'))
  })

  it('displays a validation error message when a pricing model is missing after masters load', async () => {
    installFakeApi(apiClient, masterRoutes())
    const initialProposal = {
      clientInfo: { proposalId: 900, clientName: 'Retail Co' },
      countryConfigs: [
        {
          id: 'cfg-country-1',
          countryId: 1,
          countryName: 'India',
          pricingTierId: 7,
          deploymentModelId: 11,
          pricingModelId: null,
          headcount: 250,
          contractYears: 2,
          families: [],
        },
      ],
    }
    renderPage('/calculator', initialProposal)
    expect(await screen.findByText(/Pricing model is required to resolve rate cards\./i)).toBeInTheDocument()
  })
})

describe('CalculationModal', () => {
  it('shows base pricing (Page 4) with the duration in years and the engine warnings', () => {
    const result = fx.basePricingResult()
    result.snapshot_payload.warnings = ['Line items are not country-specific: Countries [2] were NOT priced separately.']
    render(
      <CalculationModal isOpen apiResult={{ status: 'success', data: result }} isLoading={false} onClose={() => {}} />,
    )
    expect(screen.getByTestId('fcv-label')).toHaveTextContent('Full Contract Value (USD, 2 years)')
    expect(screen.getByTestId('fcv-value')).toHaveTextContent('$18,096.00')
    expect(screen.getByText('Base pricing — before discounts')).toBeInTheDocument()
    expect(screen.queryByText(/Total \(Net\)/)).not.toBeInTheDocument()
    expect(screen.getByText(/Year 1 \(annual subscription \+ one-time services\)/)).toBeInTheDocument()
    expect(screen.queryByText(/ARR/)).not.toBeInTheDocument()
    expect(screen.getByText(/were NOT priced separately/)).toBeInTheDocument()
  })

  it('shows a saved (discounted) calculation as net figures', () => {
    render(
      <CalculationModal isOpen apiResult={{ status: 'success', data: fx.calculationResult() }} isLoading={false} onClose={() => {}} />,
    )
    expect(screen.getByTestId('fcv-label')).toHaveTextContent('Full Contract Value (USD, 2 years) — net')
    expect(screen.getByTestId('fcv-value')).toHaveTextContent('$16,963.44')
    expect(screen.getByText('Saved snapshot — discounts applied')).toBeInTheDocument()
  })

  it('shows the backend error message when calculation fails', () => {
    render(
      <CalculationModal
        isOpen
        apiResult={{ status: 'error', statusCode: 422, message: 'No saved rate card exists for Shared Cloud' }}
        isLoading={false}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/Calculation Engine Error \(HTTP 422\)/)).toBeInTheDocument()
    expect(screen.getByText(/No saved rate card exists/)).toBeInTheDocument()
  })
})
