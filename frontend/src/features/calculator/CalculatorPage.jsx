import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus,
  Save,
  Calculator,
  Globe,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
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
  deserializeBackendProposal,
} from './calculatorData'
import {
  requestProposalCalculation,
  saveFullProposal,
  getProposal,
  getLatestCalculation,
  getCustomers,
  describeApiError,
  discountsFromSnapshot,
} from '../../api/proposalsApi'
import {
  getCountries,
  getCurrencies,
  getCustomerTiers,
  getDeploymentModels,
  getDeploymentPricingOptions,
  getPricingModels,
  getServiceRates,
} from '../../api/ratesApi'
import {
  getCatalogueFamilies,
  getCatalogueProducts,
  getCatalogueFeatures,
} from '../../api/catalogueApi'
import { getPacks } from '../../api/packsApi'
import { useProposal } from '../../context/ProposalContext'
import { CalculationNotices } from '../../components/common/CalculationNotices'
import { formatMoney, readCalculationTotals } from '../../utils/calculationView'

const MASTER_SOURCES = [
  ['countries', getCountries, 'countries'],
  ['currencies', getCurrencies, 'currencies'],
  ['tiers', getCustomerTiers, 'customer tiers'],
  ['deployments', getDeploymentModels, 'deployment models'],
  ['deploymentPricingOptions', getDeploymentPricingOptions, 'deployment/pricing combinations'],
  ['pricingModels', getPricingModels, 'pricing models'],
  ['families', getCatalogueFamilies, 'product families'],
  ['packs', getPacks, 'packs'],
  ['products', getCatalogueProducts, 'products'],
  ['features', getCatalogueFeatures, 'features'],
  ['serviceRates', getServiceRates, 'service rates'],
  ['customers', getCustomers, 'customers'],
]

