import { useMemo, useEffect } from 'react'
import {
  Server,
  CreditCard,
  Globe,
  Filter,
  X,
  Info,
  ChevronDown,
  Clock,
  ShieldAlert,
  Database,
} from 'lucide-react'
import { PackRatesSection } from './PackRatesSection'
import { FeatureRatesSection } from './FeatureRatesSection'
import { PlatformSubscriptionSection } from './PlatformSubscriptionSection'
import { ServiceRatesSection } from './ServiceRatesSection'
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
  deploymentPricingOptions = [],
  pricingTiers = INITIAL_PRICING_TIERS,
  selectedCountryId,
  onChangeCountry,
  countries = [],
  selectedFamilyId = 'all',
  families = [],
  onClearFamilyFilter,
  // Versions
  versionsList = [],
  activeVersion = null,
  onSelectVersion,
  // Service Rates
  serviceRates = [],
  onUpdateServiceRate,
  onDeleteServiceRate,
  onOpenAddServiceRate,
  // PEPM Rates
  packRates = [],
  packs = [],
  features = [],
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
  isVersionLocked = false,
}) {
  const activeCountry =
    countries.find((c) => c.id === selectedCountryId) || countries[0]
  const activeFamily =
    selectedFamilyId !== 'all'
      ? families.find((f) => f.id === selectedFamilyId)
      : null

  const familiesToRender = useMemo(() => {
    if (selectedFamilyId && selectedFamilyId !== 'all') {
      const match = families.find((f) => String(f.id) === String(selectedFamilyId))
      return match ? [match] : families
    }
    return families.length > 0
      ? families
      : [{ id: 'all', name: 'Product Suite', code: 'STD' }]
  }, [families, selectedFamilyId])

  const activeDeploymentObj =
    deploymentModels.find(
      (d) =>
        d.name === selectedDeployment ||
        d.code === selectedDeployment ||
        String(d.id) === String(selectedDeployment),
    ) || deploymentModels[0]

  // Filter pricing models by active deployment using deployment_pricing_options
  const availablePricingModels = useMemo(() => {
    if (
      Array.isArray(deploymentPricingOptions) &&
      deploymentPricingOptions.length > 0 &&
      activeDeploymentObj?.id
    ) {
      const allowedIds = deploymentPricingOptions
        .filter((opt) => opt.deployment_model_id === activeDeploymentObj.id)
        .map((opt) => opt.pricing_model_id)
      return pricingModels.filter((pm) => allowedIds.includes(pm.id))
    }

    // Fallback when deploymentPricingOptions is empty / offline:
    const depNameLower = (activeDeploymentObj?.name || selectedDeployment || '').toLowerCase()
    if (depNameLower.includes('premise')) {
      return pricingModels.filter((pm) => {
        const pmLower = (pm.name + ' ' + pm.code).toLowerCase()
        return pmLower.includes('license') || pmLower.includes('amc')
      })
    }

    return pricingModels.filter((pm) => {
      const pmLower = (pm.name + ' ' + pm.code).toLowerCase()
      return !pmLower.includes('license') && !pmLower.includes('amc')
    })
  }, [pricingModels, deploymentPricingOptions, activeDeploymentObj, selectedDeployment])

  // Automatically synchronize selected pricing model if current selection is invalid for active deployment
  useEffect(() => {
    if (availablePricingModels.length > 0) {
      const isCurrentValid = availablePricingModels.some(
        (pm) =>
          String(pm.code).toLowerCase() === String(selectedPricingModel).toLowerCase() ||
          String(pm.name).toLowerCase() === String(selectedPricingModel).toLowerCase() ||
          String(pm.id) === String(selectedPricingModel),
      )
      if (!isCurrentValid) {
        onChangePricingModel(availablePricingModels[0].code)
      }
    }
  }, [availablePricingModels, selectedPricingModel, onChangePricingModel])

  const activePricingModel =
    pricingModels.find(
      (pm) =>
        String(pm.code).toLowerCase() === String(selectedPricingModel).toLowerCase() ||
        String(pm.name).toLowerCase() === String(selectedPricingModel).toLowerCase() ||
        String(pm.id) === String(selectedPricingModel),
    ) || {
      name: selectedPricingModel,
      code: selectedPricingModel,
    }

  const selLower = String(selectedPricingModel || '').toLowerCase()
  const activeCodeLower = String(activePricingModel?.code || '').toLowerCase()
  const activeNameLower = String(activePricingModel?.name || '').toLowerCase()

  const isLicensePEPM =
    (selLower.includes('license') && selLower.includes('pepm')) ||
    (activeCodeLower.includes('license') && activeCodeLower.includes('pepm')) ||
    (activeNameLower.includes('license') && activeNameLower.includes('pepm'))

  const isPEPM =
    selLower === 'pepm' ||
    activeCodeLower === 'pepm' ||
    activeNameLower === 'pepm' ||
    activeNameLower.includes('per employee') ||
    isLicensePEPM

  const isDualComponent =
    isLicensePEPM ||
    Boolean(activePricingModel?.has_fixed_component && activePricingModel?.has_unit_component)

  const isPlatformSubscription =
    selLower.includes('platform') ||
    activeCodeLower.includes('platform') ||
    activeNameLower.includes('platform')

  const isLicenseAMC =
    selLower.includes('license') ||
    selLower.includes('amc') ||
    activeCodeLower.includes('license') ||
    activeCodeLower.includes('amc') ||
    activeNameLower.includes('license') ||
    activeNameLower.includes('amc')

  const isOnPremiseWithoutConfig =
    (activeDeploymentObj?.code === 'on_premise' ||
      (activeDeploymentObj?.name || '').toLowerCase().includes('premise')) &&
    availablePricingModels.length === 0

  // Filter PEPM rates by active family and country if selected
  const filteredPackRates = packRates.filter((pr) => {
    const matchDeployment =
      pr.deploymentModel === selectedDeployment ||
      pr.deploymentModelId === activeDeploymentObj?.id ||
      String(pr.deploymentModel).toLowerCase() === String(selectedDeployment).toLowerCase()
    const matchPricing =
      pr.pricingModel === selectedPricingModel ||
      pr.pricingModelId === activePricingModel?.id ||
      (isPEPM &&
        (String(pr.pricingModel).toLowerCase() === 'pepm' ||
          String(pr.pricingModel).toLowerCase().includes('per employee')))
    const matchFamily =
      selectedFamilyId === 'all' || pr.familyId === selectedFamilyId
    const matchCountry =
      !pr.countryId || String(pr.countryId) === String(selectedCountryId)
    return matchDeployment && matchPricing && matchFamily && matchCountry
  })

  const filteredFeatureRates = featureRates.filter((fr) => {
    const matchDeployment =
      fr.deploymentModel === selectedDeployment ||
      fr.deploymentModelId === activeDeploymentObj?.id ||
      String(fr.deploymentModel).toLowerCase() === String(selectedDeployment).toLowerCase()
    const matchPricing =
      fr.pricingModel === selectedPricingModel ||
      fr.pricingModelId === activePricingModel?.id ||
      (isPEPM &&
        (String(fr.pricingModel).toLowerCase() === 'pepm' ||
          String(fr.pricingModel).toLowerCase().includes('per employee')))
    const matchFamily =
      selectedFamilyId === 'all' || fr.familyId === selectedFamilyId
    const matchCountry =
      !fr.countryId || String(fr.countryId) === String(selectedCountryId)
    return matchDeployment && matchPricing && matchFamily && matchCountry
  })

  return (
    <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 space-y-5">
      {/* Top Configuration Controls Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
        {/* Row 1: Deployment & Pricing Model & Country & Version Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                {availablePricingModels.length > 0 ? (
                  availablePricingModels.map((pm) => (
                    <option key={pm.id} value={pm.code}>
                      {pm.name}
                    </option>
                  ))
                ) : (
                  <option value="">No pricing methods configured</option>
                )}
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

          {/* 4. Rate Card Version Selector */}
          <div className="space-y-1">
            <label
              htmlFor="center-rate-card-version-select"
              className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Active Baseline</span>
            </label>
            <div className="relative">
              <select
                id="center-rate-card-version-select"
                aria-label="Active Baseline Version"
                value={activeVersion?.id || ''}
                onChange={(e) => onSelectVersion && onSelectVersion(Number(e.target.value))}
                className="w-full pl-3 pr-8 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 cursor-pointer appearance-none"
              >
                {versionsList.length > 0 ? (
                  versionsList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.version_no} ({v.status})
                    </option>
                  ))
                ) : (
                  <option value="">{activeVersion?.version_no || 'RC-DEV-1 (active)'}</option>
                )}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
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

      {/* Editor Content based on Selected Deployment and Pricing Model */}
      {isOnPremiseWithoutConfig ? (
        /* Section: On-Premise + License Fee + AMC configuration status */
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  On-Premise Deployment Architecture — License Fee + AMC
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  Configuration Required in Database
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pricing Method: License Fee + AMC (Combination 5)
              </p>
            </div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 space-y-2">
            <div className="font-semibold text-amber-950 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
              <span>Database Architecture Configuration Status:</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              According to pricing governance documents, On-Premise deployment couples strictly with the <strong>License Fee + AMC</strong> pricing model.
              Currently, no live pricing model record or deployment-pricing mapping is declared in the backend PostgreSQL database for On-Premise.
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              To activate this method, register a <em>License Fee + AMC</em> pricing model in Master Data and configure its deployment mapping in <code>deployment_pricing_options</code>.
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Required Commercial Parameters
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Input 1</span>
                <p className="font-semibold text-slate-800 mt-0.5">Base License Fee</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Perpetual or term capex license amount</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Input 2</span>
                <p className="font-semibold text-slate-800 mt-0.5">Annual Maintenance (AMC)</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Annual recurring software maintenance (% or fixed fee)</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Scope</span>
                <p className="font-semibold text-slate-800 mt-0.5">Client Hosted Datacenter</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Currency: {activeCountry?.name} ({activeCountry?.symbol || activeCountry?.currency})</p>
              </div>
            </div>
          </div>
        </div>
      ) : isPEPM ? (
        <div className="space-y-8">
          {/* PEPM Formula Banner */}
          <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3.5 text-xs text-sky-950 flex items-start gap-3">
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <div className="font-semibold text-sky-950">
                PEPM Pricing Formula & Commercial Contract Logic:
              </div>
              <div className="text-[11px] font-mono text-sky-900 bg-sky-100/70 px-2 py-1 rounded inline-block font-semibold">
                Rate = rate per Active Employee (with ESS) per month × headcount × term months = Full Contract Value.
              </div>
              <p className="text-[11px] text-sky-800 leading-relaxed">
                The rate grids below configure active monthly per-employee rates across defined tiers. Full proposal totals, discounting schedules, and multi-year contract values are calculated in <strong>Page 4 — Proposal Configurator</strong>.
              </p>
            </div>
          </div>

          {/* Section Accessibility Headers for PEPM */}
          <h2 className="sr-only">Pack Rates (PEPM)</h2>
          <h2 className="sr-only">À la Carte Feature Rates (PEPM)</h2>

          {familiesToRender.map((family) => {
            const famPacks = packs.filter(
              (p) =>
                family.id === 'all' ||
                String(p.familyId) === String(family.id) ||
                String(p.product_family_id) === String(family.id),
            )
            const famPackRates = filteredPackRates.filter(
              (pr) =>
                family.id === 'all' ||
                String(pr.familyId) === String(family.id) ||
                famPacks.some(
                  (p) =>
                    String(p.id) === String(pr.packId) ||
                    String(p.packId) === String(pr.packId),
                ),
            )
            const famFeatures = features.filter(
              (f) =>
                family.id === 'all' ||
                String(f.familyId) === String(family.id) ||
                String(f.product_family_id) === String(family.id),
            )
            const famFeatureRates = filteredFeatureRates.filter(
              (fr) =>
                family.id === 'all' ||
                String(fr.familyId) === String(family.id) ||
                famFeatures.some((f) => String(f.id) === String(fr.featureId)),
            )

            return (
              <div key={family.id} className="space-y-6 pt-2 first:pt-0">
                {/* Section A: Pack Rates */}
                <PackRatesSection
                  family={family}
                  packRates={famPackRates}
                  packs={famPacks}
                  pricingTiers={pricingTiers}
                  activeDeployment={selectedDeployment}
                  activeCurrencySymbol={activeCountry?.symbol || activeCountry?.currency}
                  isVersionLocked={isVersionLocked}
                  isDualComponent={isDualComponent}
                  onUpdateRate={onUpdatePackRate}
                  onRemoveRate={onRemovePackRate}
                  onOpenAddPackRate={() => onOpenAddPackRate(family.id)}
                />

                {/* Section B: À la carte Feature Rates */}
                <FeatureRatesSection
                  family={family}
                  featureRates={famFeatureRates}
                  features={famFeatures}
                  pricingTiers={pricingTiers}
                  activeDeployment={selectedDeployment}
                  activeCurrencySymbol={activeCountry?.symbol || activeCountry?.currency}
                  isVersionLocked={isVersionLocked}
                  isDualComponent={isDualComponent}
                  onUpdateRate={onUpdateFeatureRate}
                  onRemoveRate={onRemoveFeatureRate}
                  onOpenAddFeatureRate={() => onOpenAddFeatureRate(family.id)}
                />
              </div>
            )
          })}
        </div>
      ) : isPlatformSubscription ? (
        /* Section 3: Platform + Subscription (Excel reference) */
        <PlatformSubscriptionSection
          platformConfig={platformConfig}
          onChangeConfig={onChangePlatformConfig}
          onResetToSpreadsheetDemo={onResetPlatformDemo}
          activeCurrencySymbol={activeCountry?.symbol || activeCountry?.currency}
          activeCurrencyCode={activeCountry?.currency}
          isVersionLocked={isVersionLocked}
          activeDeployment={selectedDeployment}
          activeCountry={activeCountry}
          selectedFamilyName={activeFamily ? activeFamily.name : 'All Product Families'}
          pricingTiers={pricingTiers}
        />
      ) : isLicenseAMC ? (
        /* Section 4: License Fee + AMC Configuration UI */
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  {activePricingModel.name} Configuration
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Combination 5: On-Premise + License Fee + AMC
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Dual component: Perpetual / Term Capex License Fee + Recurring Annual Maintenance (AMC).
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-2">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-slate-600 shrink-0" aria-hidden="true" />
              <span>Commercial Structure & Calculation Rules</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              License fee applies as a fixed capex component, while AMC is computed as an annual maintenance percentage or fixed recurring fee. Full contractual calculations and payment schedules are evaluated in <strong>Page 4 — Proposal Configurator</strong>.
            </p>
          </div>
        </div>
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

      {/* Main Workspace Section: Professional Service & Implementation Rates */}
      <ServiceRatesSection
        serviceRates={serviceRates}
        activeCountry={activeCountry}
        activeCurrencySymbol={activeCountry?.symbol || activeCountry?.currency || '$'}
        isVersionLocked={isVersionLocked}
        onUpdateServiceRate={onUpdateServiceRate}
        onDeleteServiceRate={onDeleteServiceRate}
        onOpenAddServiceRate={onOpenAddServiceRate}
      />
    </div>
  )
}
