import { useState, useMemo } from 'react'
import { X, Package, AlertCircle } from 'lucide-react'
import { PlatformRateInputs } from './PlatformRateInputs'
import { validatePlatformRateInputs } from '../rateCardFormatters'

const DEFAULT_TIERS = []

export function AddPackRateModal({
  isOpen,
  onClose,
  onSave,
  packs = [],
  pricingTiers = DEFAULT_TIERS,
  targetFamilyId = null,
  families = [],
  activeDeployment = 'Shared Cloud',
  activePricing = '',
  layout = 'default',
  uoms = [],
  lockedUomId = null,
  activeCurrencySymbol = '$',
  existingPackRates = [],
}) {
  const tiersToRender = pricingTiers.length > 0 ? pricingTiers : DEFAULT_TIERS

  // Filter available packs by selected family
  const familyPacks = useMemo(() => {
    if (targetFamilyId && targetFamilyId !== 'all') {
      return packs.filter(
        (p) =>
          String(p.familyId) === String(targetFamilyId) ||
          String(p.product_family_id) === String(targetFamilyId) ||
          (Array.isArray(p.familyIds) && p.familyIds.some((fid) => String(fid) === String(targetFamilyId))),
      )
    }
    return packs
  }, [packs, targetFamilyId])

  // Exclude packs that already have a configured rate row for this deployment and pricing model
  const availablePacks = useMemo(() => {
    return familyPacks.filter(
      (p) =>
        !existingPackRates.some(
          (r) =>
            (String(r.packId) === String(p.id) || String(r.packId) === String(p.packId)) &&
            (r.deploymentModel === activeDeployment ||
              String(r.deploymentModel).toLowerCase() === String(activeDeployment).toLowerCase()) &&
            (r.pricingModel === activePricing ||
              String(r.pricingModel).toLowerCase() === String(activePricing).toLowerCase()),
        ),
    )
  }, [familyPacks, existingPackRates, activeDeployment, activePricing])

  // The grid layout comes from the pricing model's components (master data), not from its name.
  const isPlatformSubscription = layout === 'platform'
  const isLicense = layout === 'license'
  const isDualComponent = false
  const fixedFeeLabel = 'Platform Fee'
  const unitRateLabel = 'Rate'

  const [selectedPackId, setSelectedPackId] = useState('')
  const [tierRates, setTierRates] = useState({})
  const [fixedTierRates, setFixedTierRates] = useState({})
  const [uomId, setUomId] = useState('')
  const [subscriptionRate, setSubscriptionRate] = useState('')
  const [amcTierRates, setAmcTierRates] = useState({})
  const effectiveUomId = lockedUomId || uomId
  const [error, setError] = useState('')

  if (!isOpen) return null

  const effectivePackId = selectedPackId || availablePacks[0]?.id || ''
  const activePack = packs.find((p) => String(p.id) === String(effectivePackId))

  const handleTierRateChange = (tierId, value) => {
    setTierRates((prev) => ({ ...prev, [tierId]: value }))
  }

  const handleFixedTierRateChange = (tierId, value) => {
    setFixedTierRates((prev) => ({ ...prev, [tierId]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!effectivePackId) {
      setError('Please select a valid pack from Pack Builder.')
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
      if (isDualComponent) {
        const fVal = fixedTierRates[tier.id]
        if (fVal !== undefined && fVal !== '' && fVal !== null) {
          const fNum = parseFloat(fVal)
          if (isNaN(fNum) || fNum < 0) {
            setError(`${fixedFeeLabel} for ${tier.name || tier.code} must be a valid non-negative number.`)
            return
          }
        }
      }
    }

    const t1 = tierRates[tiersToRender[0]?.id] ?? ''
    const t2 = tierRates[tiersToRender[1]?.id] ?? ''
    const t3 = tierRates[tiersToRender[2]?.id] ?? ''

    const ft1 = fixedTierRates[tiersToRender[0]?.id] ?? ''
    const ft2 = fixedTierRates[tiersToRender[1]?.id] ?? ''
    const ft3 = fixedTierRates[tiersToRender[2]?.id] ?? ''

    const resolvedFamilyId =
      activePack?.familyId ||
      activePack?.product_family_id ||
      activePack?.familyIds?.[0] ||
      (targetFamilyId && targetFamilyId !== 'all' ? targetFamilyId : null) ||
      (families.length > 0 ? families[0].id : 'all')

    if (!effectiveUomId) {
      setError('Select the unit of measure this rate is charged per.')
      return
    }

    onSave({
      packId: activePack?.id || effectivePackId,
      packCode: activePack?.code || 'PACK-SKU',
      packName: activePack?.name || 'Commercial Pack',
      familyId: resolvedFamilyId,
      familyIds: activePack?.familyIds || (resolvedFamilyId !== 'all' ? [resolvedFamilyId] : []),
      deploymentModel: activeDeployment,
      pricingModel: activePricing,
      uomId: effectiveUomId ? Number(effectiveUomId) : null,
      unitOfMeasure: uoms.find((u) => String(u.id) === String(effectiveUomId))?.name || '',
      tierRates,
      fixedTierRates,
      subscriptionRate: isPlatformSubscription ? String(subscriptionRate).trim() : undefined,
      amcTierRates: isLicense ? amcTierRates : undefined,
      tier1Rate: String(t1).trim(),
      tier2Rate: String(t2).trim(),
      tier3Rate: String(t3).trim(),
      fixed_tier1Rate: String(ft1).trim(),
      fixed_tier2Rate: String(ft2).trim(),
      fixed_tier3Rate: String(ft3).trim(),
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
            {familyPacks.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>No Saved Packs in Pack Builder</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  No saved packs exist for {targetFamilyObj?.name || 'this product family'} in the Pack Builder. Please build and save a pack first before configuring its rates.
                </p>
                <div className="pt-1">
                  <a
                    href="/packs"
                    className="inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700 underline text-xs"
                  >
                    Go to Pack Builder &rarr;
                  </a>
                </div>
              </div>
            ) : availablePacks.length > 0 ? (
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
              <div className="p-4 text-xs rounded-lg bg-slate-50 text-slate-700 border border-slate-200 space-y-1">
                <div className="font-semibold text-slate-900">All Packs Configured</div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  All {familyPacks.length} saved packs in {targetFamilyObj?.name || 'this family'} already have rates configured for {activeDeployment} / {activePricing}. You can edit their tier rates directly in the rate matrix table.
                </p>
              </div>
            )}
          </div>

          {/* Active pack bundled items preview */}
          {activePack?.items && activePack.items.length > 0 && availablePacks.length > 0 && (
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
              idPrefix="pack-licence"
              tiers={tiersToRender}
              unitTierRates={tierRates}
              onChangeUnit={handleTierRateChange}
              amcTierRates={amcTierRates}
              onChangeAmc={(tierId, value) => setAmcTierRates((prev) => ({ ...prev, [tierId]: value }))}
              currencySymbol={activeCurrencySymbol}
            />
          ) : isPlatformSubscription ? (
            <PlatformRateInputs
              idPrefix="pack-platform"
              tiers={tiersToRender}
              fixedTierRates={fixedTierRates}
              onChangeFixed={handleFixedTierRateChange}
              subscriptionRate={subscriptionRate}
              onChangeSubscription={setSubscriptionRate}
              currencySymbol={activeCurrencySymbol}
            />
          ) : (
          /* Dynamic Tiers Grid */
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Configured Customer Tier Rates ({activeCurrencySymbol})
            </label>
            <div className={`grid gap-3 ${tiersToRender.length <= 2 ? 'grid-cols-2' : tiersToRender.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
              {tiersToRender.map((tier) => (
                <div key={tier.id} className="space-y-2">
                  <span
                    className="block text-[11px] font-bold text-slate-700 truncate"
                    title={tier.name || tier.code}
                  >
                    {tier.name && tier.name !== tier.code
                      ? `${tier.code} (${tier.name})`
                      : tier.code || tier.name}
                  </span>

                  {isDualComponent && (
                    <div>
                      <label
                        htmlFor={`fixed-input-${tier.id}`}
                        className="block text-[10px] font-medium text-amber-700 mb-0.5"
                      >
                        {fixedFeeLabel}
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-[10px] font-mono text-amber-600">
                          {activeCurrencySymbol}
                        </span>
                        <input
                          id={`fixed-input-${tier.id}`}
                          type="number"
                          min="0"
                          step="any"
                          value={fixedTierRates[tier.id] ?? ''}
                          onChange={(e) => handleFixedTierRateChange(tier.id, e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-6 pr-2.5 py-1.5 text-xs border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono bg-amber-50/20"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor={`tier-input-${tier.id}`}
                      className="block text-[10px] font-medium text-slate-600 mb-0.5"
                    >
                      {isDualComponent ? unitRateLabel : 'Rate'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-[10px] font-mono text-slate-400">
                        {activeCurrencySymbol}
                      </span>
                      <input
                        id={`tier-input-${tier.id}`}
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`${tier.code || `Tier ${tier.id}`} (${tier.name || 'Tier'})`}
                        value={tierRates[tier.id] ?? ''}
                        onChange={(e) => handleTierRateChange(tier.id, e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-6 pr-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono"
                      />
                    </div>
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
