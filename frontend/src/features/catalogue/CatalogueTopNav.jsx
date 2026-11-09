import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, HelpCircle, Menu, ShieldCheck, User, X } from 'lucide-react'
import { useProposal } from '../../context/ProposalContext'
import { SETUP_PAGES, PROPOSAL_STEPS, pageHref, resolvePageKey } from '../../components/layout/navConfig'
import { PageGuide } from '../../components/layout/PageGuide'
import { useGuideVisibility } from '../../components/layout/useGuideVisibility'
import { HowItWorksModal } from '../../components/layout/HowItWorksModal'

/**
 * Top navigation shared by every page.
 *
 * Pages are split into "Setup" (catalog, packs, rates) and the numbered 3-step proposal flow,
 * so it is clear what is maintained once and what is done for every deal.
 * The connection pill is shown only when a page passes a real status (isConnected true/false).
 */
export function CatalogueTopNav({ activeSection = 'catalogue', isConnected = null, isDemo = false }) {
  // Keep the open proposal when moving between the proposal pages (survives a browser refresh).
  const { clientInfo } = useProposal()
  const proposalQuery = clientInfo?.proposalId ? `?proposalId=${clientInfo.proposalId}` : ''
  const activeKey = resolvePageKey(activeSection)

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const guide = useGuideVisibility()

  return (
    <>
      <header className="bg-[#0B1528] text-slate-200 border-b border-slate-800 shrink-0 relative z-30">
        <div className="px-3 sm:px-5 flex items-center justify-between gap-3 h-14">
          {/* Brand */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
            </button>

            <Link
              to="/catalogue"
              className="flex items-center gap-2.5 text-white hover:text-slate-200 transition-colors shrink-0"
              title="Go to Product Catalog"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <ShieldCheck className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-bold tracking-wider text-white">DEAL DESK</div>
                <div className="text-[9px] uppercase tracking-widest text-slate-400 font-medium leading-none">
                  Commercial Engine
                </div>
              </div>
            </Link>
          </div>

          {/* Desktop navigation: Setup group | numbered proposal steps */}
          <nav
            aria-label="Catalogue Top Navigation"
            className="hidden lg:flex items-center gap-4 min-w-0 flex-1 justify-center"
          >
            <div className="flex items-center gap-1" role="group" aria-label="Setup">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1.5">
                Setup
              </span>
              {SETUP_PAGES.map((page) => {
                const Icon = page.icon
                const isActive = page.key === activeKey
                return (
                  <Link
                    key={page.key}
                    to={pageHref(page)}
                    aria-label={`${page.shortLabel} — ${page.label}`}
                    aria-current={isActive ? 'page' : undefined}
                    title={page.label}
                    className={`h-9 px-3 text-[13px] font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
                      isActive
                        ? 'bg-white/10 text-white border-orange-500'
                        : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-orange-400' : ''}`} aria-hidden="true" />
                    <span>{page.shortLabel}</span>
                  </Link>
                )
              })}
            </div>

            <span className="w-px h-7 bg-slate-700" aria-hidden="true" />

            <div className="flex items-center gap-0.5" role="group" aria-label="Proposal steps">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1.5">
                Proposal
              </span>
              {PROPOSAL_STEPS.map((step, idx) => {
                const isActive = step.key === activeKey
                return (
                  <div key={step.key} className="flex items-center">
                    {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 mx-0.5" aria-hidden="true" />}
                    <Link
                      to={pageHref(step, proposalQuery)}
                      aria-label={`Step ${step.step}: ${step.shortLabel} — ${step.label}`}
                      aria-current={isActive ? 'step' : undefined}
                      title={`Step ${step.step}: ${step.label}`}
                      className={`h-9 pl-1.5 pr-3 text-[13px] font-medium rounded-md transition-colors flex items-center gap-2 whitespace-nowrap border-b-2 ${
                        isActive
                          ? 'bg-white/10 text-white border-orange-500'
                          : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                          isActive ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                        aria-hidden="true"
                      >
                        {step.step}
                      </span>
                      <span>{step.shortLabel}</span>
                    </Link>
                  </div>
                )
              })}
            </div>
          </nav>

          {/* Right: status, help, user */}
          <div className="flex items-center gap-2 shrink-0">
            <ConnectionPill isDemo={isDemo} isConnected={isConnected} />

            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <HelpCircle className="w-4 h-4" aria-hidden="true" />
              <span className="hidden xl:inline">How it works</span>
              <span className="sr-only xl:hidden">How it works</span>
            </button>

            <div
              className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300"
              title="Commercial Ops"
            >
              <User className="w-4 h-4" aria-hidden="true" />
              <span className="sr-only">Commercial Ops</span>
            </div>
          </div>
        </div>

        {/* Mobile / tablet menu */}
        {isMobileMenuOpen && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="lg:hidden absolute left-0 right-0 top-14 bg-[#0B1528] border-b border-slate-800 shadow-xl px-3 pb-4 pt-2 space-y-4"
          >
            <MobileGroup title="Setup — maintained occasionally">
              {SETUP_PAGES.map((page) => (
                <MobileLink
                  key={page.key}
                  to={pageHref(page)}
                  icon={page.icon}
                  label={page.label}
                  hint={page.purpose}
                  isActive={page.key === activeKey}
                  onNavigate={() => setIsMobileMenuOpen(false)}
                />
              ))}
            </MobileGroup>
            <MobileGroup title="Proposal — for each deal">
              {PROPOSAL_STEPS.map((step) => (
                <MobileLink
                  key={step.key}
                  to={pageHref(step, proposalQuery)}
                  stepNumber={step.step}
                  label={step.label}
                  hint={step.purpose}
                  isActive={step.key === activeKey}
                  onNavigate={() => setIsMobileMenuOpen(false)}
                />
              ))}
            </MobileGroup>
          </nav>
        )}
      </header>

      <PageGuide activeKey={activeKey} proposalQuery={proposalQuery} isHidden={guide.isHidden} onHide={guide.hide} />

      <HowItWorksModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        activeKey={activeKey}
        proposalQuery={proposalQuery}
        tipsHidden={guide.isHidden}
        onShowTips={() => {
          guide.show()
          setIsHelpOpen(false)
        }}
      />
    </>
  )
}

function ConnectionPill({ isDemo, isConnected }) {
  if (isDemo) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80"
        title="Demonstration data — not connected to the live database"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true"></span>
        <span>DEMO DATA</span>
      </div>
    )
  }
  if (isConnected === true) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80"
        title="All reference data loaded from the server"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true"></span>
        <span>Connected</span>
      </div>
    )
  }
  if (isConnected === false) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/80"
        title="Some data could not be loaded from the server"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" aria-hidden="true"></span>
        <span>Server offline</span>
      </div>
    )
  }
  return null
}

function MobileGroup({ title, children }) {
  return (
    <div>
      <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function MobileLink({ to, icon: Icon, stepNumber, label, hint, isActive, onNavigate }) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-start gap-3 px-2.5 py-2 rounded-lg ${
        isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      {stepNumber ? (
        <span
          className={`mt-0.5 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
            isActive ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
          }`}
          aria-hidden="true"
        >
          {stepNumber}
        </span>
      ) : (
        <Icon className={`mt-0.5 w-5 h-5 shrink-0 ${isActive ? 'text-orange-400' : 'text-slate-400'}`} aria-hidden="true" />
      )}
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-400 leading-snug">{hint}</span>
      </span>
    </Link>
  )
}

export default CatalogueTopNav
