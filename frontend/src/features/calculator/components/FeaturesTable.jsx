import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Lock, Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { INITIAL_PRODUCTS } from '../../../data/catalogueData'
import { resolveRateCard } from '../../../api/ratesApi'

export function FeaturesTable({
  familyId,
  packProductIds = [],
  selectedFeatureIds = [],
  onToggleFeature,
  products = [],
  countryId = null,
  pricingTierId = null,
  deploymentModelId = null,
  pricingModelId = null,
  contractTerm = 36,
  currencyCode = 'USD',
  currencySymbol = '$',
  headcount = 5000,
  featureHeadcounts = {},
  onUpdateFeatureHeadcount,
}) {
  const productList = products.length > 0 ? products : INITIAL_PRODUCTS

  // Find all catalogue features belonging to this product family
  const familyProducts = productList.filter(
    (p) =>
      String(p.product_family_id) === String(familyId) ||
      String(p.familyId) === String(familyId)
  )

  // Track resolved rate cards per feature { [featureId]: { status, rate, error } }
  const [featureRates, setFeatureRates] = useState({})
  const inFlightRef = useRef(new Set())

  const dimensionKey = `${countryId}-${pricingTierId}-${deploymentModelId}-${pricingModelId}`
  const prevDimensionKeyRef = useRef(dimensionKey)

  // Reset cached feature rates if pricing dimensions change
  useEffect(() => {
    if (prevDimensionKeyRef.current !== dimensionKey) {
      prevDimensionKeyRef.current = dimensionKey
      setFeatureRates({})
      inFlightRef.current.clear()
    }
  }, [dimensionKey])

  const selectedFeatureIdsKey = (selectedFeatureIds || []).map(String).sort().join(',')

  // Resolve rate card for any newly selected à la carte feature
  useEffect(() => {
    if (!countryId || !pricingTierId || !deploymentModelId || !pricingModelId) {
      return
    }

    selectedFeatureIds.forEach((featId) => {
      const numFeatId = Number(featId)
      if (isNaN(numFeatId)) return

      // Don't re-fetch if already resolved or currently in-flight
      if (
        featureRates[numFeatId]?.status === 'resolved' ||
        inFlightRef.current.has(numFeatId)
      ) {
        return
      }

      inFlightRef.current.add(numFeatId)
      setFeatureRates((prev) => ({
        ...prev,
        [numFeatId]: { status: 'loading', rate: null, error: null },
      }))

      resolveRateCard({
        country_id: Number(countryId),
        tier_id: Number(pricingTierId),
        deployment_model_id: Number(deploymentModelId),
        pricing_model_id: Number(pricingModelId),
        feature_id: numFeatId,
      })
        .then((data) => {
          inFlightRef.current.delete(numFeatId)
          setFeatureRates((prev) => ({
            ...prev,
            [numFeatId]: { status: 'resolved', rate: data, error: null },
          }))
        })
        .catch((err) => {
          inFlightRef.current.delete(numFeatId)
          const detail =
            err.response?.data?.detail ||
            err.message ||
            'No rate card configured for this feature'
          setFeatureRates((prev) => ({
            ...prev,
            [numFeatId]: {
              status: 'missing',
              rate: null,
              error: typeof detail === 'object' ? JSON.stringify(detail) : String(detail),
            },
          }))
        })
    })
  }, [selectedFeatureIdsKey, dimensionKey, countryId, pricingTierId, deploymentModelId, pricingModelId])

  if (familyProducts.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-slate-400">
        No additional features configured for this family.
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
            ({familyProducts.length} catalogue items)
          </span>
        </div>
        <span className="text-[10px] text-slate-500 hidden sm:inline">
          Features in pack are automatically locked to prevent duplicate charges.
        </span>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="À la carte features">
            <thead className="bg-slate-50 text-[10px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th scope="col" className="py-2 px-3 w-10 text-center">
                  Select
                </th>
                <th scope="col" className="py-2 px-3">
                  Feature / Solution
                </th>
                <th scope="col" className="py-2 px-3">
                  SKU / Code
                </th>
                <th scope="col" className="py-2 px-3">
                  Product Type
                </th>
                <th scope="col" className="py-2 px-3">
                  Pack Status
                </th>
                <th scope="col" className="py-2 px-3 text-right">
                  Feature Pricing
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {familyProducts.map((prod) => {
                const isIncludedInPack = packProductIds.some(
                  (pId) => String(pId) === String(prod.id)
                )
                const isSelectedAlaCarte = selectedFeatureIds.some(
                  (sId) => String(sId) === String(prod.id)
                )
                const isChecked = isIncludedInPack || isSelectedAlaCarte

                const resolvedData = featureRates[Number(prod.id)]
                const hasResolvedRate = resolvedData?.status === 'resolved' && resolvedData?.rate
                const unitRate = hasResolvedRate ? Number(resolvedData.rate.unit_rate || 0) : null
                const fixedFee = hasResolvedRate ? Number(resolvedData.rate.fixed_fee || 0) : 0
                const activeEmp = Number(featureHeadcounts[prod.id] ?? headcount) || 0
                const monthsTerm = Number(contractTerm) || 36

                // Feature FCV calculation: Unit Rate * Employees * Term + (Fixed Fee * Years)
                const featureFcv = hasResolvedRate
                  ? unitRate * activeEmp * monthsTerm + (fixedFee * (monthsTerm / 12))
                  : null

                return (
                  <tr
                    key={prod.id}
                    className={`transition-colors ${
                      isIncludedInPack
                        ? 'bg-emerald-50/40 text-slate-900'
                        : isSelectedAlaCarte
                        ? 'bg-orange-50/30 text-slate-900'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    {/* Checkbox column */}
                    <td className="py-2.5 px-3 text-center align-top">
                      <label className="inline-flex items-center justify-center cursor-pointer mt-0.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isIncludedInPack}
                          onChange={() => {
                            if (!isIncludedInPack) {
                              onToggleFeature(prod.id)
                            }
                          }}
                          className={`w-4 h-4 rounded border-slate-300 transition-colors ${
                            isIncludedInPack
                              ? 'text-emerald-600 cursor-not-allowed opacity-80'
                              : 'text-orange-600 focus:ring-orange-500 cursor-pointer'
                          }`}
                          aria-label={`Select ${prod.name || prod.subItem || prod.solution}`}
                        />
                      </label>
                    </td>

                    {/* Name & Expanded Calculation when selected */}
                    <td className="py-2.5 px-3 font-medium text-slate-900 align-top">
                      <div className="font-semibold text-slate-900">
                        {prod.name || prod.subItem || prod.solution}
                      </div>

                      {/* Expanded Feature Commercials when selected as à la carte */}
                      {isSelectedAlaCarte && (
                        <div className="mt-2.5 pt-2 border-t border-orange-200/60 space-y-2 text-xs">
                          {/* Headcount Input */}
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`feat-emp-${prod.id}`}
                              className="text-[11px] font-semibold text-slate-700 whitespace-nowrap"
                            >
                              Active Employees:
                            </label>
                            <input
                              id={`feat-emp-${prod.id}`}
                              type="number"
                              min="1"
                              value={featureHeadcounts[prod.id] ?? headcount}
                              onChange={(e) => {
                                if (onUpdateFeatureHeadcount) {
                                  onUpdateFeatureHeadcount(prod.id, Number(e.target.value) || 0)
                                }
                              }}
                              className="w-24 px-2 py-0.5 text-xs font-mono rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500"
                            />
                            <span className="text-[11px] text-slate-500">employees</span>
                          </div>

                          {/* Calculation Formula Box */}
                          {resolvedData?.status === 'loading' && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <Loader2 className="w-3.5 h-3.5 text-orange-600 animate-spin" />
                              <span>Resolving rate card for {prod.name}...</span>
                            </div>
                          )}

                          {resolvedData?.status === 'missing' && (
                            <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                              <span>{resolvedData.error || 'Rate card not configured for this feature in selected country/tier.'}</span>
                            </div>
                          )}

                          {hasResolvedRate && (
                            <div className="p-2.5 rounded-md bg-white/90 border border-emerald-200 space-y-1">
                              <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
                                <span>Feature Commercial Calculation</span>
                                <span className="font-mono text-[10px] text-slate-500 font-normal">{monthsTerm} Mo Term</span>
                              </div>
                              <div className="font-mono text-[11px] text-slate-800 space-y-0.5">
                                {monthsTerm !== 12 && (
                                  <div>
                                    <span className="text-slate-500">Annual (12 mo): </span>
                                    {currencySymbol} {unitRate.toFixed(2)} × {activeEmp.toLocaleString()} × 12 ={' '}
                                    <span className="font-semibold text-slate-900">
                                      {currencySymbol} {(unitRate * activeEmp * 12 + fixedFee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-slate-500">{monthsTerm === 12 ? 'Annual & Contract (12 mo): ' : `Contract (${monthsTerm} mo): `}</span>
                                  {currencySymbol} {unitRate.toFixed(2)} × {activeEmp.toLocaleString()} × {monthsTerm} ={' '}
                                  <span className="font-bold text-emerald-700">
                                    {currencySymbol} {featureFcv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Code */}
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 align-top">
                      {prod.code}
                    </td>

                    {/* Classification */}
                    <td className="py-2.5 px-3 text-[11px] text-slate-500 align-top">
                      {prod.classification || prod.productType || 'Standard Module'}
                    </td>

                    {/* Pack Status */}
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

                    {/* Pricing */}
                    <td className="py-2.5 px-3 text-right text-[11px] font-medium text-slate-500 align-top">
                      {isIncludedInPack ? (
                        <span className="text-emerald-700 font-semibold">Bundled</span>
                      ) : isSelectedAlaCarte ? (
                        hasResolvedRate ? (
                          <div className="space-y-0.5">
                            <div className="font-mono font-bold text-slate-900">
                              {currencySymbol} {unitRate.toFixed(2)}/emp/mo
                            </div>
                            <div className="text-[10px] font-mono font-bold text-emerald-700">
                              FCV {currencySymbol} {featureFcv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        ) : resolvedData?.status === 'loading' ? (
                          <span className="text-orange-600 font-mono text-[10px]">Resolving...</span>
                        ) : resolvedData?.status === 'missing' ? (
                          <span className="text-amber-700 font-medium font-mono text-[10px]">
                            No Rate Card
                          </span>
                        ) : (
                          <span className="text-orange-700 font-semibold font-mono">
                            Backend Rate Card
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
