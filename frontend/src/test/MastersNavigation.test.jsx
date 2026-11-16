import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProposalProvider } from '../context/ProposalContext'
import { router as appRouterConfig } from '../app/router'
import { installFakeApi } from './fixtures/fakeApi'
import apiClient from '../api/client'
import * as fx from './fixtures/backendRecords'

vi.mock('../api/client')

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
  {
    id: 801,
    rate_card_version_id: 1,
    country_id: 1,
    deployment_model_id: 11,
    pricing_model_id: 14,
    tier_id: 7,
    uom_id: 15,
    uom: uoms[0],
    pack_version_id: 42,
    feature_id: null,
    unit_rate: '80',
    fixed_fee: null,
    currency: fx.currencies[0],
  },
]

function mockBackendRoutes() {
  return {
    'GET /catalogue/families': () => fx.families,
    'GET /catalogue/products': () => fx.products,
    'GET /catalogue/features': () => fx.features,
    'GET /packs/': () => fx.packs,
    'GET /packs/:id/versions': () => fx.packVersions,
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
    'GET /rates/commercial-rate-cards': () => [],
    'GET /proposals/': () => [],
  }
}

function renderMastersApp(initialEntry = '/catalogue') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  const testRouter = createMemoryRouter(appRouterConfig.routes, {
    initialEntries: [initialEntry],
  })

  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <ProposalProvider>
          <RouterProvider router={testRouter} />
        </ProposalProvider>
      </QueryClientProvider>,
    ),
  }
}

