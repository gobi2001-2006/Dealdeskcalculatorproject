import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import apiClient from '../api/client'
import {
  saveFullProposal,
  requestProposalCalculation,
  collectProposalErrors,
  ProposalInputError,
  discountsFromSnapshot,
} from '../api/proposalsApi'
import { deserializeBackendProposal } from '../features/calculator/calculatorData'
import { installFakeApi, httpError } from './fixtures/fakeApi'
import * as fx from './fixtures/backendRecords'

vi.mock('../api/client')

/** Configurator state for a new proposal built only from saved fixture ids. */
function newProposalState(overrides = {}) {
  return {
    clientInfo: {
      proposalId: null,
      clientName: 'Retail Co',
      customerId: null,
      dealId: null,
      dealCode: 'DEAL-RC-1',
      reportingCurrencyId: 6,
      reportingCurrency: 'USD',
      proposalCode: '',
    },
    countryConfigs: [
      {
        id: 'cfg-1',
        countryId: 1,
        countryName: 'India',
        pricingTierId: 7,
        deploymentModelId: 11,
        pricingModelId: 12,
        contractTerm: 24,
        headcount: 250,
        families: [
          { id: 'fam-1', familyId: 10, headcount: 100, selectedPackId: 42, selectedFeatureIds: [32], featureHeadcounts: {} },
        ],
        serviceLines: [{ id: 'srv-1', roleName: 'Implementation Consultant', serviceRateId: 50, hoursOrDays: 12 }],
      },
    ],
    ...overrides,
  }
}

/** Fake backend for a brand-new proposal (no matching customer/deal). */
function newProposalBackend(extra = {}) {
  let created = null
  return installFakeApi(apiClient, {
    'POST /rates/resolve': (body) => ({ rate_card_id: 1, uom_id: 13, currency_code: 'INR', ...body }),
    'GET /customers/': () => [],
    'POST /customers/': (body) => ({ id: 700, ...body }),
    'GET /deals/': () => [],
    'POST /deals/': (body) => ({ id: 800, ...body }),
    'POST /proposals/': (body) => {
      created = { id: 900, ...body, countries: [], versions: [{ id: 500, version_no: 1, status: 'draft', line_items: [], service_lines: [] }] }
      return created
    },
    'GET /proposals/:id': () => created,
    'POST /proposals/:id/countries': (body) => ({ id: 600, ...body }),
    'POST /proposals/:id/line-items': (body) => ({ id: 1000, ...body }),
    'POST /proposals/:id/service-lines': (body) => ({ id: 2000, ...body }),
    ...extra,
  })
}

