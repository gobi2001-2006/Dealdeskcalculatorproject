import { useLocation, Link } from 'react-router-dom'
import { Menu, Plus, User } from 'lucide-react'

const ROUTE_TITLES = {
  '/': 'Product Catalogue',
  '/dashboard': 'Product Catalogue',
  '/catalogue': 'Product Catalogue',
  '/packs': 'Pack Builder',
  '/rate-cards': 'Rate Card & Masters',
  '/rate-card': 'Rate Card & Masters',
  '/calculator': 'Proposal Calculator',
  '/pricing-discounts': 'Pricing & Discounts',
  '/pricing': 'Pricing & Discounts',
  '/proposals': 'Proposal Summary',
  '/proposal-summary': 'Proposal Summary',
}

export function Header({ onMenuClick }) {
  const location = useLocation()
  const currentTitle = ROUTE_TITLES[location.pathname] || 'Deal Desk'

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left section: mobile hamburger & breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          aria-label="Open navigation sidebar"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">
            Deal Desk
          </span>
          <span className="text-slate-300 hidden sm:inline">/</span>
          <span className="text-[13px] font-semibold text-slate-900">
            {currentTitle}
          </span>
        </div>
      </div>

      {/* Right section: visible DEMO DATA indicator, CTA, user avatar */}
      <div className="flex items-center gap-3 sm:gap-4">
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs"
          title="Illustrative presentation demo environment — not connected to production database"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
          <span>DEMO DATA</span>
        </div>

        <Link
          to="/calculator"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-700 hover:bg-emerald-800 text-white transition-colors shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">New Proposal</span>
        </Link>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
            <User className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="hidden md:block text-left">
            <div className="text-[11px] font-medium text-slate-800 leading-tight">
              Commercial Ops
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              Desk Analyst
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
