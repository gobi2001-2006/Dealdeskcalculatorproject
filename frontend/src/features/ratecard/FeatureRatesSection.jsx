import { Layers, Plus, Trash2, Info } from 'lucide-react'
import { ProductTypeBadge } from '../catalogue/ProductTypeBadge'

const DEFAULT_TIERS = [
  { id: 'tier-1', code: 'Tier 1', name: 'Enterprise' },
  { id: 'tier-2', code: 'Tier 2', name: 'Mid-Market' },
  { id: 'tier-3', code: 'Tier 3', name: 'Growth' },
]

export function FeatureRatesSection({
  family,
  featureRates = [],
  features = [],
  pricingTiers = DEFAULT_TIERS,
  activeDeployment = 'Shared Cloud',
  activeCurrencySymbol = '₹',
  isVersionLocked = false,
  isDualComponent = false,
  onUpdateRate,
  onRemoveRate,
  onOpenAddFeatureRate,
}) {
  const tiersToRender = pricingTiers.length > 0 ? pricingTiers : DEFAULT_TIERS
  const familyName = family?.name || 'Product Family'

  // Build catalogue summary from features belonging to this family
  const catalogueSummaryText =
    features.length > 0
      ? features
          .map((f) => `${f.name}${f.code ? ` (${f.code})` : ''}`)
          .join(', ')
      : `No standalone L2/L3 features configured for ${familyName}`

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {familyName} — À la Carte Feature Rates
              </h3>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-medium bg-slate-100 text-slate-600">
                {featureRates.length} configured
              </span>
              {isVersionLocked && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  Locked / Read-Only
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Individual catalogue modules and AI copilot add-ons • Recurring per employee per month
            </p>
          </div>
        </div>

        {!isVersionLocked && (
          <button
            type="button"
            onClick={onOpenAddFeatureRate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add Feature</span>
          </button>
        )}
      </div>

      {/* Catalogue summary line */}
      <div className="px-5 py-2.5 bg-slate-50/80 border-b border-slate-200/70 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">From Product Catalog (L2/L3 items): </span>
        <span className="font-mono text-[11px] text-slate-600">{catalogueSummaryText}</span>
      </div>

      {/* PEPM Formula Banner */}
      <div className="px-5 py-2 bg-sky-50/70 border-b border-sky-100 text-[11px] text-sky-900 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" aria-hidden="true" />
        <div>
          <span className="font-semibold text-sky-950">PEPM Formula: </span>
          <code className="bg-sky-100 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold text-sky-900">
            Rate per Active Employee (with ESS) per month × headcount × term months = Full Contract Value
          </code>
        </div>
      </div>

      {/* Table / List */}
      {featureRates.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-4 font-semibold min-w-[240px]">Feature / Product</th>
                <th className="py-2.5 px-3 font-semibold">Classification</th>
                <th className="py-2.5 px-3 font-semibold">Deployment</th>
                {isDualComponent &&
                  tiersToRender.map((tier, idx) => (
                    <th
                      key={`license-${tier.id}`}
                      className="py-2.5 px-3 font-semibold text-right whitespace-nowrap min-w-[110px] bg-amber-50/70 text-amber-900 border-l border-amber-200/70"
                    >
                      {tier.code || `Tier ${idx + 1}`} License Fee
                    </th>
                  ))}
                {tiersToRender.map((tier, idx) => (
                  <th
                    key={tier.id}
                    className={`py-2.5 px-3 font-semibold text-right whitespace-nowrap min-w-[110px] ${
                      isDualComponent ? 'bg-sky-50/70 text-sky-900 border-l border-sky-200/70' : ''
                    }`}
                  >
                    {isDualComponent
                      ? `${tier.code || `Tier ${idx + 1}`} PEPM`
                      : tier.name && tier.name !== tier.code
                      ? `${tier.code || `Tier ${idx + 1}`} (${tier.name})`
                      : tier.code || tier.name || `Tier ${idx + 1}`}
                  </th>
                ))}
                <th className="py-2.5 px-3 font-semibold text-center w-12">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {featureRates.map((rate) => {
                const featObj = features.find((f) => f.id === rate.featureId)
                const classification =
                  featObj?.classification ||
                  (rate.productType?.includes('AI') ? 'ai_enabled' : 'native')

                return (
                  <tr key={rate.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Feature Details */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {rate.featureName}
                      </div>

                      {/* Feature UOM beneath name */}
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                        UOM: <span>{rate.unitOfMeasure || 'Active Employees (with ESS)'}</span>
                      </div>

                      {/* Code */}
                      <div className="font-mono text-[10px] text-slate-500 mt-1">
                        {rate.productCode || featObj?.code}
                      </div>
                    </td>

                    {/* Classification / Product Type */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <ProductTypeBadge
                        type={
                          classification === 'ai_enabled'
                            ? 'AI Agent Module'
                            : rate.productType || 'Adrenalin Native'
                        }
                      />
                    </td>

                    {/* Deployment Model */}
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                        {rate.deploymentModel || activeDeployment}
                      </span>
                    </td>

                    {/* Dual Component: 1. One-time License Fee */}
                    {isDualComponent &&
                      tiersToRender.map((tier, idx) => {
                        const fixedKey = `fixed_tier_${tier.id}`
                        const fixedVal =
                          rate[fixedKey] ??
                          rate[`fixed_tier${idx + 1}Rate`] ??
                          rate[`fixed_${tier.id}Rate`] ??
                          ''

                        return (
                          <td
                            key={`fixed-${tier.id}`}
                            className="py-3 px-3 text-right bg-amber-50/20 border-l border-amber-100"
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              <span className="text-[11px] text-amber-600 font-mono">
                                {activeCurrencySymbol}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={isVersionLocked}
                                aria-label={`${rate.featureName} ${tier.code || `Tier ${idx + 1}`} License Fee`}
                                value={fixedVal}
                                onChange={(e) =>
                                  onUpdateRate(rate.id, fixedKey, e.target.value)
                                }
                                placeholder="0.00"
                                className="w-24 px-2 py-1 text-right font-mono text-xs border border-amber-200 rounded focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed bg-white"
                              />
                            </div>
                          </td>
                        )
                      })}

                    {/* Dynamic Tier Inputs (PEPM) */}
                    {tiersToRender.map((tier, idx) => {
                      const fieldKey =
                        tier.id === 'tier-1' || tier.id === 1
                          ? 'tier1Rate'
                          : tier.id === 'tier-2' || tier.id === 2
                          ? 'tier2Rate'
                          : tier.id === 'tier-3' || tier.id === 3
                          ? 'tier3Rate'
                          : `tier_${tier.id}`
                      const val =
                        rate[fieldKey] ??
                        rate[`tier_${tier.id}`] ??
                        rate[`tier${idx + 1}Rate`] ??
                        rate[tier.id] ??
                        rate[`${tier.id}Rate`] ??
                        ''

                      return (
                        <td
                          key={tier.id}
                          className={`py-3 px-3 text-right ${
                            isDualComponent ? 'bg-sky-50/20 border-l border-sky-100' : ''
                          }`}
                        >
                          <div className="inline-flex items-center justify-end gap-1">
                            <span className="text-[11px] text-slate-400 font-mono">
                              {activeCurrencySymbol}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              disabled={isVersionLocked}
                              aria-label={`${rate.featureName} ${tier.code || `Tier ${idx + 1}`} Rate`}
                              value={val}
                              onChange={(e) =>
                                onUpdateRate(rate.id, fieldKey, e.target.value)
                              }
                              className="w-24 px-2 py-1 text-right font-mono text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed bg-white"
                            />
                          </div>
                        </td>
                      )
                    })}

                    {/* Action */}
                    <td className="py-3 px-3 text-center">
                      {!isVersionLocked && (
                        <button
                          type="button"
                          onClick={() => onRemoveRate(rate.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title={`Remove rate for ${rate.featureName}`}
                          aria-label={`Remove ${rate.featureName} rate`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-6 px-4 text-center">
          <p className="text-xs text-slate-500">
            No à la carte feature rates configured for {familyName} under {activeDeployment}.
          </p>
          {!isVersionLocked && (
            <button
              type="button"
              onClick={onOpenAddFeatureRate}
              className="mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700 underline cursor-pointer"
            >
              + Add Feature
            </button>
          )}
        </div>
      )}
    </div>
  )
}
