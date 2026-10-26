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
  getDeals,
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
} from '../../api/catalogueApi'
import { getPacks } from '../../api/packsApi'
import { useProposal } from '../../context/ProposalContext'

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
    serviceRates: [],
    customers: [],
    deals: [],
    isLoading: true,
  })

  // Modals & Dialogs State
  const [isAddCountryOpen, setIsAddCountryOpen] = useState(false)
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isCalcModalOpen, setIsCalcModalOpen] = useState(false)

  // API Integration States
  const [isSaving, setIsSaving] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [calcApiResult, setCalcApiResult] = useState(null)
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
          hours: s.hoursOrDays,
          rate: s.rateApplied,
          disc: s.discountPct,
        })),
      })),
    })
  }, [clientInfo.reportingCurrencyId, countryConfigs])

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

  // Load live reference masters on mount
  useEffect(() => {
    let isMounted = true

    async function loadMasterData() {
      try {
        const [
          countriesRes,
          currenciesRes,
          tiersRes,
          deploymentsRes,
          deploymentPricingOptionsRes,
          pricingModelsRes,
          familiesRes,
          packsRes,
          productsRes,
          serviceRatesRes,
          customersRes,
          dealsRes,
        ] = await Promise.allSettled([
          getCountries(),
          getCurrencies(),
          getCustomerTiers(),
          getDeploymentModels(),
          getDeploymentPricingOptions(),
          getPricingModels(),
          getCatalogueFamilies(),
          getPacks(),
          getCatalogueProducts(),
          getServiceRates(),
          getCustomers(),
          getDeals(),
        ])

        if (!isMounted) return

        const liveCurrencies = currenciesRes.status === 'fulfilled' ? currenciesRes.value : []
        setMasters({
          countries: countriesRes.status === 'fulfilled' ? countriesRes.value : [],
          currencies: liveCurrencies,
          tiers: tiersRes.status === 'fulfilled' ? tiersRes.value : [],
          deployments: deploymentsRes.status === 'fulfilled' ? deploymentsRes.value : [],
          deploymentPricingOptions: deploymentPricingOptionsRes.status === 'fulfilled' ? deploymentPricingOptionsRes.value : [],
          pricingModels: pricingModelsRes.status === 'fulfilled' ? pricingModelsRes.value : [],
          families: familiesRes.status === 'fulfilled' ? familiesRes.value : [],
          packs: packsRes.status === 'fulfilled' ? packsRes.value : [],
          products: productsRes.status === 'fulfilled' ? productsRes.value : [],
          serviceRates: serviceRatesRes.status === 'fulfilled' ? serviceRatesRes.value : [],
          customers: customersRes.status === 'fulfilled' ? customersRes.value : [],
          deals: dealsRes.status === 'fulfilled' ? dealsRes.value : [],
          isLoading: false,
        })

        if (liveCurrencies.length > 0) {
          setClientInfo((prev) => {
            const hasValidId = liveCurrencies.some(
              (c) => Number(c.id) === Number(prev.reportingCurrencyId)
            )
            if (!hasValidId) {
              const match =
                liveCurrencies.find(
                  (c) => c.code?.toUpperCase() === prev.reportingCurrency?.toUpperCase()
                ) || liveCurrencies[0]
              if (match) {
                return {
                  ...prev,
                  reportingCurrencyId: Number(match.id),
                  reportingCurrency: match.code,
                }
              }
            }
            return prev
          })
        }
      } catch {
        if (isMounted) {
          setMasters((prev) => ({ ...prev, isLoading: false }))
        }
      }
    }

    loadMasterData()

    return () => {
      isMounted = false
    }
  }, [])

  // Reload saved proposal if proposalId is in query params or clientInfo
  const handleReloadProposal = useCallback(
    async (targetId) => {
      const idToLoad = targetId || urlProposalId || clientInfo.proposalId
      if (!idToLoad) return

      try {
        const backendProposal = await getProposal(idToLoad)
        if (backendProposal) {
          const { clientInfo: loadedClient, countryConfigs: loadedConfigs } =
            deserializeBackendProposal(backendProposal)
          setClientInfo((prev) => ({ ...prev, ...loadedClient }))
          if (loadedConfigs.length > 0) {
            setCountryConfigs(loadedConfigs)
          }

          // Also check for latest calculation snapshot
          try {
            const latestCalc = await getLatestCalculation(idToLoad)
            if (latestCalc) {
              setCalcApiResult({
                status: 'success',
                data: latestCalc,
                isBackendCalculation: true,
              })
            }
          } catch {
            // No calculation run yet, safe to ignore
          }

          showToast(`Loaded saved proposal #${idToLoad} from PostgreSQL.`, 'success')
        }
      } catch (err) {
        showToast(
          `Failed to load proposal #${idToLoad}: ${err.response?.data?.detail || err.message}`,
          'error'
        )
      }
    },
    [urlProposalId, clientInfo.proposalId, setClientInfo, setCountryConfigs]
  )

  useEffect(() => {
    if (urlProposalId && (!clientInfo.proposalId || String(clientInfo.proposalId) !== String(urlProposalId))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleReloadProposal(urlProposalId)
    }
  }, [urlProposalId, handleReloadProposal, clientInfo.proposalId])

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
    return serializeProposalToBackendSchema(clientInfo, countryConfigs, masters)
  }, [clientInfo, countryConfigs, masters])

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
        masters,
      })

      if (res.isPersisted) {
        setClientInfo((prev) => ({
          ...prev,
          proposalId: res.proposalId,
          customerId: res.customerId,
          dealId: res.dealId,
          proposalCode: res.data?.code || prev.proposalCode,
        }))
        setSearchParams({ proposalId: String(res.proposalId) })
        showToast(`Proposal #${res.proposalId} successfully saved to PostgreSQL database.`, 'success')
        setIsSaveModalOpen(false)
      } else {
        showToast(res.message || 'Failed to save proposal to PostgreSQL.', 'error')
      }
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message || 'Failed to save proposal'
      showToast(`Database save failed: ${typeof errMsg === 'object' ? JSON.stringify(errMsg) : errMsg}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Calculate Commercials using Existing Backend Calculation Engine (Phase 5)
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
      const res = await requestProposalCalculation({
        proposalId: clientInfo.proposalId,
        clientInfo,
        countryConfigs,
        masters,
      })

      setCalcApiResult(res)

      if (res.status === 'success') {
        setCalculatedInputsSignature(currentInputsSignature)
        if (res.proposalId && !clientInfo.proposalId) {
          setClientInfo((prev) => ({
            ...prev,
            proposalId: res.proposalId,
          }))
          setSearchParams({ proposalId: String(res.proposalId) })
        }
        showToast('Pricing calculation successfully executed by backend engine.', 'success')
      } else {
        showToast(`Calculation failed: ${res.message}`, 'error')
      }
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message || 'Pricing calculation failed'
      setCalcApiResult({
        status: 'error',
        statusCode: err.response?.status,
        message: typeof errMsg === 'object' ? JSON.stringify(errMsg) : errMsg,
        data: null,
      })
      showToast(`Calculation failed: ${errMsg}`, 'error')
    } finally {
      setIsCalculating(false)
    }
  }

  // Derive display values for summary strip strictly from backend calculation
  const summaryStripValues = useMemo(() => {
    if (!calcApiResult || calcApiResult.status !== 'success' || !calcApiResult.data) {
      return {
        fcv: 'Pending backend calculation',
        services: 'Pending backend calculation',
        grandTotal: 'Pending backend calculation',
      }
    }

    const data = calcApiResult.data
    const curr = data.reporting_currency_code || 'USD'
    const grandTotalNum = Number(data.total_proposal_reporting_currency || 0)

    let subscriptionReportingTotal = 0
    let serviceReportingTotal = 0
    const rawProducts = data.snapshot_payload?.products || []
    const productsList = Array.isArray(rawProducts)
      ? rawProducts
      : typeof rawProducts === 'object'
      ? Object.values(rawProducts)
      : []

    productsList.forEach((p) => {
      const fx = Number(p.fx_rate_multiplier || 1)
      const sub = Number(p.subscription_total_after_discount ?? p.subscription_total_net ?? 0)
      const srv = Number(p.service_total_after_discount ?? p.services_total_net ?? 0)
      subscriptionReportingTotal += sub * fx
      serviceReportingTotal += srv * fx
    })

    const staleSuffix = isCalculationStale ? ' (Outdated)' : ''

    const fcvStr = `${curr} ${subscriptionReportingTotal.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}${staleSuffix}`

    const servicesStr = `${curr} ${serviceReportingTotal.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}${staleSuffix}`

    const grandTotalStr = `${curr} ${grandTotalNum.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}${staleSuffix}`

    return {
      fcv: fcvStr,
      services: servicesStr,
      grandTotal: grandTotalStr,
      isStale: isCalculationStale,
    }
  }, [calcApiResult, isCalculationStale])

  return (
    <div className="h-screen h-[100dvh] max-h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation */}
      <div className="shrink-0">
        <CatalogueTopNav
          activeSection="calculator"
          isConnected={!masters.isLoading}
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
