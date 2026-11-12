import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import apiClient from '../api/client'
import {
  saveFullProposal,
  requestBasePricing,
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
        contractYears: 2,
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
      [{ countryId: 'c-in', pricingTierId: 'tier-1', deploymentModelId: null, pricingModelId: null, headcount: '', contractYears: '', families: [], serviceLines: [] }],
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
      { proposal_country_id: 600, pack_version_id: 42, feature_id: null, uom_id: 13, quantity: 250 },
      { proposal_country_id: 600, pack_version_id: null, feature_id: 32, uom_id: 13, quantity: 100 },
    ])
    // The rate is resolved for the primary block without a uom_id (the rate card supplies it).
    const resolveBodies = api.calls.filter((c) => c.path === '/rates/resolve').map((c) => c.body)
    expect(resolveBodies[0]).toEqual({ country_id: 1, deployment_model_id: 11, pricing_model_id: 12, tier_id: 7, pack_version_id: 42 })
    // Services: effort in man-days, no client-supplied rate or discount.
    expect(byPath('POST', '/proposals/900/service-lines')).toEqual([
      { role_name: 'Implementation Consultant', service_rate_id: 50, days_or_hours: 12, proposal_country_id: 600 },
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

  it('saves a multi-region proposal: each country resolves its own rate card and owns its lines', async () => {
    const api = newProposalBackend({
      'POST /proposals/:id/countries': (body) => ({ id: body.country_id === 1 ? 600 : 601, ...body }),
    })
    const state = newProposalState()
    state.countryConfigs.push({
      ...state.countryConfigs[0],
      id: 'cfg-2',
      countryId: 2,
      countryName: 'United States',
      deploymentModelId: 21,
      pricingModelId: 22,
      headcount: 1000,
      families: [{ id: 'fam-2', familyId: 10, headcount: 1000, selectedPackId: 42, selectedFeatureIds: [], featureHeadcounts: {} }],
      serviceLines: [{ id: 'srv-2', roleName: 'US Consultant', serviceRateId: 51, hoursOrDays: 2 }],
    })
    // The same pack in two countries is allowed (it is priced once per country).
    expect(collectProposalErrors(state.clientInfo, state.countryConfigs)).toEqual([])

    await saveFullProposal(state)

    const resolves = api.calls.filter((c) => c.path === '/rates/resolve').map((c) => c.body)
    expect(resolves).toEqual(expect.arrayContaining([
      expect.objectContaining({ country_id: 1, deployment_model_id: 11, pricing_model_id: 12, pack_version_id: 42 }),
      expect.objectContaining({ country_id: 2, deployment_model_id: 21, pricing_model_id: 22, pack_version_id: 42 }),
    ]))
    const lines = api.calls.filter((c) => c.method === 'POST' && c.path === '/proposals/900/line-items').map((c) => c.body)
    expect(lines).toEqual(expect.arrayContaining([
      { proposal_country_id: 600, pack_version_id: 42, feature_id: null, uom_id: 13, quantity: 250 },
      { proposal_country_id: 601, pack_version_id: 42, feature_id: null, uom_id: 13, quantity: 1000 },
    ]))
    const services = api.calls.filter((c) => c.method === 'POST' && c.path === '/proposals/900/service-lines').map((c) => c.body)
    expect(services).toEqual([
      { role_name: 'Implementation Consultant', service_rate_id: 50, days_or_hours: 12, proposal_country_id: 600 },
      { role_name: 'US Consultant', service_rate_id: 51, days_or_hours: 2, proposal_country_id: 601 },
    ])
  })

  it('still rejects the same pack twice in one country', () => {
    const state = newProposalState()
    state.countryConfigs[0].families.push({ id: 'fam-x', familyId: 11, headcount: 1, selectedPackId: 42, selectedFeatureIds: [], featureHeadcounts: {} })
    expect(collectProposalErrors(state.clientInfo, state.countryConfigs).join(' ')).toMatch(/more than once in one country/)
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
    cfg.contractYears = 2
    cfg.headcount = 300 // pack quantity and country headcount change
    cfg.families[0].selectedFeatureIds = [] // standalone feature removed
    cfg.serviceLines[0].hoursOrDays = 10

    await saveFullProposal({ clientInfo: restored.clientInfo, countryConfigs: restored.countryConfigs, existingProposalId: 900 })

    const writes = api.writes().map((c) => [c.method, c.path, c.body])
    expect(writes).toEqual(expect.arrayContaining([
      ['PATCH', '/proposals/900/countries/600', { user_headcount: 300 }],
      ['DELETE', '/proposals/900/line-items/1002', undefined],
      // Lines saved before multi-region support are attached to their (primary) country block.
      ['PATCH', '/proposals/900/line-items/1001', { quantity: 300, proposal_country_id: 600 }],
      ['PATCH', '/proposals/900/service-lines/2001', { days_or_hours: 10, proposal_country_id: 600 }],
    ]))
    // Nothing is created twice and the customer tier is unchanged.
    expect(writes.filter(([m, p]) => m === 'POST' && p.startsWith('/proposals/'))).toEqual([])
    expect(writes.find(([m, p]) => m === 'PATCH' && p === '/customers/700')).toBeUndefined()
  })
})

