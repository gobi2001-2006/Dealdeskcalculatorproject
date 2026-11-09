import { useState, useMemo, useEffect } from 'react'
import {
  Server,
  CreditCard,
  Globe,
  Filter,
  X,
  Info,
  ChevronDown,
  ShieldAlert,
  Database,
  TableProperties,
  Layers,
  Wrench,
  Package,
  Plus,
} from 'lucide-react'
import { PackRatesSection } from './PackRatesSection'
import { FeatureRatesSection } from './FeatureRatesSection'
import { PlatformSubscriptionSection } from './PlatformSubscriptionSection'
import { ServiceRatesSection } from './ServiceRatesSection'
import { RateCardRegistryTable } from './RateCardRegistryTable'
import { getCurrencySymbol, rateLayoutFor, unitRateBasisLabel } from './rateCardFormatters'

export function RateCardCenterEditor({
  apiError = null,
  selectedDeployment,
  onChangeDeployment,
  deploymentModels = [],
  selectedPricingModel,
  onChangePricingModel,
  pricingModels = [],
  deploymentPricingOptions = [],
  pricingTiers = [],
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
  allowedUoms = [],
  onUpdatePackPlatformRate,
  onUpdateFeaturePlatformRate,
  isVersionLocked = false,
  // Full Registry Table Data & Handlers
  rawRateCards = [],
  onUpdateRegistryRate,
  onRefreshRegistry,
  className = '',
}) {
  const [activeTab, setActiveTab] = useState('rate-matrix') // 'rate-matrix' | 'registry-table' | 'service-rates'

  const activeCountry =
    countries.find(
      (c) =>
        String(c.id) === String(selectedCountryId) ||
        (c.code && String(c.code).toLowerCase() === String(selectedCountryId).toLowerCase()),
    ) || countries[0]
  const activeCurrencySymbol = useMemo(() => {
    return getCurrencySymbol(activeCountry, '$')
  }, [activeCountry])
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

  // Pricing models permitted for the active deployment come only from deployment_pricing_options.
  const availablePricingModels = useMemo(() => {
    if (!activeDeploymentObj?.id || !Array.isArray(deploymentPricingOptions)) return []
    const allowedIds = deploymentPricingOptions
      .filter((opt) => String(opt.deployment_model_id) === String(activeDeploymentObj.id))
      .map((opt) => String(opt.pricing_model_id))
    return pricingModels.filter((pm) => allowedIds.includes(String(pm.id)))
  }, [pricingModels, deploymentPricingOptions, activeDeploymentObj])

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
    availablePricingModels.find(
      (pm) =>
        String(pm.code).toLowerCase() === String(selectedPricingModel).toLowerCase() ||
        String(pm.name).toLowerCase() === String(selectedPricingModel).toLowerCase() ||
        String(pm.id) === String(selectedPricingModel),
    ) || null

  // Which grid to show is decided by the pricing model's components and billing bases (master data),
  // never by its name: one-time unit rate -> licence grid, fixed + unit -> platform grid, else unit-rate grid.
  const rateLayout = rateLayoutFor(activePricingModel)
  const noPricingModelForDeployment = availablePricingModels.length === 0
  const unitPeriod = unitRateBasisLabel(activePricingModel?.unitRateBasis)

  const matchesFamily = (rate, catalogueList, idOf) =>
    selectedFamilyId === 'all' ||
    rate.familyId === 'all' ||
    !rate.familyId ||
    String(rate.familyId) === String(selectedFamilyId) ||
    (Array.isArray(rate.familyIds) && rate.familyIds.some((fid) => String(fid) === String(selectedFamilyId))) ||
    catalogueList.some(
      (item) =>
        idOf(item, rate) &&
        (String(item.familyId) === String(selectedFamilyId) ||
          String(item.product_family_id) === String(selectedFamilyId) ||
          (Array.isArray(item.familyIds) && item.familyIds.some((fid) => String(fid) === String(selectedFamilyId)))),
    )

  const matchesContext = (rate) =>
    String(rate.deploymentModelId) === String(activeDeploymentObj?.id) &&
    String(rate.pricingModelId) === String(activePricingModel?.id) &&
    (!rate.countryId ||
      String(rate.countryId) === String(selectedCountryId) ||
      (activeCountry?.id && String(rate.countryId) === String(activeCountry.id)))

  const filteredPackRates = activePricingModel
    ? packRates.filter(
        (pr) =>
          matchesContext(pr) &&
          matchesFamily(pr, packs, (p, r) => String(p.id) === String(r.packId) || String(p.packId) === String(r.packId)),
      )
    : []

  const filteredFeatureRates = activePricingModel
    ? featureRates.filter(
        (fr) => matchesContext(fr) && matchesFamily(fr, features, (f, r) => String(f.id) === String(r.featureId)),
      )
    : []

  // Helper to determine if a pack/feature rate record has entered/available pricing data
  const hasConfiguredRate = (r) => {
    if (!r) return false
    const hasVal = (v) => v !== undefined && v !== null && String(v).trim() !== '' && !isNaN(Number(v))
    return Boolean(
      hasVal(r.tier1Rate) ||
        hasVal(r.tier2Rate) ||
        hasVal(r.tier3Rate) ||
        hasVal(r.tier_1) ||
        hasVal(r.tier_2) ||
        hasVal(r.tier_3) ||
        hasVal(r.fixed_tier1Rate) ||
        hasVal(r.fixed_tier2Rate) ||
        hasVal(r.fixed_tier3Rate) ||
        hasVal(r.fixed_tier_1) ||
        hasVal(r.fixed_tier_2) ||
        hasVal(r.fixed_tier_3) ||
        hasVal(r.unit_rate) ||
        hasVal(r.fixed_fee) ||
        (pricingTiers &&
          pricingTiers.some(
            (t) =>
              hasVal(r[t.id]) ||
              hasVal(r[`tier_${t.id}`]) ||
              hasVal(r[`tier${t.id}Rate`]) ||
              hasVal(r[`fixed_tier_${t.id}`]) ||
              hasVal(r[`fixed_${t.id}Rate`]),
          )),
    )
  }

  // Render pack and feature cards only when they contain available entered data
  const renderFamilySections = (dualComponentMode, layout = 'default') => {
    const renderedPackRateIds = new Set()
    const platformProps =
      layout === 'platform' || layout === 'license'
        ? {
            layout,
            allowedUoms,
            lockedUomId: activePricingModel?.uomLockedId || null,
            fixedFeeBasis: activePricingModel?.fixedFeeBasis || null,
            unitRateBasis: activePricingModel?.unitRateBasis || null,
          }
        : {}

    const rendered = familiesToRender
      .map((family) => {
        const famPacks = packs.filter(
          (p) =>
            family.id === 'all' ||
            String(p.familyId) === String(family.id) ||
            String(p.product_family_id) === String(family.id) ||
            (Array.isArray(p.familyIds) && p.familyIds.some((fid) => String(fid) === String(family.id))),
        )
        const famPackRates = filteredPackRates.filter(
          (pr) =>
            family.id === 'all' ||
            String(pr.familyId) === String(family.id) ||
            (Array.isArray(pr.familyIds) && pr.familyIds.some((fid) => String(fid) === String(family.id))) ||
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

        const hasPacks = famPackRates.some(hasConfiguredRate)
        const hasFeatures = famFeatureRates.some(hasConfiguredRate)

        if (hasPacks) {
          famPackRates.forEach((pr) => renderedPackRateIds.add(pr.id))
        }

        // When neither packs nor features have entered data for this family
        if (!hasPacks && !hasFeatures) {
          if (selectedFamilyId !== 'all') {
            return (
              <div
                key={family.id}
                className="bg-white border border-slate-200 rounded-xl p-6 text-center shadow-2xs space-y-3"
              >
                <div className="w-10 h-10 mx-auto rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{family.name}</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    No rate cards configured yet for {family.name} under {selectedDeployment}{activeCountry?.currency ? ` (${activeCountry.currency})` : ''}.
                  </p>
                </div>
                {!isVersionLocked && (
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenAddPackRate(family.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Pack Rate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenAddFeatureRate(family.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Feature Rate</span>
                    </button>
                  </div>
                )}
              </div>
            )
          }
          // In 'all' families view, exclude unentered families entirely
          return null
        }

        return (
          <div key={family.id} className="space-y-6 pt-2 first:pt-0">
            {hasPacks && (
              <PackRatesSection
                family={family}
                packRates={famPackRates}
                packs={famPacks}
                pricingTiers={pricingTiers}
                activeDeployment={selectedDeployment}
                activePricingModel={activePricingModel}
                activeCurrencySymbol={activeCurrencySymbol}
                isVersionLocked={isVersionLocked}
                isDualComponent={dualComponentMode}
                {...platformProps}
                onUpdatePlatformRate={onUpdatePackPlatformRate}
                onUpdateRate={onUpdatePackRate}
                onRemoveRate={onRemovePackRate}
                onOpenAddPackRate={() => onOpenAddPackRate(family.id)}
              />
            )}

            {hasFeatures && (
              <FeatureRatesSection
                family={family}
                featureRates={famFeatureRates}
                features={famFeatures}
                pricingTiers={pricingTiers}
                activeDeployment={selectedDeployment}
                activeCurrencySymbol={activeCurrencySymbol}
                isVersionLocked={isVersionLocked}
                isDualComponent={dualComponentMode}
                {...platformProps}
                onUpdatePlatformRate={onUpdateFeaturePlatformRate}
                apiError={apiError}
                onUpdateRate={onUpdateFeatureRate}
                onRemoveRate={onRemoveFeatureRate}
                onOpenAddFeatureRate={() => onOpenAddFeatureRate(family.id)}
              />
            )}
          </div>
        )
      })
      .filter(Boolean)

    // Render any remaining configured pack rates that were not grouped into rendered families
    const unrenderedPackRates = filteredPackRates.filter(
      (pr) => !renderedPackRateIds.has(pr.id) && hasConfiguredRate(pr),
    )

    const unrenderedSection =
      unrenderedPackRates.length > 0 ? (
        <div key="unassigned-packs" className="space-y-6 pt-2 first:pt-0">
          <PackRatesSection
            family={{ id: 'all', name: 'Multi-Product / Cross-Family Packs' }}
            packRates={unrenderedPackRates}
            packs={packs}
            pricingTiers={pricingTiers}
            activeDeployment={selectedDeployment}
            activePricingModel={activePricingModel}
            activeCurrencySymbol={activeCurrencySymbol}
            isVersionLocked={isVersionLocked}
            isDualComponent={dualComponentMode}
            {...platformProps}
            onUpdatePlatformRate={onUpdatePackPlatformRate}
            onUpdateRate={onUpdatePackRate}
            onRemoveRate={onRemovePackRate}
            onOpenAddPackRate={() => onOpenAddPackRate(null)}
          />
        </div>
      ) : null

    const allSections = [...rendered, unrenderedSection].filter(Boolean)

    if (allSections.length === 0) {
      return (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              No Available Rate Cards
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              No pack or feature rates with available pricing data were found for {selectedDeployment}{activeCountry?.currency ? ` (${activeCountry.currency})` : ''}.
            </p>
          </div>
          {!isVersionLocked && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onOpenAddPackRate(selectedFamilyId !== 'all' ? selectedFamilyId : null)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Pack Rate</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenAddFeatureRate(selectedFamilyId !== 'all' ? selectedFamilyId : null)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Feature Rate</span>
              </button>
            </div>
          )}
        </div>
      )
    }

    return rendered
  }

  return (
    <div className={`flex-1 min-w-0 h-full overflow-y-auto p-4 sm:p-6 bg-slate-100/60 ${className}`}>
      <div className="w-full max-w-7xl mx-auto space-y-5">
        {/* Top Configuration Controls Card */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs space-y-4">
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
                title={`Active Currency Symbol: ${activeCurrencySymbol}`}
              >
                {activeCurrencySymbol}
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

          <div className="flex items-center gap-2">
            {!isVersionLocked && (
              <>
                <button
                  type="button"
                  onClick={() => onOpenAddPackRate(selectedFamilyId !== 'all' ? selectedFamilyId : null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Pack</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAddFeatureRate(selectedFamilyId !== 'all' ? selectedFamilyId : null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Feature</span>
                </button>
              </>
            )}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 pl-2 border-l border-slate-200">
              <Info className="w-3 h-3 text-slate-400" aria-hidden="true" />
              <span>Independent rate card state</span>
            </div>
          </div>
        </div>

        {/* Row 3: Tabbed Navigation for Rate Card Center Views */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('rate-matrix')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'rate-matrix'
                  ? 'bg-white text-orange-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Rate Cards Matrix</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('registry-table')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'registry-table'
                  ? 'bg-white text-orange-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span>Full Registry Table</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-orange-100 text-orange-800 font-mono">
                6 Dimensions
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('service-rates')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'service-rates'
                  ? 'bg-white text-orange-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Service Rates</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-mono">
                {serviceRates.length}
              </span>
            </button>
          </div>

          <div className="text-[11px] font-medium text-slate-500 whitespace-nowrap hidden sm:block">
            View: <span className="font-semibold text-slate-700">{activeTab === 'rate-matrix' ? 'Commercial Matrix' : activeTab === 'registry-table' ? 'Complete 6-Dim Registry' : 'Professional Implementation Services'}</span>
          </div>
        </div>
      </div>

      {/* Conditional Rendering based on activeTab */}
      {activeTab === 'registry-table' ? (
        <RateCardRegistryTable
          rawRateCards={rawRateCards}
          activeVersion={activeVersion}
          countries={countries}
          deploymentModels={deploymentModels}
          pricingModels={pricingModels}
          pricingTiers={pricingTiers}
          packs={packs}
          features={features}
          isVersionLocked={isVersionLocked}
          onUpdateRate={onUpdateRegistryRate}
          onRefresh={onRefreshRegistry}
        />
      ) : activeTab === 'service-rates' ? (
        <ServiceRatesSection
          serviceRates={serviceRates}
          activeCountry={activeCountry}
          activeCurrencySymbol={activeCurrencySymbol}
          isVersionLocked={isVersionLocked}
          onUpdateServiceRate={onUpdateServiceRate}
          onDeleteServiceRate={onDeleteServiceRate}
          onOpenAddServiceRate={onOpenAddServiceRate}
        />
      ) : (
        <>
          {/* Editor Content based on Selected Deployment and Pricing Model */}

      {noPricingModelForDeployment ? (
        /* No deployment/pricing combination configured for this deployment in master data */
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                No pricing model is configured for {activeDeploymentObj?.name || selectedDeployment}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Add the deployment and pricing model combination in master data (deployment_pricing_options) to configure its rate card.
              </p>
            </div>
          </div>
        </div>
      ) : rateLayout === 'platform' ? (
        /* Fixed fee per tier + unit (subscription) rate */
        <div className="space-y-8">
          <PlatformSubscriptionSection
            activeCurrencySymbol={activeCurrencySymbol}
            activeCurrencyCode={activeCountry?.currency}
            isVersionLocked={isVersionLocked}
            activeDeployment={selectedDeployment}
            activeCountry={activeCountry}
            selectedFamilyName={activeFamily ? activeFamily.name : 'All Product Families'}
            pricingModelName={activePricingModel?.name}
            fixedFeeBasis={activePricingModel?.fixedFeeBasis}
            unitRateBasis={activePricingModel?.unitRateBasis}
            tierCount={pricingTiers.length}
          />

          <h2 className="sr-only">Pack Rates ({activePricingModel?.name})</h2>
          {renderFamilySections(true, 'platform')}
        </div>
      ) : rateLayout === 'license' ? (
        /* One-time unit rate (licence fee per user) + AMC % */
        <div className="space-y-8">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <Server className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{activePricingModel?.name} Configuration</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  A one-time licence fee per user and an annual maintenance (AMC) percentage, for each customer tier.
                </p>
              </div>
            </div>
            <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3.5 text-[11px] text-sky-900 flex items-start gap-2">
              <Info className="w-4 h-4 text-sky-600 shrink-0" aria-hidden="true" />
              <span className="font-mono font-semibold">
                Total = Licence fee per user × Users + (Licence total × AMC %) × Contract years
              </span>
            </div>
          </div>

          <h2 className="sr-only">Pack Rates ({activePricingModel?.name})</h2>
          {renderFamilySections(true, 'license')}
        </div>
      ) : (
        /* Unit rate only (e.g. PEPM) */
        <div className="space-y-8">
          {filteredPackRates.length === 0 && filteredFeatureRates.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3 shadow-2xs">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <div className="font-bold text-amber-950">
                  Rate Card Not Configured:
                </div>
                <p className="text-xs text-amber-900">
                  No saved rate card exists for {activeDeploymentObj?.name || selectedDeployment} + {activePricingModel?.name || selectedPricingModel} in {activeCountry?.name || 'Selected Country'}. Configure the rate card before calculating the proposal.
                </p>
              </div>
            </div>
          )}

          <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3.5 text-xs text-sky-950 flex items-start gap-3">
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <div className="font-semibold text-sky-950">
                {activePricingModel?.name} Pricing Formula:
              </div>
              <div className="text-[11px] font-mono text-sky-900 bg-sky-100/70 px-2 py-1 rounded inline-block font-semibold">
                Total = Rate per {activePricingModel?.unitOfMeasure || 'unit'}{unitPeriod ? ` per ${unitPeriod}` : ''} × Quantity × {unitPeriod === 'year' ? 'Contract years' : 'Contract months'}
              </div>
              <p className="text-[11px] text-sky-800 leading-relaxed">
                The grids below hold one rate per customer tier. Proposal totals are calculated in <strong>Proposal step 1 — Configure</strong>.
              </p>
            </div>
          </div>

          <h2 className="sr-only">Pack Rates ({activePricingModel?.name})</h2>
          <h2 className="sr-only">À la Carte Feature Rates ({activePricingModel?.name})</h2>

          {renderFamilySections(false)}
        </div>
      )}

      {/* Main Workspace Section: Professional Service & Implementation Rates */}
      <ServiceRatesSection
        serviceRates={serviceRates}
        activeCountry={activeCountry}
        activeCurrencySymbol={activeCurrencySymbol}
        isVersionLocked={isVersionLocked}
        onUpdateServiceRate={onUpdateServiceRate}
        onDeleteServiceRate={onDeleteServiceRate}
        onOpenAddServiceRate={onOpenAddServiceRate}
      />
        </>
      )}
      </div>
    </div>
  )
}

