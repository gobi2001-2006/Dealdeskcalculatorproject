import { useState } from 'react'
import {
  Globe,
  Trash2,
  Layers,
  AlertCircle,
  Building2,
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
  if (country?.currency && typeof country.currency === 'object' && country.currency.symbol) {
    return country.currency.symbol
  }
  if (country?.symbol) return country.symbol
  const code = currencyCode || getCountryCurrencyCode(country)
  if (code === 'INR') return '₹'
  if (code === 'EUR') return '€'
  if (code === 'GBP') return '£'
  return '$'
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
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 shadow-2xs font-bold text-sm">
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
              <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 font-medium">
                {tierMaster.name || tierMaster.code}
              </span>
              <span>•</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 font-medium">
                {deploymentMaster.name}
              </span>
              <span>•</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 font-medium text-orange-300">
                {pricingModelMaster.name}
              </span>
              <span>•</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 font-medium">
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
      <div className="p-5 border-b border-slate-100 bg-slate-50/40">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
          {/* Country Selector */}
          <div className="lg:col-span-3">
            <label
              htmlFor={`country-select-${countryConfig.id}`}
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Country / Jurisdiction <span className="text-rose-500">*</span>
            </label>
            <select
              id={`country-select-${countryConfig.id}`}
              value={countryConfig.countryId}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
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
            <label
              htmlFor={`tier-select-${countryConfig.id}`}
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Pricing Tier <span className="text-rose-500">*</span>
            </label>
            <select
              id={`tier-select-${countryConfig.id}`}
              value={countryConfig.pricingTierId}
              onChange={(e) => handleTierChange(e.target.value)}
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
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
            <label
              htmlFor={`deployment-select-${countryConfig.id}`}
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Deployment Model <span className="text-rose-500">*</span>
            </label>
            <select
              id={`deployment-select-${countryConfig.id}`}
              value={countryConfig.deploymentModelId}
              onChange={(e) => handleDeploymentChange(e.target.value)}
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
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
            <label
              htmlFor={`pricing-model-select-${countryConfig.id}`}
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Pricing Model <span className="text-rose-500">*</span>
            </label>
            <select
              id={`pricing-model-select-${countryConfig.id}`}
              value={countryConfig.pricingModelId}
              onChange={(e) => handlePricingModelChange(e.target.value)}
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
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
            <label
              htmlFor={`term-input-${countryConfig.id}`}
              className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between"
            >
              <span>Term (Mo)</span>
              <span className="text-[10px] text-slate-400 font-normal">Months</span>
            </label>
            <input
              id={`term-input-${countryConfig.id}`}
              type="number"
              min="1"
              max="120"
              value={countryConfig.contractTerm}
              onChange={(e) => handleTermChange(e.target.value)}
              className={`w-full px-2.5 py-2 text-xs rounded-lg border transition-colors bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 ${
                termError
                  ? 'border-rose-400 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-orange-500 focus:ring-orange-100'
              }`}
              aria-invalid={Boolean(termError)}
            />
          </div>
        </div>

        {termError && (
          <p className="mt-2 text-[11px] text-rose-600 flex items-center gap-1 font-medium">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{termError}</span>
          </p>
        )}
      </div>

      {/* Product Families Section */}
      <div className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-orange-600" aria-hidden="true" />
              <span>Configured Product Families ({(countryConfig.families || []).length})</span>
            </h4>
            <p className="text-[11px] text-slate-500">
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
                className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold focus:outline-none focus:border-orange-500 shadow-2xs"
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
          <div className="p-6 rounded-lg bg-slate-50/60 border border-dashed border-slate-200 text-center space-y-2">
            <Building2 className="w-6 h-6 text-slate-400 mx-auto" aria-hidden="true" />
            <div className="text-xs font-semibold text-slate-700">
              No Product Families Added Yet
            </div>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Select an enterprise product family above to assign commercial software packs and standalone features for {countryMaster.name}.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {(countryConfig.families || []).map((familyConfig) => (
              <FamilyConfigCard
                key={familyConfig.id}
                familyConfig={familyConfig}
                countryPricingModel={pricingModelMaster.name}
                countryHeadcount={countryConfig.headcount}
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
