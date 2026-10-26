import { useState, useEffect } from 'react'
import {
  Globe,
  Trash2,
  Layers,
  AlertCircle,
} from 'lucide-react'
import {
  INITIAL_COUNTRIES,
  INITIAL_PRICING_TIERS,
  DEPLOYMENT_MODELS,
  PRICING_MODELS,
} from '../../../data/rateCardData'
import { INITIAL_PRODUCT_FAMILIES } from '../../../data/catalogueData'
import { FamilyConfigCard } from './FamilyConfigCard'
import { ServiceLinesSection } from './ServiceLinesSection'
import { validateContractTerm } from '../calculatorData'
import { getCurrencySymbol } from '../../ratecard/rateCardFormatters'

function getCountryCurrencyCode(country) {
  if (!country) return 'USD'
  if (country.currency_code) return country.currency_code
  if (typeof country.currency === 'string') return country.currency
  if (country.currency && typeof country.currency === 'object' && country.currency.code) {
    return country.currency.code
  }
  return 'USD'
}

function getCountryCurrencySymbol(country, currencyCode = null) {
  const code = currencyCode || getCountryCurrencyCode(country)
  return getCurrencySymbol(country, code) || getCurrencySymbol(code) || '$'
}

export function CountryConfigCard({
  countryConfig,
  canRemove = true,
  onUpdateCountry,
  onRemoveCountry,
  masters = null,
}) {
  const [termError, setTermError] = useState('')

  const countryList = masters?.countries?.length > 0 ? masters.countries : INITIAL_COUNTRIES
  const tierList = masters?.tiers?.length > 0 ? masters.tiers : INITIAL_PRICING_TIERS
  const deploymentList = masters?.deployments?.length > 0 ? masters.deployments : DEPLOYMENT_MODELS
  const pricingModelList = masters?.pricingModels?.length > 0 ? masters.pricingModels : PRICING_MODELS
  const familyList = masters?.families?.length > 0 ? masters.families : INITIAL_PRODUCT_FAMILIES
  const packsList = masters?.packs || []
  const productsList = masters?.products || []
  const serviceRatesList = masters?.serviceRates || []

  // Resolve current master records
  const countryMaster =
    countryList.find((c) => String(c.id) === String(countryConfig.countryId)) || {
      id: countryConfig.countryId,
      name: countryConfig.countryName || 'Regional Entity',
      currency: countryConfig.currency || 'USD',
      symbol: countryConfig.currencySymbol || '$',
    }

  const countryCurrencyCode = getCountryCurrencyCode(countryMaster)
  const countryCurrencySymbol = getCountryCurrencySymbol(countryMaster, countryCurrencyCode)

  const tierMaster =
    tierList.find((t) => String(t.id) === String(countryConfig.pricingTierId)) ||
    tierList[0] || { id: 1, name: 'Tier 1' }

  const deploymentMaster =
    deploymentList.find((d) => String(d.id) === String(countryConfig.deploymentModelId)) ||
    deploymentList[0] || { id: 1, name: 'Shared Cloud' }

  const getFilteredPricingModels = (depId) => {
    if (!depId) return pricingModelList
    if (masters?.deploymentPricingOptions?.length > 0) {
      const allowedIds = masters.deploymentPricingOptions
        .filter((opt) => String(opt.deployment_model_id) === String(depId))
        .map((opt) => String(opt.pricing_model_id))
      if (allowedIds.length > 0) {
        return pricingModelList.filter((pm) => allowedIds.includes(String(pm.id)))
      }
    }
    const depObj = deploymentList.find((d) => String(d.id) === String(depId))
    const depCode = (depObj?.code || depObj?.name || '').toLowerCase()
    if (depCode.includes('on_prem') || depCode.includes('on-prem')) {
      const onPrem = pricingModelList.filter((pm) => {
        const pmName = (pm.name || pm.code || '').toLowerCase()
        return pmName.includes('license') || pmName.includes('amc')
      })
      if (onPrem.length > 0) return onPrem
    }
    return pricingModelList
  }

  const filteredPricingModels = getFilteredPricingModels(countryConfig.deploymentModelId)

  const pricingModelMaster =
    pricingModelList.find((p) => String(p.id) === String(countryConfig.pricingModelId)) ||
    filteredPricingModels[0] ||
    pricingModelList[0] || { id: 1, name: 'PEPM' }

  // Synchronize countryConfig properties to actual database master records when loaded
  useEffect(() => {
    if (!masters) return

    let updates = null

    // 1. Sync country ID and currency if loaded from DB
    if (masters.countries?.length > 0) {
      const matchedCountry = masters.countries.find((c) => String(c.id) === String(countryConfig.countryId))
      if (!matchedCountry) {
        // Try matching by name or iso_code or fallback to first
        const byCode = masters.countries.find(
          (c) =>
            c.iso_code?.toLowerCase() === String(countryConfig.countryId).toLowerCase() ||
            c.name?.toLowerCase() === (countryConfig.countryName || '').toLowerCase()
        ) || masters.countries[0]
        if (byCode) {
          const cCode = getCountryCurrencyCode(byCode)
          updates = {
            ...(updates || {}),
            countryId: Number(byCode.id),
            countryName: byCode.name,
            currency: cCode,
            currencySymbol: getCountryCurrencySymbol(byCode, cCode),
          }
        }
      } else {
        const cCode = getCountryCurrencyCode(matchedCountry)
        if (countryConfig.currency !== cCode || countryConfig.countryName !== matchedCountry.name) {
          updates = {
            ...(updates || {}),
            countryName: matchedCountry.name,
            currency: cCode,
            currencySymbol: getCountryCurrencySymbol(matchedCountry, cCode),
          }
        }
      }
    }

    // 2. Sync tier ID
    if (masters.tiers?.length > 0) {
      const matchedTier = masters.tiers.find((t) => String(t.id) === String(countryConfig.pricingTierId))
      if (!matchedTier) {
        updates = {
          ...(updates || {}),
          pricingTierId: Number(masters.tiers[0].id),
        }
      }
    }

    // 3. Sync deployment model ID
    if (masters.deployments?.length > 0) {
      const matchedDep = masters.deployments.find((d) => String(d.id) === String(countryConfig.deploymentModelId))
      if (!matchedDep) {
        updates = {
          ...(updates || {}),
          deploymentModelId: Number(masters.deployments[0].id),
        }
      }
    }

    // 4. Sync pricing model ID
    if (masters.pricingModels?.length > 0) {
      const matchedPm = masters.pricingModels.find((p) => String(p.id) === String(countryConfig.pricingModelId))
      if (!matchedPm) {
        updates = {
          ...(updates || {}),
          pricingModelId: Number(filteredPricingModels[0]?.id || masters.pricingModels[0].id),
        }
      }
    }

    if (updates) {
      onUpdateCountry({
        ...countryConfig,
        ...updates,
      })
    }
  }, [masters])

  // Handle country dropdown change
  const handleCountryChange = (countryId) => {
    const selected = countryList.find((c) => String(c.id) === String(countryId))
    if (selected) {
      const numericId = Number(selected.id) || selected.id
      const currencyCode = getCountryCurrencyCode(selected)
      const currencySymbol = getCountryCurrencySymbol(selected, currencyCode)

      onUpdateCountry({
        ...countryConfig,
        countryId: numericId,
        countryName: selected.name,
        currency: currencyCode,
        currencySymbol: currencySymbol,
      })
    }
  }

  // Handle tier dropdown change
  const handleTierChange = (tierId) => {
    onUpdateCountry({
      ...countryConfig,
      pricingTierId: Number(tierId) || tierId,
    })
  }

  // Handle deployment dropdown change
  const handleDeploymentChange = (depId) => {
    const numericDepId = Number(depId) || depId
    const nextModels = getFilteredPricingModels(numericDepId)
    let newPricingModelId = countryConfig.pricingModelId
    if (!nextModels.some((pm) => String(pm.id) === String(newPricingModelId))) {
      newPricingModelId = nextModels[0]?.id || newPricingModelId
    }
    onUpdateCountry({
      ...countryConfig,
      deploymentModelId: numericDepId,
      pricingModelId: Number(newPricingModelId) || newPricingModelId,
    })
  }

  // Handle pricing model change (PEPM <-> Platform Subscription)
  const handlePricingModelChange = (modelId) => {
    onUpdateCountry({
      ...countryConfig,
      pricingModelId: Number(modelId) || modelId,
    })
  }

  // Handle contract term change with validation
  const handleTermChange = (value) => {
    const err = validateContractTerm(value)
    setTermError(err)
    onUpdateCountry({
      ...countryConfig,
      contractTerm: value === '' ? '' : Number(value) || value,
    })
  }

  // Handle Add Product Family to this country
  const existingFamilyIds = (countryConfig.families || []).map((f) => String(f.familyId))
  const availableFamiliesToAdd = familyList.filter(
    (fam) => !existingFamilyIds.includes(String(fam.id))
  )

  const handleAddFamily = (familyId) => {
    if (!familyId) return
    const newFamilyEntry = {
      id: `fam-cfg-${Date.now()}-${(countryConfig.families || []).length + 1}`,
      familyId: Number(familyId) || familyId,
      headcount: countryConfig.headcount || 5000,
      selectedPackId: null,
      selectedFeatureIds: [],
    }
    onUpdateCountry({
      ...countryConfig,
      families: [...(countryConfig.families || []), newFamilyEntry],
    })
  }

  // Handle Update Family
  const handleUpdateFamily = (updatedFam) => {
    onUpdateCountry({
      ...countryConfig,
      families: (countryConfig.families || []).map((f) =>
        f.id === updatedFam.id ? updatedFam : f
      ),
    })
  }

  // Handle Remove Family
  const handleRemoveFamily = (familyId) => {
    onUpdateCountry({
      ...countryConfig,
      families: (countryConfig.families || []).filter((f) => f.id !== familyId),
    })
  }

  // Handle Update Service Lines
  const handleUpdateServiceLines = (newServiceLines) => {
    onUpdateCountry({
      ...countryConfig,
      serviceLines: newServiceLines,
    })
  }

  return (
    <article
      aria-label={`Country configuration for ${countryMaster.name}`}
      className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden transition-shadow hover:shadow-sm"
    >
      {/* Dark Navy Country Header */}
      <header className="bg-[#0B1528] text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 shadow-2xs shrink-0">
            <Globe className="w-4 h-4 text-orange-400" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white tracking-wide">
                {countryMaster.name}
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-orange-400 border border-slate-700">
                {countryCurrencyCode} ({countryCurrencySymbol})
              </span>
            </div>
            {/* Header parameter badges */}
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-300 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700/80 font-medium text-slate-200">
                {tierMaster.name || tierMaster.code}
              </span>
              <span className="text-slate-600">•</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700/80 font-medium text-slate-200">
                {deploymentMaster.name}
              </span>
              <span className="text-slate-600">•</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700/80 font-medium text-orange-300">
                {pricingModelMaster.name}
              </span>
              <span className="text-slate-600">•</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700/80 font-medium text-slate-200">
                {countryConfig.contractTerm || '—'} Months
              </span>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {canRemove && (
            <button
              type="button"
              onClick={onRemoveCountry}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg text-rose-300 hover:text-white hover:bg-rose-950/80 border border-rose-800/60 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
              title={`Remove ${countryMaster.name} deployment`}
              aria-label={`Remove country ${countryMaster.name}`}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Remove Country</span>
            </button>
          )}
        </div>
      </header>

      {/* Country Configuration Controls Row */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/50 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-start">
          {/* Country Selector */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-1.5 h-4">
              <label
                htmlFor={`country-select-${countryConfig.id}`}
                className="block text-xs font-semibold text-slate-700"
              >
                Country / Jurisdiction <span className="text-rose-500">*</span>
              </label>
            </div>
            <select
              id={`country-select-${countryConfig.id}`}
              value={countryConfig.countryId}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium transition-colors"
            >
              {countryList.map((c) => {
                const currencyCode = getCountryCurrencyCode(c)
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} {currencyCode ? `(${currencyCode})` : ''}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Pricing Tier Selector */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-1.5 h-4">
              <label
                htmlFor={`tier-select-${countryConfig.id}`}
                className="block text-xs font-semibold text-slate-700"
              >
                Pricing Tier <span className="text-rose-500">*</span>
              </label>
            </div>
            <select
              id={`tier-select-${countryConfig.id}`}
              value={countryConfig.pricingTierId}
              onChange={(e) => handleTierChange(e.target.value)}
              className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium transition-colors"
            >
              {tierList.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name}
                </option>
              ))}
            </select>
          </div>

          {/* Deployment Model Selector */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-1.5 h-4">
              <label
                htmlFor={`deployment-select-${countryConfig.id}`}
                className="block text-xs font-semibold text-slate-700"
              >
                Deployment Model <span className="text-rose-500">*</span>
              </label>
            </div>
            <select
              id={`deployment-select-${countryConfig.id}`}
              value={countryConfig.deploymentModelId}
              onChange={(e) => handleDeploymentChange(e.target.value)}
              className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium transition-colors"
            >
              {deploymentList.map((dep) => (
                <option key={dep.id} value={dep.id}>
                  {dep.name}
                </option>
              ))}
            </select>
          </div>

          {/* Pricing Model Selector */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-1.5 h-4">
              <label
                htmlFor={`pricing-model-select-${countryConfig.id}`}
                className="block text-xs font-semibold text-slate-700"
              >
                Pricing Model <span className="text-rose-500">*</span>
              </label>
            </div>
            <select
              id={`pricing-model-select-${countryConfig.id}`}
              value={countryConfig.pricingModelId}
              onChange={(e) => handlePricingModelChange(e.target.value)}
              className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium transition-colors"
            >
              {filteredPricingModels.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </select>
          </div>

          {/* Contract Term (Months) Input */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-1.5 h-4">
              <label
                htmlFor={`term-input-${countryConfig.id}`}
                className="block text-xs font-semibold text-slate-700"
              >
                Contract Term (Mo) <span className="text-rose-500">*</span>
              </label>
            </div>
            <input
              id={`term-input-${countryConfig.id}`}
              type="number"
              min="1"
              max="120"
              value={countryConfig.contractTerm}
              onChange={(e) => handleTermChange(e.target.value)}
              className={`w-full h-10 px-3 text-xs rounded-lg border transition-colors bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 ${
                termError
                  ? 'border-rose-400 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-orange-500 focus:ring-orange-100'
              }`}
              aria-invalid={Boolean(termError)}
            />
          </div>
        </div>

        {termError && (
          <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{termError}</span>
          </p>
        )}

        {/* Active Employees (with ESS) Quantity Input — Separate Horizontal Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
          <div>
            <label
              htmlFor={`country-headcount-input-${countryConfig.id}`}
              className="block text-xs font-bold text-slate-900"
            >
              Active Employees (with ESS) — Country Deployment Volume
            </label>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Authoritative UOM employee count applied to PEPM subscription calculations across all families for {countryMaster.name}.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <input
              id={`country-headcount-input-${countryConfig.id}`}
              type="number"
              min="1"
              value={countryConfig.headcount || 5000}
              onChange={(e) => {
                const val = Number(e.target.value) || 0
                onUpdateCountry({
                  ...countryConfig,
                  headcount: val,
                  families: (countryConfig.families || []).map((f) => ({
                    ...f,
                    headcount: val,
                  })),
                })
              }}
              className="w-36 h-9 px-3 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-mono font-bold focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-right shadow-2xs"
            />
            <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              Users
            </span>
          </div>
        </div>
      </div>

      {/* Product Families Section */}
      <div className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div>
            <h4 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-orange-600" aria-hidden="true" />
              <span>Configured Product Families ({(countryConfig.families || []).length})</span>
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Each module family includes pack packaging configurations and standalone à la carte feature add-ons.
            </p>
          </div>

          {/* Add Family Dropdown Selector */}
          {availableFamiliesToAdd.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor={`add-family-select-${countryConfig.id}`}
                className="sr-only"
              >
                Add Product Family
              </label>
              <select
                id={`add-family-select-${countryConfig.id}`}
                defaultValue=""
                onChange={(e) => {
                  handleAddFamily(e.target.value)
                  e.target.value = ''
                }}
                className="h-8 px-3 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold focus:outline-none focus:border-orange-500 shadow-2xs hover:bg-slate-50 transition-colors"
              >
                <option value="" disabled>
                  + Add Product Family...
                </option>
                {availableFamiliesToAdd.map((fam) => (
                  <option key={fam.id} value={fam.id}>
                    {fam.name} ({fam.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Empty Families Fallback */}
        {(countryConfig.families || []).length === 0 ? (
          <div className="py-6 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center text-xs font-medium text-slate-500">
            Add Product Family
          </div>
        ) : (
          <div className="space-y-4">
            {(countryConfig.families || []).map((familyConfig) => (
              <FamilyConfigCard
                key={familyConfig.id}
                familyConfig={familyConfig}
                countryPricingModel={pricingModelMaster.name}
                countryHeadcount={countryConfig.headcount}
                countryId={countryConfig.countryId}
                pricingTierId={countryConfig.pricingTierId}
                deploymentModelId={countryConfig.deploymentModelId}
                pricingModelId={countryConfig.pricingModelId}
                contractTerm={countryConfig.contractTerm || 36}
                currencyCode={countryCurrencyCode}
                currencySymbol={countryCurrencySymbol}
                onUpdateFamily={handleUpdateFamily}
                onRemoveFamily={() => handleRemoveFamily(familyConfig.id)}
                families={familyList}
                packs={packsList}
                products={productsList}
              />
            ))}
          </div>
        )}

        {/* Service Lines Section */}
        <ServiceLinesSection
          countryName={countryMaster.name}
          currency={countryCurrencyCode}
          currencySymbol={countryCurrencySymbol}
          serviceLines={countryConfig.serviceLines || []}
          onUpdateServiceLines={handleUpdateServiceLines}
          serviceRates={serviceRatesList}
        />
      </div>
    </article>
  )
}

export default CountryConfigCard
