import { Info, HelpCircle, ShieldCheck } from 'lucide-react'

export function ProposalSummaryFooter({ countryConfigs = [], clientInfo }) {
  const countryListString = countryConfigs
    .map((c) => `${c.countryName} (${c.currency})`)
    .join(', ') || 'None'

  const definitions = [
    {
      term: 'Subscription (annual)',
      description:
        'Platform fee + (rate per unit × volume per billing period × billing periods in a year: 12 for monthly rates, 1 for annual), after line discounts and the overall subscription discount set for that country. The unit of measure and billing period come from the rate card. A one-time licence fee per user is charged once, with its AMC % charged every year.',
    },
    {
      term: 'Subscription (contract term)',
      description:
        'Platform fee × contract years (charged once if the pricing model marks it one-time) plus the subscription for every billing period in the term.',
    },
    {
      term: 'Service Fees',
      description:
        'One-time professional services: man-days × day rate (hourly rate × standard hours per day), with one overall services discount per country.',
    },
    {
      term: 'Full Contract Value (FCV)',
      description:
        'Subscription over the contract term plus one-time services, converted to the reporting currency.',
    },
    {
      term: 'Native vs reporting currency',
      description:
        'Lines are priced in the rate-card currency and converted with the latest FX rate saved on the Rate Card page that is effective on the calculation date.',
    },
  ]

  return (
    <footer
      aria-label="Proposal Financial Definitions and Governance Footnote"
      className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5 text-[12px]"
    >
      {/* Scope and Governance Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-orange-600 shrink-0" aria-hidden="true" />
          <h2 className="font-bold text-slate-900 tracking-tight text-[16px]">
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
      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-3 text-[11px] text-slate-600 leading-relaxed">
        <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          All monetary figures, discounts, and currency conversions reflect the latest calculated snapshot.
          Figures marked as{' '}
          <em className="text-slate-700 font-mono font-medium">Pending calculation</em>{' '}
          await pricing calculation.
        </p>
      </div>

      {/* Financial Definitions Grid */}
      <div className="pt-1">
        <div className="flex items-center gap-2 text-slate-700 font-semibold text-[13px] mb-3">
          <HelpCircle className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span>Financial Terms & Definitions</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {definitions.map((item) => (
            <div
              key={item.term}
              className="p-3.5 rounded-lg bg-slate-50/70 border border-slate-200/80 space-y-1.5"
            >
              <span className="font-semibold text-slate-900 block text-[12px]">
                {item.term}
              </span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
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
