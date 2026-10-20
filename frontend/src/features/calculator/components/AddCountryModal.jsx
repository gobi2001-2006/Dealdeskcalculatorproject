import { useState } from 'react'
import { Globe, X } from 'lucide-react'
import {
  INITIAL_COUNTRIES,
  INITIAL_PRICING_TIERS,
  DEPLOYMENT_MODELS,
  PRICING_MODELS,
} from '../../../data/rateCardData'
import { validateContractTerm } from '../calculatorData'

export function AddCountryModal({
  isOpen,
  existingCountryIds = [],
  onClose,
  onAddCountry,
}) {
  const availableCountries = INITIAL_COUNTRIES.filter(
    (c) => !existingCountryIds.includes(c.id)
  )
  const defaultCountry = availableCountries[0] || INITIAL_COUNTRIES[0]

  const [selectedCountryId, setSelectedCountryId] = useState(defaultCountry.id)
  const [selectedTierId, setSelectedTierId] = useState('tier-1')
  const [selectedDeploymentId, setSelectedDeploymentId] = useState('dep-shared')
  const [selectedPricingModelId, setSelectedPricingModelId] = useState('pm-pepm')
  const [contractTerm, setContractTerm] = useState('36')
  const [termError, setTermError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    const err = validateContractTerm(contractTerm)
    if (err) {
      setTermError(err)
      return
    }

    const countryMaster =
      INITIAL_COUNTRIES.find((c) => c.id === selectedCountryId) || INITIAL_COUNTRIES[0]

    onAddCountry({
      id: `cfg-country-${Date.now()}`,
      countryId: countryMaster.id,
      countryName: countryMaster.name,
      currency: countryMaster.currency,
      currencySymbol: countryMaster.symbol,
      pricingTierId: selectedTierId,
      deploymentModelId: selectedDeploymentId,
      pricingModelId: selectedPricingModelId,
      contractTerm: Number(contractTerm),
      headcount: 5000,
      platformSubscriptionConfig: {
        annualPlatformFee: '100000',
        monthlySubscriptionFee: '300',
        employeeCount: '10000',
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
              Country / Jurisdiction *
            </label>
            <select
              id="modal-country-select"
              value={selectedCountryId}
              onChange={(e) => setSelectedCountryId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
            >
              {INITIAL_COUNTRIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.currency} • {c.symbol})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="modal-tier-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Pricing Tier *
              </label>
              <select
                id="modal-tier-select"
                value={selectedTierId}
                onChange={(e) => setSelectedTierId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
              >
                {INITIAL_PRICING_TIERS.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name} ({tier.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="modal-deployment-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Deployment Model *
              </label>
              <select
                id="modal-deployment-select"
                value={selectedDeploymentId}
                onChange={(e) => setSelectedDeploymentId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
              >
                {DEPLOYMENT_MODELS.map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {dep.name}
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
                Pricing Model *
              </label>
              <select
                id="modal-pricing-model-select"
                value={selectedPricingModelId}
                onChange={(e) => setSelectedPricingModelId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
              >
                {PRICING_MODELS.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="modal-term-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Contract Term (Months) *
              </label>
              <input
                id="modal-term-input"
                type="number"
                min="1"
                step="1"
                value={contractTerm}
                onChange={(e) => {
                  setContractTerm(e.target.value)
                  setTermError('')
                }}
                className={`w-full px-3 py-2 text-xs rounded-lg border font-medium bg-white text-slate-900 focus:outline-none ${
                  termError
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-orange-500'
                }`}
              />
              {termError && (
                <p className="mt-1 text-[10px] text-rose-600 font-medium">{termError}</p>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
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
