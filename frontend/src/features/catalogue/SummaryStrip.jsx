export function SummaryStrip({
  clientName = '—',
  countriesValue = '—',
  productLinesCount = 0,
  totalProductsCount = 0,
  productLinesValue = null,
  pricingFcv = '—',
  servicesValue = '—',
  grandTotal = '—',
  proposalCode = null,
  proposalStatus = null,
}) {
  const summaryItems = [
    {
      label: 'Client / Proposal',
      value: proposalCode ? `${clientName} (${proposalCode})` : clientName,
      badge: proposalStatus,
    },
    {
      label: 'Countries',
      value: countriesValue,
    },
    {
      label: 'Product Lines',
      value:
        productLinesValue ||
        `${productLinesCount} Families (${totalProductsCount} SKUs)`,
    },
    {
      label: 'Pricing FCV',
      value: pricingFcv,
    },
    {
      label: 'Services',
      value: servicesValue,
    },
    {
      label: 'Grand Total',
      value: grandTotal,
      isGrand: true,
    },
  ]

  return (
    <section
      aria-label="Commercial Master Summary"
      className="bg-white border-b border-slate-200 shrink-0 shadow-2xs"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 lg:gap-0 lg:divide-x lg:divide-slate-200/80">
          {summaryItems.map((item, index) => (
            <div
              key={item.label}
              className={`flex flex-col justify-center min-w-0 ${
                index === 0
                  ? 'lg:pr-4'
                  : index === summaryItems.length - 1
                  ? 'lg:pl-4'
                  : 'lg:px-4'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 truncate">
                  {item.label}
                </span>
                {item.badge && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 border border-orange-200 shrink-0">
                    {item.badge}
                  </span>
                )}
              </div>
              <span
                title={String(item.value)}
                className={`text-[13px] sm:text-[14px] font-semibold mt-0.5 truncate ${
                  item.isGrand
                    ? 'text-emerald-700 font-mono font-bold'
                    : 'text-slate-900'
                }`}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default SummaryStrip

