import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Lock, Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { resolveRateCard } from '../../../api/ratesApi'
import { describeApiError } from '../../../api/proposalsApi'

/**
 * Standalone (à la carte) features of one product family.
 *
 * Rows are catalogue FEATURES (GET /api/catalogue/features) whose product belongs to the
 * family; the id sent to the backend is the feature id. Features contained in the selected
 * pack version are locked so they cannot be charged twice.
 *
 * Only the resolved rate-card row is shown here. Amounts are calculated by the backend.
 */
export function FeaturesTable({
  familyId,
  packFeatureIds = [],
  selectedFeatureIds = [],
  onToggleFeature,
  features = [],
  products = [],
  countryId = null,
  pricingTierId = null,
  deploymentModelId = null,
  pricingModelId = null,
  currencySymbol = '',
  headcount = '',
  featureHeadcounts = {},
  onUpdateFeatureHeadcount,
}) {
  const familyProductIds = new Set(
    products
      .filter((p) => String(p.product_family_id) === String(familyId))
      .map((p) => String(p.id)),
  )
  const productById = new Map(products.map((p) => [String(p.id), p]))
  const familyFeatures = features.filter(
    (f) => familyProductIds.has(String(f.product_id)) && (f.status || 'active') !== 'retired',
  )

  // Resolved rate-card rows per feature { [featureId]: { status, rate, error } }
  const [featureRates, setFeatureRates] = useState({})
  const inFlightRef = useRef(new Set())

  const dimensionKey = `${countryId}-${pricingTierId}-${deploymentModelId}-${pricingModelId}`
  const prevDimensionKeyRef = useRef(dimensionKey)

  // Reset cached rates when a pricing dimension changes
  useEffect(() => {
    if (prevDimensionKeyRef.current !== dimensionKey) {
      prevDimensionKeyRef.current = dimensionKey
      setFeatureRates({})
      inFlightRef.current.clear()
    }
  }, [dimensionKey])

  const selectedFeatureIdsKey = (selectedFeatureIds || []).map(String).sort().join(',')

  // Resolve the rate card for each selected feature (unit of measure comes from the rate card)
  useEffect(() => {
    if (!countryId || !pricingTierId || !deploymentModelId || !pricingModelId) return

    selectedFeatureIds.forEach((featId) => {
      const numFeatId = Number(featId)
      if (!Number.isInteger(numFeatId) || numFeatId <= 0) return
      if (featureRates[numFeatId]?.status === 'resolved' || inFlightRef.current.has(numFeatId)) return

      inFlightRef.current.add(numFeatId)
      setFeatureRates((prev) => ({ ...prev, [numFeatId]: { status: 'loading', rate: null, error: null } }))

      resolveRateCard({
        country_id: Number(countryId),
        tier_id: Number(pricingTierId),
        deployment_model_id: Number(deploymentModelId),
        pricing_model_id: Number(pricingModelId),
        feature_id: numFeatId,
      })
        .then((data) => {
          inFlightRef.current.delete(numFeatId)
          setFeatureRates((prev) => ({ ...prev, [numFeatId]: { status: 'resolved', rate: data, error: null } }))
        })
        .catch((err) => {
          inFlightRef.current.delete(numFeatId)
          setFeatureRates((prev) => ({
            ...prev,
            [numFeatId]: { status: 'missing', rate: null, error: describeApiError(err, 'No rate card configured for this feature') },
          }))
        })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeatureIdsKey, dimensionKey, countryId, pricingTierId, deploymentModelId, pricingModelId])

  if (familyFeatures.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-slate-400">
        No catalogue features are saved for this product family.
      </div>
    )
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
          <h4 className="text-xs font-bold text-slate-900 tracking-tight">
            À la Carte Features & Add-ons
          </h4>
          <span className="text-[10px] text-slate-500">
            ({familyFeatures.length} catalogue features)
          </span>
        </div>
        <span className="text-[10px] text-slate-500 hidden sm:inline">
          Features in the selected pack are locked to prevent duplicate charges.
        </span>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="À la carte features">
            <thead className="bg-slate-50 text-[10px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th scope="col" className="py-2 px-3 w-10 text-center">Select</th>
                <th scope="col" className="py-2 px-3">Feature</th>
                <th scope="col" className="py-2 px-3">Code</th>
                <th scope="col" className="py-2 px-3">Product</th>
                <th scope="col" className="py-2 px-3">Pack Status</th>
                <th scope="col" className="py-2 px-3 text-right">Rate Card</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {familyFeatures.map((feat) => {
                const isIncludedInPack = packFeatureIds.some((fid) => String(fid) === String(feat.id))
                const isSelectedAlaCarte = selectedFeatureIds.some((sId) => String(sId) === String(feat.id))
                const isChecked = isIncludedInPack || isSelectedAlaCarte
                const resolved = featureRates[Number(feat.id)]
                const rate = resolved?.status === 'resolved' ? resolved.rate : null
                const product = productById.get(String(feat.product_id))

                return (
                  <tr
                    key={feat.id}
                    className={`transition-colors ${
                      isIncludedInPack
                        ? 'bg-emerald-50/40 text-slate-900'
                        : isSelectedAlaCarte
                        ? 'bg-orange-50/30 text-slate-900'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center align-top">
                      <label className="inline-flex items-center justify-center cursor-pointer mt-0.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isIncludedInPack}
                          onChange={() => {
                            if (!isIncludedInPack) onToggleFeature(feat.id)
                          }}
                          className={`w-4 h-4 rounded border-slate-300 transition-colors ${
                            isIncludedInPack
                              ? 'text-emerald-600 cursor-not-allowed opacity-80'
                              : 'text-orange-600 focus:ring-orange-500 cursor-pointer'
                          }`}
                          aria-label={`Select ${feat.name}`}
                        />
                      </label>
                    </td>

                    <td className="py-2.5 px-3 font-medium text-slate-900 align-top">
                      <div className="font-semibold text-slate-900">{feat.name}</div>
                      {isSelectedAlaCarte && (
                        <div className="mt-2.5 pt-2 border-t border-orange-200/60 space-y-2 text-xs">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`feat-qty-${feat.id}`}
                              className="text-[11px] font-semibold text-slate-700 whitespace-nowrap"
                            >
                              Quantity:
                            </label>
                            <input
                              id={`feat-qty-${feat.id}`}
                              type="number"
                              min="1"
                              value={featureHeadcounts[feat.id] ?? headcount ?? ''}
                              onChange={(e) => {
                                if (onUpdateFeatureHeadcount) {
                                  onUpdateFeatureHeadcount(feat.id, e.target.value === '' ? '' : Number(e.target.value))
                                }
                              }}
                              className="w-24 px-2 py-0.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500"
                            />
                            <span className="text-[11px] text-slate-500">
                              {rate?.uom_id ? 'units / month (unit of measure from the rate card)' : 'units / month'}
                            </span>
                          </div>

                          {resolved?.status === 'loading' && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <Loader2 className="w-3.5 h-3.5 text-orange-600 animate-spin" />
                              <span>Resolving rate card for {feat.name}...</span>
                            </div>
                          )}
                          {resolved?.status === 'missing' && (
                            <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                              <span>{resolved.error}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 align-top">{feat.code}</td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-500 align-top">{product?.name || '—'}</td>

                    <td className="py-2.5 px-3 align-top">
                      {isIncludedInPack ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          <Lock className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                          <span>Included in Pack</span>
                        </span>
                      ) : isSelectedAlaCarte ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-800">
                          <CheckCircle2 className="w-3 h-3 text-orange-600" aria-hidden="true" />
                          <span>À la Carte Add-on</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Available</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right text-[11px] font-medium text-slate-500 align-top">
                      {isIncludedInPack ? (
                        <span className="text-emerald-700 font-semibold">Bundled</span>
                      ) : isSelectedAlaCarte ? (
                        rate ? (
                          <div className="space-y-0.5 font-mono">
                            {rate.fixed_fee !== null && rate.fixed_fee !== undefined && (
                              <div className="text-slate-700">
                                Fee {rate.currency_code} {Number(rate.fixed_fee).toLocaleString()}
                              </div>
                            )}
                            {rate.unit_rate !== null && rate.unit_rate !== undefined && (
                              <div className="font-bold text-slate-900">
                                {rate.currency_code} {Number(rate.unit_rate).toFixed(2)} / unit / mo
                              </div>
                            )}
                          </div>
                        ) : resolved?.status === 'loading' ? (
                          <span className="text-orange-600 font-mono text-[10px]">Resolving...</span>
                        ) : resolved?.status === 'missing' ? (
                          <span className="text-amber-700 font-medium font-mono text-[10px]">No Rate Card</span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[10px]">
                            {currencySymbol ? 'Select tier & models' : '—'}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default FeaturesTable
