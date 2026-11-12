import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import apiClient from '../api/client'
import { ProposalProvider } from '../context/ProposalContext'
import { ProposalSummaryPage } from '../features/proposals/ProposalSummaryPage'
import {
  formatMoney,
  validateDiscountPct,
  uniformProductDiscount,
  readCalculationTotals,
} from '../utils/calculationView'
import {
  getCurrencySymbol,
  formatCurrencyAmount,
  unitRateBasisLabel,
  fixedFeeBasisLabel,
  deriveSharedValue,
  validatePlatformRateInputs,
  rateLayoutFor,
} from '../features/ratecard/rateCardFormatters'
import {
  activePackVersion,
  countryCurrencyCode,
  validateClientName,
  validateContractTerm,
  validateHeadcount,
  validateServiceLine,
  serializeProposalToBackendSchema,
} from '../features/calculator/calculatorData'
import {
  exportProposal,
  getProposalExportCommercials,
  describeApiError,
  ProposalInputError,
} from '../api/proposalsApi'
import { installFakeApi, httpError } from './fixtures/fakeApi'
import * as fx from './fixtures/backendRecords'

vi.mock('../api/client')

function summaryRoutes(overrides = {}) {
  return {
    'GET /catalogue/families': () => fx.families,
    'GET /catalogue/products': () => fx.products,
    'GET /catalogue/features': () => fx.features,
    'GET /packs/': () => fx.packs,
    'GET /masters/countries': () => fx.countries,
    'GET /proposals/:id': () => fx.savedProposal({ currency_id: 2, currency: { id: 2, code: 'USD', symbol: '$' } }),
    'GET /proposals/:id/calculations/latest': () => fx.calculationResult(),
    ...overrides,
  }
}

function renderSummary(url = '/proposal-summary?proposalId=900') {
  return render(
    <ProposalProvider>
      <MemoryRouter initialEntries={[url]}>
        <ProposalSummaryPage />
      </MemoryRouter>
    </ProposalProvider>,
  )
}

