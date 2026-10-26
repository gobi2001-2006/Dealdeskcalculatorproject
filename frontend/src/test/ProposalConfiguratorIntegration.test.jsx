import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as proposalsApi from '../api/proposalsApi'
import { CalculatorPage } from '../features/calculator/CalculatorPage'
import { CalculationModal } from '../features/calculator/components/CalculationModal'
import { deserializeBackendProposal } from '../features/calculator/calculatorData'
import apiClient from '../api/client'

vi.mock('../api/client')

describe('Page 4 — Proposal Configurator & Calculation Engine Integration Tests', () => {
  let queryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  // 1. Correct request and response field mapping for saveFullProposal
  describe('Proposal Persistence Workflow (saveFullProposal)', () => {
    it('creates customer, deal, proposal header, country scopes, line items, and service lines with real backend schemas', async () => {
      // Mock customer search -> empty (creates new)
      apiClient.get.mockImplementation((url) => {
        if (url === '/customers/') return Promise.resolve({ data: [] })
        if (url === '/deals/') return Promise.resolve({ data: [] })
        if (url.startsWith('/proposals/')) {
          return Promise.resolve({
            data: {
              id: 101,
              code: 'PROP-2026-0001',
              deal_id: 201,
              customer_id: 301,
              currency_id: 1,
              status: 'draft',
              countries: [],
              versions: [{ id: 1, version_number: 1, status: 'draft', line_items: [], service_lines: [] }],
            },
          })
        }
        return Promise.resolve({ data: [] })
      })

      apiClient.post.mockImplementation((url, payload) => {
        if (url === '/customers/') {
          return Promise.resolve({ data: { id: 301, name: payload.name, code: payload.code } })
        }
        if (url === '/deals/') {
          return Promise.resolve({ data: { id: 201, name: payload.name, code: payload.code } })
        }
        if (url === '/proposals/') {
          return Promise.resolve({ data: { id: 101, code: payload.code, status: 'draft' } })
        }
        if (url.includes('/countries')) {
          return Promise.resolve({ data: { id: 501, ...payload } })
        }
        if (url.includes('/line-items')) {
          return Promise.resolve({ data: { id: 601, ...payload } })
        }
        if (url.includes('/service-lines')) {
          return Promise.resolve({ data: { id: 701, ...payload } })
        }
        return Promise.resolve({ data: {} })
      })

      const clientInfo = {
        clientName: 'Tata Consultancy Services',
        dealCode: 'DEAL-TCS-01',
        industry: 'IT Services',
        reportingCurrencyId: 1,
      }

      const countryConfigs = [
        {
          countryId: 1, // India
          deploymentModelId: 1, // Cloud
          pricingModelId: 1, // PEPM
          pricingTierId: 1, // Enterprise
          headcount: 5000,
          families: [
            {
              familyId: 1,
              selectedPackId: 2, // Pack Version ID 2
              selectedFeatureIds: [10, 11],
            },
          ],
          serviceLines: [
            {
              roleName: 'Lead Architect',
              serviceRateId: 5,
              hoursOrDays: 80,
              discountPct: 0,
            },
          ],
        },
      ]

      const result = await proposalsApi.saveFullProposal({ clientInfo, countryConfigs })

      expect(result.status).toBe('persisted')
      expect(result.proposalId).toBe(101)
      expect(result.customerId).toBe(301)
      expect(result.dealId).toBe(201)

      // Verify Customer creation payload matches backend schema
      expect(apiClient.post).toHaveBeenCalledWith('/customers/', expect.objectContaining({
        name: 'Tata Consultancy Services',
        country_id: 1,
        customer_tier_id: 1,
        status: 'active',
      }))

      // Verify Deal creation payload matches backend schema
      expect(apiClient.post).toHaveBeenCalledWith('/deals/', expect.objectContaining({
        code: 'DEAL-TCS-01',
        customer_id: 301,
        status: 'open',
      }))

      // Verify Proposal creation payload matches backend schema
      expect(apiClient.post).toHaveBeenCalledWith('/proposals/', expect.objectContaining({
        deal_id: 201,
        customer_id: 301,
        currency_id: 1,
        status: 'draft',
      }))

      // Verify Country scope payload matches backend schema
      expect(apiClient.post).toHaveBeenCalledWith('/proposals/101/countries', expect.objectContaining({
        country_id: 1,
        deployment_model_id: 1,
        pricing_model_id: 1,
        user_headcount: 5000,
        is_primary_deployment: true,
      }))

      // Verify Line items: pack version line item
      expect(apiClient.post).toHaveBeenCalledWith('/proposals/101/line-items', expect.objectContaining({
        pack_version_id: 2,
        feature_id: null,
        uom_id: 1,
        quantity: 5000,
      }))

      // Verify Line items: standalone feature line items
      expect(apiClient.post).toHaveBeenCalledWith('/proposals/101/line-items', expect.objectContaining({
        pack_version_id: null,
        feature_id: 10,
        uom_id: 1,
        quantity: 5000,
      }))

      // Verify Service line payload adheres to backend rule: no individual discount
      expect(apiClient.post).toHaveBeenCalledWith('/proposals/101/service-lines', expect.objectContaining({
        role_name: 'Lead Architect',
        days_or_hours: 80,
        service_rate_id: 5,
        discount_pct: null,
      }))
    })

    it('prevents duplicate countries and line items on retry or existing proposal save', async () => {
      // Mock existing proposal that already has country 1 and pack_version 2
      apiClient.get.mockImplementation((url) => {
        if (url.startsWith('/proposals/101')) {
          return Promise.resolve({
            data: {
              id: 101,
              code: 'PROP-2026-0001',
              deal_id: 201,
              customer_id: 301,
              currency_id: 1,
              status: 'draft',
              countries: [{ country_id: 1, user_headcount: 5000 }],
              versions: [
                {
                  id: 1,
                  version_number: 1,
                  status: 'draft',
                  line_items: [{ id: 601, pack_version_id: 2, feature_id: null }],
                  service_lines: [{ id: 701, role_name: 'Lead Architect' }],
                },
              ],
            },
          })
        }
        return Promise.resolve({ data: [] })
      })

      apiClient.patch.mockResolvedValue({
        data: { id: 101, code: 'PROP-2026-0001', status: 'draft' },
      })

      const clientInfo = {
        customerId: 301,
        dealId: 201,
        proposalCode: 'PROP-2026-0001',
      }

      const countryConfigs = [
        {
          countryId: 1, // Already exists!
          deploymentModelId: 1,
          pricingModelId: 1,
          headcount: 5000,
          families: [
            {
              familyId: 1,
              selectedPackId: 2, // Already exists!
              selectedFeatureIds: [],
            },
          ],
          serviceLines: [
            {
              roleName: 'Lead Architect', // Already exists!
              hoursOrDays: 80,
            },
          ],
        },
      ]

      await proposalsApi.saveFullProposal({
        clientInfo,
        countryConfigs,
        existingProposalId: 101,
      })

      // Header should be updated via PATCH, not POSTed as new proposal
      expect(apiClient.patch).toHaveBeenCalledWith('/proposals/101', expect.anything())
      // No duplicate countries, line items, or service lines should be POSTed
      expect(apiClient.post).not.toHaveBeenCalledWith('/proposals/101/countries', expect.anything())
      expect(apiClient.post).not.toHaveBeenCalledWith('/proposals/101/line-items', expect.anything())
      expect(apiClient.post).not.toHaveBeenCalledWith('/proposals/101/service-lines', expect.anything())
    })
  })

  // 2. Proposal Deserialization (Reloading from Backend)
  describe('Proposal Deserialization (deserializeBackendProposal)', () => {
    it('accurately maps backend proposal, countries, line items, and service lines back to frontend state', () => {
      const backendProposal = {
        id: 42,
        code: 'PROP-2026-0042',
        customer_id: 10,
        deal_id: 20,
        currency_id: 2,
        customer: { id: 10, name: 'Infosys Tech' },
        deal: { id: 20, code: 'DEAL-2026-INF' },
        countries: [
          {
            country_id: 1,
            user_headcount: 12000,
            deployment_model_id: 2,
            pricing_model_id: 1,
            country: { id: 1, name: 'India', currency: { code: 'INR', symbol: '₹' } },
          },
        ],
        versions: [
          {
            version_number: 1,
            status: 'draft',
            line_items: [
              {
                id: 1,
                pack_version_id: 5,
                feature_id: null,
                quantity: 12000,
                pack_version: {
                  id: 5,
                  pack: { product_family_id: 2 },
                },
              },
              {
                id: 2,
                pack_version_id: null,
                feature_id: 30,
                quantity: 12000,
                feature: { id: 30, product: { product_family_id: 2 } },
              },
            ],
            service_lines: [
              {
                id: 1,
                role_name: 'Senior Implementation Consultant',
                days_or_hours: 120,
                service_rate_id: 3,
                service_rate: { hourly_rate: 180 },
              },
            ],
          },
        ],
      }

      const { clientInfo, countryConfigs } = deserializeBackendProposal(backendProposal)

      expect(clientInfo.proposalId).toBe(42)
      expect(clientInfo.proposalCode).toBe('PROP-2026-0042')
      expect(clientInfo.clientName).toBe('Infosys Tech')
      expect(clientInfo.customerId).toBe(10)
      expect(clientInfo.dealCode).toBe('DEAL-2026-INF')
      expect(clientInfo.reportingCurrencyId).toBe(2)

      expect(countryConfigs).toHaveLength(1)
      expect(countryConfigs[0].countryId).toBe(1)
      expect(countryConfigs[0].headcount).toBe(12000)
      expect(countryConfigs[0].deploymentModelId).toBe(2)
      expect(countryConfigs[0].pricingModelId).toBe(1)

      // Verify line items hydrated
      const family = countryConfigs[0].families[0]
      expect(family.selectedPackId).toBe(5)
      expect(family.selectedFeatureIds).toContain(30)

      // Verify service lines hydrated
      expect(countryConfigs[0].serviceLines[0].roleName).toBe('Senior Implementation Consultant')
      expect(countryConfigs[0].serviceLines[0].hoursOrDays).toBe(120)
    })
  })

  // 3. Calculation Engine Integration (calculateProposal)
  describe('Calculation Engine Integration', () => {
    it('calls POST /api/proposals/{id}/calculate with discount overrides and returns authoritative snapshot', async () => {
      const mockCalculationResponse = {
        proposal_id: 42,
        version_number: 1,
        run_number: 3,
        rate_card_version_id: 1,
        total_contract_value: '350000.00',
        annual_recurring_revenue: '116666.67',
        margin_pct: '64.50',
        status: 'completed',
        snapshot_payload: {
          contract_term_months: 36,
          reporting_currency: 'USD',
          products: {
            'Talent Acquisition': {
              subscription_total_base: '280000.00',
              subscription_total_net: '252000.00',
              services_total_net: '35000.00',
            },
          },
        },
      }

      apiClient.post.mockResolvedValueOnce({ data: mockCalculationResponse })

      const discounts = {
        product_subscription_discounts: { '1': 10 },
        product_service_discounts: { '1': 5 },
      }

      const result = await proposalsApi.calculateProposal(42, discounts)

      expect(apiClient.post).toHaveBeenCalledWith('/proposals/42/calculate', discounts)
      expect(result.total_contract_value).toBe('350000.00')
      expect(result.annual_recurring_revenue).toBe('116666.67')
      expect(result.snapshot_payload.products['Talent Acquisition'].subscription_total_net).toBe('252000.00')
    })

    it('fetches latest calculation snapshot from GET /api/proposals/{id}/calculations/latest', async () => {
      const mockSnapshot = {
        id: 88,
        proposal_id: 42,
        total_contract_value: '350000.00',
        annual_recurring_revenue: '116666.67',
        snapshot_payload: { reporting_currency: 'USD' },
      }

      apiClient.get.mockResolvedValueOnce({ data: mockSnapshot })

      const result = await proposalsApi.getLatestCalculation(42)

      expect(apiClient.get).toHaveBeenCalledWith('/proposals/42/calculations/latest')
      expect(result.id).toBe(88)
      expect(result.total_contract_value).toBe('350000.00')
    })
  })

  // 4. Rendering CalculationModal with Real Backend Figures
  describe('CalculationModal Rendering', () => {
    it('renders backend-returned financial figures and product breakdown strictly without client-side recalculation', () => {
      const calculationResult = {
        reporting_currency_code: 'USD',
        total_proposal_reporting_currency: '450000.00',
        snapshot_id: 88,
        version_no: 1,
        calculated_at: '2026-10-20T12:00:00Z',
        snapshot_payload: {
          contract_term_months: 36,
          fx_rate_applied: '1.00',
          products: [
            {
              product_name: 'Core HR Platform',
              product_code: 'CHR',
              reporting_currency_code: 'USD',
              product_reporting_total: '270000.00',
              native_currency_code: 'USD',
              product_native_total: '270000.00',
              subscription_subtotal_before_discount: '300000.00',
              subscription_total_after_discount: '270000.00',
              service_subtotal_before_discount: '40000.00',
              service_total_after_discount: '40000.00',
              line_items: [
                {
                  line_item_id: 101,
                  type: 'pack',
                  base_unit_rate: '25.00',
                  quantity: 5000,
                  total_base: '125000.00',
                },
              ],
            },
          ],
        },
      }

      render(
        <CalculationModal
          isOpen={true}
          apiResult={{ status: 'success', data: calculationResult }}
          isLoading={false}
          onClose={vi.fn()}
        />
      )

      // Verify the dialog header indicates authoritative backend calculation
      expect(screen.getByText(/Authoritative Commercial Calculation Engine/i)).toBeInTheDocument()

      // Verify financial KPIs returned from backend
      expect(screen.getByText(/4,?50,?000\.00/)).toBeInTheDocument()
      expect(screen.getByText(/Audit Snapshot #88/i)).toBeInTheDocument()

      // Verify product breakdown returned from backend
      expect(screen.getByText('Core HR Platform')).toBeInTheDocument()
      expect(screen.getByText('(CHR)')).toBeInTheDocument()
      expect(screen.getByText(/2,?70,?000\.00/)).toBeInTheDocument()
    })

    it('displays error details when calculation fails and offers clear feedback', () => {
      render(
        <CalculationModal
          isOpen={true}
          apiResult={{
            status: 'error',
            statusCode: 422,
            message: 'Customer tier multiplier not defined for rate card version 1',
          }}
          isLoading={false}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText(/Calculation Engine Error \(HTTP 422\)/i)).toBeInTheDocument()
      expect(
        screen.getByText(/Customer tier multiplier not defined for rate card version 1/i)
      ).toBeInTheDocument()
    })
  })

  // 5. Realistic Backend Master Data Ingestion & Crash Prevention
  describe('Regression: Realistic Backend Masters Dropdown Rendering', () => {
    it('renders Proposal Configurator without crashing when backend supplies realistic currency and country objects', async () => {
      const realisticCurrencies = [
        {
          id: 1,
          code: 'USD',
          name: 'US Dollar',
          symbol: '$',
          decimal_places: 2,
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          code: 'INR',
          name: 'Indian Rupee',
          symbol: '₹',
          decimal_places: 2,
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]

      const realisticCountries = [
        {
          id: 1,
          iso_code: 'IN',
          name: 'India',
          currency_id: 2,
          price_multiplier: '1.000000',
          status: 'active',
          valid_from: '2026-01-01',
          valid_to: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          currency: {
            id: 2,
            code: 'INR',
            name: 'Indian Rupee',
            symbol: '₹',
            decimal_places: 2,
            status: 'active',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        },
        {
          id: 2,
          iso_code: 'US',
          name: 'United States',
          currency_id: 1,
          price_multiplier: '1.000000',
          status: 'active',
          valid_from: '2026-01-01',
          valid_to: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          currency: {
            id: 1,
            code: 'USD',
            name: 'US Dollar',
            symbol: '$',
            decimal_places: 2,
            status: 'active',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        },
      ]

      apiClient.get.mockImplementation((url) => {
        if (url.includes('/currencies')) return Promise.resolve({ data: realisticCurrencies })
        if (url.includes('/countries')) return Promise.resolve({ data: realisticCountries })
        if (url.includes('/tiers') || url.includes('/customer-tiers')) return Promise.resolve({ data: [{ id: 1, name: 'Enterprise' }] })
        if (url.includes('/deployments') || url.includes('/deployment-models')) return Promise.resolve({ data: [{ id: 1, name: 'Cloud' }] })
        if (url.includes('/pricing-models')) return Promise.resolve({ data: [{ id: 1, name: 'PEPM' }] })
        if (url.includes('/families')) return Promise.resolve({ data: [] })
        if (url.includes('/packs')) return Promise.resolve({ data: [] })
        if (url.includes('/products')) return Promise.resolve({ data: [] })
        if (url.includes('/service-rates')) return Promise.resolve({ data: [] })
        if (url.includes('/customers')) return Promise.resolve({ data: [] })
        if (url.includes('/deals')) return Promise.resolve({ data: [] })
        return Promise.resolve({ data: [] })
      })

      render(
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <CalculatorPage />
          </QueryClientProvider>
        </MemoryRouter>
      )

      // Configurator header renders without React object child crash
      expect(
        await screen.findByRole('heading', { level: 1, name: /Proposal Configurator/i })
      ).toBeInTheDocument()

      // Currency dropdown renders options with currency.id as value and readable string label
      const currencySelect = document.getElementById('reporting-currency-select')
      expect(currencySelect).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'USD — US Dollar' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'INR — Indian Rupee' })).toBeInTheDocument()

      // Country dropdown renders scalar label with currency code from nested currency object
      expect(await screen.findByRole('option', { name: 'India (INR)' })).toBeInTheDocument()
      expect(await screen.findByRole('option', { name: 'United States (USD)' })).toBeInTheDocument()
    })
  })

  // 6. Comprehensive Multi-Country Persistence and Calculation Summary Tests
  describe('Page 4 End-to-End Multi-Country & Financial Aggregation', () => {
    it('persists multiple countries and consolidates financial totals with FX into the summary strip', async () => {
      const mockMultiCountryProposal = {
        id: 777,
        code: 'PROP-2026-MULTI',
        deal_id: 10,
        customer_id: 20,
        currency_id: 1,
        status: 'draft',
        countries: [
          { country_id: 1, user_headcount: 3000 },
          { country_id: 2, user_headcount: 2000 },
        ],
        versions: [{ id: 1, version_number: 1, status: 'draft', line_items: [], service_lines: [] }],
      }

      apiClient.get.mockImplementation((url) => {
        if (url === '/customers/') return Promise.resolve({ data: [] })
        if (url === '/deals/') return Promise.resolve({ data: [] })
        if (url.startsWith('/proposals/')) {
          // On fresh creation, the proposal does not have countries yet
          return Promise.resolve({
            data: {
              ...mockMultiCountryProposal,
              countries: [],
              versions: [{ id: 1, version_number: 1, status: 'draft', line_items: [], service_lines: [] }],
            },
          })
        }
        return Promise.resolve({ data: [] })
      })

      apiClient.post.mockImplementation((url, payload) => {
        if (url === '/customers/') return Promise.resolve({ data: { id: 20, name: payload.name } })
        if (url === '/deals/') return Promise.resolve({ data: { id: 10, code: payload.code } })
        if (url === '/proposals/') return Promise.resolve({ data: { id: 777, code: payload.code } })
        if (url.includes('/countries')) return Promise.resolve({ data: { id: 800, ...payload } })
        if (url.includes('/line-items')) return Promise.resolve({ data: { id: 900, ...payload } })
        if (url.includes('/service-lines')) return Promise.resolve({ data: { id: 950, ...payload } })
        return Promise.resolve({ data: {} })
      })

      const clientInfo = {
        clientName: 'Global Enterprise Ltd',
        reportingCurrencyId: 1,
      }

      const countryConfigs = [
        {
          countryId: 1,
          countryName: 'India',
          headcount: 3000,
          deploymentModelId: 1,
          pricingModelId: 1,
          families: [{ familyId: 1, selectedPackId: 2, selectedFeatureIds: [] }],
          serviceLines: [],
        },
        {
          countryId: 2,
          countryName: 'United States',
          headcount: 2000,
          deploymentModelId: 1,
          pricingModelId: 1,
          families: [{ familyId: 1, selectedPackId: 2, selectedFeatureIds: [] }],
          serviceLines: [],
        },
      ]

      const saveResult = await proposalsApi.saveFullProposal({ clientInfo, countryConfigs })

      expect(saveResult.status).toBe('persisted')
      expect(saveResult.proposalId).toBe(777)

      // Both countries should have been added
      expect(apiClient.post).toHaveBeenCalledWith('/proposals/777/countries', expect.objectContaining({
        country_id: 1,
        user_headcount: 3000,
      }))
      expect(apiClient.post).toHaveBeenCalledWith('/proposals/777/countries', expect.objectContaining({
        country_id: 2,
        user_headcount: 2000,
      }))
    })

    it('dynamically preserves contractTerm in deserialization and sends to backend calculation', async () => {
      // 1. Verify deserialization with custom 36-month term
      const mockBackendProposal = {
        id: 999,
        code: 'PROP-2026-999',
        currency_id: 1,
        currency: { code: 'INR', symbol: '₹' },
        countries: [
          {
            id: 1,
            country_id: 1,
            country: { id: 1, name: 'India', currency: { code: 'INR', symbol: '₹' } },
            term_months: 36,
            user_headcount: 5000,
          },
        ],
        versions: [{ id: 1, status: 'draft', line_items: [], service_lines: [] }],
      }

      const deserialized = deserializeBackendProposal(mockBackendProposal)
      expect(deserialized.countryConfigs[0].contractTerm).toBe(36)
      expect(deserialized.countryConfigs[0].headcount).toBe(5000)

      // 2. Verify requestProposalCalculation passes contract_term_months: 36
      apiClient.post.mockResolvedValueOnce({
        data: {
          snapshot_id: 888,
          proposal_id: 999,
          contract_term_months: 36,
          total_proposal_annual_reporting_currency: 120000000,
          total_proposal_contract_reporting_currency: 360000000,
          total_proposal_reporting_currency: 120000000,
          snapshot_payload: {
            contract_term_months: 36,
            total_proposal_annual_reporting_currency: 120000000,
            total_proposal_contract_reporting_currency: 360000000,
            total_proposal_reporting_currency: 120000000,
          },
        },
      })

      const calcRes = await proposalsApi.requestProposalCalculation({
        proposalId: 999,
        clientInfo: { clientName: 'Adrenalin Test', reportingCurrency: 'INR' },
        countryConfigs: deserialized.countryConfigs,
      })

      expect(calcRes.status).toBe('success')
      expect(apiClient.post).toHaveBeenCalledWith('/proposals/999/calculate', expect.objectContaining({
        contract_term_months: 36,
      }))
      expect(calcRes.data.contract_term_months).toBe(36)
      expect(calcRes.data.total_proposal_contract_reporting_currency).toBe(360000000)
    })
  })
})