describe('Proposal save workflow (saveFullProposal)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_DEALDESK_USER_ID', '4')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('lists every missing selection instead of guessing ids', () => {
    const errors = collectProposalErrors(
      { clientName: '', reportingCurrencyId: null },
      [{ countryId: 'c-in', pricingTierId: 'tier-1', deploymentModelId: null, pricingModelId: null, headcount: '', contractTerm: '', families: [], serviceLines: [] }],
    )
    expect(errors).toEqual(expect.arrayContaining([
      'Client name is required.',
      'Select a reporting currency.',
      'Country 1: select a country.',
      'Country 1: select a customer tier.',
      'Country 1: select a deployment model.',
      'Country 1: select a pricing model.',
    ]))
  })

  it('makes no API writes when the configuration is invalid', async () => {
    const api = newProposalBackend()
    const state = newProposalState()
    state.countryConfigs[0].pricingTierId = 'tier-1' // a demo id, not a saved record
    await expect(saveFullProposal(state)).rejects.toBeInstanceOf(ProposalInputError)
    expect(api.writes()).toEqual([])
  })

  it('requires the acting user to be configured (no hardcoded user id 1)', async () => {
    vi.stubEnv('VITE_DEALDESK_USER_ID', '')
    const api = newProposalBackend()
    await expect(saveFullProposal(newProposalState())).rejects.toThrow(/VITE_DEALDESK_USER_ID/)
    expect(api.writes()).toEqual([])
  })

  it('rejects different tiers per country, because the backend prices with the customer tier', () => {
    const state = newProposalState()
    state.countryConfigs.push({ ...state.countryConfigs[0], id: 'cfg-2', countryId: 2, pricingTierId: 3, families: [], serviceLines: [] })
    expect(collectProposalErrors(state.clientInfo, state.countryConfigs).join(' ')).toMatch(/same customer tier/)
  })

  it('creates the full proposal with saved ids, the rate card UoM and man-day effort', async () => {
    const api = newProposalBackend()
    const result = await saveFullProposal(newProposalState())
    expect(result.proposalId).toBe(900)

    const byPath = (method, path) => api.calls.filter((c) => c.method === method && c.path === path).map((c) => c.body)
    expect(byPath('POST', '/customers/')[0]).toMatchObject({ name: 'Retail Co', country_id: 1, customer_tier_id: 7, industry: null })
    expect(byPath('POST', '/deals/')[0]).toMatchObject({ code: 'DEAL-RC-1', customer_id: 700, owner_user_id: 4 })
    expect(byPath('POST', '/deals/')[0]).not.toHaveProperty('target_close_date')
    expect(byPath('POST', '/proposals/')[0]).toMatchObject({ deal_id: 800, customer_id: 700, currency_id: 6, created_by_user_id: 4 })
    expect(byPath('POST', '/proposals/900/countries')[0]).toEqual({
      country_id: 1, deployment_model_id: 11, pricing_model_id: 12, user_headcount: 250, is_primary_deployment: true,
    })
    // Lines: the UoM comes from the resolved rate card (13), never a hardcoded 1.
    expect(byPath('POST', '/proposals/900/line-items')).toEqual([
      { pack_version_id: 42, feature_id: null, uom_id: 13, quantity: 250 },
      { pack_version_id: null, feature_id: 32, uom_id: 13, quantity: 100 },
    ])
    // The rate is resolved for the primary block without a uom_id (the rate card supplies it).
    const resolveBodies = api.calls.filter((c) => c.path === '/rates/resolve').map((c) => c.body)
    expect(resolveBodies[0]).toEqual({ country_id: 1, deployment_model_id: 11, pricing_model_id: 12, tier_id: 7, pack_version_id: 42 })
    // Services: effort in man-days, no client-supplied rate or discount.
    expect(byPath('POST', '/proposals/900/service-lines')).toEqual([
      { role_name: 'Implementation Consultant', service_rate_id: 50, days_or_hours: 12 },
    ])
  })

  it('stops before any write when a selected line has no rate card', async () => {
    const api = newProposalBackend({
      'POST /rates/resolve': (body) => {
        if (body.feature_id === 32) throw httpError(404, 'No saved rate card exists for this country')
        return { uom_id: 13 }
      },
    })
    await expect(saveFullProposal(newProposalState())).rejects.toThrow(/feature 32: No saved rate card/)
    expect(api.writes()).toEqual([])
  })

  it('synchronises an existing proposal: updates changed values and removes what was deselected', async () => {
    const saved = fx.savedProposal()
    const api = installFakeApi(apiClient, {
      'POST /rates/resolve': () => ({ uom_id: 13 }),
      'GET /customers/:id': () => ({ id: 700, customer_tier_id: 7 }),
      'PATCH /proposals/:id': (body) => ({ id: 900, ...body }),
      'GET /proposals/:id': () => saved,
      'PATCH /proposals/:id/countries/:blockId': (body) => ({ id: 600, ...body }),
      'PATCH /proposals/:id/line-items/:lineId': (body) => body,
      'DELETE /proposals/:id/line-items/:lineId': () => ({}),
      'PATCH /proposals/:id/service-lines/:lineId': (body) => body,
      'DELETE /proposals/:id/service-lines/:lineId': () => null,
    })
    // Screen state loaded from the saved proposal, then edited.
    const restored = deserializeBackendProposal(saved, { masters: { packs: fx.packs, products: fx.products, countries: fx.countries } })
    const cfg = restored.countryConfigs[0]
    cfg.contractTerm = 24
    cfg.headcount = 300 // pack quantity and country headcount change
    cfg.families[0].selectedFeatureIds = [] // standalone feature removed
    cfg.serviceLines[0].hoursOrDays = 10

    await saveFullProposal({ clientInfo: restored.clientInfo, countryConfigs: restored.countryConfigs, existingProposalId: 900 })

    const writes = api.writes().map((c) => [c.method, c.path, c.body])
    expect(writes).toEqual(expect.arrayContaining([
      ['PATCH', '/proposals/900/countries/600', { user_headcount: 300 }],
      ['DELETE', '/proposals/900/line-items/1002', undefined],
      ['PATCH', '/proposals/900/line-items/1001', { quantity: 300 }],
      ['PATCH', '/proposals/900/service-lines/2001', { days_or_hours: 10 }],
    ]))
    // Nothing is created twice and the customer tier is unchanged.
    expect(writes.filter(([m, p]) => m === 'POST' && p.startsWith('/proposals/'))).toEqual([])
    expect(writes.find(([m, p]) => m === 'PATCH' && p === '/customers/700')).toBeUndefined()
  })
})

