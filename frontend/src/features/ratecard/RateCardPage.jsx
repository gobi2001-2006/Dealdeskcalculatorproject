import { useState } from 'react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { SummaryStrip } from '../catalogue/SummaryStrip'
import { RateCardProductsSidebar } from './RateCardProductsSidebar'
import { RateCardCenterEditor } from './RateCardCenterEditor'
import { RateCardMasterPanels } from './RateCardMasterPanels'

// Modals
import { AddProductModal } from './modals/AddProductModal'
import { AddCountryModal } from './modals/AddCountryModal'
import { AddHourlyRateModal } from './modals/AddHourlyRateModal'
import { AddFxRateModal } from './modals/AddFxRateModal'
import { AddPackRateModal } from './modals/AddPackRateModal'
import { AddFeatureRateModal } from './modals/AddFeatureRateModal'

// Master & Initial Datasets
import {
  INITIAL_PRODUCT_FAMILIES,
  INITIAL_PRODUCTS,
} from '../../data/catalogueData'
import { INITIAL_PACKS } from '../../data/packsData'
import {
  INITIAL_COUNTRIES,
  INITIAL_PRICING_TIERS,
  DEPLOYMENT_MODELS,
  PRICING_MODELS,
  INITIAL_HOURLY_RATES,
  INITIAL_EXCHANGE_RATES,
  INITIAL_PACK_RATES,
  INITIAL_FEATURE_RATES,
  SPREADSHEET_DEMO_PLATFORM_CONFIG,
} from '../../data/rateCardData'

