import { NOT_CALCULATED } from '../../utils/calculationView'

/**
 * At-a-glance strip for the open proposal: who it is for, what is in it, and the backend totals.
 * Shown on the three proposal pages only.
 */
export function SummaryStrip({
  clientName = '—',
  countriesValue = '—',
  productLinesCount = 0,
  totalProductsCount = 0,
  productLinesValue = null,
  pricingFcv = '—',
  servicesValue = '—',
  grandTotal = '—',
}) {
  const detailItems = [
    { label: 'Client', value: clientName },
    { label: 'Countries', value: countriesValue },
    {
      label: 'Products',
      value: productLinesValue || `${productLinesCount} Families (${totalProductsCount} SKUs)`,
    },
    { label: 'Subscription (FCV)', value: pricingFcv, isAmount: true },
    { label: 'Services', value: servicesValue, isAmount: true },
  ]

  const isPending = (v) => typeof v === 'string' && (v.startsWith(NOT_CALCULATED) || v === '—')
  const grandPending = isPending(grandTotal)
  const grandOutdated = typeof grandTotal === 'string' && grandTotal.includes('(Outdated)')

  return (
    <section
      aria-label="Commercial Master Summary"
      className="bg-white border-b border-slate-200 shrink-0"
    >
      <div className="px-4 sm:px-6 py-2 flex flex-col md:flex-row md:items-stretch gap-2 md:gap-4">
        <dl className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1.5">
          {detailItems.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 truncate">
                {item.label}
              </dt>
              <dd
                title={String(item.value)}
                className={`text-[13px] mt-0.5 truncate ${
                  isPending(item.value)
                    ? 'text-slate-400 italic'
                    : item.isAmount
                    ? 'text-slate-900 font-semibold tabular-nums'
                    : 'text-slate-900 font-medium'
                }`}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <div
          className={`shrink-0 rounded-lg px-4 py-1.5 flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 md:gap-0 md:min-w-[200px] border ${
            grandPending
              ? 'bg-slate-50 border-slate-200'
              : grandOutdated
              ? 'bg-amber-50 border-amber-200'
              : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Grand Total</span>
          <span
            title={String(grandTotal)}
            className={`truncate ${
              grandPending
                ? 'text-[13px] text-slate-400 italic'
                : grandOutdated
                ? 'text-base font-bold text-amber-800 tabular-nums'
                : 'text-base font-bold text-emerald-800 tabular-nums'
            }`}
          >
            {grandTotal}
          </span>
        </div>
      </div>
    </section>
  )
}

export default SummaryStrip
