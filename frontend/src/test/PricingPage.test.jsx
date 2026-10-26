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
    ...overrides,
  }
}

function renderPage(url = '/pricing-discounts?proposalId=900') {
  return render(
    <ProposalProvider>
      <MemoryRouter initialEntries={[url]}>
        <PricingPage />
      </MemoryRouter>
    </ProposalProvider>,
  )
}

describe('Page 5 — Pricing & Discounts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the six-page navigation with Pricing & Discounts active', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const link = screen.getByRole('link', { name: /Pricing & Discounts/i })
    expect(link).toHaveClass('border-orange-500')
    expect(link.getAttribute('href')).toBe('/pricing-discounts')
    for (const name of [/Product Catalog/i, /Pack Builder/i, /Rate Card & Masters/i, /Proposal Configurator/i, /Proposal Summary/i]) {
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
    expect(within(table).getAllByText('₹620,000.00')).toHaveLength(2) // gross and net (no line discount)
    expect(within(table).getByText('₹55,800.00')).toBeInTheDocument()
    // Saved line discount (10%) restored from the line item; overall/service from the snapshot
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

  it('saves a line discount on the line item, then recalculates with product-level discounts', async () => {
    const api = installFakeApi(apiClient, routes({
      'PATCH /proposals/:id/line-items/:lineId': (body) => body,
      'POST /proposals/:id/calculate': () => fx.calculationResult({ snapshot_id: 99 }),
    }))
    renderPage()
    const packDiscount = await screen.findByLabelText('Discount for TA Premium')
    fireEvent.change(packDiscount, { target: { value: '12.5' } })
    fireEvent.change(screen.getByLabelText('Overall subscription discount'), { target: { value: '7' } })

    fireEvent.click(screen.getByRole('button', { name: /Save Discounts & Recalculate/i }))
    expect(await screen.findByText(/Discounts saved and proposal recalculated \(snapshot #99\)/)).toBeInTheDocument()

    const patch = api.calls.find((c) => c.method === 'PATCH')
    expect(patch).toMatchObject({ path: '/proposals/900/line-items/1001', body: { discount_pct: 12.5 } })
    // The unchanged saved discount (10% on line 1002) is not rewritten.
    expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1)
    const calc = api.calls.find((c) => c.path === '/proposals/900/calculate')
    expect(calc.body).toEqual({
      product_subscription_discounts: { TA_MAX: 7 },
      product_service_discounts: { TA_MAX: 10 },
      contract_term_months: 24,
    })
  })

  it('shows the backend error when recalculation is rejected', async () => {
    installFakeApi(apiClient, routes({
      'PATCH /proposals/:id/line-items/:lineId': (body) => body,
      'POST /proposals/:id/calculate': () => {
        throw httpError(400, 'Product subscription discount % for TA_MAX must be between 0 and 100, got 101')
      },
    }))
    renderPage()
    await screen.findByLabelText('Discount for TA Premium')
    fireEvent.click(screen.getByRole('button', { name: /Save Discounts & Recalculate/i }))
    expect(await screen.findByText(/must be between 0 and 100, got 101/)).toBeInTheDocument()
  })

  it('shows reporting-currency totals from the backend and flags an outdated snapshot', async () => {
    installFakeApi(apiClient, routes({
      'GET /proposals/:id/calculations/latest': () => fx.calculationResult({ is_stale: true }),
    }))
    renderPage()
    const card = await screen.findByRole('region', { name: /Commercial Summary and Financial Metrics/i })
    await waitFor(() => expect(within(card).getByText('$16,963.44')).toBeInTheDocument())
    expect(within(card).getByText('$1,555.20')).toBeInTheDocument()
    expect(screen.getByText(/Outdated calculation/i)).toBeInTheDocument()
    expect(within(card).getByText(/Not calculated \(no cost-rate engine yet\)/)).toBeInTheDocument()
  })

  it('labels approval thresholds as demo settings that are not enforced', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const policiesCard = await screen.findByRole('region', { name: /Approval Governance Policies/i })
    expect(within(policiesCard).getByText('Demo settings — not enforced')).toBeInTheDocument()
  })
})
