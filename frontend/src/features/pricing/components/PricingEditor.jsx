import { useState } from 'react'
import {
  Globe,
  Layers,
  Sparkles,
  Package,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Clock,
  Briefcase,
  Tag,
  Users,
  Building,
  DollarSign,
  Award,
  HeartHandshake,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react'
import { INITIAL_PRODUCT_FAMILIES, INITIAL_PRODUCTS } from '../../../data/catalogueData'
import { INITIAL_PACKS } from '../../../data/packsData'
import { validateServiceLine } from '../../calculator/calculatorData'

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

export function PricingEditor({
  countryConfig,
  focusedFamilyId,
  lineItemDiscounts = {},
  overallDiscounts = {},
  serviceDiscounts = {},
  calculationSnapshot = null,
  onUpdateLineDiscount,
  onUpdateOverallDiscount,
  onUpdateServiceDiscount,
  onUpdateServiceLines,
}) {
  // Service line inline adding state
  const [isAddingService, setIsAddingService] = useState(false)
  const [serviceErrors, setServiceErrors] = useState({})

  // Discount validation errors state
  // Keyed by `${itemKey}` -> error string
  const [discountErrors, setDiscountErrors] = useState({})
  const [overallDiscountError, setOverallDiscountError] = useState('')

  // Service line form state
  const [serviceDraft, setServiceDraft] = useState({
    roleName: 'Enterprise Solution Architecture',
    hourlyRateId: 'hr-1',
    rateApplied: '220',
    hoursOrDays: '40',
    unit: 'Hours',
  })

  if (!countryConfig) {
    return (
      <div className="flex-1 p-8 text-center text-slate-400">
        No country selected.
      </div>
    )
  }

  // Get current country's overall discount data
  const currentOverallDiscount = overallDiscounts[countryConfig.id] || {
    type: 'percentage',
    value: '',
    reason: '',
  }

  const snapshot = calculationSnapshot?.snapshot_payload || {}
  const allSubLines = Array.isArray(snapshot.all_subscription_line_items)
    ? snapshot.all_subscription_line_items
    : []
  const allServiceLines = Array.isArray(snapshot.all_service_lines)
    ? snapshot.all_service_lines
    : []
  const snapshotProducts = Array.isArray(snapshot.products)
    ? snapshot.products
    : []

  const findCalculatedLine = (targetPack, targetFeat) => {
    if (!allSubLines.length) return null
    if (targetPack) {
      return (
        allSubLines.find(
          (li) =>
            (targetPack.id && (String(li.pack_version_id) === String(targetPack.id) || String(li.pack_id) === String(targetPack.id))) ||
            (targetPack.code && li.product_code === targetPack.code) ||
            (targetPack.name && li.target_name?.includes(targetPack.name))
        ) || null
      )
    }
    if (targetFeat) {
      return (
        allSubLines.find(
          (li) =>
            (targetFeat.id && String(li.feature_id) === String(targetFeat.id)) ||
            (targetFeat.code && li.product_code === targetFeat.code) ||
            (targetFeat.name && li.target_name?.includes(targetFeat.name)) ||
            (targetFeat.subItem && li.target_name?.includes(targetFeat.subItem)) ||
            (targetFeat.solution && li.target_name?.includes(targetFeat.solution))
        ) || null
      )
    }
    return null
  }

  const countryGrossSubtotal =
    snapshotProducts.length > 0
      ? snapshotProducts.reduce(
          (sum, p) =>
            sum +
            Number(
              p.contract_subscription_subtotal_before_discount ??
                p.subscription_subtotal_before_discount ??
                0
            ),
          0
        )
      : null

  const countryNetSubtotal =
    snapshotProducts.length > 0
      ? snapshotProducts.reduce(
          (sum, p) =>
            sum +
            Number(
              p.contract_subscription_total_after_discount ??
                p.subscription_total_after_discount ??
                0
            ),
          0
        )
      : null

  // Handle line discount value change with validation
  const handleLineDiscountValueChange = (itemKey, rawValue, type) => {
    let errorMsg = ''
    if (rawValue !== '' && rawValue !== null && rawValue !== undefined) {
      const num = Number(rawValue)
      if (isNaN(num)) {
        errorMsg = 'Discount must be a valid number.'
      } else if (num < 0) {
        errorMsg = 'Discount cannot be negative.'
      } else if (type === 'percentage' && num > 100) {
        errorMsg = 'Percentage discount cannot exceed 100%.'
      }
    }

    setDiscountErrors((prev) => ({
      ...prev,
      [itemKey]: errorMsg,
    }))

    onUpdateLineDiscount(itemKey, {
      type,
      value: rawValue,
    })
  }

  // Handle line discount type toggle (% vs fixed)
  const handleLineDiscountTypeToggle = (itemKey, newType) => {
    const current = lineItemDiscounts[itemKey] || { value: '', reason: '' }
    let errorMsg = ''
    if (current.value !== '') {
      const num = Number(current.value)
      if (num < 0) {
        errorMsg = 'Discount cannot be negative.'
      } else if (newType === 'percentage' && num > 100) {
        errorMsg = 'Percentage discount cannot exceed 100%.'
      }
    }

    setDiscountErrors((prev) => ({
      ...prev,
      [itemKey]: errorMsg,
    }))

    onUpdateLineDiscount(itemKey, {
      type: newType,
      value: current.value,
    })
  }

  // Handle line discount reason change
  const handleLineDiscountReasonChange = (itemKey, reason) => {
    onUpdateLineDiscount(itemKey, { reason })
  }

  // Handle overall discount change
  const handleOverallDiscountChange = (rawValue) => {
    let errorMsg = ''
    if (rawValue !== '' && rawValue !== null && rawValue !== undefined) {
      const num = Number(rawValue)
      if (isNaN(num)) {
        errorMsg = 'Overall discount must be a valid number.'
      } else if (num < 0) {
        errorMsg = 'Overall discount cannot be negative.'
      } else if (num > 100) {
        errorMsg = 'Overall percentage discount cannot exceed 100%.'
      }
    }

    setOverallDiscountError(errorMsg)
    onUpdateOverallDiscount(countryConfig.id, {
      type: 'percentage',
      value: rawValue,
    })
  }

  const handleOverallReasonChange = (reason) => {
    onUpdateOverallDiscount(countryConfig.id, { reason })
  }

  // Save New Service Line
  const handleSaveServiceLine = () => {
    const errs = validateServiceLine(serviceDraft)
    if (Object.keys(errs).length > 0) {
      setServiceErrors(errs)
      return
    }

    const newLine = {
      id: `srv-${Date.now()}`,
      roleName: serviceDraft.roleName.trim(),
      hourlyRateId: serviceDraft.hourlyRateId || null,
      rateApplied: Number(serviceDraft.rateApplied) || 0,
      hoursOrDays: Number(serviceDraft.hoursOrDays) || 0,
      unit: serviceDraft.unit || 'Hours',
      currency: countryConfig.currency,
    }

    const updated = [...(countryConfig.serviceLines || []), newLine]
    onUpdateServiceLines(countryConfig.id, updated)
    setIsAddingService(false)
    setServiceErrors({})
  }

  const handleDeleteServiceLine = (srvId) => {
    const updated = (countryConfig.serviceLines || []).filter((s) => s.id !== srvId)
    onUpdateServiceLines(countryConfig.id, updated)
  }

  const handleServiceDiscountChange = (srvId, rawValue) => {
    onUpdateServiceDiscount(srvId, { value: rawValue })
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto">
      {/* Country Scope Banner */}
      <section
        role="region"
        aria-label="Country Scope Banner"
        className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0B1528] text-white flex items-center justify-center font-bold">
              <Globe className="w-4 h-4 text-orange-400" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  {countryConfig.countryName}
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-orange-100 text-orange-800 border border-orange-200">
                  {countryConfig.currency} ({countryConfig.currencySymbol})
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Regional commercial terms and line-item discount configuration.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-semibold text-slate-400">
              Pricing Scope:
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {countryConfig.pricingTierId === 'tier-1'
                ? 'Tier 1 (Enterprise)'
                : countryConfig.pricingTierId === 'tier-2'
                ? 'Tier 2 (Mid-Market)'
                : 'Tier 3 (Growth)'}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {countryConfig.deploymentModelId === 'dep-shared'
                ? 'Shared Cloud'
                : countryConfig.deploymentModelId === 'dep-private'
                ? 'Private Cloud'
                : 'On-Premises'}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
              {countryConfig.pricingModelId === 'pm-platform'
                ? 'Platform Subscription'
                : 'PEPM'}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
              {countryConfig.contractTerm} Months
            </span>
          </div>
        </div>

        <div className="pt-2.5 flex items-center justify-between text-xs text-slate-600">
          <span>
            Active Employee Volume:{' '}
            <strong className="text-slate-900 font-mono">
              {Number(countryConfig.headcount || 5000).toLocaleString()}
            </strong>
          </span>
          <span className="text-[11px] text-slate-500">
            Native Currency Context: <strong className="font-mono text-slate-800">{countryConfig.currency}</strong>
          </span>
        </div>
      </section>

      {/* Product Families Line-Item Sections */}
      <div className="space-y-6">
        {countryConfig.families.length === 0 ? (
          <div className="p-8 rounded-xl bg-white border border-dashed border-slate-300 text-center space-y-2">
            <Layers className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-slate-800">
              No Product Families Configured for {countryConfig.countryName}
            </h3>
            <p className="text-[11px] text-slate-500">
              Return to Proposal Configurator to add suites and à la carte features for this country.
            </p>
          </div>
        ) : (
          countryConfig.families.map((fam) => {
            const familyMaster =
              INITIAL_PRODUCT_FAMILIES.find((f) => f.id === fam.familyId) || {
                name: 'Product Family',
                code: 'FAM',
                iconName: 'Package',
              }
            const FamilyIcon = ICON_MAP[familyMaster.iconName] || Package
            const pack = fam.selectedPackId
              ? INITIAL_PACKS.find((p) => p.id === fam.selectedPackId) ||
                (() => {
                  const line = allSubLines.find(
                    (li) =>
                      String(li.pack_version_id) === String(fam.selectedPackId) ||
                      String(li.pack_id) === String(fam.selectedPackId)
                  )
                  return {
                    id: fam.selectedPackId,
                    name: line?.target_name || `Pack ${fam.selectedPackId}`,
                    code: line?.product_code || `PACK-${fam.selectedPackId}`,
                    color: '#F26522',
                    productIds: [],
                  }
                })()
              : null

            // Included products in pack
            const packIncludedProducts = pack?.productIds
              ? pack.productIds
                  .map((id) => INITIAL_PRODUCTS.find((p) => p.id === id))
                  .filter(Boolean)
              : []

            // À la carte features selected
            const alaCarteProducts = (fam.selectedFeatureIds || [])
              .map((id) => INITIAL_PRODUCTS.find((p) => p.id === id))
              .filter(Boolean)

            const isFamilyFocused = focusedFamilyId === fam.id

            return (
              <section
                key={fam.id}
                id={`family-section-${fam.id}`}
                aria-label={`${familyMaster.name} Pricing Section`}
                className={`bg-white rounded-xl border transition-all overflow-hidden shadow-xs ${
                  isFamilyFocused
                    ? 'ring-2 ring-orange-500 border-orange-500'
                    : 'border-slate-200'
                }`}
              >
                {/* Family Section Header */}
                <header className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-orange-600 shadow-2xs">
                      <FamilyIcon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-slate-900 tracking-tight">
                          {familyMaster.name}
                        </h3>
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-bold">
                          {familyMaster.code}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {countryConfig.pricingModelId === 'pm-platform'
                          ? 'Platform Subscription Model'
                          : 'PEPM: Active Employees (with ESS)'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[11px] text-slate-500">
                      Quantity: <strong className="text-slate-800 font-mono">{fam.headcount || countryConfig.headcount}</strong> users
                    </span>
                    <span>•</span>
                    <span className="text-[11px] text-slate-500">
                      Term: <strong className="text-slate-800 font-mono">{countryConfig.contractTerm}</strong> mos
                    </span>
                  </div>
                </header>

                {/* Line Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs" aria-label={`${familyMaster.name} Line Items`}>
                    <thead className="bg-slate-50/80 text-[10px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th scope="col" className="py-2.5 px-4 min-w-[220px]">
                          Line Item / Offering
                        </th>
                        <th scope="col" className="py-2.5 px-3 min-w-[110px]">
                          Unit Rate
                        </th>
                        <th scope="col" className="py-2.5 px-3 min-w-[130px]">
                          Volume & Term
                        </th>
                        <th scope="col" className="py-2.5 px-3 min-w-[120px]">
                          Gross Amount
                        </th>
                        <th scope="col" className="py-2.5 px-4 min-w-[260px]">
                          Discretionary Discount
                        </th>
                        <th scope="col" className="py-2.5 px-3 min-w-[120px] text-right">
                          Net Amount
                        </th>
                        <th scope="col" className="py-2.5 px-3 min-w-[100px] text-center">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {/* 1. Base Pack Line Item */}
                      {pack ? (() => {
                        const calculatedPackItem = findCalculatedLine(pack, null)
                        return (
                        <tr className="hover:bg-slate-50/60 transition-colors">
                          {/* Item Description */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: pack.color || '#F26522' }}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 text-xs">
                                  {pack.name}
                                </div>
                                <div className="text-[10px] font-mono text-slate-500">
                                  {pack.code} • Base Suite ({packIncludedProducts.length} items)
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Unit Rate */}
                          <td className="py-3 px-3">
                            {calculatedPackItem ? (
                              <span className="text-[11px] font-mono text-slate-800 font-semibold">
                                {countryConfig.currencySymbol} {Number(calculatedPackItem.rate_per_unit ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {calculatedPackItem.platform_fee > 0 && (
                                  <span className="text-[10px] text-slate-500 font-normal block">
                                    + {countryConfig.currencySymbol}{Number(calculatedPackItem.platform_fee).toLocaleString()} platform
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span
                                className="text-[11px] font-mono text-slate-500 italic bg-slate-50 px-2 py-0.5 rounded border border-slate-100"
                                title="Backend-owned calculation"
                              >
                                Pending backend calculation
                              </span>
                            )}
                          </td>

                          {/* Volume & Term */}
                          <td className="py-3 px-3 text-[11px]">
                            <div>
                              <strong className="font-mono text-slate-800">
                                {Number(fam.headcount || countryConfig.headcount).toLocaleString()}
                              </strong>{' '}
                              users
                            </div>
                            <div className="text-slate-400 text-[10px]">
                              × {countryConfig.contractTerm} months
                            </div>
                          </td>

                          {/* Gross Amount */}
                          <td className="py-3 px-3">
                            {calculatedPackItem ? (
                              <span className="text-[11px] font-mono text-slate-800 font-semibold">
                                {countryConfig.currencySymbol} {Number(calculatedPackItem.contract_subscription_before_discount ?? calculatedPackItem.item_subscription_before_discount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span
                                className="text-[11px] font-mono text-slate-500 italic"
                                title="Backend-owned calculation"
                              >
                                Pending backend calculation
                              </span>
                            )}
                          </td>

                          {/* Discount Input Controls */}
                          <td className="py-3 px-4">
                            {(() => {
                              const itemKey = `${countryConfig.id}:${fam.id}:pack`
                              const disc = lineItemDiscounts[itemKey] || {
                                type: 'percentage',
                                value: '',
                                reason: '',
                              }
                              const err = discountErrors[itemKey]

                              return (
                                <div className="space-y-1.5 max-w-xs">
                                  <div className="flex items-center gap-1.5">
                                    {/* Type Toggle */}
                                    <div className="inline-flex rounded-md shadow-2xs border border-slate-300 overflow-hidden shrink-0">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleLineDiscountTypeToggle(itemKey, 'percentage')
                                        }
                                        className={`px-2 py-1 text-[10px] font-bold ${
                                          disc.type === 'percentage'
                                            ? 'bg-orange-600 text-white'
                                            : 'bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                        aria-label="Percentage discount"
                                      >
                                        %
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleLineDiscountTypeToggle(itemKey, 'fixed')
                                        }
                                        className={`px-2 py-1 text-[10px] font-bold ${
                                          disc.type === 'fixed'
                                            ? 'bg-orange-600 text-white'
                                            : 'bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                        aria-label="Fixed amount discount"
                                      >
                                        {countryConfig.currencySymbol}
                                      </button>
                                    </div>

                                    {/* Value Input */}
                                    <input
                                      type="number"
                                      min="0"
                                      max={disc.type === 'percentage' ? '100' : undefined}
                                      value={disc.value}
                                      onChange={(e) =>
                                        handleLineDiscountValueChange(
                                          itemKey,
                                          e.target.value,
                                          disc.type
                                        )
                                      }
                                      placeholder={disc.type === 'percentage' ? '0%' : '0'}
                                      aria-label={`Discount for ${pack.name}`}
                                      className={`w-20 px-2 py-1 text-xs rounded border bg-white text-slate-900 focus:outline-none font-medium ${
                                        err
                                          ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                                          : 'border-slate-300 focus:border-orange-500'
                                      }`}
                                    />

                                    {/* Reason Input */}
                                    <input
                                      type="text"
                                      value={disc.reason || ''}
                                      onChange={(e) =>
                                        handleLineDiscountReasonChange(
                                          itemKey,
                                          e.target.value
                                        )
                                      }
                                      placeholder="Reason / justification..."
                                      aria-label={`Discount reason for ${pack.name}`}
                                      className="flex-1 min-w-[100px] px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:border-orange-500"
                                    />
                                  </div>

                                  {err && (
                                    <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                                      <span>{err}</span>
                                    </p>
                                  )}
                                </div>
                              )
                            })()}
                          </td>

                          {/* Net Amount */}
                          <td className="py-3 px-3 text-right">
                            {calculatedPackItem ? (
                              <span className="text-[11px] font-mono text-emerald-700 font-bold">
                                {countryConfig.currencySymbol} {Number(calculatedPackItem.contract_subscription_after_discount ?? calculatedPackItem.item_subscription_after_discount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span
                                className="text-[11px] font-mono text-slate-500 italic"
                                title="Backend-owned calculation"
                              >
                                Pending backend calculation
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3 text-center">
                            {calculatedPackItem ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" aria-hidden="true" />
                                <span>Calculated</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                <Clock className="w-2.5 h-2.5 text-amber-600" aria-hidden="true" />
                                <span>Pending</span>
                              </span>
                            )}
                          </td>
                        </tr>
                        )
                      })() : (
                        <tr>
                          <td colSpan={7} className="py-2.5 px-4 text-xs text-slate-400 italic">
                            No base pack selected for this family.
                          </td>
                        </tr>
                      )}

                      {/* 2. À la carte Feature Line Items */}
                      {alaCarteProducts.map((prod) => {
                        const calculatedFeatItem = findCalculatedLine(null, prod)
                        const itemKey = `${countryConfig.id}:${fam.id}:feature:${prod.id}`
                        const disc = lineItemDiscounts[itemKey] || {
                          type: 'percentage',
                          value: '',
                          reason: '',
                        }
                        const err = discountErrors[itemKey]

                        return (
                          <tr key={prod.id} className="hover:bg-slate-50/60 transition-colors bg-orange-50/20">
                            {/* Feature Item Description */}
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-orange-600 shrink-0" aria-hidden="true" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 text-xs">
                                    {prod.solution || prod.subItem}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {prod.code} • {prod.subItem} • À la carte Add-on
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Unit Rate */}
                            <td className="py-2.5 px-3">
                              {calculatedFeatItem ? (
                                <span className="text-[11px] font-mono text-slate-800 font-semibold">
                                  {countryConfig.currencySymbol} {Number(calculatedFeatItem.rate_per_unit ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-[11px] font-mono text-slate-500 italic">
                                  Pending backend calculation
                                </span>
                              )}
                            </td>

                            {/* Volume & Term */}
                            <td className="py-2.5 px-3 text-[11px]">
                              <div>
                                <strong className="font-mono text-slate-800">
                                  {Number(fam.headcount || countryConfig.headcount).toLocaleString()}
                                </strong>{' '}
                                users
                              </div>
                              <div className="text-slate-400 text-[10px]">
                                × {countryConfig.contractTerm} months
                              </div>
                            </td>

                            {/* Gross Amount */}
                            <td className="py-2.5 px-3">
                              {calculatedFeatItem ? (
                                <span className="text-[11px] font-mono text-slate-800 font-semibold">
                                  {countryConfig.currencySymbol} {Number(calculatedFeatItem.contract_subscription_before_discount ?? calculatedFeatItem.item_subscription_before_discount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-[11px] font-mono text-slate-500 italic">
                                  Pending backend calculation
                                </span>
                              )}
                            </td>

                            {/* Discount Input */}
                            <td className="py-2.5 px-4">
                              <div className="space-y-1.5 max-w-xs">
                                <div className="flex items-center gap-1.5">
                                  <div className="inline-flex rounded-md shadow-2xs border border-slate-300 overflow-hidden shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleLineDiscountTypeToggle(itemKey, 'percentage')
                                      }
                                      className={`px-2 py-1 text-[10px] font-bold ${
                                        disc.type === 'percentage'
                                          ? 'bg-orange-600 text-white'
                                          : 'bg-white text-slate-600 hover:bg-slate-50'
                                      }`}
                                      aria-label={`Percentage discount for ${prod.subItem}`}
                                    >
                                      %
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleLineDiscountTypeToggle(itemKey, 'fixed')
                                      }
                                      className={`px-2 py-1 text-[10px] font-bold ${
                                        disc.type === 'fixed'
                                          ? 'bg-orange-600 text-white'
                                          : 'bg-white text-slate-600 hover:bg-slate-50'
                                      }`}
                                      aria-label={`Fixed amount discount for ${prod.subItem}`}
                                    >
                                      {countryConfig.currencySymbol}
                                    </button>
                                  </div>

                                  <input
                                    type="number"
                                    min="0"
                                    max={disc.type === 'percentage' ? '100' : undefined}
                                    value={disc.value}
                                    onChange={(e) =>
                                      handleLineDiscountValueChange(
                                        itemKey,
                                        e.target.value,
                                        disc.type
                                      )
                                    }
                                    placeholder={disc.type === 'percentage' ? '0%' : '0'}
                                    aria-label={`Discount for ${prod.subItem}`}
                                    className={`w-20 px-2 py-1 text-xs rounded border bg-white text-slate-900 focus:outline-none font-medium ${
                                      err
                                        ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                                        : 'border-slate-300 focus:border-orange-500'
                                    }`}
                                  />

                                  <input
                                    type="text"
                                    value={disc.reason || ''}
                                    onChange={(e) =>
                                      handleLineDiscountReasonChange(
                                        itemKey,
                                        e.target.value
                                      )
                                    }
                                    placeholder="Reason..."
                                    aria-label={`Discount reason for ${prod.subItem}`}
                                    className="flex-1 min-w-[100px] px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:border-orange-500"
                                  />
                                </div>

                                {err && (
                                  <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                                    <span>{err}</span>
                                  </p>
                                )}
                              </div>
                            </td>

                            {/* Net Amount */}
                            <td className="py-2.5 px-3 text-right">
                              {calculatedFeatItem ? (
                                <span className="text-[11px] font-mono text-emerald-700 font-bold">
                                  {countryConfig.currencySymbol} {Number(calculatedFeatItem.contract_subscription_after_discount ?? calculatedFeatItem.item_subscription_after_discount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-[11px] font-mono text-slate-500 italic">
                                  Pending backend calculation
                                </span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-2.5 px-3 text-center">
                              {calculatedFeatItem ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" aria-hidden="true" />
                                  <span>Calculated</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                  <Clock className="w-2.5 h-2.5 text-amber-600" aria-hidden="true" />
                                  <span>Pending</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })
        )}
      </div>

      {/* Overall Country Discount & Subtotal Card */}
      <section
        aria-label="Overall Country Discount and Subtotals"
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-orange-600" aria-hidden="true" />
            <h3 className="text-xs font-bold text-slate-900 tracking-tight">
              Overall Country Discount & Commercial Subtotal ({countryConfig.countryName})
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">
            Native Currency: <strong className="font-mono text-slate-800">{countryConfig.currency}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Base Gross Subtotal Display */}
          <div className="md:col-span-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-0.5">
              Gross Software Subtotal ({countryConfig.currency})
            </span>
            {countryGrossSubtotal != null ? (
              <span className="text-xs font-mono font-bold text-slate-800">
                {countryConfig.currencySymbol} {Number(countryGrossSubtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            ) : (
              <span
                className="text-xs font-mono text-slate-500 italic"
                title="Awaiting backend calculation"
              >
                Pending backend calculation
              </span>
            )}
          </div>

          {/* Overall Discount Input */}
          <div className="md:col-span-4 space-y-1">
            <label
              htmlFor={`overall-discount-${countryConfig.id}`}
              className="block text-xs font-semibold text-slate-700"
            >
              Overall Country Discretionary Discount (%)
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`overall-discount-${countryConfig.id}`}
                type="number"
                min="0"
                max="100"
                value={currentOverallDiscount.value}
                onChange={(e) => handleOverallDiscountChange(e.target.value)}
                placeholder="e.g. 10%"
                className={`w-28 px-3 py-1.5 text-xs rounded-lg border bg-white text-slate-900 font-medium focus:outline-none ${
                  overallDiscountError
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-orange-500'
                }`}
              />
              <input
                type="text"
                value={currentOverallDiscount.reason || ''}
                onChange={(e) => handleOverallReasonChange(e.target.value)}
                placeholder="Business justification..."
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:border-orange-500"
              />
            </div>
            {overallDiscountError && (
              <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{overallDiscountError}</span>
              </p>
            )}
          </div>

          {/* Net Software Subtotal Display */}
          <div className="md:col-span-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-right">
            <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-0.5">
              Net Software Subtotal ({countryConfig.currency})
            </span>
            {countryNetSubtotal != null ? (
              <span className="text-xs font-mono font-bold text-emerald-700">
                {countryConfig.currencySymbol} {Number(countryNetSubtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            ) : (
              <span
                className="text-xs font-mono font-bold text-slate-600 italic"
                title="Calculated by backend pricing engine"
              >
                Pending backend calculation
              </span>
            )}
          </div>
        </div>

        <p className="text-[10px] text-slate-500 italic leading-relaxed">
          Important: The frontend does not calculate commercial totals or apply additive discount formulas.
          Discounts are validated and transmitted to the backend pricing engine for authoritative financial computation.
        </p>
      </section>

      {/* Section C: Implementation / Service Lines Section */}
      <section
        aria-label="Professional Services Pricing"
        className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-orange-600" aria-hidden="true" />
            <h3 className="text-xs font-bold text-slate-900 tracking-tight">
              Implementation & Consulting Services ({countryConfig.countryName})
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              Demo State
            </span>
          </div>

          {!isAddingService && (
            <button
              type="button"
              onClick={() => {
                setIsAddingService(true)
                setServiceErrors({})
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Service Line</span>
            </button>
          )}
        </div>

        {/* Add Service Line Inline Modal / Form */}
        {isAddingService && (
          <div className="p-3.5 rounded-lg bg-orange-50/40 border border-orange-200 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-900">
              <span>New Professional Service Line</span>
              <button
                type="button"
                onClick={() => setIsAddingService(false)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Cancel adding service line"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6">
                <label
                  htmlFor="editor-service-role"
                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                >
                  Role / Scope Description *
                </label>
                <input
                  id="editor-service-role"
                  type="text"
                  value={serviceDraft.roleName}
                  onChange={(e) =>
                    setServiceDraft((prev) => ({ ...prev, roleName: e.target.value }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                />
                {serviceErrors.roleName && (
                  <span className="text-[10px] text-rose-600 font-medium mt-0.5 block">
                    {serviceErrors.roleName}
                  </span>
                )}
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="editor-service-hours"
                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                >
                  Effort (Hours) *
                </label>
                <input
                  id="editor-service-hours"
                  type="number"
                  min="0"
                  value={serviceDraft.hoursOrDays}
                  onChange={(e) =>
                    setServiceDraft((prev) => ({
                      ...prev,
                      hoursOrDays: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                />
                {serviceErrors.hoursOrDays && (
                  <span className="text-[10px] text-rose-600 font-medium mt-0.5 block">
                    {serviceErrors.hoursOrDays}
                  </span>
                )}
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="editor-service-rate"
                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                >
                  Hourly Rate ({countryConfig.currency}) *
                </label>
                <input
                  id="editor-service-rate"
                  type="number"
                  min="0"
                  value={serviceDraft.rateApplied}
                  onChange={(e) =>
                    setServiceDraft((prev) => ({
                      ...prev,
                      rateApplied: e.target.value,
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                />
                {serviceErrors.rateApplied && (
                  <span className="text-[10px] text-rose-600 font-medium mt-0.5 block">
                    {serviceErrors.rateApplied}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingService(false)}
                className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200/60 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveServiceLine}
                className="px-3.5 py-1 text-xs font-semibold rounded bg-orange-600 hover:bg-orange-700 text-white shadow-2xs"
              >
                Add Service Line
              </button>
            </div>
          </div>
        )}

        {/* Services Table */}
        {(countryConfig.serviceLines || []).length === 0 ? (
          <div className="p-4 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
            No professional service lines configured. Click "+ Add Service Line" to include custom implementation effort.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
            <table className="w-full text-left text-xs" aria-label="Professional Services">
              <thead className="bg-slate-50 text-[10px] font-semibold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th scope="col" className="py-2.5 px-3">
                    Service Description
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Currency
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Effort (Hours)
                  </th>
                  <th scope="col" className="py-2.5 px-3">
                    Hourly Rate
                  </th>
                  <th scope="col" className="py-2.5 px-3 min-w-[130px]">
                    Service Discount
                  </th>
                  <th scope="col" className="py-2.5 px-3 text-right">
                    Extended Total
                  </th>
                  <th scope="col" className="py-2.5 px-3 text-center w-16">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {(countryConfig.serviceLines || []).map((srv) => {
                  const srvDiscount = serviceDiscounts[srv.id] || { value: '' }
                  const calculatedServiceItem = allServiceLines.find(
                    (sl) => sl.role_name === srv.roleName || (srv.id && String(sl.id) === String(srv.id))
                  )

                  return (
                    <tr key={srv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {srv.roleName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                        {srv.currency || countryConfig.currency}
                      </td>
                      <td className="py-2.5 px-3">
                        {srv.hoursOrDays} hrs
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {countryConfig.currencySymbol} {srv.rateApplied}/hr
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={srvDiscount.value || ''}
                            onChange={(e) =>
                              handleServiceDiscountChange(srv.id, e.target.value)
                            }
                            placeholder="0%"
                            className="w-16 px-1.5 py-0.5 text-xs rounded border border-slate-300"
                            aria-label={`Discount for ${srv.roleName}`}
                          />
                          <span className="text-[10px] text-slate-400">%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                        {calculatedServiceItem ? (
                          <span className="font-semibold text-slate-800">
                            {countryConfig.currencySymbol} {Number(calculatedServiceItem.service_line_total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">
                            Pending backend calculation
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteServiceLine(srv.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Remove service line"
                          aria-label={`Remove service line ${srv.roleName}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default PricingEditor