describe('Frontend Utilities — Isolated Unit Tests', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calculationView helpers format money, validate discounts, read totals & uniform product discounts', () => {
    expect(formatMoney(null, 'USD')).toBe('—')
    expect(formatMoney(undefined, 'USD')).toBe('—')
    expect(formatMoney('not-num', 'USD')).toBe('—')
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50')
    expect(formatMoney(1234.5, '')).toBe('1,234.50')
    expect(formatMoney(12, 'XYZ')).toContain('XYZ')

    expect(validateDiscountPct('')).toBe('')
    expect(validateDiscountPct(0)).toBe('')
    expect(validateDiscountPct(100)).toBe('')
    expect(validateDiscountPct(-0.1)).toMatch(/0% and 100%/)
    expect(validateDiscountPct(100.1)).toMatch(/0% and 100%/)
    expect(validateDiscountPct('abc')).toMatch(/Enter a number/)

    expect(uniformProductDiscount(null, 'subscription_discount_pct')).toEqual({ value: '', mixed: false })
    expect(
      uniformProductDiscount(
        { snapshot_payload: { products: [{ subscription_discount_pct: 5 }, { subscription_discount_pct: 5 }] } },
        'subscription_discount_pct',
      ),
    ).toEqual({ value: '5', mixed: false })
    expect(
      uniformProductDiscount(
        { snapshot_payload: { products: [{ subscription_discount_pct: 5 }, { subscription_discount_pct: 10 }] } },
        'subscription_discount_pct',
      ),
    ).toEqual({ value: '5', mixed: true })
    expect(
      uniformProductDiscount(
        {
          snapshot_payload: {
            products: [
              { service_subtotal_before_discount: 0, service_discount_pct: 12 },
              { service_subtotal_before_discount: 100, service_discount_pct: 8 },
            ],
          },
        },
        'service_discount_pct',
      ),
    ).toEqual({ value: '8', mixed: false })

    expect(readCalculationTotals(null)).toBeNull()
    const totals = readCalculationTotals(fx.calculationResult({ is_stale: true }))
    expect(totals.currency).toBe('USD')
    expect(totals.termMonths).toBe(24)
    expect(totals.contractTotal).toBe(16963.44)
    expect(totals.annualTotal).toBe(9259.32)
    expect(totals.isStale).toBe(true)
  })

  it('rateCardFormatters helpers handle currency formatting, shared fields, layout modes and AMC/rate validation', () => {
    expect(getCurrencySymbol('USD')).toBe('$')
    expect(getCurrencySymbol('AED')).toBe('AED')
    expect(formatCurrencyAmount(null, '$')).toBe('')
    expect(formatCurrencyAmount(1000, '$')).toBe('$ 1,000.00')
    expect(unitRateBasisLabel('monthly')).toBe('month')
    expect(unitRateBasisLabel('one_time')).toBeNull()
    expect(fixedFeeBasisLabel('annual')).toBe('annual fee')
    expect(fixedFeeBasisLabel('one_time')).toBe('one-time fee')

    expect(deriveSharedValue([80, 80])).toEqual({ value: '80', mixed: false })
    expect(deriveSharedValue([80, 90])).toEqual({ value: '80', mixed: true })
    expect(deriveSharedValue([])).toEqual({ value: '', mixed: false })

    const tiers = [{ id: 1, name: 'Tier 1' }]
    expect(validatePlatformRateInputs(tiers, { 1: '380000' }, '80')).toBe('')
    expect(validatePlatformRateInputs(tiers, {}, '80')).toMatch(/at least one customer tier/)
    expect(validatePlatformRateInputs(tiers, { 1: '-5' }, '80')).toMatch(/non-negative number/)
    expect(validatePlatformRateInputs(tiers, { 1: '100' }, '-2')).toMatch(/Subscription rate must be a non-negative/)

    expect(rateLayoutFor({ unit_rate_basis: 'one_time' })).toBe('license')
    expect(rateLayoutFor({ has_fixed_component: true, has_unit_component: true })).toBe('platform')
    expect(rateLayoutFor({ has_fixed_component: false, has_unit_component: true, unit_rate_basis: 'monthly' })).toBe('default')
  })

  it('calculatorData & proposalsApi helpers validate inputs, serialize payload, and format API errors', async () => {
    expect(validateClientName('')).toMatch(/required/)
    expect(validateClientName('A')).toMatch(/at least 2/)
    expect(validateClientName('Acme Corp')).toBe('')

    expect(validateContractTerm('')).toMatch(/required/)
    // Contract duration is entered in whole years (stored as years x 12 months).
    expect(validateContractTerm('1.5')).toMatch(/whole number of years/)
    expect(validateContractTerm('0')).toMatch(/at least 1 year/)
    expect(validateContractTerm('3')).toBe('')

    expect(validateHeadcount('0')).toMatch(/positive whole number/)
    expect(validateHeadcount('250')).toBe('')

    const srvErrors = validateServiceLine({ roleName: '', serviceRateId: null, hoursOrDays: 0 })
    expect(Object.keys(srvErrors)).toEqual(['roleName', 'serviceRateId', 'hoursOrDays'])

    expect(countryCurrencyCode({ currency: { code: 'AED' } })).toBe('AED')
    expect(activePackVersion({ pack_versions: [{ id: 1, status: 'draft' }, { id: 2, status: 'active' }] })?.id).toBe(2)

    const serialized = serializeProposalToBackendSchema(
      { clientName: 'Acme', reportingCurrency: 'USD', reportingCurrencyId: 2 },
      [
        {
          countryId: 1, countryName: 'India', currency: 'INR',
          headcount: 100, pricingTierId: 1, deploymentModelId: 1, pricingModelId: 1, contractTerm: 12,
          families: [{ selectedPackId: 10, selectedFeatureIds: [20], featureHeadcounts: { 20: 50 } }],
          serviceLines: [{ roleName: 'Consultant', serviceRateId: 5, hoursOrDays: 4 }],
        },
      ],
    )
    expect(serialized.proposal_line_items).toHaveLength(2)
    expect(serialized.proposal_service_lines).toHaveLength(1)

    expect(describeApiError(new ProposalInputError(['Missing field']))).toBe('Missing field')
    expect(describeApiError({ response: { data: { detail: 'Conflict' } } })).toBe('Conflict')
    expect(
      describeApiError({ response: { data: { detail: [{ loc: ['body', 'rate'], msg: 'must be > 0' }] } } }),
    ).toBe('rate: must be > 0')

    apiClient.get.mockResolvedValueOnce({ data: new Blob(['PDF']), headers: {} })
    await exportProposal(900, 'pdf')
    expect(apiClient.get).toHaveBeenCalledWith('/proposals/900/export', {
      params: { format: 'pdf' },
      responseType: 'blob',
    })

    apiClient.get.mockResolvedValueOnce({ data: { fcv: 100 } })
    expect(await getProposalExportCommercials(900)).toEqual({ fcv: 100 })
  })
})

