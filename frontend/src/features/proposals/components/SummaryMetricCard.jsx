export function SummaryMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  colorVariant = 'slate',
  isGrandTotal = false,
  currencyCode = null,
}) {
  const colorStyles = {
    orange: {
      card: isGrandTotal
        ? 'bg-[#0B1528] text-white border-orange-500/40'
        : 'bg-white border-slate-200',
      iconBox: 'bg-orange-100 text-orange-700',
      value: isGrandTotal ? 'text-orange-400 font-bold' : 'text-slate-900',
    },
    blue: {
      card: 'bg-white border-slate-200',
      iconBox: 'bg-blue-50 text-blue-700 border border-blue-200',
      value: 'text-slate-900',
    },
    teal: {
      card: 'bg-white border-slate-200',
      iconBox: 'bg-teal-50 text-teal-700 border border-teal-200',
      value: 'text-slate-900',
    },
    slate: {
      card: 'bg-white border-slate-200',
      iconBox: 'bg-slate-100 text-slate-700 border border-slate-200',
      value: 'text-slate-900',
    },
    emerald: {
      card: 'bg-white border-slate-200',
      iconBox: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      value: 'text-slate-900',
    },
  }

  const selectedTheme = colorStyles[colorVariant] || colorStyles.slate

  return (
    <div
      role="region"
      aria-label={`${title} summary card`}
      className={`rounded-xl border p-4 shadow-xs flex flex-col justify-between transition-shadow hover:shadow-sm ${selectedTheme.card}`}
    >
      <div className="flex items-start justify-between gap-2 pb-2">
        <div>
          <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 block">
            {title}
          </span>
          {currencyCode && (
            <span className="text-[10px] font-mono text-slate-400">
              ({currencyCode})
            </span>
          )}
        </div>
        {Icon && (
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selectedTheme.iconBox}`}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="mt-1">
        <div
          className={`text-[18px] sm:text-[20px] font-bold font-mono tracking-tight truncate ${selectedTheme.value}`}
          title={typeof value === 'string' ? value : undefined}
        >
          {value}
        </div>
        {subtitle && (
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

export default SummaryMetricCard
