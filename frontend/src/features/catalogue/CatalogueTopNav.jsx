import { Link } from 'react-router-dom'
import { ShieldCheck, User } from 'lucide-react'

export function CatalogueTopNav({ activeSection = 'catalogue', isConnected = true, isDemo = false }) {
  const NAV_ITEMS = [
    {
      label: 'Product Catalog',
      to: '/catalogue',
      isActive: activeSection === 'catalogue',
      enabled: true,
    },
    {
      label: 'Pack Builder',
      to: '/packs',
      isActive: activeSection === 'packs',
      enabled: true,
    },
    {
      label: 'Rate Card & Masters',
      to: '/rate-cards',
      isActive: activeSection === 'rate-cards',
      enabled: true,
      badge: 'Master',
    },
    {
      label: 'Proposal Configurator',
      to: '/calculator',
      isActive: activeSection === 'calculator' || activeSection === 'configurator',
      enabled: true,
    },
    {
      label: 'Pricing & Discounts',
      to: '/pricing-discounts',
      isActive:
        activeSection === 'pricing' ||
        activeSection === 'discounts' ||
        activeSection === 'pricing-discounts',
      enabled: true,
    },
    {
      label: 'Proposal Summary',
      to: '/proposals',
      isActive: activeSection === 'proposals',
      enabled: true,
    },
  ]

  return (
    <header className="bg-[#0B1528] text-slate-200 border-b border-slate-800 shrink-0">
      <div className="px-4 sm:px-6 flex items-center justify-between h-14">
        {/* Brand/Logo Area */}
        <div className="flex items-center gap-6">
          <Link
            to="/catalogue"
            className="flex items-center gap-2.5 text-white hover:text-slate-200 transition-colors group"
            title="Product Catalogue"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
              <ShieldCheck className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wider text-white">
                DEAL DESK
              </div>
              <div className="text-[9px] uppercase tracking-widest text-slate-400 font-medium leading-none">
                Commercial Engine
              </div>
            </div>
          </Link>

          {/* Navigation Items */}
          <nav
            aria-label="Catalogue Top Navigation"
            className="hidden md:flex items-center gap-1 overflow-x-auto"
          >
            {NAV_ITEMS.map((item) => {
              if (item.enabled && item.to) {
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      item.isActive
                        ? 'bg-slate-800 text-white shadow-2xs border-b-2 border-orange-500 font-semibold'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                    }`}
                  >
                    <span>{item.label}</span>
                  </Link>
                )
              }

              return (
                <span
                  key={item.label}
                  className="px-3 py-1.5 text-xs font-medium text-slate-500 cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                  title="Reference section — not implemented in current routes"
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                      {item.badge}
                    </span>
                  )}
                </span>
              )
            })}
          </nav>
        </div>

        {/* Right Section: Connection / DEMO DATA pill & Profile */}
        <div className="flex items-center gap-3">
          {isDemo ? (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80"
              title="Demonstration dataset — not connected to production database"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"></span>
              <span>DEMO DATA</span>
            </div>
          ) : isConnected ? (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80"
              title="Connected to PostgreSQL database"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"></span>
              <span>POSTGRESQL LIVE</span>
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/80"
              title="Disconnected from backend database"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" aria-hidden="true"></span>
              <span>OFFLINE / DISCONNECTED</span>
            </div>
          )}

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800 text-xs text-slate-300">
            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              <User className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <span className="hidden sm:inline font-medium">Commercial Ops</span>
          </div>
        </div>
      </div>
    </header>
  )
}

export default CatalogueTopNav
