import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { CataloguePage } from '../features/catalogue/CataloguePage'
import { PacksPage } from '../features/packs/PacksPage'
import { RateCardPage } from '../features/ratecard/RateCardPage'
import { CalculatorPage } from '../features/calculator/CalculatorPage'
import { PricingPage } from '../features/pricing/PricingPage'
import { ProposalSummaryPage } from '../features/proposals/ProposalSummaryPage'
import { NotFoundPage } from '../features/notfound/NotFoundPage'

export const router = createBrowserRouter([
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
    path: '/rate-card',
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
    path: '/pricing',
    element: <PricingPage />,
  },
  {
    path: '/proposals',
    element: <ProposalSummaryPage />,
  },
  {
    path: '/proposal-summary',
    element: <ProposalSummaryPage />,
  },
  {
    element: <AppShell />,
    children: [
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])

export default router
