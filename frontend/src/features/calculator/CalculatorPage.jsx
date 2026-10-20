import { useState, useMemo } from 'react'
import {
  Plus,
  Save,
  Calculator,
  Globe,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { SummaryStrip } from '../catalogue/SummaryStrip'
import { ClientConfigCard } from './components/ClientConfigCard'
import { CountryConfigCard } from './components/CountryConfigCard'
import { AddCountryModal } from './components/AddCountryModal'
import { ProposalSaveModal } from './components/ProposalSaveModal'
import { CalculationModal } from './components/CalculationModal'
import {
  validateClientName,
  serializeProposalToBackendSchema,
} from './calculatorData'
import {
  requestProposalCalculation,
  saveProposalDraft,
} from '../../api/proposalsApi'
import { useProposal } from '../../context/ProposalContext'

export function CalculatorPage() {
  const {
    clientInfo,
    setClientInfo,
    clientErrors,
    setClientErrors,
    countryConfigs,
    setCountryConfigs,
  } = useProposal()

  // Modals & Dialogs State
  const [isAddCountryOpen, setIsAddCountryOpen] = useState(false)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isCalcModalOpen, setIsCalcModalOpen] = useState(false)

  // API Integration States (Phase F & Save)
  const [isCalculating, setIsCalculating] = useState(false)
  const [calcApiResult, setCalcApiResult] = useState(null)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success') // 'success' | 'warning' | 'error'

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg)
    setToastType(type)
    setTimeout(() => {
      setToastMessage('')
    }, 4500)
  }

  // Handle Client Info Changes
  const handleChangeClientInfo = (field, value) => {
    setClientInfo((prev) => ({
      ...prev,
      [field]: value,
    }))
    if (field === 'clientName') {
      const err = validateClientName(value)
      setClientErrors((prev) => ({ ...prev, clientName: err }))
    }
  }

  // Handle Add Country Configuration
  const handleAddCountry = (newCountryConfig) => {
    setCountryConfigs((prev) => [...prev, newCountryConfig])
    showToast(`Added country configuration for ${newCountryConfig.countryName}.`)
  }

  // Handle Update Country Configuration
  const handleUpdateCountry = (updatedCountry) => {
    setCountryConfigs((prev) =>
      prev.map((c) => (c.id === updatedCountry.id ? updatedCountry : c))
    )
  }

  // Handle Remove Country Configuration
  const handleRemoveCountry = (countryId) => {
    const target = countryConfigs.find((c) => c.id === countryId)
    setCountryConfigs((prev) => prev.filter((c) => c.id !== countryId))
    if (target) {
      showToast(`Removed ${target.countryName} configuration.`, 'warning')
    }
  }

  // Calculate high-level summary counts for Summary Strip
  const summaryCounts = useMemo(() => {
    let totalFamilies = 0
    let totalPacks = 0
    let totalFeatures = 0

    countryConfigs.forEach((c) => {
      totalFamilies += c.families.length
      c.families.forEach((f) => {
        if (f.selectedPackId) totalPacks += 1
        totalFeatures += f.selectedFeatureIds?.length || 0
      })
    })

    return {
      countriesCount: countryConfigs.length,
      totalFamilies,
      totalPacks,
      totalFeatures,
    }
  }, [countryConfigs])

  // Serialized schema payload for modals and backend API
  const serializedPayload = useMemo(() => {
    return serializeProposalToBackendSchema(clientInfo, countryConfigs)
  }, [clientInfo, countryConfigs])

  // Handle Save Proposal Draft (Phase G)
  const handleTriggerSave = () => {
    const clientErr = validateClientName(clientInfo.clientName)
    if (clientErr) {
      setClientErrors({ clientName: clientErr })
      showToast('Please fix client name errors before saving.', 'error')
      return
    }
    setIsSaveModalOpen(true)
  }

  const handleConfirmLocalSave = async () => {
    const res = await saveProposalDraft(serializedPayload)
    if (res.isPersisted) {
      showToast('Proposal successfully saved to PostgreSQL database.', 'success')
    } else {
      showToast(
        'Proposal draft saved locally in frontend state (not persisted to PostgreSQL).',
        'warning'
      )
    }
  }

  // Handle Calculate Commercials (Phase F)
  const handleTriggerCalculation = async () => {
    const clientErr = validateClientName(clientInfo.clientName)
    if (clientErr) {
      setClientErrors({ clientName: clientErr })
      showToast('Please specify a client name before calculation.', 'error')
      return
    }

    setIsCalculating(true)
    setIsCalcModalOpen(true)
    const res = await requestProposalCalculation(serializedPayload)
    setCalcApiResult(res)
    setIsCalculating(false)
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation: Dark navy top header with Proposal Configurator highlighted */}
      <CatalogueTopNav activeSection="calculator" />

      {/* 2. Existing White Commercial Summary Strip */}
      <SummaryStrip
        clientName={clientInfo.clientName || 'Untitled Proposal'}
        countriesValue={`${summaryCounts.countriesCount} Configured`}
        productLinesValue={`${summaryCounts.totalFamilies} Families (${summaryCounts.totalPacks} Packs, ${summaryCounts.totalFeatures} Features)`}
        pricingFcv="Pending backend calculation"
        servicesValue="Pending backend calculation"
        grandTotal="Pending backend calculation"
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 sm:px-6 py-2 text-xs font-medium flex items-center justify-between border-b transition-all animate-in slide-in-from-top-2 ${
            toastType === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : toastType === 'warning'
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            {toastType === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            ) : toastType === 'warning' ? (
              <Clock className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
            )}
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* 3. Main Workspace: Warm-Grey Background with White Cards */}
      <div className="flex-1 overflow-y-auto bg-[#F8FAFC]">
        <main
          className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6"
          aria-label="Proposal Configurator Workspace"
        >
          {/* Workspace Title & Actions Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Proposal Configurator
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
                  <span>Interactive Engine</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Configure multi-country enterprise commercial terms, packaging suites, à la carte features, and professional services.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => setIsAddCountryOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-200"
              >
                <Plus className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
                <span>Add Country</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerSave}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-200"
              >
                <Save className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                <span>Save Proposal</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerCalculation}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <Calculator className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Calculate Pricing</span>
              </button>
            </div>
          </div>

          {/* Phase A: Client Details & Reporting Currency Card */}
          <ClientConfigCard
            clientInfo={clientInfo}
            onChangeClientInfo={handleChangeClientInfo}
            errors={clientErrors}
          />

          {/* Phase B: Country Configurations Section */}
          <section
            aria-label="Country Configurations"
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Globe className="w-4 h-4 text-orange-600" aria-hidden="true" />
                  <span>Regional Country Configurations ({countryConfigs.length})</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Each country retains independent pricing tiers, deployment models, contract terms, and currency contexts.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddCountryOpen(true)}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Another Country</span>
              </button>
            </div>

            {countryConfigs.length === 0 ? (
              <div className="p-8 rounded-xl bg-white border border-dashed border-slate-300 text-center space-y-3">
                <Globe className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    No Countries Configured
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    Add at least one regional deployment country to configure software packaging, à la carte features, and service lines.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddCountryOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>Add First Country</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {countryConfigs.map((countryConfig) => (
                  <CountryConfigCard
                    key={countryConfig.id}
                    countryConfig={countryConfig}
                    canRemove={countryConfigs.length > 1}
                    onUpdateCountry={handleUpdateCountry}
                    onRemoveCountry={() => handleRemoveCountry(countryConfig.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Modals & Dialogs */}
      <AddCountryModal
        isOpen={isAddCountryOpen}
        existingCountryIds={countryConfigs.map((c) => c.countryId)}
        onClose={() => setIsAddCountryOpen(false)}
        onAddCountry={handleAddCountry}
      />

      <ProposalSaveModal
        isOpen={isSaveModalOpen}
        serializedData={serializedPayload}
        onClose={() => setIsSaveModalOpen(false)}
        onConfirmSave={handleConfirmLocalSave}
      />

      <CalculationModal
        isOpen={isCalcModalOpen}
        clientInfo={clientInfo}
        countryConfigs={countryConfigs}
        apiResult={calcApiResult}
        isLoading={isCalculating}
        onClose={() => setIsCalcModalOpen(false)}
        onRetryCalculation={handleTriggerCalculation}
      />
    </div>
  )
}

export default CalculatorPage
