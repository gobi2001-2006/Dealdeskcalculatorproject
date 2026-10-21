 import { useState, useMemo } from 'react'
import { X, Layers, AlertCircle } from 'lucide-react'

const DEFAULT_TIERS = [
  { id: 'tier-1', code: 'Tier 1', name: 'Enterprise' },
  { id: 'tier-2', code: 'Tier 2', name: 'Mid-Market' },
  { id: 'tier-3', code: 'Tier 3', name: 'Growth' },
]

export function AddFeatureRateModal({
  isOpen,
  onClose,
  onSave,
  features = [],
  pricingTiers = DEFAULT_TIERS,
  targetFamilyId = null,
  families = [],
  activeDeployment = 'Shared Cloud',
  activePricing = 'PEPM',
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
  const [uom, setUom] = useState('Active Employees (with ESS)')
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

    onSave({
      featureId: activeFeature?.id ? Number(activeFeature.id) : Number(effectiveFeatureId),
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
      unitOfMeasure: uom,
      tierRates,
      tier1Rate: String(t1).trim() || '0',
      tier2Rate: String(t2).trim() || '0',
      tier3Rate: String(t3).trim() || '0',
    })

    setTierRates({})
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
              <h2 id="add-feature-rate-title" className="text-sm font-bold text-slate-900">
                Add À la Carte Feature Rate
              </h2>
              <p className="text-xs text-slate-500">
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
            <div className="flex items-start gap-2 p-3 text-xs rounded-lg bg-rose-50 text-rose-800 border border-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="feature-product-select" className="block text-xs font-semibold text-slate-700 mb-1">
              Select Feature (from Product Catalogue L2/L3) <span className="text-rose-500">*</span>
            </label>
            {availableFeatures.length > 0 ? (
              <select
                id="feature-product-select"
                value={effectiveFeatureId}
                onChange={(e) => setSelectedFeatureId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                {availableFeatures.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.code}) — {f.productName || 'Module'} [{f.classification || 'native'}]
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 text-xs rounded-lg bg-slate-50 text-slate-600 border border-slate-200">
                All catalogue features for this family already have rates configured for {activeDeployment} / {activePricing}.
              </div>
            )}
          </div>

          {/* Active feature details badge */}
          {activeFeature && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
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
            <label htmlFor="uom-input" className="block text-xs font-semibold text-slate-700 mb-1">
              Unit of Measure
            </label>
            <input
              id="uom-input"
              type="text"
              value={uom}
              onChange={(e) => setUom(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          {/* Dynamic Tiers Grid */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Configured Customer Tier Rates
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
                  <input
                    id={`feature-tier-input-${tier.id}`}
                    type="number"
                    min="0"
                    step="any"
                    value={tierRates[tier.id] ?? ''}
                    onChange={(e) => handleTierRateChange(tier.id, e.target.value)}
                    placeholder="Rate"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={availableFeatures.length === 0}
              className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Add Feature Rate
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
