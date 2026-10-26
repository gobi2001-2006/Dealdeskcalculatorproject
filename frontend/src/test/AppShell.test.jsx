import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from '../components/layout/AppShell'
import { CataloguePage } from '../features/catalogue/CataloguePage'
import { PacksPage } from '../features/packs/PacksPage'
import { RateCardPage } from '../features/ratecard/RateCardPage'
import { CalculatorPage } from '../features/calculator/CalculatorPage'
import { PricingPage } from '../features/pricing/PricingPage'
import { ProposalsPage } from '../features/proposals/ProposalsPage'
import { NotFoundPage } from '../features/notfound/NotFoundPage'

function renderWithProviders(initialEntries = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const testRouter = createMemoryRouter(
    [
      {
        path: '/',
        element: <Navigate to="/catalogue" replace />,
      },
      {
        path: '/dashboard',
        element: <Navigate to="/catalogue" replace />,
      },
      {
        path: '/catalogue',
        element: <CataloguePage />,
      },
      {
        path: '/packs',
        element: <PacksPage />,
      },
      {
        path: '/rate-cards',
        element: <RateCardPage />,
      },
      {
        path: '/calculator',
        element: <CalculatorPage />,
      },
      {
        path: '/pricing-discounts',
        element: <PricingPage />,
      },
      {
        path: '/proposals',
        element: <ProposalsPage />,
      },
      {
        element: <AppShell />,
        children: [
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
    { initialEntries },
  )

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={testRouter} />
    </QueryClientProvider>,
  )
}

describe('Deal Desk Application Shell Smoke Tests', () => {
  it('renders brand mark and sidebar navigation links without Dashboard', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const sidebarRouter = createMemoryRouter(
      [
        {
          element: <AppShell />,
          children: [{ path: '*', element: <div>App Shell Test View</div> }],
        },
      ],
      { initialEntries: ['/app-shell-view'] },
    )
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={sidebarRouter} />
      </QueryClientProvider>,
    )

    expect(screen.getByText('DEAL DESK')).toBeInTheDocument()
    expect(screen.getByText('Commercial Engine')).toBeInTheDocument()

    const sidebar = screen.getByRole('complementary', { name: /Primary Navigation/i })
    expect(within(sidebar).queryByRole('link', { name: /Dashboard/i })).not.toBeInTheDocument()
    expect(within(sidebar).getByRole('link', { name: /Product Catalogue/i })).toBeInTheDocument()
    expect(within(sidebar).getByRole('link', { name: /Pack Builder/i })).toBeInTheDocument()
    expect(within(sidebar).getByRole('link', { name: /Rate Card & Masters/i })).toBeInTheDocument()
    expect(within(sidebar).getByRole('link', { name: /Proposal Calculator/i })).toBeInTheDocument()
    expect(within(sidebar).getByRole('link', { name: /Pricing & Discounts/i })).toBeInTheDocument()
    expect(within(sidebar).getByRole('link', { name: /Saved Proposals/i })).toBeInTheDocument()
  })

  it('redirects / to Product Catalogue landing page', () => {
    renderWithProviders(['/'])

    expect(
      screen.getByRole('heading', { name: /All Products/i, level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Product Catalog/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Commercial Desk Dashboard/i })).not.toBeInTheDocument()
  })

  it('redirects /dashboard to Product Catalogue landing page', () => {
    renderWithProviders(['/dashboard'])

    expect(
      screen.getByRole('heading', { name: /All Products/i, level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Product Catalog/i }),
    ).toBeInTheDocument()
  })

  it('renders catalogue route with Product Catalog header and All Products', () => {
    renderWithProviders(['/catalogue'])

    expect(
      screen.getByRole('heading', { name: /All Products/i, level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Product Catalog/i }),
    ).toBeInTheDocument()
  })

  it('renders pack builder route with packs sidebar and empty workspace initial state', () => {
    renderWithProviders(['/packs'])

    expect(
      screen.getByRole('heading', { name: /Packs/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Select a pack to edit, or create your first pack/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Create First Pack/i }),
    ).toBeInTheDocument()
  })

  it('renders rate cards and masters route with active navigation and 3 columns', () => {
    renderWithProviders(['/rate-cards'])

    expect(
      screen.getByRole('link', { name: /Rate Card & Masters/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: /Products and Families Navigation/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: /Master Data Management/i }),
    ).toBeInTheDocument()
    // The pricing model comes from the backend; nothing is pre-selected from demo data.
    expect(
      screen.getByRole('combobox', { name: /Commercial Pricing Model/i }),
    ).toBeInTheDocument()
  })

  it('renders proposal configurator route with top navigation and summary strip', () => {
    renderWithProviders(['/calculator'])

    expect(
      screen.getByRole('heading', { name: /Proposal Configurator/i, level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Proposal Configurator/i }),
    ).toBeInTheDocument()
  })

  it('renders pricing and discounts route with active navigation', () => {
    renderWithProviders(['/pricing-discounts'])

    const topNav = screen.getByRole('navigation', { name: /Catalogue Top Navigation/i })
    const activePricingLink = within(topNav).getByRole('link', { name: /Pricing & Discounts/i })
    expect(activePricingLink).toBeInTheDocument()
    expect(activePricingLink.className).toContain('border-orange-500')
  })

  it('renders saved proposals placeholder route', () => {
    renderWithProviders(['/proposals'])

    expect(
      screen.getByRole('heading', { name: /Saved Proposals/i, level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Saved Proposals Placeholder/i)).toBeInTheDocument()
  })

  it('renders 404 page for unknown routes with link to Product Catalogue', () => {
    renderWithProviders(['/unknown-path'])

    expect(
      screen.getByRole('heading', { name: /Page Not Found/i, level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Return to Product Catalogue/i }),
    ).toBeInTheDocument()
  })
})
