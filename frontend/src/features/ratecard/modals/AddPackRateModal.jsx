import { useState, useMemo } from 'react'
import { X, Package, AlertCircle } from 'lucide-react'

const DEFAULT_TIERS = [
  { id: 'tier-1', code: 'Tier 1', name: 'Enterprise' },
  { id: 'tier-2', code: 'Tier 2', name: 'Mid-Market' },
  { id: 'tier-3', code: 'Tier 3', name: 'Growth' },
]

export function AddPackRateModal({
  isOpen,
  onClose,
  onSave,
  packs = [],
  pricingTiers = DEFAULT_TIERS,
  targetFamilyId = null,
  families = [],
  activeDeployment = 'Shared Cloud',
  activePricing = 'PEPM',
  existingPackRates = [],
}) {
  const tiersToRender = pricingTiers.length > 0 ? pricingTiers : DEFAULT_TIERS

  // Filter available packs:
  // If targetFamilyId is provided, narrow down to packs in that family
  const familyPacks = useMemo(() => {
    if (targetFamilyId && targetFamilyId !== 'all') {
      return packs.filter(
        (p) =>
          String(p.familyId) === String(targetFamilyId) ||
          String(p.product_family_id) === String(targetFamilyId),
      )
    }
    return packs
  }, [packs, targetFamilyId])

  const availablePacks = useMemo(() => {
    return familyPacks.filter(
      (p) =>
        !existingPackRates.some(
          (r) =>
            (r.packId === p.id || r.packId === p.packId) &&
            r.deploymentModel === activeDeployment &&
            r.pricingModel === activePricing,
        ),
    )
  }, [familyPacks, existingPackRates, activeDeployment, activePricing])

  const [selectedPackId, setSelectedPackId] = useState('')
  const [tierRates, setTierRates] = useState({})
  const [uom, setUom] = useState('Active Employees (with ESS)')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const effectivePackId = selectedPackId || availablePacks[0]?.id || ''
  const activePack = packs.find((p) => String(p.id) === String(effectivePackId))

  const handleTierRateChange = (tierId, value) => {
    setTierRates((prev) => ({ ...prev, [tierId]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!effectivePackId) {
      setError('Please select a pack from Pack Builder.')
      return
    }

    // Validate tier rate inputs
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
      packId: activePack?.id || effectivePackId,
      packCode: activePack?.code || 'PACK-SKU',
      packName: activePack?.name || 'Commercial Pack',
      familyId: activePack?.familyId || activePack?.product_family_id || targetFamilyId || 'fam-ta',
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
      aria-labelledby="add-pack-rate-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
              <Package className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="add-pack-rate-title" className="text-sm font-bold text-slate-900">
                Add Pack Rate ({activeDeployment})
              </h2>
              <p className="text-xs text-slate-500">
                {targetFamilyObj ? `${targetFamilyObj.name} • ` : ''}Configure dynamic tier pricing for a Pack Builder suite
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
            <label htmlFor="pack-select" className="block text-xs font-semibold text-slate-700 mb-1">
              Select Pack (from Pack Builder) <span className="text-rose-500">*</span>
            </label>
            {availablePacks.length > 0 ? (
              <select
                id="pack-select"
                value={effectivePackId}
                onChange={(e) => setSelectedPackId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                {availablePacks.map((p) => {
                  const reqCount = (p.items || []).filter((it) => it.is_required !== false).length
                  const optCount = (p.items || []).filter((it) => it.is_required === false).length
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) — {reqCount} req, {optCount} opt features
                    </option>
                  )
                })}
              </select>
            ) : (
              <div className="p-3 text-xs rounded-lg bg-slate-50 text-slate-600 border border-slate-200">
                All existing packs already have rates configured for {activeDeployment} / {activePricing}.
              </div>
            )}
          </div>

          {/* Active pack bundled items preview */}
          {activePack?.items && activePack.items.length > 0 && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Configured Features in {activePack.name}:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {activePack.items.map((it) => (
                  <span
                    key={it.id || it.feature_id}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      it.is_required !== false
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mr-1 ${
                        it.is_required !== false ? 'bg-emerald-500' : 'bg-indigo-500'
                      }`}
                    />
                    {it.name || it.feature?.name} ({it.is_required !== false ? 'Required' : 'Optional'})
                  </span>
                ))}
              </div>
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
                    htmlFor={`tier-input-${tier.id}`}
                    className="block text-[11px] font-medium text-slate-600 mb-1 truncate"
                    title={tier.name || tier.code}
                  >
                    {tier.name && tier.name !== tier.code
                      ? `${tier.code} (${tier.name})`
                      : tier.code || tier.name}
                  </label>
                  <input
                    id={`tier-input-${tier.id}`}
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
              disabled={availablePacks.length === 0}
              className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Add Pack Rate
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
