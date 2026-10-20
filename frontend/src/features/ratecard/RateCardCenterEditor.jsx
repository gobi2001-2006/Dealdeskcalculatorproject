import {
  Server,
  CreditCard,
  Globe,
  Filter,
  X,
  Info,
  ChevronDown,
  Clock,
} from 'lucide-react'
import { PackRatesSection } from './PackRatesSection'
import { FeatureRatesSection } from './FeatureRatesSection'
import { PlatformSubscriptionSection } from './PlatformSubscriptionSection'
import {
  DEPLOYMENT_MODELS,
  PRICING_MODELS,
  INITIAL_PRICING_TIERS,
} from '../../data/rateCardData'

export function RateCardCenterEditor({
  selectedDeployment,
  onChangeDeployment,
  deploymentModels = DEPLOYMENT_MODELS,
  selectedPricingModel,
  onChangePricingModel,
  pricingModels = PRICING_MODELS,
  pricingTiers = INITIAL_PRICING_TIERS,
  selectedCountryId,
  onChangeCountry,
  countries = [],
  selectedFamilyId = 'all',
  families = [],
  onClearFamilyFilter,
  // PEPM Rates
  packRates = [],
  packs = [],
  onUpdatePackRate,
  onRemovePackRate,
  onOpenAddPackRate,
  featureRates = [],
  onUpdateFeatureRate,
  onRemoveFeatureRate,
  onOpenAddFeatureRate,
  // Platform + Subscription
  platformConfig,
  onChangePlatformConfig,
  onResetPlatformDemo,
}) {
  const activeCountry =
    countries.find((c) => c.id === selectedCountryId) || countries[0]
  const activeFamily =
    selectedFamilyId !== 'all'
      ? families.find((f) => f.id === selectedFamilyId)
      : null
  const activePricingModel =
    pricingModels.find((pm) => pm.code === selectedPricingModel) || {
      name: selectedPricingModel,
      code: selectedPricingModel,
    }

  // Filter PEPM rates by active family if selected
  const filteredPackRates = packRates.filter((pr) => {
    const matchDeployment = pr.deploymentModel === selectedDeployment
    const matchPricing = pr.pricingModel === selectedPricingModel
    const matchFamily =
      selectedFamilyId === 'all' || pr.familyId === selectedFamilyId
    return matchDeployment && matchPricing && matchFamily
  })

  const filteredFeatureRates = featureRates.filter((fr) => {
    const matchDeployment = fr.deploymentModel === selectedDeployment
    const matchPricing = fr.pricingModel === selectedPricingModel
    const matchFamily =
      selectedFamilyId === 'all' || fr.familyId === selectedFamilyId
    return matchDeployment && matchPricing && matchFamily
  })

  return (
    <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 space-y-5">
      {/* Top Configuration Controls Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
        {/* Row 1: Deployment & Pricing Model & Country Dropdowns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Deployment Model Dropdown */}
          <div className="space-y-1">
            <label
              htmlFor="deployment-model-select"
              className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5"
            >
              <Server className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Deployment Architecture</span>
            </label>
            <div className="relative">
              <select
                id="deployment-model-select"
                aria-label="Deployment Architecture"
                value={selectedDeployment}
                onChange={(e) => onChangeDeployment(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer appearance-none"
              >
                {deploymentModels.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* 2. Pricing Model Dropdown */}
          <div className="space-y-1">
            <label
              htmlFor="pricing-model-select"
              className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Commercial Pricing Model</span>
            </label>
            <div className="relative">
              <select
                id="pricing-model-select"
                aria-label="Commercial Pricing Model"
                value={selectedPricingModel}
                onChange={(e) => onChangePricingModel(e.target.value)}
                className="w-full pl-3 pr-8 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer appearance-none"
              >
                {pricingModels.map((pm) => (
                  <option key={pm.id} value={pm.code}>
                    {pm.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* 3. Country & Currency Selector */}
          <div className="space-y-1">
            <label
              htmlFor="country-select"
              className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Rate Country & Currency</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <select
                  id="country-select"
                  aria-label="Rate Country"
                  value={selectedCountryId}
                  onChange={(e) => onChangeCountry(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer appearance-none"
                >
                  {countries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.currency})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
              <span
                className="px-2.5 py-2 text-xs font-mono font-bold rounded-lg bg-slate-100 text-slate-700 border border-slate-200 shrink-0"
                title={`Active Currency Symbol: ${activeCountry?.symbol || activeCountry?.currency}`}
              >
                {activeCountry?.symbol || activeCountry?.currency}
              </span>
            </div>
          </div>
        </div>

        {/* Row 2: Family Scope Pill & Notice */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Scope:</span>
            {activeFamily ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                <Filter className="w-3 h-3 text-orange-600" aria-hidden="true" />
                <span>Filtered by: {activeFamily.name}</span>
                <button
                  type="button"
                  onClick={onClearFamilyFilter}
                  className="p-0.5 hover:bg-orange-200 rounded-full cursor-pointer"
                  title="Clear family filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                All Product Families
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Info className="w-3 h-3 text-slate-400" aria-hidden="true" />
            <span>Independent rate card state preserved across pricing & deployment models</span>
          </div>
        </div>
      </div>

      {/* Editor Content based on Selected Pricing Model */}
      {selectedPricingModel === 'PEPM' ? (
        <div className="space-y-5">
          {/* Section 1: Pack Rates */}
          <PackRatesSection
            packRates={filteredPackRates}
            packs={packs}
            pricingTiers={pricingTiers}
            activeDeployment={selectedDeployment}
            activeCurrencySymbol={activeCountry?.symbol || activeCountry?.currency}
            onUpdateRate={onUpdatePackRate}
            onRemoveRate={onRemovePackRate}
            onOpenAddPackRate={onOpenAddPackRate}
          />

          {/* Section 2: À la carte Feature Rates */}
          <FeatureRatesSection
            featureRates={filteredFeatureRates}
            pricingTiers={pricingTiers}
            activeDeployment={selectedDeployment}
            activeCurrencySymbol={activeCountry?.symbol || activeCountry?.currency}
            onUpdateRate={onUpdateFeatureRate}
            onRemoveRate={onRemoveFeatureRate}
            onOpenAddFeatureRate={onOpenAddFeatureRate}
          />
        </div>
      ) : selectedPricingModel === 'Platform Subscription' ? (
        /* Section 3: Platform + Subscription (Excel reference) */
        <PlatformSubscriptionSection
          platformConfig={platformConfig}
          onChangeConfig={onChangePlatformConfig}
          onResetToSpreadsheetDemo={onResetPlatformDemo}
          activeCurrencySymbol={activeCountry?.symbol || activeCountry?.currency}
          activeCurrencyCode={activeCountry?.currency}
        />
      ) : (
        /* Section 4: Custom / New Pricing Model awaiting backend implementation */
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4 shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 mx-auto flex items-center justify-center">
            <CreditCard className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-bold text-slate-800">
              {activePricingModel.name} — Commercial Pricing Configuration
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Commercial calculations, discount matrices, and contract formulas for this pricing model are awaiting backend engine configuration.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Pending backend calculation</span>
          </div>
        </div>
      )}
    </div>
  )
}
