 import { useState, useMemo } from 'react'
import { X, Layers, AlertCircle } from 'lucide-react'
import { PlatformRateInputs } from './PlatformRateInputs'
import { validatePlatformRateInputs } from '../rateCardFormatters'

const DEFAULT_TIERS = []

export function AddFeatureRateModal({
  isOpen,
  onClose,
  onSave,
  features = [],
  pricingTiers = DEFAULT_TIERS,
  targetFamilyId = null,
  families = [],
  activeDeployment = 'Shared Cloud',
  activePricing = '',
  layout = 'default',
  uoms = [],
  lockedUomId = null,
  activeCurrencySymbol = '$',
  existingFeatureRates = [],
}) {
  const tiersToRender = pricingTiers.length > 0 ? pricingTiers : DEFAULT_TIERS

  // Pre-filter features by family if targetFamilyId is provided
  const familyFeatures = useMemo(() => {
    if (targetFamilyId && targetFamilyId !== 'all') {
      return features.filter(
        (f) =>
          String(f.familyId) === String(targetFamilyId) ||
          String(f.product_family_id) === String(targetFamilyId),
      )
    }
    return features
  }, [features, targetFamilyId])

  // Filter available features not yet configured for this deployment & pricing model
  const availableFeatures = useMemo(() => {
    return familyFeatures.filter(
      (feat) =>
        !existingFeatureRates.some(
          (r) =>
            (r.featureId === feat.id || String(r.featureId) === String(feat.id)) &&
            r.deploymentModel === activeDeployment &&
            r.pricingModel === activePricing,
        ),
    )
  }, [familyFeatures, existingFeatureRates, activeDeployment, activePricing])

  const [selectedFeatureId, setSelectedFeatureId] = useState('')
  const [tierRates, setTierRates] = useState({})
  const [fixedTierRates, setFixedTierRates] = useState({})
  const [subscriptionRate, setSubscriptionRate] = useState('')
  const [amcTierRates, setAmcTierRates] = useState({})
  const [uomId, setUomId] = useState('')
  // The grid layout comes from the pricing model's components (master data), not from its name.
  const isPlatformSubscription = layout === 'platform'
  const isLicense = layout === 'license'
  const effectiveUomId = lockedUomId || uomId
  const [error, setError] = useState('')

  if (!isOpen) return null

  const effectiveFeatureId = selectedFeatureId || availableFeatures[0]?.id || ''
  const activeFeature = features.find((f) => String(f.id) === String(effectiveFeatureId))

  const handleTierRateChange = (tierId, value) => {
    setTierRates((prev) => ({ ...prev, [tierId]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!effectiveFeatureId) {
      setError('Please select a feature from the Product Catalogue.')
      return
    }

    if (isPlatformSubscription) {
      const platformError = validatePlatformRateInputs(tiersToRender, fixedTierRates, subscriptionRate)
      if (platformError) {
        setError(platformError)
        return
      }
    }

    if (isLicense) {
      for (const tier of tiersToRender) {
        const fee = tierRates[tier.id]
        const amc = amcTierRates[tier.id]
        const blank = (v) => v === undefined || v === null || String(v).trim() === ''
        if (!blank(fee) && (isNaN(Number(fee)) || Number(fee) < 0)) {
          setError(`Licence fee for ${tier.name || tier.code} must be a non-negative number.`)
          return
        }
        if (!blank(amc) && (isNaN(Number(amc)) || Number(amc) < 0 || Number(amc) > 100)) {
          setError(`AMC % for ${tier.name || tier.code} must be between 0 and 100.`)
          return
        }
        if (!blank(fee) && blank(amc)) {
          setError(`Enter the AMC % for ${tier.name || tier.code} (0 if no maintenance is charged).`)
          return
        }
      }
      if (!tiersToRender.some((t) => String(tierRates[t.id] ?? '').trim() !== '')) {
        setError('Enter the licence fee for at least one customer tier.')
        return
      }
    }

    // Validate tier rates
    for (const tier of tiersToRender) {
      const val = tierRates[tier.id]
      if (val !== undefined && val !== '' && val !== null) {
        const num = parseFloat(val)
        if (isNaN(num) || num < 0) {
          setError(`Rate for ${tier.name || tier.code} must be a valid non-negative number.`)
          return
        }
      }
    }

    const t1 = tierRates[tiersToRender[0]?.id] ?? ''
    const t2 = tierRates[tiersToRender[1]?.id] ?? ''
    const t3 = tierRates[tiersToRender[2]?.id] ?? ''

    const resolvedFeatId =
      activeFeature?.id != null
        ? !isNaN(Number(activeFeature.id))
          ? Number(activeFeature.id)
          : activeFeature.id
        : !isNaN(Number(effectiveFeatureId))
        ? Number(effectiveFeatureId)
        : effectiveFeatureId

    if (!effectiveUomId) {
      setError('Select the unit of measure this rate is charged per.')
      return
    }

    onSave({
      featureId: resolvedFeatId,
      productId: activeFeature?.productId,
      productCode: activeFeature?.code || 'FEAT-SKU',
      featureName: activeFeature?.name || 'Feature Add-on',
      familyId: activeFeature?.familyId || activeFeature?.product_family_id || targetFamilyId || 'all',
      productType:
        activeFeature?.classification === 'ai_enabled'
          ? 'AI Agent Module'
          : 'Adrenalin Native',
      deploymentModel: activeDeployment,
      pricingModel: activePricing,
      uomId: effectiveUomId ? Number(effectiveUomId) : null,
      unitOfMeasure: uoms.find((u) => String(u.id) === String(effectiveUomId))?.name || '',
      tierRates,
      fixedTierRates: isPlatformSubscription ? fixedTierRates : undefined,
      subscriptionRate: isPlatformSubscription ? String(subscriptionRate).trim() : undefined,
      amcTierRates: isLicense ? amcTierRates : undefined,
      tier1Rate: String(t1).trim(),
      tier2Rate: String(t2).trim(),
      tier3Rate: String(t3).trim(),
    })

    setTierRates({})
    setFixedTierRates({})
    setSubscriptionRate('')
    setAmcTierRates({})
    setError('')
    onClose()
  }

  const targetFamilyObj = families.find((f) => String(f.id) === String(targetFamilyId))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-feature-rate-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
              <Layers className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="add-feature-rate-title" className="text-[16px] font-bold text-slate-900">
                Add À la Carte Feature Rate
              </h2>
              <p className="text-[11px] text-slate-500">
                {targetFamilyObj ? `${targetFamilyObj.name} • ` : ''}Configure dynamic tier rates for an individual catalogue feature ({activeDeployment})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 text-[11px] rounded-lg bg-rose-50 text-rose-800 border border-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="feature-product-select" className="block text-[13px] font-semibold text-slate-700 mb-1">
              Select Feature <span className="text-rose-500">*</span>
            </label>
            {availableFeatures.length > 0 ? (
              <select
                id="feature-product-select"
                value={effectiveFeatureId}
                onChange={(e) => setSelectedFeatureId(e.target.value)}
                className="w-full px-3.5 py-2 text-[14px] border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                {availableFeatures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.code}) — {f.productName || 'Module'} [{f.classification || 'native'}]
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 text-[11px] rounded-lg bg-slate-50 text-slate-600 border border-slate-200">
                All catalogue features for this family already have rates configured for {activeDeployment} / {activePricing}.
              </div>
            )}
          </div>

          {/* Active feature details badge */}
          {activeFeature && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-[11px]">
              <div>
                <span className="font-semibold text-slate-800">{activeFeature.name}</span>
                <span className="font-mono text-[10px] text-slate-500 ml-2">Code: {activeFeature.code}</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700">
                {activeFeature.classification === 'ai_enabled' ? 'AI Agent' : 'Native Module'}
              </span>
            </div>
          )}

          <div>
            <label htmlFor="uom-input" className="block text-[13px] font-semibold text-slate-700 mb-1">
              Unit of Measure {lockedUomId && <span className="text-slate-400 font-normal">(fixed by the pricing model)</span>}
            </label>
            <select
              id="uom-input"
              value={effectiveUomId || ''}
              onChange={(e) => setUomId(e.target.value)}
              disabled={Boolean(lockedUomId)}
              className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${
                lockedUomId ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed font-medium' : 'bg-white border-slate-300'
              }`}
            >
              <option value="">{uoms.length ? '-- Select unit of measure --' : '-- No units of measure loaded --'}</option>
              {uoms.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </option>
              ))}
            </select>
          </div>

          {isLicense ? (
            <PlatformRateInputs
              variant="license"
              idPrefix="feature-licence"
              tiers={tiersToRender}
              unitTierRates={tierRates}
              onChangeUnit={handleTierRateChange}
              amcTierRates={amcTierRates}
              onChangeAmc={(tierId, value) => setAmcTierRates((prev) => ({ ...prev, [tierId]: value }))}
              currencySymbol={activeCurrencySymbol}
            />
          ) : isPlatformSubscription ? (
            <PlatformRateInputs
              idPrefix="feature-platform"
              tiers={tiersToRender}
              fixedTierRates={fixedTierRates}
              onChangeFixed={(tierId, value) => setFixedTierRates((prev) => ({ ...prev, [tierId]: value }))}
              subscriptionRate={subscriptionRate}
              onChangeSubscription={setSubscriptionRate}
              currencySymbol={activeCurrencySymbol}
            />
          ) : (
          /* Dynamic Tiers Grid */
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
              Configured Customer Tier Rates ({activeCurrencySymbol})
            </label>
            <div className={`grid gap-3 ${tiersToRender.length <= 2 ? 'grid-cols-2' : tiersToRender.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
              {tiersToRender.map((tier) => (
                <div key={tier.id}>
                  <label
                    htmlFor={`feature-tier-input-${tier.id}`}
                    className="block text-[11px] font-medium text-slate-600 mb-1 truncate"
                    title={tier.name || tier.code}
                  >
                    {tier.name && tier.name !== tier.code
                      ? `${tier.code} (${tier.name})`
                      : tier.code || tier.name}
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-[10px] font-mono text-slate-400">
                      {activeCurrencySymbol}
                    </span>
                    <input
                      id={`feature-tier-input-${tier.id}`}
                      type="number"
                      min="0"
                      step="any"
                      value={tierRates[tier.id] ?? ''}
                      onChange={(e) => handleTierRateChange(tier.id, e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-6 pr-2.5 py-1.5 text-[13px] sm:text-[14px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={availableFeatures.length === 0}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Add Feature Rate
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
