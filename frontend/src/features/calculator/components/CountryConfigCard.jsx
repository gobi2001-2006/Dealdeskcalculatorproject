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

export function CountryConfigCard({
  countryConfig,
  canRemove = true,
  onUpdateCountry,
  onRemoveCountry,
}) {
  const [termError, setTermError] = useState('')

  // Resolve current master records
  const countryMaster =
    INITIAL_COUNTRIES.find((c) => c.id === countryConfig.countryId) || {
      id: countryConfig.countryId,
      name: countryConfig.countryName || 'Regional Entity',
      currency: countryConfig.currency || 'USD',
      symbol: countryConfig.currencySymbol || '$',
    }

  const tierMaster =
    INITIAL_PRICING_TIERS.find((t) => t.id === countryConfig.pricingTierId) ||
    INITIAL_PRICING_TIERS[0]

  const deploymentMaster =
    DEPLOYMENT_MODELS.find((d) => d.id === countryConfig.deploymentModelId) ||
    DEPLOYMENT_MODELS[0]

  const pricingModelMaster =
    PRICING_MODELS.find((p) => p.id === countryConfig.pricingModelId) ||
    PRICING_MODELS[0]

  // Handle country dropdown change
  const handleCountryChange = (countryId) => {
    const selected = INITIAL_COUNTRIES.find((c) => c.id === countryId)
    if (selected) {
      onUpdateCountry({
        ...countryConfig,
        countryId: selected.id,
        countryName: selected.name,
        currency: selected.currency,
        currencySymbol: selected.symbol,
      })
    }
  }

  // Handle tier dropdown change
  const handleTierChange = (tierId) => {
    onUpdateCountry({
      ...countryConfig,
      pricingTierId: tierId,
    })
  }

  // Handle deployment dropdown change
  const handleDeploymentChange = (depId) => {
    onUpdateCountry({
      ...countryConfig,
      deploymentModelId: depId,
    })
  }

  // Handle pricing model change (PEPM <-> Platform Subscription)
  // CRITICAL: We preserve both PEPM headcount and platformSubscriptionConfig!
  const handlePricingModelChange = (modelId) => {
    onUpdateCountry({
      ...countryConfig,
      pricingModelId: modelId,
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
  // Prevent duplicate family entries in the same country
  const existingFamilyIds = countryConfig.families.map((f) => f.familyId)
  const availableFamiliesToAdd = INITIAL_PRODUCT_FAMILIES.filter(
    (fam) => !existingFamilyIds.includes(fam.id)
  )

  const handleAddFamily = (familyId) => {
    if (!familyId) return
    const newFamilyEntry = {
      id: `fam-cfg-${Date.now()}-${countryConfig.families.length + 1}`,
      familyId,
      headcount: countryConfig.headcount || 5000,
      selectedPackId: null,
      selectedFeatureIds: [],
    }
    onUpdateCountry({
      ...countryConfig,
      families: [...countryConfig.families, newFamilyEntry],
    })
  }

  // Handle Update Family
  const handleUpdateFamily = (updatedFam) => {
    onUpdateCountry({
      ...countryConfig,
      families: countryConfig.families.map((f) =>
        f.id === updatedFam.id ? updatedFam : f
      ),
    })
  }

  // Handle Remove Family
  const handleRemoveFamily = (familyId) => {
    onUpdateCountry({
      ...countryConfig,
      families: countryConfig.families.filter((f) => f.id !== familyId),
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
                {countryMaster.currency} ({countryMaster.symbol})
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
              {INITIAL_COUNTRIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.currency})
                </option>
              ))}
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
              {INITIAL_PRICING_TIERS.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name} ({tier.code})
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
              {DEPLOYMENT_MODELS.map((dep) => (
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
              {PRICING_MODELS.map((pm) => (
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
              <span>Term (Months) *</span>
            </label>
            <input
              id={`term-input-${countryConfig.id}`}
              type="number"
              min="1"
              step="1"
              value={countryConfig.contractTerm}
              onChange={(e) => handleTermChange(e.target.value)}
              className={`w-full px-2.5 py-2 text-xs rounded-lg border transition-colors bg-white text-slate-900 focus:outline-none font-medium ${
                termError
                  ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100'
              }`}
              aria-invalid={Boolean(termError)}
              aria-describedby={termError ? `term-error-${countryConfig.id}` : undefined}
            />
            {termError && (
              <p
                id={`term-error-${countryConfig.id}`}
                className="mt-1 text-[10px] text-rose-600 flex items-center gap-1 font-medium"
              >
                <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{termError}</span>
              </p>
            )}
          </div>
        </div>

        {/* Country-Specific Result Area for Pricing Returned by Backend */}
        <div className="mt-3.5 p-3 rounded-lg bg-slate-100/80 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-800">
              Country Pricing Summary ({countryMaster.name} • {countryMaster.currency}):
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span
              className="text-xs font-mono font-semibold text-slate-600 italic bg-white border border-slate-200 px-2.5 py-1 rounded shadow-2xs"
              title="Pricing calculations are strictly backend-owned"
            >
              Pricing pending backend calculation
            </span>
          </div>
        </div>
      </div>

      {/* Product Families Section */}
      <div className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-orange-600" aria-hidden="true" />
              <span>Configured Product Families ({countryConfig.families.length})</span>
            </h4>
            <p className="text-[11px] text-slate-500">
              Add packaging suites and à la carte features for {countryMaster.name}.
            </p>
          </div>

          {/* Add Product Family Dropdown */}
          {availableFamiliesToAdd.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                id={`add-family-select-${countryConfig.id}`}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddFamily(e.target.value)
                    e.target.value = ''
                  }
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:border-orange-500 font-medium"
                aria-label={`Add product family to ${countryMaster.name}`}
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

        {/* Product Families List */}
        {countryConfig.families.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
            <Layers className="w-6 h-6 text-slate-400 mx-auto" aria-hidden="true" />
            <h5 className="text-xs font-semibold text-slate-700">
              No Product Families Added Yet
            </h5>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Select a product family from the catalogue to attach packaging suites and individual features.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {countryConfig.families.map((famConfig) => (
              <FamilyConfigCard
                key={famConfig.id}
                familyConfig={famConfig}
                countryPricingModel={pricingModelMaster.name}
                countryHeadcount={countryConfig.headcount}
                countryCurrencySymbol={countryMaster.symbol}
                onUpdateFamily={handleUpdateFamily}
                onRemoveFamily={() => handleRemoveFamily(famConfig.id)}
              />
            ))}
          </div>
        )}

        {/* Phase E — Professional Service Lines Section */}
        <ServiceLinesSection
          countryName={countryMaster.name}
          currency={countryMaster.currency}
          currencySymbol={countryMaster.symbol}
          serviceLines={countryConfig.serviceLines || []}
          onUpdateServiceLines={handleUpdateServiceLines}
        />
      </div>
    </article>
  )
}

export default CountryConfigCard
