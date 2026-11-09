import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Info, X } from 'lucide-react'
import { SETUP_PAGES, PROPOSAL_STEPS, pageHref } from './navConfig'

/**
 * Plain-language overview of the whole app: what to set up once, and the 3 steps for each deal.
 */
export function HowItWorksModal({ isOpen, onClose, activeKey, proposalQuery = '', tipsHidden, onShowTips }) {
  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/60" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-it-works-title"
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 id="how-it-works-title" className="text-lg font-bold text-slate-900">
              How Deal Desk works
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Set up your products and prices once. Then build each proposal in 3 steps.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Setup — do this first, update when things change
            </h3>
            <ol className="grid sm:grid-cols-3 gap-3">
              {SETUP_PAGES.map((page, idx) => {
                const Icon = page.icon
                return (
                  <li key={page.key}>
                    <Link
                      to={pageHref(page)}
                      onClick={onClose}
                      className={`block h-full rounded-xl border p-3 transition-colors ${
                        page.key === activeKey
                          ? 'border-orange-300 bg-orange-50/60'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-500" aria-hidden="true" />
                        <span className="text-[11px] font-semibold text-slate-400">{String.fromCharCode(65 + idx)}</span>
                        <span className="text-sm font-semibold text-slate-900">{page.label}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{page.purpose}</p>
                    </Link>
                  </li>
                )
              })}
            </ol>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Proposal — for every deal
            </h3>
            <ol className="space-y-2">
              {PROPOSAL_STEPS.map((step) => (
                <li key={step.key}>
                  <Link
                    to={pageHref(step, proposalQuery)}
                    onClick={onClose}
                    className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                      step.key === activeKey
                        ? 'border-orange-300 bg-orange-50/60'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold flex items-center justify-center shrink-0">
                      {step.step}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{step.title}</span>
                      <span className="block text-xs text-slate-600 leading-relaxed">{step.howTo}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400 mt-1.5 shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex items-start gap-2.5 rounded-xl bg-sky-50 border border-sky-200 p-3 text-xs text-sky-900 leading-relaxed">
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              All prices and totals are calculated by the server. If you change anything after calculating,
              figures are marked <strong>outdated</strong> in amber — click <strong>Calculate Pricing</strong> (or{' '}
              <strong>Recalculate</strong>) to refresh them.
            </p>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          {tipsHidden ? (
            <button
              type="button"
              onClick={onShowTips}
              className="text-xs font-semibold text-orange-700 hover:text-orange-800"
            >
              Show page tips again
            </button>
          ) : (
            <span className="text-xs text-slate-500">Each page shows a short tip under the menu.</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export default HowItWorksModal