export function RateCardPage() {
  // 1. Shared Catalogue & Pack Data
  const [families] = useState(INITIAL_PRODUCT_FAMILIES)
  const [products, setProducts] = useState(INITIAL_PRODUCTS)
  const [packs] = useState(INITIAL_PACKS)

  // 2. Master Data Catalogs
  const [countries, setCountries] = useState(INITIAL_COUNTRIES)
  const [pricingTiers, setPricingTiers] = useState(INITIAL_PRICING_TIERS)
  const [deploymentModels, setDeploymentModels] = useState(DEPLOYMENT_MODELS)
  const [pricingModels, setPricingModels] = useState(PRICING_MODELS)
  const [hourlyRates, setHourlyRates] = useState(INITIAL_HOURLY_RATES)
  const [exchangeRates, setExchangeRates] = useState(INITIAL_EXCHANGE_RATES)

  // 3. Selection Contexts
  const [selectedFamilyId, setSelectedFamilyId] = useState('all')
  const [selectedDeployment, setSelectedDeployment] = useState('Shared Cloud')
  const [selectedPricingModel, setSelectedPricingModel] = useState('PEPM')
  const [selectedCountryId, setSelectedCountryId] = useState('c-in')

  // 4. Rate Cards State (Independent state for PEPM & Platform Subscription)
  const [packRates, setPackRates] = useState(INITIAL_PACK_RATES)
  const [featureRates, setFeatureRates] = useState(INITIAL_FEATURE_RATES)
  const [platformConfig, setPlatformConfig] = useState(SPREADSHEET_DEMO_PLATFORM_CONFIG)

  // 5. Modals State
  const [isAddProductOpen, setIsAddProductOpen] = useState(false)
  const [isAddCountryOpen, setIsAddCountryOpen] = useState(false)
  const [isAddHourlyOpen, setIsAddHourlyOpen] = useState(false)
  const [isAddFxOpen, setIsAddFxOpen] = useState(false)
  const [isAddPackRateOpen, setIsAddPackRateOpen] = useState(false)
  const [isAddFeatureRateOpen, setIsAddFeatureRateOpen] = useState(false)

  // 6. Toast notifications
  const [toastMessage, setToastMessage] = useState('')

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage('')
    }, 3500)
  }

  // --- Handlers: Left Sidebar (Products & Families) ---
  const handleSaveNewProduct = (newProduct) => {
    const productWithId = {
      ...newProduct,
      id: newProduct.id || `prod-${Date.now()}`,
    }
    setProducts((prev) => [productWithId, ...prev])
    showToast(`Product "${newProduct.solution}" added to catalogue.`)
  }

  // --- Handlers: Center Editor (Rates) ---
  const handleUpdatePackRate = (id, field, value) => {
    setPackRates((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    )
  }

  const handleRemovePackRate = (id) => {
    setPackRates((prev) => prev.filter((r) => r.id !== id))
    showToast('Pack rate removed.')
  }

  const handleSavePackRate = (newRate) => {
    const rateWithId = {
      ...newRate,
      id: newRate.id || `pr-${Date.now()}`,
    }
    setPackRates((prev) => [...prev, rateWithId])
    showToast(`Pack rate for "${newRate.packName}" configured.`)
  }

  const handleUpdateFeatureRate = (id, field, value) => {
    setFeatureRates((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    )
  }

  const handleRemoveFeatureRate = (id) => {
    setFeatureRates((prev) => prev.filter((r) => r.id !== id))
    showToast('Feature rate removed.')
  }

  const handleSaveFeatureRate = (newRate) => {
    const rateWithId = {
      ...newRate,
      id: newRate.id || `fr-${Date.now()}`,
    }
    setFeatureRates((prev) => [...prev, rateWithId])
    showToast(`Feature rate for "${newRate.featureName}" configured.`)
  }

  // Platform Subscription Handlers
  const handleChangePlatformConfig = (tierKey, fieldKey, value) => {
    setPlatformConfig((prev) => ({
      ...prev,
      [tierKey]: {
        ...prev[tierKey],
        [fieldKey]: value,
      },
    }))
  }

  const handleResetPlatformDemo = () => {
    setPlatformConfig(SPREADSHEET_DEMO_PLATFORM_CONFIG)
    showToast('Platform Subscription values reset to Excel demonstration preset.')
  }

  // --- Handlers: Right Master Data Panels ---
  const handleSaveCountry = (newCountry) => {
    const countryWithId = {
      ...newCountry,
      id: newCountry.id || `c-${Date.now()}`,
    }
    setCountries((prev) => [...prev, countryWithId])
    showToast(`Country "${newCountry.name}" registered.`)
  }

  const handleDeleteCountry = (id) => {
    setCountries((prev) => prev.filter((c) => c.id !== id))
    showToast('Country removed from master catalog.')
  }

  const handleUpdateCountry = (id, updatedFields) => {
    setCountries((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updatedFields } : c)),
    )
    showToast('Country details updated.')
  }

  const handleUpdateTier = (id, updatedFields) => {
    setPricingTiers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updatedFields } : t)),
    )
    showToast('Pricing tier details updated.')
  }

  const handleAddTier = (newTierData) => {
    let maxTierNum = 0
    pricingTiers.forEach((t) => {
      const match = t.code.match(/Tier\s*(\d+)/i)
      if (match) {
        const num = parseInt(match[1], 10)
        if (num > maxTierNum) maxTierNum = num
      }
    })
    const nextTierNum = maxTierNum > 0 ? maxTierNum + 1 : pricingTiers.length + 1

    const newTier = {
      id: `tier-${Date.now()}`,
      code: `Tier ${nextTierNum}`,
      name: newTierData.name,
      description: newTierData.description || '',
    }
    setPricingTiers((prev) => [...prev, newTier])
    showToast(`Pricing Tier "${newTier.code} — ${newTier.name}" added.`)
  }

  const handleDeleteTier = (tierId) => {
    const tier = pricingTiers.find((t) => t.id === tierId)
    if (!tier) return

    const fieldKey =
      tier.id === 'tier-1'
        ? 'tier1Rate'
        : tier.id === 'tier-2'
        ? 'tier2Rate'
        : tier.id === 'tier-3'
        ? 'tier3Rate'
        : `${tier.id}Rate`

    const hasPackRates = packRates.some(
      (r) =>
        r[fieldKey] !== undefined &&
        r[fieldKey] !== '' &&
        !isNaN(Number(r[fieldKey])) &&
        Number(r[fieldKey]) > 0,
    )
    const hasFeatureRates = featureRates.some(
      (r) =>
        r[fieldKey] !== undefined &&
        r[fieldKey] !== '' &&
        !isNaN(Number(r[fieldKey])) &&
        Number(r[fieldKey]) > 0,
    )

    if (hasPackRates || hasFeatureRates) {
      const confirmed =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(
              `Pricing tier "${tier.code} — ${tier.name}" has configured rate values in the rate card. Deleting it will permanently discard those rates. Do you want to proceed?`,
            )
          : true
      if (!confirmed) return
    } else {
      const confirmed =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(
              `Are you sure you want to delete pricing tier "${tier.code} — ${tier.name}"?`,
            )
          : true
      if (!confirmed) return
    }

    setPricingTiers((prev) => prev.filter((t) => t.id !== tierId))
    showToast(`Pricing tier "${tier.name}" removed.`)
  }

  const handleAddDeploymentModel = (newModelData) => {
    const newModel = {
      id: `dep-${Date.now()}`,
      code: newModelData.name,
      name: newModelData.name,
      description:
        newModelData.description || 'Custom deployment infrastructure architecture.',
    }
    setDeploymentModels((prev) => [...prev, newModel])
    showToast(`Deployment model "${newModel.name}" added.`)
  }

  const handleAddPricingModel = (newModelData) => {
    const code = newModelData.code || newModelData.name
    const newModel = {
      id: `pm-${Date.now()}`,
      code: code,
      name: newModelData.name,
      description:
        newModelData.description || 'Custom commercial pricing structure.',
      unitOfMeasure: 'Configurable',
    }
    setPricingModels((prev) => [...prev, newModel])
    showToast(`Pricing model "${newModel.name}" added.`)
  }

  const handleSaveHourlyRate = (newRate) => {
    const hourlyWithId = {
      ...newRate,
      id: newRate.id || `hr-${Date.now()}`,
    }
    setHourlyRates((prev) => [...prev, hourlyWithId])
    showToast(`Service rate for "${newRate.serviceLine}" added.`)
  }

  const handleDeleteHourlyRate = (id) => {
    setHourlyRates((prev) => prev.filter((hr) => hr.id !== id))
    showToast('Hourly rate removed.')
  }

  const handleUpdateHourlyRate = (id, updatedFields) => {
    setHourlyRates((prev) =>
      prev.map((hr) => (hr.id === id ? { ...hr, ...updatedFields } : hr)),
    )
    showToast('Hourly rate updated.')
  }

  const handleSaveFxRate = (newFx) => {
    const fxWithId = {
      ...newFx,
      id: newFx.id || `fx-${Date.now()}`,
    }
    setExchangeRates((prev) => [...prev, fxWithId])
    showToast(`Exchange rate ${newFx.sourceCurrency}/${newFx.targetCurrency} registered.`)
  }

  const handleDeleteFxRate = (id) => {
    setExchangeRates((prev) => prev.filter((fx) => fx.id !== id))
    showToast('Exchange rate removed.')
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800">
      {/* 1. Dark Navy Top Navigation */}
      <CatalogueTopNav activeSection="rate-cards" />

      {/* 2. White Commercial Master Summary Strip */}
      <SummaryStrip
        productLinesCount={families.length}
        totalProductsCount={products.length}
      />

      {/* 3. Main Workspace: Three Independently Scrollable Columns */}
      <div className="flex-1 flex overflow-hidden h-[calc(100vh-106px)]">
        {/* Left Column: Products & Families */}
        <RateCardProductsSidebar
          families={families}
          products={products}
          selectedFamilyId={selectedFamilyId}
          onSelectFamily={setSelectedFamilyId}
          onOpenAddProduct={() => setIsAddProductOpen(true)}
        />

        {/* Center Column: Deployment / Pricing Model / Rates Editor */}
        <RateCardCenterEditor
          selectedDeployment={selectedDeployment}
          onChangeDeployment={setSelectedDeployment}
          deploymentModels={deploymentModels}
          selectedPricingModel={selectedPricingModel}
          onChangePricingModel={setSelectedPricingModel}
          pricingModels={pricingModels}
          pricingTiers={pricingTiers}
          selectedCountryId={selectedCountryId}
          onChangeCountry={setSelectedCountryId}
          countries={countries}
          selectedFamilyId={selectedFamilyId}
          families={families}
          onClearFamilyFilter={() => setSelectedFamilyId('all')}
          // PEPM Rates
          packRates={packRates}
          packs={packs}
          onUpdatePackRate={handleUpdatePackRate}
          onRemovePackRate={handleRemovePackRate}
          onOpenAddPackRate={() => setIsAddPackRateOpen(true)}
          featureRates={featureRates}
          onUpdateFeatureRate={handleUpdateFeatureRate}
          onRemoveFeatureRate={handleRemoveFeatureRate}
          onOpenAddFeatureRate={() => setIsAddFeatureRateOpen(true)}
          // Platform + Subscription
          platformConfig={platformConfig}
          onChangePlatformConfig={handleChangePlatformConfig}
          onResetPlatformDemo={handleResetPlatformDemo}
        />

        {/* Right Column: Master Data Panels */}
        <RateCardMasterPanels
          countries={countries}
          onOpenAddCountry={() => setIsAddCountryOpen(true)}
          onDeleteCountry={handleDeleteCountry}
          onUpdateCountry={handleUpdateCountry}
          pricingTiers={pricingTiers}
          onUpdateTier={handleUpdateTier}
          onAddTier={handleAddTier}
          onDeleteTier={handleDeleteTier}
          deploymentModels={deploymentModels}
          onAddDeploymentModel={handleAddDeploymentModel}
          pricingModels={pricingModels}
          onAddPricingModel={handleAddPricingModel}
          hourlyRates={hourlyRates}
          onOpenAddHourlyRate={() => setIsAddHourlyOpen(true)}
          onDeleteHourlyRate={handleDeleteHourlyRate}
          onUpdateHourlyRate={handleUpdateHourlyRate}
          exchangeRates={exchangeRates}
          onOpenAddFxRate={() => setIsAddFxOpen(true)}
          onDeleteFxRate={handleDeleteFxRate}
          // Coverage inputs
          families={families}
          packRates={packRates}
          featureRates={featureRates}
        />
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium border border-slate-700 animate-fade-in flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      <AddProductModal
        isOpen={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
        onSave={handleSaveNewProduct}
        families={families}
        selectedFamilyId={selectedFamilyId}
      />

      <AddCountryModal
        isOpen={isAddCountryOpen}
        onClose={() => setIsAddCountryOpen(false)}
        onSave={handleSaveCountry}
        existingCountries={countries}
      />

      <AddHourlyRateModal
        isOpen={isAddHourlyOpen}
        onClose={() => setIsAddHourlyOpen(false)}
        onSave={handleSaveHourlyRate}
        countries={countries}
      />

      <AddFxRateModal
        isOpen={isAddFxOpen}
        onClose={() => setIsAddFxOpen(false)}
        onSave={handleSaveFxRate}
        currencies={countries.map((c) => c.currency)}
      />

      <AddPackRateModal
        isOpen={isAddPackRateOpen}
        onClose={() => setIsAddPackRateOpen(false)}
        onSave={handleSavePackRate}
        packs={packs}
        activeDeployment={selectedDeployment}
        activePricing={selectedPricingModel}
        existingPackRates={packRates}
      />

      <AddFeatureRateModal
        isOpen={isAddFeatureRateOpen}
        onClose={() => setIsAddFeatureRateOpen(false)}
        onSave={handleSaveFeatureRate}
        products={products}
        activeDeployment={selectedDeployment}
        activePricing={selectedPricingModel}
        existingFeatureRates={featureRates}
      />
    </div>
  )
}

export default RateCardPage
