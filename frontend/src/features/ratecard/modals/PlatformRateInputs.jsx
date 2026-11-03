/**
 * Modal inputs for the schedule layouts (tier list from the backend; the UOM picker stays in the modal):
 *   variant 'platform': a platform fee per customer tier and one subscription rate.
 *   variant 'license' : a licence fee per user and an AMC % per customer tier.
 */
export function PlatformRateInputs({
  variant = 'platform',
  tiers = [],
  fixedTierRates = {},
  onChangeFixed,
  subscriptionRate = '',
  onChangeSubscription,
  unitTierRates = {},
  onChangeUnit,
  amcTierRates = {},
  onChangeAmc,
  currencySymbol = '',
  idPrefix = 'platform',
}) {
  const gridCols = tiers.length <= 2 ? 'grid-cols-2' : tiers.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
  const tierLabel = (tier) => (tier.name && tier.name !== tier.code ? `${tier.code} (${tier.name})` : tier.code || tier.name)

  if (variant === 'license') {
    return (
      <div>
        <span className="block text-xs font-semibold text-slate-700 mb-1.5">
          Licence Fee per User ({currencySymbol}, one-time) and AMC % by Customer Tier
        </span>
        <div className={`grid gap-3 ${gridCols}`}>
          {tiers.map((tier) => (
            <div key={tier.id} className="space-y-1.5">
              <span className="block text-[11px] font-bold text-slate-700 truncate" title={tier.name || tier.code}>
                {tierLabel(tier)}
              </span>
              <label className="block text-[10px] font-medium text-amber-700" htmlFor={`${idPrefix}-licence-${tier.id}`}>
                Licence fee / user
              </label>
              <input
                id={`${idPrefix}-licence-${tier.id}`}
                type="number"
                min="0"
                step="any"
                value={unitTierRates[tier.id] ?? ''}
                onChange={(e) => onChangeUnit(tier.id, e.target.value)}
                placeholder="0.00"
                className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
              />
              <label className="block text-[10px] font-medium text-amber-700" htmlFor={`${idPrefix}-amc-${tier.id}`}>
                AMC %
              </label>
              <input
                id={`${idPrefix}-amc-${tier.id}`}
                type="number"
                min="0"
                max="100"
                step="any"
                value={amcTierRates[tier.id] ?? ''}
                onChange={(e) => onChangeAmc(tier.id, e.target.value)}
                placeholder="e.g. 5"
                className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="block text-xs font-semibold text-slate-700 mb-1.5">
          Platform Fee by Customer Tier ({currencySymbol})
        </span>
        <div className={`grid gap-3 ${gridCols}`}>
          {tiers.map((tier) => (
            <div key={tier.id}>
              <label
                htmlFor={`${idPrefix}-fixed-${tier.id}`}
                className="block text-[11px] font-medium text-amber-700 mb-1 truncate"
                title={tier.name || tier.code}
              >
                {tierLabel(tier)}
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-[10px] font-mono text-amber-600">{currencySymbol}</span>
                <input
                  id={`${idPrefix}-fixed-${tier.id}`}
                  type="number"
                  min="0"
                  step="any"
                  value={fixedTierRates[tier.id] ?? ''}
                  onChange={(e) => onChangeFixed(tier.id, e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-6 pr-2.5 py-1.5 text-xs border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono bg-amber-50/20"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-subscription-rate`} className="block text-xs font-semibold text-slate-700 mb-1">
          Subscription Rate ({currencySymbol} per unit)
        </label>
        <div className="relative max-w-[200px]">
          <span className="absolute left-2.5 top-2 text-[10px] font-mono text-sky-700">{currencySymbol}</span>
          <input
            id={`${idPrefix}-subscription-rate`}
            type="number"
            min="0"
            step="any"
            value={subscriptionRate}
            onChange={(e) => onChangeSubscription(e.target.value)}
            placeholder="0.00"
            className="w-full pl-6 pr-2.5 py-1.5 text-xs border border-sky-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 font-mono"
          />
        </div>
        <p className="mt-1 text-[10px] text-slate-500">To use a different rate for each tier, choose “Set rate per tier” in the grid after adding.</p>
      </div>
    </div>
  )
}
