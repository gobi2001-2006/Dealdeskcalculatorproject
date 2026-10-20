export function SummaryStrip({
  clientName = 'Global Enterprise Master',
  countriesValue = '—',
  productLinesCount = 5,
  totalProductsCount = 0,
  productLinesValue = null,
  pricingFcv = '—',
  servicesValue = '—',
  grandTotal = '—',
}) {
  const summaryItems = [
    {
      label: 'Client',
      value: clientName,
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
      className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 shrink-0 shadow-2xs"
    >
      <div className="flex items-center justify-between overflow-x-auto gap-4 divide-x divide-slate-100">
        {summaryItems.map((item, index) => (
          <div
            key={item.label}
            className={`flex flex-col min-w-[110px] ${
              index === 0 ? 'pr-4' : 'px-4'
            }`}
          >
            <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
              {item.label}
            </span>
            <span
              className={`text-xs font-semibold mt-0.5 whitespace-nowrap ${
                item.isGrand
                  ? 'text-emerald-700 font-mono font-bold'
                  : 'text-slate-800'
              }`}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default SummaryStrip
