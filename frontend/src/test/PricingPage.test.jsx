import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import apiClient from '../api/client'
import { ProposalProvider } from '../context/ProposalContext'
import { PricingPage } from '../features/pricing/PricingPage'
import { installFakeApi, httpError } from './fixtures/fakeApi'
import * as fx from './fixtures/backendRecords'

vi.mock('../api/client')

function routes(overrides = {}) {
  return {
    'GET /catalogue/families': () => fx.families,
    'GET /catalogue/products': () => fx.products,
    'GET /catalogue/features': () => fx.features,
    'GET /packs/': () => fx.packs,
    'GET /masters/countries': () => fx.countries,
    'GET /proposals/:id': () => fx.savedProposal(),
    'GET /proposals/:id/calculations/latest': () => fx.calculationResult(),
    'GET /masters/approval-thresholds': () => [],
    ...overrides,
  }
}

function renderPage(url = '/pricing-discounts?proposalId=900', initialProposal = undefined) {
  return render(
    <ProposalProvider initialProposal={initialProposal}>
      <MemoryRouter initialEntries={[url]}>
        <PricingPage />
      </MemoryRouter>
    </ProposalProvider>,
  )
}

describe('Page 5 — Pricing & Discounts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the navigation with Pricing & Discounts active under Proposal', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const link = screen.getByRole('link', { name: 'Pricing & Discounts' })
    expect(link).toHaveClass('border-orange-500')
    expect(link.getAttribute('href')).toBe('/pricing-discounts')
    for (const name of ['Masters', 'Proposal', 'Approvals', 'Admin', 'Proposal Configurator', 'Proposal Summary']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('explains that a saved proposal is needed when none is open', async () => {
    installFakeApi(apiClient, routes())
    renderPage('/pricing-discounts')
    expect(await screen.findByText(/No saved proposal is open/i)).toBeInTheDocument()
  })

  it('shows the saved lines with catalogue names, backend amounts and the saved line discount', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const table = await screen.findByRole('table', { name: /Talent Acquisition line items/i })
    expect(within(table).getByText('TA Premium')).toBeInTheDocument()
    expect(within(table).getByText('Standalone Add-on')).toBeInTheDocument()
    // Native-currency amounts straight from the snapshot
    expect(within(table).getAllByText(/₹6,?20,000\.00/)).toHaveLength(2) // gross and net (no line discount)
    expect(within(table).getByText('₹55,800.00')).toBeInTheDocument()
    // Saved line discount (10%) restored from the line item; overall/service from the (older) snapshot,
    // since this country block has none stored yet
    expect(screen.getByLabelText('Discount for Standalone Add-on')).toHaveValue(10)
    expect(screen.getByLabelText('Overall subscription discount')).toHaveValue(5)
    expect(screen.getByLabelText('Overall services discount')).toHaveValue(10)
    // Percentage only: no fixed-amount toggle
    expect(screen.queryByRole('button', { name: /Fixed amount discount/i })).not.toBeInTheDocument()
  })

  it('validates discounts between 0% and 100%', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const input = await screen.findByLabelText('Discount for TA Premium')
    fireEvent.change(input, { target: { value: '150' } })
    expect(await screen.findByText(/between 0% and 100%/)).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '-5' } })
    expect(screen.getByText(/between 0% and 100%/)).toBeInTheDocument()
  })

  it("saves line discounts and the country's overall discounts, then recalculates", async () => {
    const api = installFakeApi(apiClient, routes({
      'PATCH /proposals/:id/line-items/:lineId': (body) => body,
      'PATCH /proposals/:id/countries/:blockId': (body) => body,
      'POST /proposals/:id/calculate': () => fx.calculationResult({ snapshot_id: 99 }),
    }))
    renderPage()
    const packDiscount = await screen.findByLabelText('Discount for TA Premium')
    fireEvent.change(packDiscount, { target: { value: '12.5' } })
    fireEvent.change(screen.getByLabelText('Overall subscription discount'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Overall subscription discount reason'), { target: { value: 'Strategic logo' } })

    fireEvent.click(screen.getByRole('button', { name: /Save Discounts & Recalculate/i }))
    expect(await screen.findByText(/Discounts saved and proposal recalculated \(snapshot #99\)/)).toBeInTheDocument()

    const linePatches = api.calls.filter((c) => c.method === 'PATCH' && c.path.includes('/line-items/'))
    expect(linePatches).toEqual([expect.objectContaining({ path: '/proposals/900/line-items/1001', body: { discount_pct: 12.5 } })])
    // The overall discounts are stored on the country block (the 10% services discount of the older
    // snapshot is carried over), with the justification.
    const countryPatches = api.calls.filter((c) => c.method === 'PATCH' && c.path.includes('/countries/'))
    expect(countryPatches).toEqual([
      expect.objectContaining({
        path: '/proposals/900/countries/600',
        body: { subscription_discount_pct: 7, subscription_discount_reason: 'Strategic logo', service_discount_pct: 10 },
      }),
    ])
    // The backend reads the discounts from the proposal: nothing product-level is sent.
    const calc = api.calls.find((c) => c.path === '/proposals/900/calculate')
    expect(calc.body).toEqual({ contract_term_months: 24 })
  })

  it("restores each country's stored overall discount and justification", async () => {
    installFakeApi(apiClient, routes({
      'GET /proposals/:id': () => fx.savedProposal({
        countries: [{
          id: 600, proposal_id: 900, country_id: 1, deployment_model_id: 11, pricing_model_id: 12, user_headcount: 250,
          is_primary_deployment: true, subscription_discount_pct: '8.5000', subscription_discount_reason: 'Volume commitment',
          service_discount_pct: null, service_discount_reason: null,
        }],
      }),
    }))
    renderPage()
    expect(await screen.findByLabelText('Overall subscription discount')).toHaveValue(8.5)
    expect(screen.getByLabelText('Overall subscription discount reason')).toHaveValue('Volume commitment')
    // Nothing stored for services: the % the last calculation used is shown (older snapshot).
    expect(screen.getByLabelText('Overall services discount')).toHaveValue(10)
  })

  it('keeps a separate overall discount for each country', async () => {
    const api = installFakeApi(apiClient, routes({
      'GET /proposals/:id': () => fx.savedProposal({
        countries: [
          { id: 600, proposal_id: 900, country_id: 1, deployment_model_id: 11, pricing_model_id: 12, user_headcount: 250,
            is_primary_deployment: true, subscription_discount_pct: '6', service_discount_pct: '10' },
          { id: 601, proposal_id: 900, country_id: 2, deployment_model_id: 11, pricing_model_id: 12, user_headcount: 40,
            is_primary_deployment: false, subscription_discount_pct: '3', service_discount_pct: null },
        ],
      }),
      'PATCH /proposals/:id/countries/:blockId': (body) => body,
      'POST /proposals/:id/calculate': () => fx.calculationResult({ snapshot_id: 77 }),
    }))
    renderPage()
    expect(await screen.findByLabelText('Overall subscription discount')).toHaveValue(6) // India (primary)
    expect(screen.getByText(/Overall Subscription Discount — India/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /United States/ }))
    expect(await screen.findByText(/Overall Subscription Discount — United States/)).toBeInTheDocument()
    const usInput = screen.getByLabelText('Overall subscription discount')
    expect(usInput).toHaveValue(3)
    fireEvent.change(usInput, { target: { value: '4' } })

    fireEvent.click(screen.getByRole('button', { name: /India/ }))
    expect(await screen.findByText(/Overall Subscription Discount — India/)).toBeInTheDocument()
    expect(screen.getByLabelText('Overall subscription discount')).toHaveValue(6) // unchanged by the US edit

    fireEvent.click(screen.getByRole('button', { name: /Save Discounts & Recalculate/i }))
    expect(await screen.findByText(/snapshot #77/)).toBeInTheDocument()
    const countryPatches = api.calls.filter((c) => c.method === 'PATCH' && c.path.includes('/countries/'))
    expect(countryPatches).toEqual([
      expect.objectContaining({ path: '/proposals/900/countries/601', body: { subscription_discount_pct: 4 } }),
    ])
  })

  it('shows the backend error when recalculation is rejected', async () => {
    installFakeApi(apiClient, routes({
      'PATCH /proposals/:id/line-items/:lineId': (body) => body,
      'PATCH /proposals/:id/countries/:blockId': (body) => body,
      'POST /proposals/:id/calculate': () => {
        throw httpError(400, 'Product subscription discount % for TA_MAX must be between 0 and 100, got 101')
      },
    }))
    renderPage()
    await screen.findByLabelText('Discount for TA Premium')
    fireEvent.click(screen.getByRole('button', { name: /Save Discounts & Recalculate/i }))
    expect(await screen.findByText(/must be between 0 and 100, got 101/)).toBeInTheDocument()
  })

  // State left in the shared context by another proposal (#800) must never reach proposal #900.
  const otherProposalState = {
    clientInfo: { proposalId: 800, clientName: 'Other Co' },
    lineItemDiscounts: { '1|pack:42': { value: '30', reason: 'belongs to #800' } },
    overallDiscounts: { 1: { value: '25', reason: 'belongs to #800' } },
    serviceDiscounts: { 1: { value: '15', reason: 'belongs to #800' } },
  }

  it('does not show another proposal’s discounts', async () => {
    installFakeApi(apiClient, routes({
      'GET /proposals/:id/calculations/latest': () => {
        throw httpError(404, 'No calculation snapshot found')
      },
    }))
    renderPage('/pricing-discounts?proposalId=900', otherProposalState)
    const pack = await screen.findByLabelText('Discount for TA Premium')
    await waitFor(() => expect(screen.getByLabelText('Overall subscription discount')).toHaveValue(null))
    expect(pack).toHaveValue(null)
    expect(screen.getByLabelText('Discount for TA Premium reason')).toHaveValue('')
    expect(screen.getByLabelText('Overall subscription discount reason')).toHaveValue('')
    expect(screen.getByLabelText('Discount for Standalone Add-on')).toHaveValue(10) // #900's own saved line discount
  })

  it('blocks saving when this proposal’s discounts did not load', async () => {
    const api = installFakeApi(apiClient, routes({
      'GET /proposals/:id': () => {
        throw httpError(500, 'Database unavailable')
      },
    }))
    renderPage('/pricing-discounts?proposalId=900', {
      ...otherProposalState,
      countryConfigs: [{ id: 'cfg-800', countryId: 1, countryName: 'India', contractYears: 2, families: [], serviceLines: [] }],
    })
    expect(await screen.findByText(/Could not load proposal #900/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Save Discounts & Recalculate/i }))
    expect(await screen.findByText(/saved discounts of proposal #900 have not loaded/)).toBeInTheDocument()
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([])
  })

  it('shows reporting-currency totals from the backend and flags an outdated snapshot', async () => {
    installFakeApi(apiClient, routes({
      'GET /proposals/:id/calculations/latest': () => fx.calculationResult({ is_stale: true }),
    }))
    renderPage()
    const card = await screen.findByRole('region', { name: /Commercial Summary and Financial Metrics/i })
    await waitFor(() => expect(within(card).getByText('$16,963.44')).toBeInTheDocument())
    expect(within(card).getByText('$1,555.20')).toBeInTheDocument()
    expect(within(card).getByText(/Outdated/i)).toBeInTheDocument()
    expect(within(card).getByText(/Not available|Not calculated/)).toBeInTheDocument()
  })

  it('shows no invented approval thresholds when none are configured', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const policiesCard = await screen.findByRole('region', { name: /Approval Governance Policies/i })
    expect(within(policiesCard).getByText('Not enforced yet')).toBeInTheDocument()
    await waitFor(() => expect(within(policiesCard).getAllByText('Not configured')).toHaveLength(4))
    expect(within(policiesCard).queryByText(/%$/)).not.toBeInTheDocument()
  })

  it('shows the approval thresholds stored in the database', async () => {
    installFakeApi(apiClient, routes({
      'GET /masters/approval-thresholds': () => [
        { id: 1, threshold_type: 'overall_discount', value_pct: '12.5000', region: null, status: 'active' },
      ],
    }))
    renderPage()
    const policiesCard = await screen.findByRole('region', { name: /Approval Governance Policies/i })
    expect(await within(policiesCard).findByText('12.5%')).toBeInTheDocument()
    expect(within(policiesCard).getAllByText('Not configured')).toHaveLength(3)
  })
})