describe('Masters Main Navigation & Secondary Tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installFakeApi(apiClient, mockBackendRoutes())
  })

  it('renders the 4 primary navigation items: Masters, Proposal, Approvals, Admin', async () => {
    renderMastersApp('/catalogue')

    const topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    expect(within(topNav).getByRole('link', { name: 'Masters' })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: 'Proposal' })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: 'Approvals' })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: 'Admin' })).toBeInTheDocument()
  })

  it('navigates to Product Catalog by default when clicking Masters or visiting /masters', async () => {
    renderMastersApp('/masters')

    // /masters redirects to /catalogue
    expect(await screen.findByRole('heading', { name: /All Products/i, level: 1 })).toBeInTheDocument()

    // Masters is highlighted as active in the main navigation
    const topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    const mastersLink = within(topNav).getByRole('link', { name: 'Masters' })
    expect(mastersLink).toHaveAttribute('aria-current', 'page')
    expect(mastersLink.className).toContain('border-emerald-500')
  })

  it('displays the three secondary navigation tabs when Masters is active', async () => {
    renderMastersApp('/catalogue')

    const topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    expect(within(topNav).getByRole('link', { name: 'Product Catalog' })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: 'Pack Builder' })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: /Rate Card & Masters/i })).toBeInTheDocument()

    // Product Catalog tab is active
    const productCatalogTab = within(topNav).getByRole('link', { name: 'Product Catalog' })
    expect(productCatalogTab).toHaveAttribute('aria-current', 'page')
    expect(productCatalogTab.className).toContain('border-orange-500')
  })

  it('navigates to Pack Builder when clicking the Pack Builder secondary tab', async () => {
    const { user } = renderMastersApp('/catalogue')

    let topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    const packBuilderTab = within(topNav).getByRole('link', { name: 'Pack Builder' })
    await user.click(packBuilderTab)

    // Pack Builder page rendered
    expect(await screen.findByRole('heading', { name: /Packs/i })).toBeInTheDocument()

    // In Pack Builder, Masters is still active in main navigation, and Pack Builder tab is active in secondary tabs
    topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    expect(within(topNav).getByRole('link', { name: 'Masters' })).toHaveAttribute('aria-current', 'page')
    expect(within(topNav).getByRole('link', { name: 'Pack Builder' })).toHaveAttribute('aria-current', 'page')
  })

  it('navigates to Rate Card & Masters when clicking the Rate Card & Masters secondary tab', async () => {
    const { user } = renderMastersApp('/catalogue')

    let topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    const rateCardTab = within(topNav).getByRole('link', { name: /Rate Card & Masters/i })
    await user.click(rateCardTab)

    // Rate Card page rendered
    expect(await screen.findByRole('complementary', { name: /Products and Families Navigation/i })).toBeInTheDocument()

    // Rate Card tab is active
    topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    expect(within(topNav).getByRole('link', { name: 'Masters' })).toHaveAttribute('aria-current', 'page')
    expect(within(topNav).getByRole('link', { name: /Rate Card & Masters/i })).toHaveAttribute('aria-current', 'page')
  })

  it('switches between all three tabs smoothly without unnecessary page reload', async () => {
    const { user } = renderMastersApp('/catalogue')

    // 1. Initially on Product Catalog
    expect(await screen.findByRole('heading', { name: /All Products/i, level: 1 })).toBeInTheDocument()

    // 2. Click Pack Builder
    let topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    await user.click(within(topNav).getByRole('link', { name: 'Pack Builder' }))
    expect(await screen.findByRole('heading', { name: /Packs/i })).toBeInTheDocument()

    // 3. Click Rate Card & Masters
    topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    await user.click(within(topNav).getByRole('link', { name: /Rate Card & Masters/i }))
    expect(await screen.findByRole('complementary', { name: /Products and Families Navigation/i })).toBeInTheDocument()

    // 4. Click Product Catalog to return
    topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    await user.click(within(topNav).getByRole('link', { name: 'Product Catalog' }))
    expect(await screen.findByRole('heading', { name: /All Products/i, level: 1 })).toBeInTheDocument()
  })

  it('preserves existing direct routes: /catalogue, /packs, /rate-cards', async () => {
    // Direct visit to /packs
    const { unmount } = renderMastersApp('/packs')
    expect(await screen.findByRole('heading', { name: /Packs/i })).toBeInTheDocument()
    unmount()

    // Direct visit to /rate-cards
    const result2 = renderMastersApp('/rate-cards')
    expect(await result2.findByRole('complementary', { name: /Products and Families Navigation/i })).toBeInTheDocument()
    result2.unmount()
  })

  it('keeps Proposal, Approvals, and Admin sections independent and navigable', async () => {
    const { user } = renderMastersApp('/catalogue')

    // Navigate to Proposal
    let topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    await user.click(within(topNav).getByRole('link', { name: 'Proposal' }))
    expect(await screen.findByRole('heading', { name: /Proposal Configurator/i, level: 1 })).toBeInTheDocument()

    // Under Proposal, Proposal tabs are shown (Proposal Configurator, Pricing & Discounts, Proposal Summary)
    topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    expect(within(topNav).getByRole('link', { name: 'Proposal' })).toHaveAttribute('aria-current', 'page')
    expect(within(topNav).getByRole('link', { name: 'Proposal Configurator' })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: 'Pricing & Discounts' })).toBeInTheDocument()
    expect(within(topNav).getByRole('link', { name: 'Proposal Summary' })).toBeInTheDocument()

    // Navigate to Approvals
    await user.click(within(topNav).getByRole('link', { name: 'Approvals' }))
    expect(await screen.findByRole('heading', { name: /Approvals & Governance/i, level: 1 })).toBeInTheDocument()
    topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    expect(within(topNav).getByRole('link', { name: 'Approvals' })).toHaveAttribute('aria-current', 'page')

    // Navigate to Admin
    await user.click(within(topNav).getByRole('link', { name: 'Admin' }))
    expect(await screen.findByRole('heading', { name: /Administration & System Settings/i, level: 1 })).toBeInTheDocument()
    topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    expect(within(topNav).getByRole('link', { name: 'Admin' })).toHaveAttribute('aria-current', 'page')

    // Navigate back to Masters
    await user.click(within(topNav).getByRole('link', { name: 'Masters' }))
    expect(await screen.findByRole('heading', { name: /All Products/i, level: 1 })).toBeInTheDocument()
    topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    expect(within(topNav).getByRole('link', { name: 'Product Catalog' })).toBeInTheDocument()
  })
})
