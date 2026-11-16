import { NavLink } from 'react-router-dom'
import {
  Package,
  Layers,
  Database,
  Calculator,
  Percent,
  FileText,
  X,
  ShieldCheck,
  Building2,
} from 'lucide-react'

const NAV_ITEMS = [
  {
    to: '/catalogue',
    label: 'Product Catalogue',
    icon: Package,
    badge: '48 SKUs',
  },
  {
    to: '/packs',
    label: 'Pack Builder',
    icon: Layers,
    badge: '12 Packs',
  },
  {
    to: '/rate-cards',
    label: 'Rate Card & Masters',
    icon: Database,
    badge: 'Masters',
  },
  {
    to: '/calculator',
    label: 'Proposal Calculator',
    icon: Calculator,
    badge: null,
  },
  {
    to: '/pricing-discounts',
    label: 'Pricing & Discounts',
    icon: Percent,
    badge: null,
  },
  {
    to: '/proposals',
    label: 'Saved Proposals',
    icon: FileText,
    badge: '9 Drafts',
  },
  {
    to: '/approvals',
    label: 'Approvals & Governance',
    icon: ShieldCheck,
    badge: null,
  },
  {
    to: '/admin',
    label: 'Administration',
    icon: Building2,
    badge: null,
  },
]

export function Sidebar({ isOpen, onClose }) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Primary Navigation"
      >
        {/* Brand header */}
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
              <ShieldCheck className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <div className="text-[13px] font-bold tracking-wide text-white flex items-center gap-1.5">
                DEAL DESK
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                Commercial Engine
              </div>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Close navigation sidebar"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Navigation
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => {
                  if (onClose) onClose()
                }}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all group ${
                    isActive
                      ? 'bg-slate-800 text-white shadow-2xs border-l-3 border-emerald-500 pl-2.5'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive
                            ? 'text-emerald-400'
                            : 'text-slate-400 group-hover:text-slate-200'
                        }`}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                    </div>

                    {item.badge && (
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${
                          isActive
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="p-3 border-t border-slate-800">
          <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                <Building2 className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-white truncate">
                  Enterprise Deal Desk
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  Commercial Ops Portal
                </div>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
              <span className="font-mono">Ready for Operations</span>
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Active
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
