import { useState } from 'react'
import { Globe, X } from 'lucide-react'
import {
  INITIAL_COUNTRIES,
  INITIAL_PRICING_TIERS,
  DEPLOYMENT_MODELS,
  PRICING_MODELS,
} from '../../../data/rateCardData'
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

export function AddCountryModal({
  isOpen,
  existingCountryIds = [],
  onClose,
  onAddCountry,
  masters = null,
}) {
  const countryList = masters?.countries?.length > 0 ? masters.countries : INITIAL_COUNTRIES
  const tierList = masters?.tiers?.length > 0 ? masters.tiers : INITIAL_PRICING_TIERS
  const deploymentList = masters?.deployments?.length > 0 ? masters.deployments : DEPLOYMENT_MODELS
  const pricingModelList = masters?.pricingModels?.length > 0 ? masters.pricingModels : PRICING_MODELS

  const availableCountries = countryList.filter(
    (c) => !existingCountryIds.map(String).includes(String(c.id))
  )
  const defaultCountry = availableCountries[0] || countryList[0] || { id: 1, name: 'India', currency: 'INR', symbol: '₹' }

  const [selectedCountryId, setSelectedCountryId] = useState(defaultCountry.id)
  const [selectedTierId, setSelectedTierId] = useState(tierList[0]?.id || 1)
  const [selectedDeploymentId, setSelectedDeploymentId] = useState(deploymentList[0]?.id || 1)

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

  const filteredPricingModels = getFilteredPricingModels(selectedDeploymentId)
  const initialPricingModelId = filteredPricingModels[0]?.id || pricingModelList[0]?.id || 1
  const [selectedPricingModelId, setSelectedPricingModelId] = useState(initialPricingModelId)
  const [contractTerm, setContractTerm] = useState('36')
  const [termError, setTermError] = useState('')

  const handleDeploymentChange = (newDepId) => {
    setSelectedDeploymentId(newDepId)
    const nextModels = getFilteredPricingModels(newDepId)
    if (!nextModels.some((pm) => String(pm.id) === String(selectedPricingModelId))) {
      setSelectedPricingModelId(nextModels[0]?.id || '')
    }
  }

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    const err = validateContractTerm(contractTerm)
    if (err) {
      setTermError(err)
      return
    }

    const countryMaster =
      countryList.find((c) => String(c.id) === String(selectedCountryId)) || defaultCountry

    const numericCountryId = Number(countryMaster.id) || countryMaster.id
    const currencyCode = getCountryCurrencyCode(countryMaster)
    const currencySymbol = getCountryCurrencySymbol(countryMaster, currencyCode)

    onAddCountry({
      id: `cfg-country-${Date.now()}`,
      countryId: numericCountryId,
      countryName: countryMaster.name,
      currency: currencyCode,
      currencySymbol: currencySymbol,
      pricingTierId: Number(selectedTierId) || selectedTierId,
      deploymentModelId: Number(selectedDeploymentId) || selectedDeploymentId,
      pricingModelId: Number(selectedPricingModelId) || selectedPricingModelId,
      contractTerm: Number(contractTerm),
      headcount: 5000,
      platformSubscriptionConfig: {
        annualPlatformFee: '100000',
        monthlySubscriptionFee: '300',
        employeeCount: '5000',
      },
      families: [],
      serviceLines: [],
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-country-title"
    >
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#0B1528] text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-orange-400">
              <Globe className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="add-country-title" className="text-sm font-bold text-white tracking-wide">
                Add Regional Country Deployment
              </h2>
              <p className="text-[11px] text-slate-300">
                Configure regional pricing tier, deployment infrastructure, and contract term.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label
              htmlFor="modal-country-select"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Select Country Entity <span className="text-rose-500">*</span>
            </label>
            <select
              id="modal-country-select"
              value={selectedCountryId}
              onChange={(e) => setSelectedCountryId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
            >
              {availableCountries.map((c) => {
                const currencyCode = getCountryCurrencyCode(c)
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} {currencyCode ? `(${currencyCode})` : ''}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="modal-tier-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Pricing Tier
              </label>
              <select
                id="modal-tier-select"
                value={selectedTierId}
                onChange={(e) => setSelectedTierId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500"
              >
                {tierList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="modal-deployment-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Deployment Model
              </label>
              <select
                id="modal-deployment-select"
                value={selectedDeploymentId}
                onChange={(e) => handleDeploymentChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500"
              >
                {deploymentList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="modal-pricing-model-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Pricing Architecture
              </label>
              <select
                id="modal-pricing-model-select"
                value={selectedPricingModelId}
                onChange={(e) => setSelectedPricingModelId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500"
              >
                {filteredPricingModels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="modal-term-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Contract Term (Months) <span className="text-rose-500">*</span>
              </label>
              <input
                id="modal-term-input"
                type="number"
                min="1"
                max="120"
                value={contractTerm}
                onChange={(e) => {
                  setContractTerm(e.target.value)
                  setTermError('')
                }}
                className={`w-full px-3 py-2 text-xs rounded-lg border ${
                  termError ? 'border-rose-400' : 'border-slate-300'
                } bg-white text-slate-900 focus:outline-none focus:border-orange-500 font-mono`}
              />
              {termError && (
                <p className="mt-1 text-[11px] text-rose-600 font-medium">{termError}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors"
            >
              Add Country
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddCountryModal
