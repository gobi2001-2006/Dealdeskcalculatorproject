import { Globe, Clock } from 'lucide-react'

export function CountrySummarySectionHeader({ countryIndex, countryConfig }) {
  const deploymentLabel =
    countryConfig.deploymentModelName ||
    (countryConfig.deploymentModelId === 'dep-private' || countryConfig.deploymentModelId === 2 || countryConfig.deploymentModelId === '2'
      ? 'Private Cloud'
      : countryConfig.deploymentModelId === 'dep-onprem' || countryConfig.deploymentModelId === 3 || countryConfig.deploymentModelId === '3'
      ? 'On-Premises'
      : 'Shared Cloud')

  const pricingModelLabel =
    countryConfig.pricingModelName ||
    (countryConfig.pricingModelId === 'pm-platform' || countryConfig.pricingModelId === 2 || countryConfig.pricingModelId === '2'
      ? 'Platform Subscription'
      : 'PEPM')

  const tierLabel =
    countryConfig.pricingTierName ||
    (countryConfig.pricingTierId === 'tier-1' || countryConfig.pricingTierId === 1 || countryConfig.pricingTierId === '1'
      ? 'Tier 1'
      : countryConfig.pricingTierId === 'tier-2' || countryConfig.pricingTierId === 2 || countryConfig.pricingTierId === '2'
      ? 'Tier 2'
      : 'Tier 3')

  return (
    <tr className="bg-[#0B1528] text-white border-t-2 border-orange-500">
      <th
        colSpan={6}
        scope="colgroup"
        className="py-3 px-4 font-normal text-left"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-slate-800 text-orange-400 flex items-center justify-center shrink-0">
              <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs text-white tracking-wide">
                Country {countryIndex}: {countryConfig.countryName}
              </span>
              <span className="text-slate-400 text-xs">|</span>
              <span className="font-mono text-xs font-semibold text-orange-300">
                {countryConfig.currency} ({countryConfig.currencySymbol})
              </span>
              <span className="text-slate-400 text-xs">|</span>
              <span className="text-xs text-slate-300">
                {deploymentLabel}
              </span>
              <span className="text-slate-400 text-xs">|</span>
              <span className="text-xs text-slate-300">
                {pricingModelLabel}
              </span>
              <span className="text-slate-400 text-xs">|</span>
              <span className="text-xs text-slate-300">
                {tierLabel}
              </span>
              <span className="text-slate-400 text-xs">|</span>
              <span className="text-xs text-slate-300 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" aria-hidden="true" />
                <span>{countryConfig.contractTerm} months</span>
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-mono">
            Headcount:{' '}
            <strong className="text-white font-mono">
              {Number(countryConfig.headcount || 0).toLocaleString()}
            </strong>{' '}
            users
          </div>
        </div>
      </th>
    </tr>
  )
}

export default CountrySummarySectionHeader