describe('ProposalSummaryPage — Export & Validation Unit Tests', () => {
  const origCreateObjectURL = window.URL.createObjectURL
  const origRevokeObjectURL = window.URL.revokeObjectURL
  let anchorClickSpy

  beforeEach(() => {
    vi.clearAllMocks()
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    window.URL.revokeObjectURL = vi.fn()
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    window.URL.createObjectURL = origCreateObjectURL
    window.URL.revokeObjectURL = origRevokeObjectURL
    anchorClickSpy.mockRestore()
  })

  it('shows error banner when loading saved proposal fails', async () => {
    installFakeApi(apiClient, summaryRoutes({
      'GET /proposals/:id': () => {
        throw httpError(500, 'Database unavailable')
      },
    }))
    renderSummary()
    expect(await screen.findByText(/Database unavailable/)).toBeInTheDocument()
  })

  it('exports DOCX with Content-Disposition filename and shows in-flight loading state', async () => {
    installFakeApi(apiClient, summaryRoutes())
    const origGet = apiClient.get.getMockImplementation()
    let resolveExport
    apiClient.get.mockImplementation((url, config) => {
      if (url === '/proposals/900/export') {
        return new Promise((resolve) => {
          resolveExport = () =>
            resolve({
              data: new Blob(['docx-bytes']),
              headers: { 'content-disposition': 'attachment; filename="Custom_ACME_2026.docx"' },
            })
        })
      }
      return origGet(url, config)
    })

    renderSummary()
    const docxBtn = await screen.findByRole('button', { name: /Export Proposal/i })
    const pdfBtn = screen.getByRole('button', { name: /Export PDF/i })
    fireEvent.click(docxBtn)

    await waitFor(() => {
      expect(screen.getByText('Exporting…')).toBeInTheDocument()
      expect(docxBtn).toBeDisabled()
      expect(pdfBtn).toBeDisabled()
    })

    resolveExport()
    await waitFor(() => {
      expect(screen.getByText(/Custom_ACME_2026\.docx/)).toBeInTheDocument()
    })
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('exports PDF with fallback filename when Content-Disposition header is missing', async () => {
    installFakeApi(apiClient, summaryRoutes())
    const origGet = apiClient.get.getMockImplementation()
    apiClient.get.mockImplementation((url, config) => {
      if (url === '/proposals/900/export') {
        expect(config.params).toEqual({ format: 'pdf' })
        return Promise.resolve({ data: new Blob(['%PDF-1.4']), headers: {} })
      }
      return origGet(url, config)
    })

    renderSummary()
    const pdfBtn = await screen.findByRole('button', { name: /Export PDF/i })
    fireEvent.click(pdfBtn)

    await waitFor(() => {
      expect(screen.getByText(/Proposal_.*\.pdf/)).toBeInTheDocument()
    })
  })

  it('handles 409 Conflict and 422 Blob error payloads on export cleanly', async () => {
    installFakeApi(apiClient, summaryRoutes())
    const origGet = apiClient.get.getMockImplementation()
    let mode = 409
    apiClient.get.mockImplementation((url, config) => {
      if (url === '/proposals/900/export') {
        if (mode === 409) {
          return Promise.reject(httpError(409, 'Snapshot is stale'))
        }
        const blob = new Blob([JSON.stringify({ detail: 'Missing AMC percentage' })], { type: 'application/json' })
        return Promise.reject({ response: { status: 422, data: blob } })
      }
      return origGet(url, config)
    })

    renderSummary()
    const docxBtn = await screen.findByRole('button', { name: /Export Proposal/i })

    fireEvent.click(docxBtn)
    expect(await screen.findByText(/Snapshot is stale/)).toBeInTheDocument()

    mode = 422
    fireEvent.click(docxBtn)
    expect(await screen.findByText(/Missing AMC percentage/)).toBeInTheDocument()
  })

  it('blocks export without API call when uncalculated, stale, or empty scope, but allows zero-priced valid product', async () => {
    // 1. Uncalculated
    const apiNoCalc = installFakeApi(apiClient, summaryRoutes({
      'GET /proposals/:id/calculations/latest': () => {
        throw httpError(404, 'No snapshot')
      },
    }))
    const { unmount } = renderSummary()
    fireEvent.click(await screen.findByRole('button', { name: /Export Proposal/i }))
    expect(await screen.findByText(/Please calculate the proposal before exporting/)).toBeInTheDocument()
    expect(apiNoCalc.calls.some((c) => c.path.includes('/export'))).toBe(false)
    unmount()

    // 2. Stale calculation
    const apiStale = installFakeApi(apiClient, summaryRoutes({
      'GET /proposals/:id/calculations/latest': () => fx.calculationResult({ is_stale: true }),
    }))
    const viewStale = renderSummary()
    fireEvent.click(await screen.findByRole('button', { name: /Export PDF/i }))
    expect(await screen.findByText(/Please recalculate before exporting/)).toBeInTheDocument()
    expect(apiStale.calls.some((c) => c.path.includes('/export'))).toBe(false)
    viewStale.unmount()

    // 3. Empty commercial scope
    const emptyCalc = fx.calculationResult()
    emptyCalc.snapshot_payload.products = []
    emptyCalc.snapshot_payload.all_subscription_line_items = []
    emptyCalc.snapshot_payload.all_service_lines = []
    const apiEmpty = installFakeApi(apiClient, summaryRoutes({
      'GET /proposals/:id/calculations/latest': () => emptyCalc,
    }))
    const viewEmpty = renderSummary()
    fireEvent.click(await screen.findByRole('button', { name: /Export Proposal/i }))
    expect(await screen.findByText(/at least one valid commercial item is required/)).toBeInTheDocument()
    expect(apiEmpty.calls.some((c) => c.path.includes('/export'))).toBe(false)
    viewEmpty.unmount()

    // 4. Zero-priced valid product IS exportable
    const zeroPricedCalc = fx.calculationResult({
      total_proposal_reporting_currency: 0,
      total_proposal_annual_reporting_currency: 0,
      total_proposal_contract_reporting_currency: 0,
    })
    zeroPricedCalc.snapshot_payload.products[0].contract_product_reporting_total = 0
    zeroPricedCalc.snapshot_payload.products[0].product_reporting_total = 0
    installFakeApi(apiClient, summaryRoutes({
      'GET /proposals/:id/calculations/latest': () => zeroPricedCalc,
      'GET /proposals/:id/export': () => new Blob(['OK']),
    }))
    renderSummary()
    fireEvent.click(await screen.findByRole('button', { name: /Export Proposal/i }))
    expect(await screen.findByText(/Proposal exported successfully/)).toBeInTheDocument()
  })
})
