import { useMemo, useState, useEffect } from 'react'
import {
  Package,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { resolveRateCard } from '../../../api/ratesApi'
import { describeApiError } from '../../../api/proposalsApi'
import { FeaturesTable } from './FeaturesTable'
import { activePackVersion } from '../calculatorData'

export function FamilyConfigCard({
  familyConfig,
  countryHeadcount = '',
  countryId = null,
  pricingTierId = null,
  deploymentModelId = null,
  pricingModelId = null,
  currencySymbol = '',
  onUpdateFamily,
  onRemoveFamily,
  families = [],
  packs = [],
  products = [],
  features = [],
}) {
  const familyMaster =
    families.find((f) => String(f.id) === String(familyConfig.familyId)) || {
      id: familyConfig.familyId,
      name: familyConfig.familyId ? `Product family #${familyConfig.familyId}` : 'Unassigned product family',
      code: '—',
    }

  // Saved packs of this family that have an active version.
  const availablePacks = useMemo(
    () =>
      packs.filter(
        (p) =>
          String(p.product_family_id) === String(familyConfig.familyId) &&
          (p.status || 'active') === 'active' &&
          activePackVersion(p),
      ),
    [familyConfig.familyId, packs],
  )

  // The pack (and version) behind the selected pack version id.
  const selectedPack = useMemo(() => {
    if (!familyConfig.selectedPackId) return null
    return (
      packs.find((p) => (p.pack_versions || []).some((v) => String(v.id) === String(familyConfig.selectedPackId))) ||
      null
    )
  }, [familyConfig.selectedPackId, packs])
  const selectedVersion =
    selectedPack?.pack_versions?.find((v) => String(v.id) === String(familyConfig.selectedPackId)) || null

  // Feature ids contained in the selected pack version (locked in the features table).
  const packFeatureIds = useMemo(
    () => (selectedVersion?.pack_items || []).map((pi) => pi.feature_id),
    [selectedVersion],
  )

  const handlePackChange = (packVersionId) => {
    const nextPackFeatures = new Set()
    packs.forEach((p) =>
      (p.pack_versions || []).forEach((v) => {
        if (String(v.id) === String(packVersionId)) (v.pack_items || []).forEach((pi) => nextPackFeatures.add(String(pi.feature_id)))
      }),
    )
    onUpdateFamily({
      ...familyConfig,
      selectedPackId: packVersionId ? Number(packVersionId) : null,
      // A standalone feature that is now inside the pack would be charged twice: drop it.
      selectedFeatureIds: (familyConfig.selectedFeatureIds || []).filter((fid) => !nextPackFeatures.has(String(fid))),
    })
  }

  const handleToggleFeature = (featureId) => {
    const current = familyConfig.selectedFeatureIds || []
    const exists = current.some((id) => String(id) === String(featureId))
    onUpdateFamily({
      ...familyConfig,
      selectedFeatureIds: exists
        ? current.filter((id) => String(id) !== String(featureId))
        : [...current, Number(featureId)],
    })
  }

  // Live rate-card lookup for the selected pack (display only; the backend prices the proposal).
  const [rateResolution, setRateResolution] = useState({ status: 'idle', rate: null, message: '' })

  useEffect(() => {
    let isCancelled = false
    const dims = [familyConfig.selectedPackId, countryId, pricingTierId, deploymentModelId, pricingModelId].map(Number)
    if (dims.some((d) => !Number.isInteger(d) || d <= 0)) {
      setRateResolution({ status: 'idle', rate: null, message: '' }) // eslint-disable-line react-hooks/set-state-in-effect
      return
    }
    const [packVersionId, cId, tId, dId, pmId] = dims
    setRateResolution({ status: 'loading', rate: null, message: 'Resolving rate card...' })

    resolveRateCard({
      country_id: cId,
      tier_id: tId,
      deployment_model_id: dId,
      pricing_model_id: pmId,
      pack_version_id: packVersionId,
    })
      .then((data) => {
        if (isCancelled) return
        const parts = []
        if (data.fixed_fee !== null && data.fixed_fee !== undefined) {
          parts.push(`platform fee ${data.currency_code} ${Number(data.fixed_fee).toLocaleString()} / year`)
        }
        if (data.unit_rate !== null && data.unit_rate !== undefined) {
          parts.push(`${data.currency_code} ${Number(data.unit_rate).toFixed(2)} / unit / month`)
        }
        setRateResolution({ status: 'resolved', rate: data, message: `Rate card #${data.rate_card_id}: ${parts.join(' + ')}` })
      })
      .catch((err) => {
        if (isCancelled) return
        const status = err.response?.status
        setRateResolution({
          status: status === 404 ? 'missing' : status === 409 ? 'ambiguous' : 'error',
          rate: null,
          message: describeApiError(err, 'Rate card could not be resolved'),
        })
      })

    return () => {
      isCancelled = true
    }
  }, [familyConfig.selectedPackId, countryId, pricingTierId, deploymentModelId, pricingModelId])

  const badgeClass = {
    missing: 'bg-amber-50 text-amber-900 border-amber-300',
    ambiguous: 'bg-rose-50 text-rose-900 border-rose-300',
    error: 'bg-rose-50 text-rose-900 border-rose-300',
  }

  return (
    <div className="bg-slate-50/70 rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
      {/* Family Card Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-800 shadow-2xs">
            <Package className="w-4 h-4 text-orange-600" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 tracking-tight">{familyMaster.name}</h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200/80 text-slate-700">
                {familyMaster.code}
              </span>
            </div>
            <p className="text-[10px] text-slate-500">Pack and standalone feature selection.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRemoveFamily}
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-200"
          title={`Remove ${familyMaster.name} configuration`}
          aria-label={`Remove ${familyMaster.name} family`}
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Pack Selection & Quantity Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
        <div className="md:col-span-8">
          <div className="flex items-center justify-between mb-1.5 h-4">
            <label htmlFor={`pack-select-${familyConfig.id}`} className="block text-xs font-semibold text-slate-700">
              Pack Selection (active pack versions from Pack Builder)
            </label>
          </div>
          <select
            id={`pack-select-${familyConfig.id}`}
            value={familyConfig.selectedPackId || ''}
            onChange={(e) => handlePackChange(e.target.value)}
            className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
          >
            <option value="">-- No Pack (À la Carte Features Only) --</option>
            {/* Keep a saved selection visible even if that version is no longer active. */}
            {selectedPack && selectedVersion && !availablePacks.includes(selectedPack) && (
              <option value={selectedVersion.id}>
                {selectedPack.name} — Version {selectedVersion.version_no} ({selectedVersion.status})
              </option>
            )}
            {availablePacks.map((pack) => {
              const version = activePackVersion(pack)
              return (
                <option key={version.id} value={version.id}>
                  {pack.name} ({pack.code || pack.variant}) — Version {version.version_no}
                </option>
              )
            })}
          </select>
          {availablePacks.length === 0 && (
            <p className="mt-1 text-[11px] text-slate-500">No active pack versions are saved for this family.</p>
          )}

          {familyConfig.selectedPackId && rateResolution.status !== 'idle' && (
            <div className="mt-2">
              {rateResolution.status === 'loading' && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>
                  <span>Resolving rate card...</span>
                </span>
              )}
              {rateResolution.status === 'resolved' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>{rateResolution.message}</span>
                </span>
              )}
              {badgeClass[rateResolution.status] && (
                <span className={`inline-flex items-start gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border ${badgeClass[rateResolution.status]}`}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{rateResolution.message}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="md:col-span-4">
          <div className="flex items-center justify-between mb-1.5 h-4">
            <label htmlFor={`headcount-${familyConfig.id}`} className="block text-xs font-semibold text-slate-700">
              Feature quantity (units / month)
            </label>
          </div>
          <input
            id={`headcount-${familyConfig.id}`}
            type="number"
            min="1"
            value={familyConfig.headcount ?? countryHeadcount ?? ''}
            onChange={(e) =>
              onUpdateFamily({
                ...familyConfig,
                headcount: e.target.value === '' ? '' : Number(e.target.value),
              })
            }
            className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 font-mono focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
          />
          <p className="mt-1 text-[10px] text-slate-500">
            The pack quantity is the country headcount; this default applies to standalone features.
          </p>
        </div>
      </div>

      <FeaturesTable
        familyId={familyConfig.familyId}
        packFeatureIds={packFeatureIds}
        selectedFeatureIds={familyConfig.selectedFeatureIds || []}
        onToggleFeature={handleToggleFeature}
        features={features}
        products={products}
        countryId={countryId}
        pricingTierId={pricingTierId}
        deploymentModelId={deploymentModelId}
        pricingModelId={pricingModelId}
        currencySymbol={currencySymbol}
        headcount={familyConfig.headcount ?? countryHeadcount}
        featureHeadcounts={familyConfig.featureHeadcounts || {}}
        onUpdateFeatureHeadcount={(featureId, count) => {
          onUpdateFamily({
            ...familyConfig,
            featureHeadcounts: { ...(familyConfig.featureHeadcounts || {}), [featureId]: count },
          })
        }}
      />

      <p className="text-[11px] text-slate-500">
        Subscription amounts for this family are calculated by the backend engine (Calculate Pricing) from the
        saved rate card; they are not estimated in the browser.
      </p>
    </div>
  )
}

export default FamilyConfigCard
