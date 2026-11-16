import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { CataloguePage } from '../features/catalogue/CataloguePage'
import { PacksPage } from '../features/packs/PacksPage'
import { RateCardPage } from '../features/ratecard/RateCardPage'
import { CalculatorPage } from '../features/calculator/CalculatorPage'
import { PricingPage } from '../features/pricing/PricingPage'
import { ProposalSummaryPage } from '../features/proposals/ProposalSummaryPage'
import { HubSpotImportPage } from '../features/proposals/HubSpotImportPage'
import { ProposalContentPage } from '../features/proposals/ProposalContentPage'
import { ProposalReviewSubmitPage } from '../features/proposals/ProposalReviewSubmitPage'
import { ApprovalsPage } from '../features/approvals/ApprovalsPage'
import { AdminPage } from '../features/admin/AdminPage'
import { NotFoundPage } from '../features/notfound/NotFoundPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RequireAuth } from '../features/auth/RequireAuth'

// Application pages: all behind the sign-in guard (RequireAuth).
export const appRoutes = [
  {
    path: '/',
    element: <Navigate to="/catalogue" replace />,
  },
  {
    path: '/dashboard',
    element: <Navigate to="/catalogue" replace />,
  },
  {
    path: '/masters',
    element: <Navigate to="/catalogue" replace />,
  },
  {
    path: '/masters/catalogue',
    element: <Navigate to="/catalogue" replace />,
  },
  {
    path: '/masters/packs',
    element: <Navigate to="/packs" replace />,
  },
  {
    path: '/masters/rate-cards',
    element: <Navigate to="/rate-cards" replace />,
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
    path: '/proposals/import',
    element: <HubSpotImportPage />,
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
    path: '/proposals/content',
    element: <ProposalContentPage />,
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
    path: '/proposals/review',
    element: <ProposalReviewSubmitPage />,
  },
  {
    path: '/proposals/review-submit',
    element: <ProposalReviewSubmitPage />,
  },
  {
    path: '/approvals',
    element: <ApprovalsPage />,
  },
  {
    path: '/admin',
    element: <AdminPage />,
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
]

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { element: <RequireAuth />, children: appRoutes },
])

export default router
