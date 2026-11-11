import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import apiClient from '../api/client'
import { ProposalProvider } from '../context/ProposalContext'
import { ProposalSummaryPage } from '../features/proposals/ProposalSummaryPage'
import { installFakeApi } from './fixtures/fakeApi'
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
    ...overrides,
  }
}

function renderPage(url = '/proposals?proposalId=900') {
  return render(
    <ProposalProvider>
      <MemoryRouter initialEntries={[url]}>
        <ProposalSummaryPage />
      </MemoryRouter>
    </ProposalProvider>,
  )
}

describe('Page 6 — Proposal Summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_DEALDESK_USER_ID', '4')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('shows an empty state with a link to the configurator when nothing is open', () => {
    installFakeApi(apiClient, routes())
    renderPage('/proposals')
    expect(screen.getByText(/No Proposal Scope Configured/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Configure Proposal/i })).toHaveAttribute('href', '/calculator')
  })

  it('renders every priced line from the saved snapshot with native and reporting currency', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const table = await screen.findByRole('table', { name: /Detailed Proposal Commercial Summary/i })
    expect(within(table).getByText('TA Premium v2')).toBeInTheDocument()
    expect(within(table).getByText('Standalone Add-on')).toBeInTheDocument()
    expect(within(table).getByText('Implementation Consultant')).toBeInTheDocument()
    expect(within(table).getByText(/12 man-days × ₹12,000\.00\/day/)).toBeInTheDocument()
    // Native INR subtotal and the backend's USD conversion are both shown and labelled.
    expect(within(table).getByText(/Subtotal — TA Max \(INR\)/)).toBeInTheDocument()
    expect(within(table).getByText('₹14,13,620.00')).toBeInTheDocument()
    expect(within(table).getByText('Converted to USD')).toBeInTheDocument()
    expect(within(table).getByText(/INR → USD @ 0\.012/)).toBeInTheDocument()
    // Grand total = full contract value from the backend
    const grand = within(table).getByText('Grand Total (USD)').closest('tr')
    expect(within(grand).getByText('$16,963.44')).toBeInTheDocument()
    expect(within(grand).getByText('$1,555.20')).toBeInTheDocument()
  })

  it('labels the metric cards correctly (FCV vs year 1 vs services)', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const metrics = await screen.findByRole('region', { name: /High-Level Proposal Financial Metrics/i })
    await waitFor(() => expect(within(metrics).getByText('$16,963.44')).toBeInTheDocument())
    expect(within(metrics).getByText('Grand Total (FCV)')).toBeInTheDocument()
    expect(within(metrics).getByText(/Year 1: \$9,259\.32/)).toBeInTheDocument()
    expect(within(metrics).getByText('$7,704.12')).toBeInTheDocument()
    expect(within(metrics).getByText('$15,408.24')).toBeInTheDocument()
  })

  it('shows a message, not zeros, when the proposal has never been calculated', async () => {
    installFakeApi(apiClient, routes({
      'GET /proposals/:id/calculations/latest': () => {
        throw Object.assign(new Error('nf'), { response: { status: 404, data: { detail: 'No calculation snapshot found' } } })
      },
    }))
    renderPage()
    expect(await screen.findByText(/No calculation has been saved for this proposal yet/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Pending calculation/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })

  it('shows discount details from the snapshot when toggled', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    await screen.findByText('Standalone Add-on')
    expect(screen.queryByText(/Line discount 10%/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: /Show Discounts Toggle/i }))
    expect(screen.getByText(/Line discount 10% = −₹6,200\.00/)).toBeInTheDocument()
    expect(screen.getByText(/Overall subscription discount 5%/)).toBeInTheDocument()
  })

  it('flags an outdated snapshot and shows engine warnings', async () => {
    const result = fx.calculationResult({ is_stale: true })
    result.snapshot_payload.warnings = ['Countries [2] were NOT priced separately.']
    installFakeApi(apiClient, routes({ 'GET /proposals/:id/calculations/latest': () => result }))
    renderPage()
    expect(await screen.findByText(/Outdated calculation/i)).toBeInTheDocument()
    expect(screen.getByText(/were NOT priced separately/)).toBeInTheDocument()
    expect(screen.getByText(/Calculated \(outdated\)/)).toBeInTheDocument()
  })

  it('recalculates with the same discounts and term as the latest snapshot', async () => {
    const api = installFakeApi(apiClient, routes({
      'POST /proposals/:id/calculate': () => fx.calculationResult({ snapshot_id: 101 }),
    }))
    renderPage()
    await screen.findByText('Standalone Add-on')
    fireEvent.click(screen.getByRole('button', { name: /^Recalculate$/i }))
    await waitFor(() => expect(api.calls.some((c) => c.path === '/proposals/900/calculate')).toBe(true))
    expect(api.calls.find((c) => c.path === '/proposals/900/calculate').body).toEqual({
      product_subscription_discounts: { TA_MAX: 5 },
      product_service_discounts: { TA_MAX: 10 },
      contract_term_months: 24,
    })
  })

  it('saves the open proposal instead of creating a new one', async () => {
    const api = installFakeApi(apiClient, routes({
      'POST /rates/resolve': () => ({ uom_id: 13 }),
      'GET /customers/:id': () => ({ id: 700, customer_tier_id: 7 }),
      'PATCH /proposals/:id': (body) => ({ id: 900, ...body }),
      'PATCH /proposals/:id/line-items/:lineId': (body) => body,
      'PATCH /proposals/:id/service-lines/:lineId': (body) => body,
    }))
    renderPage()
    await screen.findByText('Standalone Add-on')
    fireEvent.click(screen.getAllByRole('button', { name: /Save Proposal/i })[0])
    fireEvent.click(await screen.findByRole('button', { name: /Confirm Save/i }))
    expect(await screen.findByText(/Proposal #900 saved/)).toBeInTheDocument()
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/proposals/')).toBe(false)
    expect(api.calls.some((c) => c.method === 'PATCH' && c.path === '/proposals/900')).toBe(true)
    // Lines saved before multi-region support are attached to their (primary) country block.
    expect(api.calls.filter((c) => c.method === 'PATCH' && c.path.startsWith('/proposals/900/line-items/'))
      .every((c) => c.body.proposal_country_id === 600)).toBe(true)
  })

  it('enables export buttons and triggers proposal export for docx and pdf', async () => {
    installFakeApi(apiClient, routes({
      'GET /proposals/:id/export': () => new Blob(['fake docx'], { type: 'application/vnd.openxmlformats' }),
    }))
    renderPage()
    await screen.findByText('Standalone Add-on')
    const exportBtn = screen.getByRole('button', { name: /Export Proposal/i })
    const pdfBtn = screen.getByRole('button', { name: /Export PDF/i })
    expect(exportBtn).toBeEnabled()
    expect(pdfBtn).toBeEnabled()
  })

  it('blocks export with clear validation message when proposal has zero commercial items', async () => {
    const emptyCalc = fx.calculationResult()
    emptyCalc.total_proposal_contract_reporting_currency = 0
    emptyCalc.total_proposal_annual_reporting_currency = 0
    emptyCalc.snapshot_payload = {
      ...emptyCalc.snapshot_payload,
      total_proposal_contract_reporting_currency: 0,
      total_proposal_annual_reporting_currency: 0,
      total_subscription_contract_reporting_currency: 0,
      total_subscription_annual_reporting_currency: 0,
      total_services_reporting_currency: 0,
      products: [],
      all_subscription_line_items: [],
      all_service_lines: [],
    }
    const api = installFakeApi(apiClient, routes({
      'GET /proposals/:id/calculations/latest': () => emptyCalc,
    }))
    renderPage()
    const exportBtn = await screen.findByRole('button', { name: /Export Proposal/i })
    fireEvent.click(exportBtn)
    expect(await screen.findByText(/at least one valid commercial item is required/i)).toBeInTheDocument()
    expect(api.calls.some((c) => c.path.includes('/export'))).toBe(false)
  })
})
