import { useState, useCallback } from 'react'
import {
  Globe,
  Trash2,
  Layers,
  AlertCircle,
} from 'lucide-react'
import { FamilyConfigCard } from './FamilyConfigCard'
import { ServiceLinesSection } from './ServiceLinesSection'
import { validateContractTerm, countryCurrencyCode as getCountryCurrencyCode } from '../calculatorData'
import { getCurrencySymbol } from '../../ratecard/rateCardFormatters'
import { describeCountryVolume } from '../rateUnits'

function getCountryCurrencySymbol(country, currencyCode = null) {
  const code = currencyCode || getCountryCurrencyCode(country)
  if (!code) return ''
  return country?.currency?.symbol || getCurrencySymbol(country, code) || getCurrencySymbol(code) || ''
}

export function CountryConfigCard({
  countryConfig,
  canRemove = true,
  onUpdateCountry,
  onRemoveCountry,
  masters = null,
}) {
  const [termError, setTermError] = useState('')

  // Only saved master records are offered; an empty list means the backend returned none.
  const countryList = masters?.countries || []
  const tierList = masters?.tiers || []
  const deploymentList = masters?.deployments || []
  const pricingModelList = masters?.pricingModels || []
  const familyList = masters?.families || []
  const packsList = masters?.packs || []
  const productsList = masters?.products || []
  const featuresList = masters?.features || []
  // Service rates are per country: only this country's active rates can price its services.
  const serviceRatesList = (masters?.serviceRates || []).filter(
    (sr) => Number(sr.country_id) === Number(countryConfig.countryId) && (sr.status || 'active') === 'active',
  )

  const countryMaster =
    countryList.find((c) => String(c.id) === String(countryConfig.countryId)) || {
      id: countryConfig.countryId,
      name: countryConfig.countryName || 'Select a country',
      currency: countryConfig.currency ? { code: countryConfig.currency, symbol: countryConfig.currencySymbol } : null,
    }

  const countryCurrencyCode = getCountryCurrencyCode(countryMaster)
  const countryCurrencySymbol = getCountryCurrencySymbol(countryMaster, countryCurrencyCode)

  const tierMaster = tierList.find((t) => String(t.id) === String(countryConfig.pricingTierId)) || null
  const deploymentMaster =
    deploymentList.find((d) => String(d.id) === String(countryConfig.deploymentModelId)) || null

  // Pricing models allowed for a deployment model come from the saved combination master.
  const getFilteredPricingModels = (depId) => {
    if (!depId) return []
    const allowedIds = (masters?.deploymentPricingOptions || [])
      .filter((opt) => String(opt.deployment_model_id) === String(depId))
      .map((opt) => String(opt.pricing_model_id))
    return pricingModelList.filter((pm) => allowedIds.includes(String(pm.id)))
  }

  const isMastersLoading = Boolean(masters?.isLoading)
  const filteredPricingModels = getFilteredPricingModels(countryConfig.deploymentModelId)
  const pricingModelMaster =
    pricingModelList.find((p) => String(p.id) === String(countryConfig.pricingModelId)) || null

  // Derive pricing model validation message (evaluated once masters finish loading)
  let pricingModelError = ''
  if (!isMastersLoading) {
    if (!countryConfig.pricingModelId) {
      pricingModelError = 'Pricing model is required to resolve rate cards.'
    } else if (!pricingModelMaster) {
      pricingModelError = `Selected pricing model #${countryConfig.pricingModelId} was not found in loaded master data.`
    } else if (
      countryConfig.deploymentModelId &&
      filteredPricingModels.length > 0 &&
      !filteredPricingModels.some((pm) => String(pm.id) === String(countryConfig.pricingModelId))
    ) {
      pricingModelError = 'Selected pricing model is not available for this deployment model.'
    }
  }

  // Handle country dropdown change
  const handleCountryChange = (countryId) => {
    const selected = countryList.find((c) => String(c.id) === String(countryId))
    const currencyCode = getCountryCurrencyCode(selected)
    onUpdateCountry({
      ...countryConfig,
      countryId: selected ? Number(selected.id) : null,
      countryName: selected?.name || '',
      currency: currencyCode,
      currencySymbol: selected ? getCountryCurrencySymbol(selected, currencyCode) : '',
      // Service rates belong to a country, so lines priced for another country are dropped.
      serviceLines: selected && Number(selected.id) === Number(countryConfig.countryId) ? countryConfig.serviceLines : [],
    })
  }

  // Handle tier dropdown change
  const handleTierChange = (tierId) => {
    onUpdateCountry({
      ...countryConfig,
      pricingTierId: tierId ? Number(tierId) : null,
    })
  }

  // Handle deployment dropdown change
  const handleDeploymentChange = (depId) => {
    const numericDepId = depId ? Number(depId) : null
    const nextModels = getFilteredPricingModels(numericDepId)
    // Keep the pricing model only if it is still a valid combination; never substitute one.
    const keep = nextModels.some((pm) => String(pm.id) === String(countryConfig.pricingModelId))
    onUpdateCountry({
      ...countryConfig,
      deploymentModelId: numericDepId,
      pricingModelId: keep ? countryConfig.pricingModelId : null,
    })
  }

  // Handle pricing model change (PEPM <-> Platform Subscription)
  const handlePricingModelChange = (modelId) => {
    onUpdateCountry({
      ...countryConfig,
      pricingModelId: modelId ? Number(modelId) : null,
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
      headcount: countryConfig.headcount,
      selectedPackId: null,
      selectedFeatureIds: [],
    }
    onUpdateCountry({
      ...countryConfig,
      families: [...(countryConfig.families || []), newFamilyEntry],
    })
  }

  // Unit of measure of each family's selected pack (reported by FamilyConfigCard from the rate card)
  const [packUnits, setPackUnits] = useState({})
  const handlePackUnitChange = useCallback((familyConfigId, unit) => {
    setPackUnits((prev) => {
      const same = unit === null ? !(familyConfigId in prev) : prev[familyConfigId]?.uomName === unit.uomName && prev[familyConfigId]?.period === unit.period
      if (same) return prev
      const next = { ...prev }
      if (unit === null) delete next[familyConfigId]
      else next[familyConfigId] = unit
      return next
    })
  }, [])
  const volumeLabel = describeCountryVolume(
    (countryConfig.families || []).map((f) => packUnits[f.id]).filter(Boolean),
    countryMaster.name,
  )

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
              <h3 className="text-[16px] font-bold text-white tracking-wide">
                {countryMaster.name}
              </h3>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-orange-400 border border-slate-700">
                {countryCurrencyCode || 'No currency'}{countryCurrencySymbol ? ` (${countryCurrencySymbol})` : ''}
              </span>
            </div>
            {/* Header parameter badges */}
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-300 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700/80 font-medium text-slate-200">
                {tierMaster ? tierMaster.name || tierMaster.code : 'Tier not set'}
              </span>
              <span className="text-slate-600">•</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700/80 font-medium text-slate-200">
                {deploymentMaster ? deploymentMaster.name : 'Deployment not set'}
              </span>
              <span className="text-slate-600">•</span>
              <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700/80 font-medium text-orange-300">
                {isMastersLoading
                  ? 'Loading pricing model...'
                  : pricingModelMaster
                  ? pricingModelMaster.name
                  : 'Pricing model not set'}
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg text-rose-300 hover:text-white hover:bg-rose-950/80 border border-rose-800/60 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
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
            <div className="flex items-center justify-between mb-1.5 h-5">
              <label
                htmlFor={`country-select-${countryConfig.id}`}
                className="block text-[13px] font-semibold text-slate-700"
              >
                Country / Jurisdiction <span className="text-rose-500">*</span>
              </label>
            </div>
            <select
              id={`country-select-${countryConfig.id}`}
              value={countryConfig.countryId ?? ''}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full h-10 px-3.5 text-[14px] rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium transition-colors"
            >
              <option value="">{countryList.length ? '-- Select country --' : '-- No countries loaded --'}</option>
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
            <div className="flex items-center justify-between mb-1.5 h-5">
              <label
                htmlFor={`tier-select-${countryConfig.id}`}
                className="block text-[13px] font-semibold text-slate-700"
              >
                Pricing Tier <span className="text-rose-500">*</span>
              </label>
            </div>
            <select
              id={`tier-select-${countryConfig.id}`}
              value={countryConfig.pricingTierId ?? ''}
              onChange={(e) => handleTierChange(e.target.value)}
              className="w-full h-10 px-3.5 text-[14px] rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium transition-colors"
            >
              <option value="">{tierList.length ? '-- Select tier --' : '-- No tiers loaded --'}</option>
              {tierList.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name}
                </option>
              ))}
            </select>
          </div>

          {/* Deployment Model Selector */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-1.5 h-5">
              <label
                htmlFor={`deployment-select-${countryConfig.id}`}
                className="block text-[13px] font-semibold text-slate-700"
              >
                Deployment Model <span className="text-rose-500">*</span>
              </label>
            </div>
            <select
              id={`deployment-select-${countryConfig.id}`}
              value={countryConfig.deploymentModelId ?? ''}
              onChange={(e) => handleDeploymentChange(e.target.value)}
              className="w-full h-10 px-3.5 text-[14px] rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium transition-colors"
            >
              <option value="">{deploymentList.length ? '-- Select deployment --' : '-- None loaded --'}</option>
              {deploymentList.map((dep) => (
                <option key={dep.id} value={dep.id}>
                  {dep.name}
                </option>
              ))}
            </select>
          </div>

          {/* Pricing Model Selector */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-1.5 h-5">
              <label
                htmlFor={`pricing-model-select-${countryConfig.id}`}
                className="block text-[13px] font-semibold text-slate-700"
              >
                Pricing Model <span className="text-rose-500">*</span>
              </label>
            </div>
            <select
              id={`pricing-model-select-${countryConfig.id}`}
              value={countryConfig.pricingModelId ?? ''}
              onChange={(e) => handlePricingModelChange(e.target.value)}
              className={`w-full h-10 px-3.5 text-[14px] rounded-lg border bg-white text-slate-900 focus:outline-none focus:ring-2 font-medium transition-colors ${
                pricingModelError
                  ? 'border-rose-400 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-orange-500 focus:ring-orange-100'
              }`}
              aria-invalid={Boolean(pricingModelError)}
            >
              <option value="">
                {isMastersLoading
                  ? '-- Loading pricing models... --'
                  : countryConfig.deploymentModelId
                  ? filteredPricingModels.length
                    ? '-- Select pricing model --'
                    : '-- No pricing model configured for this deployment --'
                  : '-- Choose deployment first --'}
              </option>
              {filteredPricingModels.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
              {pricingModelMaster && !filteredPricingModels.some((pm) => String(pm.id) === String(pricingModelMaster.id)) && (
                <option key={pricingModelMaster.id} value={pricingModelMaster.id}>
                  {pricingModelMaster.name} (unsupported for deployment)
                </option>
              )}
            </select>
            {pricingModelError && (
              <p className="mt-1 text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{pricingModelError}</span>
              </p>
            )}
          </div>

          {/* Contract Term (Months) Input */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-1.5 h-5">
              <label
                htmlFor={`term-input-${countryConfig.id}`}
                className="block text-[13px] font-semibold text-slate-700"
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
              className={`w-full h-10 px-3.5 text-[14px] rounded-lg border transition-colors bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 ${
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

        {/* Country deployment volume: the quantity of every selected pack, in the pack rate card's UOM */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
          <div>
            <label
              htmlFor={`country-headcount-input-${countryConfig.id}`}
              className="block text-[13px] font-bold text-slate-900"
            >
              {volumeLabel.heading}
            </label>
            <p className={`text-[11px] mt-0.5 ${volumeLabel.mixed ? 'text-amber-700' : 'text-slate-500'}`}>
              {volumeLabel.help}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <input
              id={`country-headcount-input-${countryConfig.id}`}
              type="number"
              min="1"
              value={countryConfig.headcount ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : Number(e.target.value)
                onUpdateCountry({
                  ...countryConfig,
                  headcount: val,
                  families: (countryConfig.families || []).map((f) => ({
                    ...f,
                    headcount: val,
                  })),
                })
              }}
              className="w-40 h-10 px-3.5 text-[14px] rounded-lg border border-slate-300 bg-white text-slate-900 font-mono font-bold focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-right shadow-2xs"
            />
            <span className="text-[12px] font-semibold text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 shadow-2xs">
              {volumeLabel.unit}
            </span>
          </div>
        </div>
      </div>

      {/* Product Families Section */}
      <div className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div>
            <h4 className="text-[16px] font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
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
                className="h-9 px-3.5 text-[12px] rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold focus:outline-none focus:border-orange-500 shadow-2xs hover:bg-slate-50 transition-colors"
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
                countryHeadcount={countryConfig.headcount}
                countryId={countryConfig.countryId}
                pricingTierId={countryConfig.pricingTierId}
                deploymentModelId={countryConfig.deploymentModelId}
                pricingModelId={countryConfig.pricingModelId}
                contractTerm={countryConfig.contractTerm}
                currencyCode={countryCurrencyCode}
                currencySymbol={countryCurrencySymbol}
                onPackUnitChange={handlePackUnitChange}
                onUpdateFamily={handleUpdateFamily}
                onRemoveFamily={() => handleRemoveFamily(familyConfig.id)}
                families={familyList}
                packs={packsList}
                products={productsList}
                features={featuresList}
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
