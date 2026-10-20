import { Package, Plus, Trash2, Info } from 'lucide-react'

const DEFAULT_TIERS = [
  { id: 'tier-1', code: 'Tier 1', name: 'Enterprise' },
  { id: 'tier-2', code: 'Tier 2', name: 'Mid-Market' },
  { id: 'tier-3', code: 'Tier 3', name: 'Growth' },
]

export function PackRatesSection({
  packRates = [],
  packs = [],
  pricingTiers = DEFAULT_TIERS,
  activeDeployment = 'Shared Cloud',
  activeCurrencySymbol = '₹',
  onUpdateRate,
  onRemoveRate,
  onOpenAddPackRate,
}) {
  const tiersToRender = pricingTiers.length > 0 ? pricingTiers : DEFAULT_TIERS

  const getPackProducts = (packId) => {
    const pack = packs.find((p) => p.id === packId)
    return pack?.productIds || []
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
            <Package className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Pack Rates (PEPM)
              </h3>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-medium bg-slate-100 text-slate-600">
                {packRates.length} configured
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Commercial multi-product bundles from Pack Builder • Recurring per employee per month
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenAddPackRate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Pack Rate</span>
        </button>
      </div>

      {/* Info notice */}
      <div className="px-5 py-2 bg-amber-50/50 border-b border-amber-100/70 text-[11px] text-amber-800 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
        <span>
          Tier rates are evaluated against customer committed active headcount. Total annual contracts and margins are computed exclusively on the backend.
        </span>
      </div>

      {/* Table / List */}
      {packRates.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-4 font-semibold">Pack Details</th>
                <th className="py-2.5 px-3 font-semibold">Deployment</th>
                <th className="py-2.5 px-3 font-semibold">Unit of Measure</th>
                {tiersToRender.map((tier) => (
                  <th
                    key={tier.id}
                    className="py-2.5 px-3 font-semibold text-right whitespace-nowrap"
                  >
                    {tier.code} ({tier.name})
                  </th>
                ))}
                <th className="py-2.5 px-3 font-semibold text-center w-12">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {packRates.map((rate) => {
                const productIds = getPackProducts(rate.packId)
                return (
                  <tr key={rate.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Pack Details */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {rate.packName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                          {rate.packCode}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {productIds.length} bundled products
                        </span>
                      </div>
                    </td>

                    {/* Deployment Model */}
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                        {rate.deploymentModel || activeDeployment}
                      </span>
                    </td>

                    {/* Unit of Measure */}
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap text-[11px]">
                      {rate.unitOfMeasure}
                    </td>

                    {/* Dynamic Tier Inputs */}
                    {tiersToRender.map((tier) => {
                      const fieldKey =
                        tier.id === 'tier-1'
                          ? 'tier1Rate'
                          : tier.id === 'tier-2'
                          ? 'tier2Rate'
                          : tier.id === 'tier-3'
                          ? 'tier3Rate'
                          : `${tier.id}Rate`
                      const val = rate[fieldKey] ?? ''

                      return (
                        <td key={tier.id} className="py-3 px-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <span className="text-[11px] text-slate-400 font-mono">
                              {activeCurrencySymbol}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              aria-label={`${rate.packName} ${tier.code} Rate`}
                              value={val}
                              onChange={(e) =>
                                onUpdateRate(rate.id, fieldKey, e.target.value)
                              }
                              className="w-20 px-2 py-1 text-right font-mono text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                            />
                          </div>
                        </td>
                      )
                    })}

                    {/* Action */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onRemoveRate(rate.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Remove rate row"
                        aria-label={`Remove ${rate.packName} rate`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-8 px-4 text-center">
          <p className="text-xs text-slate-500">
            No pack rates configured for current family and deployment filter.
          </p>
          <button
            type="button"
            onClick={onOpenAddPackRate}
            className="mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700 underline cursor-pointer"
          >
            + Add Pack Rate
          </button>
        </div>
      )}
    </div>
  )
}
