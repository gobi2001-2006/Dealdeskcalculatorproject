import { Link } from 'react-router-dom'
import { ArrowRight, Lightbulb, X } from 'lucide-react'
import { PROPOSAL_STEPS, findPage, pageHref } from './navConfig'

/**
 * Slim bar under the top navigation: what this page is for, how to use it, and where to go next.
 */
export function PageGuide({ activeKey, proposalQuery = '', isHidden, onHide }) {
  const page = findPage(activeKey)
  if (!page || isHidden) return null

  const isProposalStep = PROPOSAL_STEPS.some((s) => s.key === page.key)
  const nextPage = page.next ? findPage(page.next.key) : null

  return (
    <section
      aria-label="Page guide"
      className="bg-white border-b border-slate-200 shrink-0"
    >
      <div className="px-4 sm:px-6 py-2 flex items-start sm:items-center gap-3">
        <span
          className={`shrink-0 mt-0.5 sm:mt-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
            isProposalStep
              ? 'bg-orange-50 text-orange-700 border border-orange-200'
              : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          {isProposalStep ? `Step ${page.step} of ${PROPOSAL_STEPS.length}` : 'Setup'}
        </span>

        <p className="flex-1 min-w-0 text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-900">{page.title}:</span>{' '}
          {page.purpose}{' '}
          <span className="hidden md:inline text-slate-500">
            <Lightbulb className="inline w-3.5 h-3.5 -mt-0.5 mr-0.5 text-amber-500" aria-hidden="true" />
            {page.howTo}
          </span>
        </p>

        {nextPage && (
          <Link
            to={pageHref(nextPage, proposalQuery)}
            className="shrink-0 hidden sm:inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <span>Next: {page.next.label}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}

        <button
          type="button"
          onClick={onHide}
          className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          aria-label="Hide page tips"
          title="Hide tips (bring them back from “How it works”)"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

export default PageGuide
