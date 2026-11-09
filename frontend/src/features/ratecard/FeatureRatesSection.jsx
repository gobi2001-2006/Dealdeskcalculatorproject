import { useMemo } from 'react'
import { Layers, Plus, Trash2, Info, AlertCircle } from 'lucide-react'
import { ProductTypeBadge } from '../catalogue/ProductTypeBadge'
import { PlatformRatesTable } from './PlatformRatesTable'

// Tier columns come only from saved customer tiers.
const DEFAULT_TIERS = []

export function FeatureRatesSection({
  family,
  featureRates = [],
  features = [],
  pricingTiers = DEFAULT_TIERS,
  activeDeployment = 'Shared Cloud',
  activeCurrencySymbol = '$',
  isVersionLocked = false,
  isDualComponent = false,
  apiError = null,
  // Platform + Subscription layout: tier platform fees + one UOM + one subscription rate per feature
  layout = 'default',
  allowedUoms = [],
  lockedUomId = null,
  fixedFeeBasis = 'annual',
  unitRateBasis = 'monthly',
  onUpdatePlatformRate,
  onUpdateRate,
  onRemoveRate,
  onOpenAddFeatureRate,
}) {
  const isPlatformLayout = layout === 'platform' || layout === 'license'
  const tiersToRender = pricingTiers.length > 0 ? pricingTiers : DEFAULT_TIERS
  const familyName = family?.name || 'Product Family'

  // Only include features that have available/entered rate data
  const combinedFeatures = useMemo(() => {
    const list = []

    const hasEnteredRate = (r) => {
      if (!r) return false
      const hasVal = (v) => v !== undefined && v !== null && String(v).trim() !== '' && Number(v) > 0
      return Boolean(
        hasVal(r.tier1Rate) ||
          hasVal(r.tier2Rate) ||
          hasVal(r.tier3Rate) ||
          hasVal(r.tier_1) ||
          hasVal(r.tier_2) ||
          hasVal(r.tier_3) ||
          hasVal(r.fixed_tier1Rate) ||
          hasVal(r.fixed_tier2Rate) ||
          hasVal(r.fixed_tier3Rate) ||
          hasVal(r.fixed_tier_1) ||
          hasVal(r.fixed_tier_2) ||
          hasVal(r.fixed_tier_3) ||
          hasVal(r.unit_rate) ||
          hasVal(r.fixed_fee) ||
          (pricingTiers &&
            pricingTiers.some(
              (t) =>
                hasVal(r[t.id]) ||
                hasVal(r[`tier_${t.id}`]) ||
                hasVal(r[`tier${t.id}Rate`]) ||
                hasVal(r[`fixed_tier_${t.id}`]) ||
                hasVal(r[`fixed_${t.id}Rate`]),
            )),
      )
    }

    // One row per saved rate schedule: a feature may be priced under several units of measure.
    const seenRowIds = new Set()
    featureRates.forEach((rate) => {
      if (!hasEnteredRate(rate) || seenRowIds.has(String(rate.id))) return
      seenRowIds.add(String(rate.id))
      const feat = features.find((f) => String(f.id) === String(rate.featureId))
      list.push({
        ...rate,
        rowKey: String(rate.id),
        featureName: feat?.name || rate.featureName,
        productCode: feat?.code || rate.productCode,
        classification: feat?.classification || rate.classification,
        productType:
          feat?.productType ||
          rate.productType ||
          ((feat?.classification || rate.classification) === 'ai_enabled' ? 'AI Agent Module' : 'Adrenalin Native'),
        deploymentModel: rate.deploymentModel || activeDeployment,
        isConfigured: true,
      })
    })

    return list
  }, [features, featureRates, activeDeployment, pricingTiers])

  const configuredCount = combinedFeatures.length

  // Build catalogue summary line of available configured features
  const catalogueSummaryText =
    combinedFeatures.length > 0
      ? combinedFeatures
          .map((f) => `${f.featureName || f.name}${f.productCode ? ` (${f.productCode})` : ''}`)
          .join(', ')
      : `No features configured for ${familyName}`

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
                {configuredCount} configured
              </span>
              {isVersionLocked && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  Locked / Read-Only
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Individual catalogue modules and AI copilot add-ons •{' '}
              {layout === 'license'
                ? 'Licence fee per user + AMC % by tier'
                : isPlatformLayout
                ? 'Platform fee by tier + Subscription rate per UOM'
                : 'Recurring rate per unit, by tier'}
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
          <span className="font-semibold text-sky-950">Pricing Structure: </span>
          <code className="bg-sky-100 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold text-sky-900">
            {layout === 'license'
              ? 'Contract Value = Licence Fee per User × Users + (Licence Total × AMC %) × Contract Years'
              : isPlatformLayout
              ? 'Contract Value = Tier Platform Fee × Contract Years + Subscription Rate × Volume × Billing Periods'
              : 'Rate per unit × Quantity × Billing Periods = Full Contract Value'}
          </code>
        </div>
      </div>

      {/* API Error State */}
      {apiError && (
        <div className="px-5 py-3 bg-rose-50 border-b border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>Failed to load feature rates from database: {apiError}</span>
        </div>
      )}

      {/* Table / List */}
      {isPlatformLayout && combinedFeatures.length > 0 ? (
        <PlatformRatesTable
          nameHeader="Feature"
          variant={layout === 'license' ? 'license' : 'platform'}
          rows={combinedFeatures.map((rate) => ({
            id: rate.id,
            key: rate.rowKey || rate.id,
            name: rate.featureName,
            code: rate.productCode,
            tierFees: Object.fromEntries(tiersToRender.map((t) => [t.id, rate[`fixed_tier_${t.id}`] ?? ''])),
            tierRates: Object.fromEntries(tiersToRender.map((t) => [t.id, rate[`tier_${t.id}`] ?? ''])),
            tierAmc: Object.fromEntries(tiersToRender.map((t) => [t.id, rate[`amc_tier_${t.id}`] ?? ''])),
            perTierRates: rate.perTierRates ?? Boolean(rate.subscriptionRateMixed),
            uomId: rate.uomId,
            uomName: rate.unitOfMeasure,
            uomMixed: rate.uomMixed,
            subscriptionRate: rate.subscriptionRate ?? '',
            subscriptionRateMixed: rate.subscriptionRateMixed,
          }))}
          pricingTiers={tiersToRender}
          allowedUoms={allowedUoms}
          lockedUomId={lockedUomId}
          fixedFeeBasis={fixedFeeBasis}
          unitRateBasis={unitRateBasis}
          currencySymbol={activeCurrencySymbol}
          isVersionLocked={isVersionLocked}
          onChange={onUpdatePlatformRate}
          onRemove={onRemoveRate}
        />
      ) : combinedFeatures.length > 0 ? (
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
              {combinedFeatures.map((rate) => {
                const featObj = features.find((f) => String(f.id) === String(rate.featureId))
                const classification =
                  rate.classification ||
                  featObj?.classification ||
                  (rate.productType?.includes('AI') ? 'ai_enabled' : 'native')

                return (
                  <tr key={rate.rowKey || rate.id || rate.featureId} className="hover:bg-slate-50/70 transition-colors">
                    {/* Feature Details */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {rate.featureName}
                        </span>
                      </div>

                      {/* Feature UOM beneath name */}
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                        UOM: <span>{rate.unitOfMeasure || '—'}</span>
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
                      const fieldKey = `tier_${tier.id}`
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
                              placeholder="0.00"
                              className="w-24 px-2 py-1 text-right font-mono text-xs border border-slate-200 rounded focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed bg-white"
                            />
                          </div>
                        </td>
                      )
                    })}

                    {/* Action */}
                    <td className="py-3 px-3 text-center">
                      {!isVersionLocked && rate.isConfigured && (
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
        /* Empty state: No catalogue features configured for this family */
        <div className="py-8 px-4 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Layers className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-slate-700">
            No catalogue features available for {familyName}
          </p>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            Standalone modules and AI agent copilot features can be registered in the Product Catalog.
          </p>
          {!isVersionLocked && (
            <div className="pt-1">
              <a
                href="/catalogue"
                className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 underline cursor-pointer"
              >
                Go to Product Catalogue &rarr;
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