export function CalculatorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlProposalId = searchParams.get('proposalId')

  const {
    clientInfo,
    setClientInfo,
    clientErrors,
    setClientErrors,
    countryConfigs,
    setCountryConfigs,
  } = useProposal()

  // Live Master Data Cache
  const [masters, setMasters] = useState({
    countries: [],
    currencies: [],
    tiers: [],
    deployments: [],
    deploymentPricingOptions: [],
    pricingModels: [],
    families: [],
    packs: [],
    products: [],
    features: [],
    serviceRates: [],
    customers: [],
    isLoading: true,
    loadErrors: [],
  })

  // Modals & Dialogs State
  const [isAddCountryOpen, setIsAddCountryOpen] = useState(false)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isCalcModalOpen, setIsCalcModalOpen] = useState(false)

  // API Integration States
  const [isSaving, setIsSaving] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const { calcApiResult, setCalcApiResult } = useProposal()
  const [calculatedInputsSignature, setCalculatedInputsSignature] = useState(null)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success') // 'success' | 'warning' | 'error'

  // Input signature to detect when parameters change after calculation
  const currentInputsSignature = useMemo(() => {
    return JSON.stringify({
      currencyId: clientInfo.reportingCurrencyId,
      countries: (countryConfigs || []).map((c) => ({
        id: c.countryId,
        tier: c.pricingTierId,
        dep: c.deploymentModelId,
        pm: c.pricingModelId,
        term: c.contractTerm,
        headcount: c.headcount,
        families: (c.families || []).map((f) => ({
          famId: f.familyId,
          packId: f.selectedPackId,
          featIds: f.selectedFeatureIds,
          fHeadcounts: f.featureHeadcounts,
        })),
        services: (c.serviceLines || []).map((s) => ({
          role: s.roleName,
          rateId: s.serviceRateId,
          days: s.hoursOrDays,
        })),
      })),
    })
  }, [clientInfo.reportingCurrencyId, countryConfigs])

  // After a load or a calculation, remember what the screen looked like so later edits show as outdated.
  const [captureSignature, setCaptureSignature] = useState(false)
  useEffect(() => {
    if (captureSignature) {
      setCalculatedInputsSignature(currentInputsSignature) // eslint-disable-line react-hooks/set-state-in-effect
      setCaptureSignature(false)
    }
  }, [captureSignature, currentInputsSignature])

  // Replace screen state with what the database now holds (new ids for countries/service lines).
  // The contract term is kept from the screen: the backend stores it only on calculation snapshots.
  const applySavedProposal = (savedDetail, ids) => {
    if (!savedDetail) return
    const reloaded = deserializeBackendProposal(savedDetail, { masters })
    setClientInfo((prev) => ({
      ...prev,
      proposalId: ids.proposalId,
      customerId: ids.customerId,
      dealId: ids.dealId,
      proposalCode: savedDetail.code || prev.proposalCode,
    }))
    setCountryConfigs((prev) =>
      reloaded.countryConfigs.map((c, i) => ({ ...c, contractTerm: prev[i]?.contractTerm ?? c.contractTerm })),
    )
  }

  const isCalculationStale = Boolean(
    calcApiResult?.status === 'success' &&
    calculatedInputsSignature &&
    currentInputsSignature !== calculatedInputsSignature
  )

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg)
    setToastType(type)
    setTimeout(() => {
      setToastMessage('')
    }, 5000)
  }

  // Load live reference masters on mount. A failed list is reported, never replaced by demo data.
  useEffect(() => {
    let isMounted = true

    async function loadMasterData() {
      const results = await Promise.allSettled(MASTER_SOURCES.map(([, fetcher]) => fetcher()))
      if (!isMounted) return
      const next = { isLoading: false, loadErrors: [] }
      results.forEach((res, idx) => {
        const [key, , label] = MASTER_SOURCES[idx]
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          next[key] = res.value
        } else {
          next[key] = []
          next.loadErrors.push(`${label}: ${describeApiError(res.reason, 'could not be loaded')}`)
        }
      })
      setMasters(next)
    }

    loadMasterData()

    return () => {
      isMounted = false
    }
  }, [])

  // Reload a saved proposal (and its latest snapshot) from the backend.
  const handleReloadProposal = useCallback(
    async (targetId) => {
      const idToLoad = targetId || urlProposalId || clientInfo.proposalId
      if (!idToLoad) return

      try {
        const backendProposal = await getProposal(idToLoad)
        let latestCalc = null
        try {
          latestCalc = await getLatestCalculation(idToLoad)
        } catch (err) {
          if (err.response?.status !== 404) throw err // 404 = never calculated
        }
        const { clientInfo: loadedClient, countryConfigs: loadedConfigs } = deserializeBackendProposal(
          backendProposal,
          { masters, latestCalc },
        )
        setClientInfo((prev) => ({ ...prev, ...loadedClient }))
        setCountryConfigs(loadedConfigs)
        setCalcApiResult(
          latestCalc ? { status: 'success', proposalId: idToLoad, data: latestCalc, isBackendCalculation: true } : null,
        )
        setCalculatedInputsSignature(null)
        if (latestCalc) setCaptureSignature(true)
        showToast(`Loaded saved proposal #${idToLoad}.`, 'success')
      } catch (err) {
        showToast(`Failed to load proposal #${idToLoad}: ${describeApiError(err)}`, 'error')
      }
    },
    [urlProposalId, clientInfo.proposalId, masters, setClientInfo, setCountryConfigs, setCalcApiResult]
  )

  // Load the proposal named in the URL once the masters (needed to map families/currencies) are in.
  useEffect(() => {
    if (masters.isLoading) return
    if (urlProposalId && String(clientInfo.proposalId) !== String(urlProposalId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleReloadProposal(urlProposalId)
    }
  }, [urlProposalId, handleReloadProposal, clientInfo.proposalId, masters.isLoading])

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
      totalFamilies += (c.families || []).length
      ;(c.families || []).forEach((f) => {
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

  // Serialized schema payload for modals and backend API preview
  const serializedPayload = useMemo(() => {
    return serializeProposalToBackendSchema(clientInfo, countryConfigs)
  }, [clientInfo, countryConfigs])

  // Handle Save Proposal Draft to PostgreSQL (Phase 4)
  const handleTriggerSave = () => {
    const clientErr = validateClientName(clientInfo.clientName)
    if (clientErr) {
      setClientErrors({ clientName: clientErr })
      showToast('Please fix client name errors before saving.', 'error')
      return
    }
    setIsSaveModalOpen(true)
  }

  const handleConfirmBackendSave = async () => {
    setIsSaving(true)
    try {
      const res = await saveFullProposal({
        clientInfo,
        countryConfigs,
        existingProposalId: clientInfo.proposalId,
      })
      applySavedProposal(res.data, res)
      setSearchParams({ proposalId: String(res.proposalId) })
      showToast(`Proposal #${res.proposalId} saved.`, 'success')
      setIsSaveModalOpen(false)
    } catch (err) {
      showToast(`Save failed: ${describeApiError(err, 'Failed to save proposal')}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Calculate: the proposal is saved (synchronised) first, so the backend prices what is on screen.
  // Product-level overall/services discounts are applied on Pricing & Discounts; saved line
  // discounts are always included.
  const handleTriggerCalculation = async () => {
    const clientErr = validateClientName(clientInfo.clientName)
    if (clientErr) {
      setClientErrors({ clientName: clientErr })
      showToast('Please specify a client name before calculation.', 'error')
      return
    }

    if (countryConfigs.length === 0) {
      showToast('Please configure at least one country scope before calculation.', 'error')
      return
    }

    setIsCalculating(true)
    setIsCalcModalOpen(true)

    try {
      // Keep the product-level discounts applied on Pricing & Discounts (recorded on the last snapshot).
      const res = await requestProposalCalculation({
        proposalId: clientInfo.proposalId,
        clientInfo,
        countryConfigs,
        discounts: calcApiResult?.status === 'success' ? discountsFromSnapshot(calcApiResult.data) : {},
      })

      setCalcApiResult(res)

      if (res.status === 'success') {
        applySavedProposal(res.savedProposal, res)
        setCaptureSignature(true)
        if (String(res.proposalId) !== String(urlProposalId)) {
          setSearchParams({ proposalId: String(res.proposalId) })
        }
        if (res.discountsDropped) {
          showToast('Proposal priced, but the products changed, so overall/services discounts were not applied. Re-apply them on Pricing & Discounts.', 'warning')
        } else {
          showToast('Proposal saved and priced by the backend engine.', 'success')
        }
      } else {
        showToast(`Calculation failed: ${res.message}`, 'error')
      }
    } finally {
      setIsCalculating(false)
    }
  }

  // Summary strip values come straight from the backend result (no browser-side conversion).
  const calcTotals = calcApiResult?.status === 'success' ? readCalculationTotals(calcApiResult.data) : null
  const summaryStripValues = useMemo(() => {
    if (!calcTotals) {
      return {
        fcv: 'Pending backend calculation',
        services: 'Pending backend calculation',
        grandTotal: 'Pending backend calculation',
      }
    }
    const staleSuffix = isCalculationStale || calcTotals.isStale ? ' (Outdated)' : ''
    return {
      fcv: `${formatMoney(calcTotals.subscriptionContract, calcTotals.currency)}${staleSuffix}`,
      services: `${formatMoney(calcTotals.services, calcTotals.currency)}${staleSuffix}`,
      grandTotal: `${formatMoney(calcTotals.contractTotal, calcTotals.currency)}${staleSuffix}`,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcApiResult, isCalculationStale])

  return (
    <div className="h-screen h-[100dvh] max-h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation */}
      <div className="shrink-0">
        <CatalogueTopNav
          activeSection="calculator"
          isConnected={masters.isLoading ? null : masters.loadErrors.length === 0}
          isDemo={false}
        />
      </div>

      {/* 2. Existing White Commercial Summary Strip */}
      <div className="shrink-0">
        <SummaryStrip
          clientName={clientInfo.clientName || 'Untitled Proposal'}
          countriesValue={`${summaryCounts.countriesCount} Configured`}
          productLinesValue={`${summaryCounts.totalFamilies} Families (${summaryCounts.totalPacks} Packs, ${summaryCounts.totalFeatures} Features)`}
          pricingFcv={summaryStripValues.fcv}
          servicesValue={summaryStripValues.services}
          grandTotal={summaryStripValues.grandTotal}
        />
      </div>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 sm:px-6 py-2 text-xs font-medium flex items-center justify-between border-b transition-all animate-in slide-in-from-top-2 shrink-0 ${
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

      {/* 3. Main Workspace */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-slate-100">
        <main
          className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-8"
          aria-label="Proposal Configurator Workspace"
        >
          {/* Workspace Title & Actions Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Proposal Configurator
                </h1>
                {isCalculating ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" aria-hidden="true"></span>
                    <span>FastAPI Calculating...</span>
                  </span>
                ) : isCalculationStale ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs" title="Parameters were modified after calculation. Click 'Calculate Pricing' to refresh.">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
                    <span>Inputs Modified — Recalculation Required (Snapshot #{calcApiResult.data?.snapshot_id})</span>
                  </span>
                ) : calcApiResult?.status === 'success' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
                    <span>FastAPI Calculated (Snapshot #{calcApiResult.data?.snapshot_id})</span>
                  </span>
                ) : calcApiResult?.status === 'error' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" aria-hidden="true"></span>
                    <span>FastAPI Calculation Failed</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" aria-hidden="true"></span>
                    <span>FastAPI Calculation Engine Ready</span>
                  </span>
                )}
                {clientInfo.proposalId && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                    Proposal #{clientInfo.proposalId}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-normal">
                Configure multi-country commercial terms, packaging suites, à la carte features, and professional services connected to PostgreSQL.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap shrink-0">
              {clientInfo.proposalId && (
                <button
                  type="button"
                  onClick={() => handleReloadProposal()}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-slate-300"
                  title="Reload saved proposal from database"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span>Reload #{clientInfo.proposalId}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsAddCountryOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-200"
              >
                <Plus className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
                <span>Add Country</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerSave}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                <span>{clientInfo.proposalId ? 'Update Proposal' : 'Save Proposal'}</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerCalculation}
                disabled={isCalculating}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1 disabled:opacity-50"
              >
                <Calculator className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isCalculating ? 'Calculating...' : 'Calculate Pricing'}</span>
              </button>
            </div>
          </div>

          {masters.loadErrors?.length > 0 && (
            <div role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-900 space-y-1">
              <div className="font-semibold">Some master data could not be loaded from the backend:</div>
              <ul className="list-disc list-inside text-[11px]">
                {masters.loadErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <CalculationNotices totals={calcTotals} isLocallyModified={isCalculationStale} />

          {/* Phase A: Client Details & Reporting Currency Card */}
          <ClientConfigCard
            clientInfo={clientInfo}
            onChangeClientInfo={handleChangeClientInfo}
            errors={clientErrors}
            customers={masters.customers}
            currencies={masters.currencies}
            onSelectCustomerTier={(tierId) => {
              setCountryConfigs((prev) =>
                prev.map((c) => ({
                  ...c,
                  pricingTierId: tierId,
                }))
              )
            }}
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors border border-transparent hover:border-orange-200"
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
                    masters={masters}
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
        masters={masters}
      />

      <ProposalSaveModal
        isOpen={isSaveModalOpen}
        serializedData={serializedPayload}
        onClose={() => setIsSaveModalOpen(false)}
        onConfirmSave={handleConfirmBackendSave}
        isSaving={isSaving}
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
