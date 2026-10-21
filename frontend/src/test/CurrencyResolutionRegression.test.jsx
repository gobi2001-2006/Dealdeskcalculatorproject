import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { saveFullProposal } from '../api/proposalsApi'
import { ClientConfigCard } from '../features/calculator/components/ClientConfigCard'
import { serializeProposalToBackendSchema } from '../features/calculator/calculatorData'
import apiClient from '../api/client'

vi.mock('../api/client')

describe('Currency Resolution & Absence of Hardcoded ID 1 Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('serializeProposalToBackendSchema does not fall back to 1 when reportingCurrencyId is missing', () => {
    const clientInfo = {
      clientName: 'Acme Global',
      reportingCurrency: 'USD',
      reportingCurrencyId: null, // Unset
    }

    const serialized = serializeProposalToBackendSchema(clientInfo, [], [], [])

    // Must be null, never hardcoded 1
    expect(serialized.proposal.reporting_currency_id).toBeNull()
  })

  it('ClientConfigCard automatically syncs reportingCurrencyId when live currencies load without user interaction', async () => {
    const liveCurrencies = [
      { id: 2, code: 'INR', name: 'Indian Rupee' },
      { id: 3, code: 'USD', name: 'US Dollar' },
    ]

    const onChangeClientInfo = vi.fn()
    const clientInfo = {
      clientName: 'Acme Global',
      dealName: 'Q4 Deal',
      reportingCurrency: 'USD',
      reportingCurrencyId: null, // Initially null
      pricingApproach: 'product_led',
      tier: 'standard',
      region: 'global',
    }

    render(
      <ClientConfigCard
        clientInfo={clientInfo}
        onChangeClientInfo={onChangeClientInfo}
        currencies={liveCurrencies}
      />
    )

    // The component effect should detect that USD matches currency ID 3 and trigger onChangeClientInfo with reportingCurrencyId: 3
    expect(onChangeClientInfo).toHaveBeenCalledWith('reportingCurrencyId', 3)
  })

  it('saveFullProposal dynamically resolves USD to ID 3 and countries to DB IDs without ID 1', async () => {
    const liveCurrencies = [
      { id: 2, code: 'INR', name: 'Indian Rupee' },
      { id: 3, code: 'USD', name: 'US Dollar' },
    ]
    const liveCountries = [
      { id: 2, code: 'IN', name: 'India' },
      { id: 3, code: 'US', name: 'United States' },
    ]

    let postedProposal = null
    let postedCountries = []

    apiClient.get.mockImplementation((url) => {
      if (url === '/currencies/') return Promise.resolve({ data: liveCurrencies })
      if (url === '/countries/') return Promise.resolve({ data: liveCountries })
      if (url === '/customers/') return Promise.resolve({ data: [{ id: 10, name: 'Acme Global' }] })
      if (url === '/deals/') return Promise.resolve({ data: [{ id: 20, name: 'Q4 Deal' }] })
      if (url.startsWith('/proposals/')) {
        return Promise.resolve({
          data: {
            id: 100,
            code: 'PROP-2026-TEST',
            deal_id: 20,
            customer_id: 10,
            currency_id: 3,
            status: 'draft',
            countries: [],
            versions: [{ id: 1, version_number: 1, status: 'draft', line_items: [], service_lines: [] }],
          },
        })
      }
      return Promise.resolve({ data: [] })
    })

    apiClient.post.mockImplementation((url, payload) => {
      if (url === '/proposals/') {
        postedProposal = payload
        return Promise.resolve({ data: { id: 100, code: payload.code, status: 'draft' } })
      }
      if (url.includes('/countries')) {
        postedCountries.push(payload)
        return Promise.resolve({ data: { id: 500 + postedCountries.length, ...payload } })
      }
      return Promise.resolve({ data: { id: 999 } })
    })

    const proposalState = {
      clientInfo: {
        clientName: 'Acme Global',
        dealName: 'Q4 Deal',
        reportingCurrency: 'USD',
        reportingCurrencyId: 3, // Real DB ID
      },
      countries: [
        {
          id: 'c-in',
          countryId: 2,
          code: 'IN',
          name: 'India',
          deploymentModel: 'cloud_saas',
          pricingModel: 'per_user',
          userHeadcount: 150,
          isPrimary: true,
        },
      ],
      products: [],
      services: [],
    }

    const masters = {
      currencies: liveCurrencies,
      countries: liveCountries,
    }

    await saveFullProposal({
      clientInfo: proposalState.clientInfo,
      countryConfigs: proposalState.countries,
      masters,
    })

    // Verify Proposal payload used currency_id = 3 (USD), NOT 1
    expect(postedProposal).not.toBeNull()
    expect(postedProposal.currency_id).toBe(3)
    expect(postedProposal.currency_id).not.toBe(1)

    // Verify Country payload used country_id = 2 (India), NOT 1
    expect(postedCountries.length).toBe(1)
    expect(postedCountries[0].country_id).toBe(2)
    expect(postedCountries[0].country_id).not.toBe(1)
  })

  it('saveFullProposal safely resolves missing currencyId from liveCurrencies by code', async () => {
    const liveCurrencies = [
      { id: 2, code: 'INR', name: 'Indian Rupee' },
      { id: 3, code: 'USD', name: 'US Dollar' },
    ]

    let postedProposal = null

    apiClient.get.mockImplementation((url) => {
      if (url === '/currencies/') return Promise.resolve({ data: liveCurrencies })
      if (url === '/countries/') return Promise.resolve({ data: [] })
      if (url === '/customers/') return Promise.resolve({ data: [{ id: 10, name: 'Acme Global' }] })
      if (url === '/deals/') return Promise.resolve({ data: [{ id: 20, name: 'Q4 Deal' }] })
      if (url.startsWith('/proposals/')) {
        return Promise.resolve({
          data: {
            id: 100,
            code: 'PROP-2026-TEST',
            deal_id: 20,
            customer_id: 10,
            currency_id: 2,
            status: 'draft',
            countries: [],
            versions: [{ id: 1, version_number: 1, status: 'draft', line_items: [], service_lines: [] }],
          },
        })
      }
      return Promise.resolve({ data: [] })
    })

    apiClient.post.mockImplementation((url, payload) => {
      if (url === '/proposals/') {
        postedProposal = payload
        return Promise.resolve({ data: { id: 100, code: payload.code, status: 'draft' } })
      }
      return Promise.resolve({ data: { id: 999 } })
    })

    const proposalState = {
      clientInfo: {
        clientName: 'Acme Global',
        dealName: 'Q4 Deal',
        reportingCurrency: 'INR', // INR code
        reportingCurrencyId: null, // Missing ID
      },
      countries: [],
      products: [],
      services: [],
    }

    const masters = {
      currencies: liveCurrencies,
      countries: [],
    }

    await saveFullProposal({
      clientInfo: proposalState.clientInfo,
      countryConfigs: proposalState.countries,
      masters,
    })

    // Dynamically resolved INR to 2
    expect(postedProposal.currency_id).toBe(2)
  })
})