describe('Calculation request (requestProposalCalculation)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_DEALDESK_USER_ID', '4')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('saves the screen state first and sends the contract term from the configuration', async () => {
    const api = newProposalBackend({
      'POST /proposals/:id/calculate': (body) => ({ ...fx.calculationResult(), request: body }),
    })
    const res = await requestProposalCalculation({ proposalId: null, ...newProposalState() })
    expect(res.status).toBe('success')
    const order = api.writes().map((c) => c.path)
    expect(order.indexOf('/proposals/900/calculate')).toBeGreaterThan(order.indexOf('/proposals/900/line-items'))
    expect(api.calls.find((c) => c.path === '/proposals/900/calculate').body).toEqual({
      product_subscription_discounts: {},
      product_service_discounts: {},
      contract_term_months: 24,
    })
  })

  it('reports a backend pricing error instead of a result', async () => {
    newProposalBackend({
      'POST /proposals/:id/calculate': () => {
        throw httpError(422, 'No saved rate card exists for Shared Cloud + Platform Subscription in India for Tier 1.')
      },
    })
    const res = await requestProposalCalculation({ proposalId: null, ...newProposalState() })
    expect(res).toMatchObject({ status: 'error', statusCode: 422, data: null })
    expect(res.message).toMatch(/No saved rate card/)
  })

  it('keeps product discounts, and prices without them (flagged) only if the product set changed', async () => {
    const bodies = []
    newProposalBackend({
      'POST /proposals/:id/calculate': (body) => {
        bodies.push(body)
        if (Object.keys(body.product_subscription_discounts).length) {
          throw httpError(400, "Discount supplied for product code(s) not on this proposal: ['OLD']")
        }
        return fx.calculationResult()
      },
    })
    const res = await requestProposalCalculation({
      proposalId: null,
      ...newProposalState(),
      discounts: { product_subscription_discounts: { OLD: 5 }, product_service_discounts: {} },
    })
    expect(res).toMatchObject({ status: 'success', discountsDropped: true })
    expect(bodies.map((b) => b.product_subscription_discounts)).toEqual([{ OLD: 5 }, {}])
  })

  it('repeats the per-product discounts recorded in a snapshot', () => {
    expect(discountsFromSnapshot(fx.calculationResult())).toEqual({
      product_subscription_discounts: { TA_MAX: 5 },
      product_service_discounts: { TA_MAX: 10 },
    })
  })
})

describe('Reloading a saved proposal (deserializeBackendProposal)', () => {
  it('restores real ids, the product family, saved quantities and discounts without demo defaults', () => {
    const { clientInfo, countryConfigs, lineDiscountsByTarget } = deserializeBackendProposal(fx.savedProposal(), {
      masters: { packs: fx.packs, products: fx.products, countries: fx.countries },
      latestCalc: fx.calculationResult(),
    })
    expect(clientInfo).toMatchObject({ proposalId: 900, clientName: 'Retail Co', reportingCurrency: 'USD', reportingCurrencyId: 6 })
    const cfg = countryConfigs[0]
    expect(cfg).toMatchObject({
      backendId: 600, countryId: 1, countryName: 'India', currency: 'INR', pricingTierId: 7,
      deploymentModelId: 11, pricingModelId: 12, contractTerm: 24, headcount: 250,
    })
    expect(cfg.families).toHaveLength(1)
    expect(cfg.families[0]).toMatchObject({ familyId: 10, selectedPackId: 42, selectedFeatureIds: [32], featureHeadcounts: { 32: 100 } })
    expect(cfg.serviceLines[0]).toMatchObject({ backendId: 2001, serviceRateId: 50, hoursOrDays: 12 })
    expect(lineDiscountsByTarget).toEqual({ 'feature:32': 10 })
  })

  it('leaves the contract term empty when no calculation exists (no invented 36 months)', () => {
    const { countryConfigs } = deserializeBackendProposal(fx.savedProposal(), { masters: {} })
    expect(countryConfigs[0].contractTerm).toBe('')
  })
})
