import { Link } from 'react-router-dom'
import { LogOut, ShieldCheck, User } from 'lucide-react'
import { useProposal } from '../../context/ProposalContext'
import { clearSession, currentUser } from '../../auth/session'
import { logout } from '../../api/authApi'

/**
 * Top navigation with two-tier hierarchy:
 * Main Navigation: Masters, Proposal, Approvals, Admin
 * Secondary Navigation Tabs (displayed when section is active):
 * - Masters: Product Catalog, Pack Builder, Rate Card & Masters
 * - Proposal: Proposal Configurator, Pricing & Discounts, Proposal Summary
 */
export function CatalogueTopNav({ activeSection = 'catalogue', isConnected = null, isDemo = false }) {
  // Keep the open proposal when moving between the proposal pages (survives a browser refresh).
  const { clientInfo } = useProposal()
  const signedIn = currentUser()
  // Sign out: tell the server (stateless), drop the session, and reload on the login page so no
  // proposal data stays in memory for the next person.
  const handleSignOut = async () => {
    try {
      await logout()
    } catch {
      /* the session is cleared locally either way */
    }
    clearSession()
    window.location.assign('/login')
  }
  const proposalQuery = clientInfo?.proposalId ? `?proposalId=${clientInfo.proposalId}` : ''

  const isMastersSection = [
    'catalogue',
    'packs',
    'rate-cards',
    'rate-card',
    'masters',
  ].includes(activeSection)

  const isProposalSection = [
    'hubspot',
    'import',
    'calculator',
    'configurator',
    'pricing',
    'discounts',
    'pricing-discounts',
    'content',
    'proposal-content',
    'proposals',
    'proposal-summary',
    'summary',
    'review',
    'review-submit',
    'proposal',
  ].includes(activeSection)

  const isApprovalsSection = ['approvals', 'approval'].includes(activeSection)
  const isAdminSection = ['admin'].includes(activeSection)

  const MASTERS_TABS = [
    {
      label: 'Product Catalog',
      to: '/catalogue',
      isActive: activeSection === 'catalogue',
    },
    {
      label: 'Pack Builder',
      to: '/packs',
      isActive: activeSection === 'packs',
    },
    {
      label: 'Rate Card & Masters',
      to: '/rate-cards',
      isActive: activeSection === 'rate-cards' || activeSection === 'rate-card',
      badge: 'Master',
    },
  ]

  const PROPOSAL_TABS = [
    {
      label: 'Import from HubSpot',
      to: `/proposals/import${proposalQuery}`,
      isActive: activeSection === 'hubspot' || activeSection === 'import',
    },
    {
      label: 'Proposal Configurator',
      to: `/calculator${proposalQuery}`,
      isActive: activeSection === 'calculator' || activeSection === 'configurator',
    },
    {
      label: 'Pricing & Discounts',
      to: `/pricing-discounts${proposalQuery}`,
      isActive:
        activeSection === 'pricing' ||
        activeSection === 'discounts' ||
        activeSection === 'pricing-discounts',
    },
    {
      label: 'Proposal Content',
      to: `/proposals/content${proposalQuery}`,
      isActive: activeSection === 'content' || activeSection === 'proposal-content',
    },
    {
      label: 'Proposal Summary',
      to: `/proposals${proposalQuery}`,
      isActive:
        activeSection === 'proposals' ||
        activeSection === 'proposal-summary' ||
        activeSection === 'summary',
    },
    {
      label: 'Review & Submit',
      to: `/proposals/review${proposalQuery}`,
      isActive: activeSection === 'review' || activeSection === 'review-submit',
    },
  ]

  return (
    <header className="bg-[#0B1528] text-slate-200 border-b border-slate-800 shrink-0">
      <nav aria-label="Catalogue Top Navigation">
        {/* Tier 1: Main Navigation Bar */}
        <div className="px-4 sm:px-6 flex items-center justify-between h-14">
          {/* Brand/Logo Area */}
          <div className="flex items-center gap-6">
            <Link
              to="/catalogue"
              className="flex items-center gap-2.5 text-white hover:text-slate-200 transition-colors group"
              title="Deal Desk Home"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
                <ShieldCheck className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <div className="text-[14px] font-bold tracking-wider text-white">
                  DEAL DESK
                </div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-medium leading-none">
                  Commercial Engine
                </div>
              </div>
            </Link>

            {/* Main Navigation Menu */}
            <div className="hidden md:flex items-center gap-1.5">
              {/* 1. Masters */}
              <Link
                to="/catalogue"
                className={`px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isMastersSection
                    ? 'bg-slate-800 text-white shadow-2xs border-b-2 border-emerald-500 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
                aria-current={isMastersSection ? 'page' : undefined}
              >
                <span>Masters</span>
              </Link>

              {/* 2. Proposal */}
              <Link
                to={`/calculator${proposalQuery}`}
                className={`px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isProposalSection
                    ? 'bg-slate-800 text-white shadow-2xs border-b-2 border-emerald-500 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
                aria-current={isProposalSection ? 'page' : undefined}
              >
                <span>Proposal</span>
              </Link>

              {/* 3. Approvals */}
              <Link
                to="/approvals"
                className={`px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isApprovalsSection
                    ? 'bg-slate-800 text-white shadow-2xs border-b-2 border-emerald-500 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
                aria-current={isApprovalsSection ? 'page' : undefined}
              >
                <span>Approvals</span>
              </Link>

              {/* 4. Admin */}
              <Link
                to="/admin"
                className={`px-3.5 py-1.5 text-[13px] font-medium rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isAdminSection
                    ? 'bg-slate-800 text-white shadow-2xs border-b-2 border-emerald-500 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
                aria-current={isAdminSection ? 'page' : undefined}
              >
                <span>Admin</span>
              </Link>
            </div>
          </div>

          {/* Right Section: Connection / DEMO DATA pill & Profile */}
          <div className="flex items-center gap-3">
            {isDemo ? (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80"
                title="Sample data"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"></span>
                <span>DEMO DATA</span>
              </div>
            ) : isConnected === true ? (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80"
                title="Connected"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"></span>
                <span>LIVE</span>
              </div>
            ) : isConnected === false ? (
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/80"
                title="Service unavailable"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" aria-hidden="true"></span>
                <span>OFFLINE / DISCONNECTED</span>
              </div>
            ) : null}

            <div className="flex items-center gap-2 pl-2 border-l border-slate-800 text-[12px] text-slate-300">
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <User className="w-3.5 h-3.5" aria-hidden="true" />
              </div>
              {signedIn ? (
                <>
                  <span className="hidden sm:flex flex-col leading-tight" data-testid="signed-in-user">
                    <span className="font-medium text-slate-200">{signedIn.full_name}</span>
                    {signedIn.role_labels?.length > 0 && (
                      <span className="text-[10px] text-slate-400">{signedIn.role_labels.join(', ')}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white"
                    title="Sign out"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Sign out</span>
                  </button>
                </>
              ) : (
                <span className="hidden sm:inline font-medium">Commercial Ops</span>
              )}
            </div>
          </div>
        </div>

        {/* Tier 2: Secondary Navigation Tabs for Masters */}
        {isMastersSection && (
          <div className="bg-[#070e1c] border-t border-slate-800/80 px-4 sm:px-6 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1 hidden sm:inline">
                Masters:
              </span>
              {MASTERS_TABS.map((tab) => (
                <Link
                  key={tab.label}
                  to={tab.to}
                  className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    tab.isActive
                      ? 'bg-slate-800 text-white shadow-2xs border-b-2 border-orange-500 font-semibold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                  aria-current={tab.isActive ? 'page' : undefined}
                >
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      {tab.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Tier 2: Secondary Navigation Tabs for Proposal */}
        {isProposalSection && (
          <div className="bg-[#070e1c] border-t border-slate-800/80 px-4 sm:px-6 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1 hidden sm:inline">
                Proposal:
              </span>
              {PROPOSAL_TABS.map((tab) => (
                <Link
                  key={tab.label}
                  to={tab.to}
                  className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    tab.isActive
                      ? 'bg-slate-800 text-white shadow-2xs border-b-2 border-orange-500 font-semibold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                  aria-current={tab.isActive ? 'page' : undefined}
                >
                  <span>{tab.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}

export default CatalogueTopNav
