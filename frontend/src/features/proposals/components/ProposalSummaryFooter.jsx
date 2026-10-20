import { Info, HelpCircle, ShieldCheck } from 'lucide-react'

export function ProposalSummaryFooter({ countryConfigs = [], clientInfo }) {
  const countryListString = countryConfigs
    .map((c) => `${c.countryName} (${c.currency})`)
    .join(', ') || 'None'

  const definitions = [
    {
      term: 'License Fee',
      description:
        'One-time upfront perpetual or fixed platform license fee component, billed at contract execution.',
    },
    {
      term: 'Rental / PEPM',
      description:
        'Recurring subscription fee charged per-employee-per-month (or periodic cloud tier) across the contracted multi-year term.',
    },
    {
      term: 'Service Fees',
      description:
        'One-time or milestone-based professional services for enterprise implementation, system integration, data migration, and consulting.',
    },
    {
      term: 'Full Contract Value (FCV)',
      description:
        'The consolidated multi-year commercial commitment across all products, countries, and service lines in the reporting currency, net of approved discounts.',
    },
    {
      term: 'Native Currency Context',
      description:
        'Regional pricing lines are quoted in local operating currencies and converted into the single reporting currency at backend corporate treasury FX rates.',
    },
  ]

  return (
    <footer
      aria-label="Proposal Financial Definitions and Governance Footnote"
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4 text-xs"
    >
      {/* Scope and Governance Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-orange-600 shrink-0" aria-hidden="true" />
          <h2 className="font-bold text-slate-900 tracking-tight text-xs uppercase">
            Commercial Governance & Proposal Scope
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
          <span>
            Scope:{' '}
            <strong className="text-slate-800 font-medium">
              {countryConfigs.length} {countryConfigs.length === 1 ? 'Country' : 'Countries'}
            </strong>{' '}
            [{countryListString}]
          </span>
          <span className="text-slate-300">|</span>
          <span>
            Reporting Currency:{' '}
            <strong className="text-orange-600 font-mono font-bold">
              {clientInfo.reportingCurrency}
            </strong>
          </span>
        </div>
      </div>

      {/* Pricing Integrity Note */}
      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5 text-[11px] text-slate-600 leading-relaxed">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <strong className="text-slate-800 font-semibold">
            Commercial Engine Integrity Notice:
          </strong>{' '}
          All monetary figures, discounts, margin calculations, and multi-currency consolidations are
          governed authoritatively by the Deal Desk backend pricing service. The frontend does not calculate
          totals, apply additive discount formulas, or fabricate gross margins. Figures marked as{' '}
          <em className="text-slate-700 font-mono font-medium">Pending backend calculation</em>{' '}
          await API calculation execution.
        </p>
      </div>

      {/* Financial Definitions Grid */}
      <div className="pt-1">
        <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-[11px] mb-2.5">
          <HelpCircle className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <span>Financial Terms & Definitions</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {definitions.map((item) => (
            <div
              key={item.term}
              className="p-2.5 rounded-lg bg-slate-50/70 border border-slate-200/80 space-y-1"
            >
              <span className="font-semibold text-slate-900 block text-[11px]">
                {item.term}
              </span>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}

export default ProposalSummaryFooter
