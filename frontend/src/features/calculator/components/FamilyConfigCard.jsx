import { useMemo, useState, useEffect } from 'react'
import {
  Users,
  Building,
  DollarSign,
  Award,
  Clock,
  Sparkles,
  Briefcase,
  HeartHandshake,
  ShieldCheck,
  Package,
  Trash2,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react'
import { INITIAL_PRODUCT_FAMILIES, INITIAL_PRODUCTS } from '../../../data/catalogueData'
import { INITIAL_PACKS } from '../../../data/packsData'
import { resolveRateCard } from '../../../api/ratesApi'
import { FeaturesTable } from './FeaturesTable'

const ICON_MAP = {
  Users,
  Building,
  DollarSign,
  Award,
  Clock,
  Sparkles,
  Briefcase,
  HeartHandshake,
  ShieldCheck,
}

export function FamilyConfigCard({
  familyConfig,
  countryHeadcount = 5000,
  countryId = null,
  pricingTierId = null,
  deploymentModelId = null,
  pricingModelId = null,
  contractTerm = 36,
  currencyCode = 'USD',
  currencySymbol = '$',
  onUpdateFamily,
  onRemoveFamily,
  families = [],
  packs = [],
  products = [],
}) {
  const familyList = families.length > 0 ? families : INITIAL_PRODUCT_FAMILIES
  const packList = packs.length > 0 ? packs : INITIAL_PACKS
  const productList = products.length > 0 ? products : INITIAL_PRODUCTS

  const familyMaster =
    familyList.find((f) => String(f.id) === String(familyConfig.familyId)) || {
      id: familyConfig.familyId,
      name: 'Product Family',
      code: 'FAM',
      iconName: 'Package',
    }

  const FamilyIcon = ICON_MAP[familyMaster.iconName] || Package

  // Filter packs for this family
  const availablePacks = useMemo(() => {
    return packList.filter(
      (p) =>
        String(p.product_family_id) === String(familyConfig.familyId) ||
        String(p.familyId) === String(familyConfig.familyId) ||
        (Array.isArray(p.familyIds) && p.familyIds.some((fid) => String(fid) === String(familyConfig.familyId)))
    )
  }, [familyConfig.familyId, packList])

  // Get selected pack details
  const selectedPack = useMemo(() => {
    if (!familyConfig.selectedPackId) return null
    return (
      packList.find(
        (p) =>
          String(p.id) === String(familyConfig.selectedPackId) ||
          p.pack_versions?.some((v) => String(v.id) === String(familyConfig.selectedPackId)) ||
          p.versions?.some((v) => String(v.id) === String(familyConfig.selectedPackId))
      ) || null
    )
  }, [familyConfig.selectedPackId, packList])

  // Extract included feature IDs in the selected pack version
  const packFeatureIds = useMemo(() => {
    if (!selectedPack) return []
    // If backend pack has versions with pack_items
    const allVersions = selectedPack.pack_versions || selectedPack.versions || []
    const matchedVer = allVersions.find(
      (v) => String(v.id) === String(familyConfig.selectedPackId)
    ) || allVersions[0]

    if (matchedVer?.pack_items) {
      return matchedVer.pack_items.map((pi) => pi.feature_id)
    }
    return selectedPack.productIds || []
  }, [selectedPack, familyConfig.selectedPackId])

  // Handle pack selection change
  const handlePackChange = (rawId) => {
    if (!rawId) {
      onUpdateFamily({
        ...familyConfig,
        selectedPackId: null,
      })
      return
    }

    // Resolve pack version ID
    const targetPack = packList.find(
      (p) =>
        String(p.id) === String(rawId) ||
        p.pack_versions?.some((v) => String(v.id) === String(rawId)) ||
        p.versions?.some((v) => String(v.id) === String(rawId))
    )
    const packVersionId =
      targetPack?.pack_versions?.[0]?.id ||
      targetPack?.versions?.[0]?.id ||
      targetPack?.id ||
      Number(rawId) ||
      rawId

    onUpdateFamily({
      ...familyConfig,
      selectedPackId: Number(packVersionId) || packVersionId,
    })
  }

  // Handle toggle feature
  const handleToggleFeature = (featureId) => {
    const current = familyConfig.selectedFeatureIds || []
    const exists = current.some((id) => String(id) === String(featureId))
    const next = exists
      ? current.filter((id) => String(id) !== String(featureId))
      : [...current, Number(featureId) || featureId]

    onUpdateFamily({
      ...familyConfig,
      selectedFeatureIds: next,
    })
  }

  // Live rate resolution for selected pack
  const [rateResolution, setRateResolution] = useState({
    status: 'idle', // 'idle' | 'loading' | 'resolved' | 'missing' | 'ambiguous' | 'error'
    rate: null,
    message: '',
  })

  useEffect(() => {
    let isCancelled = false

    if (!familyConfig.selectedPackId || !countryId || !pricingTierId || !deploymentModelId || !pricingModelId) {
      setRateResolution({ status: 'idle', rate: null, message: '' })
      return
    }

    const numericPackVerId = Number(familyConfig.selectedPackId)
    const numericCountryId = Number(countryId)
    const numericTierId = Number(pricingTierId)
    const numericDepId = Number(deploymentModelId)
    const numericPmId = Number(pricingModelId)

    if (isNaN(numericPackVerId) || isNaN(numericCountryId) || isNaN(numericTierId) || isNaN(numericDepId) || isNaN(numericPmId)) {
      setRateResolution({ status: 'idle', rate: null, message: '' })
      return
    }

    setRateResolution({ status: 'loading', rate: null, message: 'Resolving rate card...' })

    resolveRateCard({
      country_id: numericCountryId,
      tier_id: numericTierId,
      deployment_model_id: numericDepId,
      pricing_model_id: numericPmId,
      uom_id: 1, // Employee UOM
      pack_version_id: numericPackVerId,
    })
      .then((data) => {
        if (!isCancelled) {
          setRateResolution({
            status: 'resolved',
            rate: data,
            message: `Rate resolved: ${data.currency_code} ${Number(data.unit_rate || 0).toFixed(2)} / employee / mo${data.fixed_fee ? ` + ${data.currency_code} ${Number(data.fixed_fee).toLocaleString()} platform fee` : ''}`,
          })
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          const status = err.response?.status
          const detail = err.response?.data?.detail || err.message
          if (status === 404) {
            setRateResolution({
              status: 'missing',
              rate: null,
              message: `No rate-card entry found in database for this Country, Tier, Deployment, and Pricing Model combination. Rate card configuration required in Page 3.`,
            })
          } else if (status === 409) {
            setRateResolution({
              status: 'ambiguous',
              rate: null,
              message: `Multiple matching rate card entries found in database (ambiguous match). Please verify rate card table in Page 3.`,
            })
          } else {
            setRateResolution({
              status: 'error',
              rate: null,
              message: `Rate resolution operational error: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`,
            })
          }
        }
      })

    return () => {
      isCancelled = true
    }
  }, [familyConfig.selectedPackId, countryId, pricingTierId, deploymentModelId, pricingModelId])

  return (
    <div className="bg-slate-50/70 rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
      {/* Family Card Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-800 shadow-2xs">
            <FamilyIcon className="w-4 h-4 text-orange-600" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 tracking-tight">
                {familyMaster.name}
              </h3>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200/80 text-slate-700">
                {familyMaster.code}
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              {familyMaster.description || 'Enterprise module packaging and à la carte features.'}
            </p>
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

      {/* Pack Selection & Headcount Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
        {/* Pack Selector Dropdown */}
        <div className="md:col-span-8">
          <div className="flex items-center justify-between mb-1.5 h-4">
            <label
              htmlFor={`pack-select-${familyConfig.id}`}
              className="block text-xs font-semibold text-slate-700"
            >
              Pack Selection (from Pack Builder)
            </label>
          </div>
          <div className="relative">
            <select
              id={`pack-select-${familyConfig.id}`}
              value={familyConfig.selectedPackId || ''}
              onChange={(e) => handlePackChange(e.target.value)}
              className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
            >
              <option value="">-- No Pack (À la Carte Features Only) --</option>
              {availablePacks.map((pack) => {
                const versionId = pack.pack_versions?.[0]?.id || pack.versions?.[0]?.id || pack.id
                const versionNo = pack.pack_versions?.[0]?.version_no || pack.versions?.[0]?.version_no || 1
                return (
                  <option key={versionId} value={versionId}>
                    {pack.name} ({pack.code || pack.variant}) — Version {versionNo}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Rate Resolution Status Badge */}
          {familyConfig.selectedPackId && (
            <div className="mt-2">
              {rateResolution.status === 'loading' && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>
                  <span>Resolving approved rate card from PostgreSQL...</span>
                </span>
              )}
              {rateResolution.status === 'resolved' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>{rateResolution.message}</span>
                </span>
              )}
              {rateResolution.status === 'missing' && (
                <span className="inline-flex items-start gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{rateResolution.message}</span>
                </span>
              )}
              {rateResolution.status === 'ambiguous' && (
                <span className="inline-flex items-start gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-rose-50 text-rose-900 border border-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{rateResolution.message}</span>
                </span>
              )}
              {rateResolution.status === 'error' && (
                <span className="inline-flex items-start gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-rose-50 text-rose-900 border border-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{rateResolution.message}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Headcount Allocation */}
        <div className="md:col-span-4">
          <div className="flex items-center justify-between mb-1.5 h-4">
            <label
              htmlFor={`headcount-${familyConfig.id}`}
              className="block text-xs font-semibold text-slate-700"
            >
              Active Employees (with ESS)
            </label>
          </div>
          <input
            id={`headcount-${familyConfig.id}`}
            type="number"
            min="1"
            value={familyConfig.headcount ?? countryHeadcount}
            onChange={(e) =>
              onUpdateFamily({
                ...familyConfig,
                headcount: Number(e.target.value) || 0,
              })
            }
            className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 font-mono focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
          />
        </div>
      </div>

      {/* Features Table */}
      <FeaturesTable
        familyId={familyConfig.familyId}
        packProductIds={packFeatureIds}
        selectedFeatureIds={familyConfig.selectedFeatureIds || []}
        onToggleFeature={handleToggleFeature}
        products={productList}
        countryId={countryId}
        pricingTierId={pricingTierId}
        deploymentModelId={deploymentModelId}
        pricingModelId={pricingModelId}
        contractTerm={contractTerm || 36}
        currencyCode={currencyCode}
        currencySymbol={currencySymbol}
        headcount={familyConfig.headcount ?? countryHeadcount}
        featureHeadcounts={familyConfig.featureHeadcounts || {}}
        onUpdateFeatureHeadcount={(featureId, count) => {
          onUpdateFamily({
            ...familyConfig,
            featureHeadcounts: {
              ...(familyConfig.featureHeadcounts || {}),
              [featureId]: count,
            },
          })
        }}
      />

      {/* Live Calculated Commercial Subtotals for Family */}
      {rateResolution.status === 'resolved' && rateResolution.rate && (() => {
        const termMonths = Number(contractTerm) || 12
        const activeEmp = Number(familyConfig.headcount ?? countryHeadcount ?? 0)
        const unitRate = Number(rateResolution.rate.unit_rate || 0)
        const fixedFee = Number(rateResolution.rate.fixed_fee || 0)

        const annualConsumptionFee = unitRate * activeEmp * 12
        const annualSubscriptionTotal = fixedFee + annualConsumptionFee

        const contractConsumptionFee = unitRate * activeEmp * termMonths
        const contractPlatformFee = fixedFee * (termMonths / 12)
        const contractSubscriptionTotal = contractPlatformFee + contractConsumptionFee

        return (
          <div className="mt-3.5 p-3.5 rounded-lg bg-white border border-slate-200 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 flex-wrap gap-2">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>
                  {termMonths === 12
                    ? 'Calculated Subtotal (Annual Commercials — 12 Mo)'
                    : `Calculated Commercials (Annual Run-Rate & ${termMonths}-Month Contract Total)`}
                </span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {termMonths === 12
                  ? 'Formula: Platform Fee + (Rate × Employees × 12)'
                  : `Formula: Annual = Fee + (Rate × Emp × 12) | Contract (${termMonths} Mo) = (Fee × ${termMonths}/12) + (Rate × Emp × ${termMonths})`}
              </span>
            </div>

            {/* Annual Run-Rate Breakdown (12 Months) */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                1. Annual Commercials (12-Month Period)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                {/* Monthly Unit Rate */}
                <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-medium">Monthly Rate / User</span>
                  <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                    {currencySymbol} {unitRate.toFixed(2)}
                  </span>
                </div>

                {/* Annual Consumption Fee */}
                <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-medium">Annual Consumption Fee</span>
                  <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                    {currencySymbol}{' '}
                    {annualConsumptionFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Annual Platform Fee */}
                <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200">
                  <span className="text-[10px] text-slate-500 block font-medium">Annual Fixed Platform Fee</span>
                  <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                    {currencySymbol}{' '}
                    {fixedFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Annual Subscription Total */}
                <div className="p-2.5 rounded-lg bg-emerald-50/80 border border-emerald-200">
                  <span className="text-[10px] text-emerald-800 block font-semibold">Annual Subscription Total</span>
                  <span className="font-mono font-black text-emerald-900 text-base mt-0.5 block">
                    {currencySymbol}{' '}
                    {annualSubscriptionTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Full-Contract Duration Breakdown (When term !== 12) */}
            {termMonths !== 12 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>2. Full-Contract Commercials ({termMonths} Months Duration)</span>
                  <span className="font-mono text-slate-500 lowercase">
                    {termMonths} months ({(termMonths / 12).toFixed(1)} yrs)
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  {/* Contract Duration */}
                  <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block font-medium">Contract Duration</span>
                    <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                      {termMonths} Months
                    </span>
                  </div>

                  {/* Contract Consumption Fee */}
                  <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block font-medium">Contract Consumption Fee</span>
                    <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                      {currencySymbol}{' '}
                      {contractConsumptionFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Contract Platform Fee */}
                  <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-200">
                    <span className="text-[10px] text-slate-500 block font-medium">Contract Fixed Platform Fee</span>
                    <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                      {currencySymbol}{' '}
                      {contractPlatformFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Full-Contract Subscription Total */}
                  <div className="p-2.5 rounded-lg bg-blue-50/80 border border-blue-200">
                    <span className="text-[10px] text-blue-800 block font-semibold">Full-Contract Subscription</span>
                    <span className="font-mono font-black text-blue-900 text-base mt-0.5 block">
                      {currencySymbol}{' '}
                      {contractSubscriptionTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

export default FamilyConfigCard