describe('Page 4 base pricing (requestBasePricing)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_DEALDESK_USER_ID', '4')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('saves the screen state (duration in months on the proposal), then prices at base level without discounts', async () => {
    const api = newProposalBackend({
      'POST /proposals/:id/calculate/base': (body) => ({ ...fx.basePricingResult(), request: body }),
    })
    const res = await requestBasePricing({ proposalId: null, ...newProposalState() })
    expect(res.status).toBe('success')
    expect(res.data.pricing_stage).toBe('base')
    // 2 years on screen -> 24 months stored on the proposal
    expect(api.calls.find((c) => c.method === 'POST' && c.path === '/proposals/').body.contract_term_months).toBe(24)
    const order = api.writes().map((c) => c.path)
    expect(order.indexOf('/proposals/900/calculate/base')).toBeGreaterThan(order.indexOf('/proposals/900/line-items'))
    // Base pricing sends no discounts, and the discounted (snapshot-writing) calculation is never called.
    expect(api.calls.find((c) => c.path === '/proposals/900/calculate/base').body).toEqual({})
    expect(api.calls.some((c) => c.path === '/proposals/900/calculate')).toBe(false)
  })

  it('reports a backend pricing error instead of a result', async () => {
    newProposalBackend({
      'POST /proposals/:id/calculate/base': () => {
        throw httpError(422, 'No saved rate card exists for Shared Cloud + Platform Subscription in India for Tier 1.')
      },
    })
    const res = await requestBasePricing({ proposalId: null, ...newProposalState() })
    expect(res).toMatchObject({ status: 'error', statusCode: 422, data: null })
    expect(res.message).toMatch(/No saved rate card/)
  })

  it('rejects a duration that is not a whole number of years before writing anything', async () => {
    const api = newProposalBackend({})
    const state = newProposalState()
    state.countryConfigs[0].contractYears = 1.5
    const res = await requestBasePricing({ proposalId: null, ...state })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/whole number of years/)
    expect(api.writes()).toEqual([])
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
      deploymentModelId: 11, pricingModelId: 12, contractYears: 2, headcount: 250,
    })
    expect(cfg.families).toHaveLength(1)
    expect(cfg.families[0]).toMatchObject({ familyId: 10, selectedPackId: 42, selectedFeatureIds: [32], featureHeadcounts: { 32: 100 } })
    expect(cfg.serviceLines[0]).toMatchObject({ backendId: 2001, serviceRateId: 50, hoursOrDays: 12 })
    expect(lineDiscountsByTarget).toEqual({ '1|feature:32': 10 }) // country 1 + feature 32
  })

  it('leaves the contract duration empty when nothing is saved (no invented default)', () => {
    const { countryConfigs } = deserializeBackendProposal(fx.savedProposal(), { masters: {} })
    expect(countryConfigs[0].contractYears).toBe('')
  })

  it('shows the duration saved on the proposal in years, ahead of the latest snapshot', () => {
    const { countryConfigs } = deserializeBackendProposal(fx.savedProposal({ contract_term_months: 60 }), {
      masters: {},
      latestCalc: fx.calculationResult(), // priced with 24 months
    })
    expect(countryConfigs[0].contractYears).toBe(5)
  })
})
