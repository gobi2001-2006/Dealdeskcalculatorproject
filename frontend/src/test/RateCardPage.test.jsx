import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import apiClient from '../api/client'
import { RateCardPage } from '../features/ratecard/RateCardPage'
import { installFakeApi, httpError } from './fixtures/fakeApi'
import * as fx from './fixtures/backendRecords'

vi.mock('../api/client')

// Page 3 fixture: PEPM with a locked unit of measure; tier ids deliberately out of list order.
const tiers = [
  { id: 7, code: 'T1', name: 'Enterprise', status: 'active' },
  { id: 3, code: 'T2', name: 'Growth', status: 'active' },
]
const pepm = { id: 14, code: 'pepm', name: 'PEPM', uom_locked_id: 15, status: 'active' }
const uoms = [
  { id: 15, code: 'employee', name: 'Active Employees (with ESS)' },
  { id: 13, code: 'candidate', name: 'Candidate' },
]
const rateCards = [
  { id: 801, rate_card_version_id: 1, country_id: 1, deployment_model_id: 11, pricing_model_id: 14, tier_id: 7, uom_id: 15, uom: uoms[0], pack_version_id: 42, feature_id: null, unit_rate: '80', fixed_fee: null, currency: fx.currencies[0] },
  { id: 802, rate_card_version_id: 1, country_id: 1, deployment_model_id: 11, pricing_model_id: 14, tier_id: 3, uom_id: 15, uom: uoms[0], pack_version_id: 42, feature_id: null, unit_rate: '70', fixed_fee: null, currency: fx.currencies[0] },
]

function routes(overrides = {}) {
  return {
    'GET /masters/countries': () => fx.countries,
    'GET /masters/customer-tiers': () => tiers,
    'GET /masters/deployment-models': () => fx.deployments,
    'GET /masters/pricing-models': () => [pepm],
    'GET /masters/deployment-pricing-options': () => [{ deployment_model_id: 11, pricing_model_id: 14 }],
    'GET /masters/currencies': () => fx.currencies,
    'GET /masters/fx-rates': () => [
      { id: 61, from_currency_id: 5, to_currency_id: 6, from_currency: fx.currencies[0], to_currency: fx.currencies[1], rate: '0.012', effective_date: '2026-01-01', rate_source: 'Pricing Desk' },
    ],
    'GET /masters/units-of-measure': () => uoms,
    'GET /rates/service-rates': () => fx.serviceRates,
    'GET /rates/versions': () => [{ id: 1, version_no: 'RC-1', status: 'active' }],
    'GET /rates/versions/active': () => ({ id: 1, version_no: 'RC-1', status: 'active' }),
    'GET /rates/rate-cards': () => rateCards,
    'GET /catalogue/families': () => fx.families,
    'GET /catalogue/products': () => fx.products,
    'GET /catalogue/features': () => fx.features,
    'GET /packs/': () => fx.packs,
    'POST /rates/rate-cards': (body) => ({ id: 900, ...body }),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/rate-cards']}>
      <RateCardPage />
    </MemoryRouter>,
  )
}

describe('Page 3 — Rate Card & Masters', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())

  it('shows the backend error and no demo rates when the backend is unavailable', async () => {
    const failing = Object.fromEntries(Object.keys(routes()).filter((k) => k.startsWith('GET')).map((k) => [k, () => { throw httpError(503, 'Database connection failed') }]))
    installFakeApi(apiClient, failing)
    renderPage()
    await waitFor(() => expect(screen.getByRole('complementary', { name: /Master Data Management/i })).toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByText(/Database connection failed|Network connection failed|unavailable/i).length).toBeGreaterThan(0))
    expect(screen.queryByText('Talent Acquisition Growth Suite')).not.toBeInTheDocument()
    expect(screen.queryByText('Enterprise Solution Architecture')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Commercial Pricing Model/i })).not.toHaveValue('PEPM')
  })

  it('renders saved pack rates per tier id with the rate card unit of measure', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const growth = await screen.findByLabelText(/TA Premium Tier 2 Rate/i)
    const enterprise = screen.getByLabelText(/TA Premium Tier 1 Rate/i)
    // Tier 1 column = tier id 7 (80), Tier 2 column = tier id 3 (70): mapped by id, not by position guess.
    expect(enterprise).toHaveValue(80)
    expect(growth).toHaveValue(70)
    expect(screen.getAllByText('Active Employees (with ESS)').length).toBeGreaterThan(0)
  })

  it('saves an edited cell against the exact tier, unit of measure and active pack version', async () => {
    const api = installFakeApi(apiClient, routes())
    renderPage()
    const growth = await screen.findByLabelText(/TA Premium Tier 2 Rate/i)
    vi.useFakeTimers()
    fireEvent.change(growth, { target: { value: '72.5' } })
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    vi.useRealTimers()
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST' && c.path === '/rates/rate-cards')).toBe(true))
    expect(api.calls.find((c) => c.method === 'POST' && c.path === '/rates/rate-cards').body).toEqual({
      rate_card_version_id: 1,
      country_id: 1,
      deployment_model_id: 11,
      pricing_model_id: 14,
      tier_id: 3,
      pack_version_id: 42,
      uom_id: 15,
      unit_rate: 72.5,
    })
  })

  it('does not save a cleared rate as a zero price', async () => {
    const api = installFakeApi(apiClient, routes())
    renderPage()
    const enterprise = await screen.findByLabelText(/TA Premium Tier 1 Rate/i)
    vi.useFakeTimers()
    fireEvent.change(enterprise, { target: { value: '' } })
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    vi.useRealTimers()
    await waitFor(() => expect(api.calls.some((c) => c.path === '/rates/rate-cards' && c.method === 'POST')).toBe(true))
    const body = api.calls.find((c) => c.path === '/rates/rate-cards' && c.method === 'POST').body
    expect(body).not.toHaveProperty('unit_rate', 0)
    expect(body.unit_rate).toBeUndefined()
  })

  it('lists saved FX rates with their recorded source', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const masters = await screen.findByRole('complementary', { name: /Master Data Management/i })
    await waitFor(() => expect(within(masters).getAllByText(/Pricing Desk/).length).toBeGreaterThan(0))
    expect(within(masters).queryByText(/Corporate Treasury/)).not.toBeInTheDocument()
  })

  it('switches deployment and pricing model from saved records only', async () => {
    installFakeApi(apiClient, routes())
    renderPage()
    const deployment = await screen.findByRole('combobox', { name: /Deployment Architecture/i })
    await waitFor(() => expect(deployment).toHaveValue('Shared Cloud'))
    const options = within(deployment).getAllByRole('option').map((o) => o.textContent)
    expect(options.some((t) => /Private Cloud|On-Premises/.test(t))).toBe(false)
    expect(screen.getByRole('combobox', { name: /Commercial Pricing Model/i })).toHaveValue('pepm')
  })
})
