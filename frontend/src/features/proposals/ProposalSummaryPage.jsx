import { useState, useMemo, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Globe,
  Package,
  Key,
  Calendar,
  Briefcase,
  DollarSign,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  Save,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { SummaryStrip } from '../catalogue/SummaryStrip'
import { SummaryMetricCard } from './components/SummaryMetricCard'
import { ProposalFinancialTable } from './components/ProposalFinancialTable'
import { ProposalSummaryFooter } from './components/ProposalSummaryFooter'
import { ProposalSaveModal } from '../calculator/components/ProposalSaveModal'
import { CalculationModal } from '../calculator/components/CalculationModal'
import { CalculationNotices } from '../../components/common/CalculationNotices'
import {
  saveFullProposal,
  calculateProposal,
  getLatestCalculation,
  getProposal,
  exportProposal,
  discountsFromSnapshot,
  proposalTermMonths,
  describeApiError,
} from '../../api/proposalsApi'
import { formatContractYears, yearsToMonths } from '../../utils/contractDuration'
import { deserializeBackendProposal, serializeProposalToBackendSchema } from '../calculator/calculatorData'
import { useProposal } from '../../context/ProposalContext'
import { loadCatalogueMasters } from '../../utils/catalogueLookup'
import { formatMoney, readCalculationTotals } from '../../utils/calculationView'

export function ProposalSummaryPage() {
  const {
    clientInfo,
    setClientInfo,
    countryConfigs,
    setCountryConfigs,
    calcApiResult,
    setCalcApiResult,
  } = useProposal()

  const [searchParams] = useSearchParams()
  const urlProposalId = searchParams?.get('proposalId')
  const effectiveProposalId = urlProposalId || clientInfo?.proposalId || null

  const [showDiscounts, setShowDiscounts] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isCalcModalOpen, setIsCalcModalOpen] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isExportingDocx, setIsExportingDocx] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [modalCalcResult, setModalCalcResult] = useState(null)
  const [loadError, setLoadError] = useState('')

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg)
    setToastType(type)
    setTimeout(() => setToastMessage(''), 6000)
  }

  // Always read the saved proposal and its latest snapshot from the backend.
  useEffect(() => {
    let isMounted = true
    async function loadProposalAndSnapshot() {
      if (!effectiveProposalId) return
      try {
        const [masters, backendProposal] = await Promise.all([
          loadCatalogueMasters(),
          getProposal(effectiveProposalId),
        ])
        let latest = null
        try {
          latest = await getLatestCalculation(effectiveProposalId)
        } catch (err) {
          if (err.response?.status !== 404) throw err
        }
        if (!isMounted) return
        const restored = deserializeBackendProposal(backendProposal, { masters, latestCalc: latest })
        if (String(clientInfo?.proposalId) !== String(effectiveProposalId) || countryConfigs.length === 0) {
          setClientInfo(restored.clientInfo)
          setCountryConfigs(restored.countryConfigs)
        }
        setCalcApiResult(
          latest ? { status: 'success', proposalId: effectiveProposalId, data: latest, isBackendCalculation: true } : null,
        )
        setLoadError('')
      } catch (err) {
        if (isMounted) setLoadError(`Could not load proposal #${effectiveProposalId}: ${describeApiError(err)}`)
      }
    }
    loadProposalAndSnapshot()
    return () => { isMounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveProposalId])

  const totals = calcApiResult?.status === 'success' ? readCalculationTotals(calcApiResult.data) : null
  const snapshotPayload = totals ? calcApiResult.data.snapshot_payload : null
  const currencyCode = totals?.currency || clientInfo?.reportingCurrency || ''

  const summaryCounts = useMemo(() => {
    let totalFamilies = 0, totalPacks = 0, totalFeatures = 0, totalServices = 0
    ;(countryConfigs || []).forEach((c) => {
      totalFamilies += c.families.length
      totalServices += (c.serviceLines || []).length
      c.families.forEach((f) => {
        if (f.selectedPackId) totalPacks += 1
        totalFeatures += f.selectedFeatureIds?.length || 0
      })
    })
    return {
      countriesCount: countryConfigs?.length || 0,
      totalFamilies, totalPacks, totalFeatures, totalServices,
    }
  }, [countryConfigs])

  const handleTriggerSave = () => setIsSaveModalOpen(true)

  const handleConfirmSave = async () => {
    setIsSaving(true)
    try {
      const res = await saveFullProposal({ clientInfo, countryConfigs, existingProposalId: effectiveProposalId })
      setClientInfo((prev) => ({ ...prev, proposalId: res.proposalId, customerId: res.customerId, dealId: res.dealId }))
      setIsSaveModalOpen(false)
      showToast(`Proposal #${res.proposalId} saved.`, 'success')
    } catch (err) {
      showToast(`Save failed: ${describeApiError(err)}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Recalculate the saved proposal with the same discounts and term as the latest snapshot.
  const handleTriggerCalculation = async () => {
    setIsCalcModalOpen(true)
    if (!effectiveProposalId) {
      setModalCalcResult({ status: 'error', message: 'Save the proposal on the Proposal Configurator first.', data: null })
      return
    }
    setIsCalculating(true)
    try {
      // The term saved on the proposal is used by the backend; older proposals send the term of
      // their latest calculation (or the duration on screen).
      const detail = await getProposal(effectiveProposalId)
      const term = proposalTermMonths(detail, calcApiResult?.data) ?? yearsToMonths(countryConfigs?.[0]?.contractYears)
      if (!term) {
        setModalCalcResult({ status: 'error', message: 'Set the contract duration (years) on the Proposal Configurator first.', data: null })
        return
      }
      const rawResult = await calculateProposal(effectiveProposalId, {
        ...discountsFromSnapshot(calcApiResult?.data),
        ...(detail.contract_term_months ? {} : { contract_term_months: term }),
      })
      const result = { status: 'success', proposalId: effectiveProposalId, data: rawResult, isBackendCalculation: true }
      setModalCalcResult(result)
      setCalcApiResult(result)
    } catch (error) {
      setModalCalcResult({
        status: 'error',
        statusCode: error.response?.status,
        message: describeApiError(error, 'Pricing calculation failed'),
        data: null,
        isBackendCalculation: false,
      })
    } finally {
      setIsCalculating(false)
    }
  }

  const handleExportProposal = async (format = 'docx') => {
    if (!effectiveProposalId) {
      showToast('Save the proposal on the Proposal Configurator before exporting.', 'warning')
      return
    }
    if (!totals) {
      showToast('Please calculate the proposal before exporting.', 'warning')
      return
    }
    if (totals?.isStale) {
      showToast('Proposal configuration has been modified since last calculation. Please recalculate before exporting.', 'warning')
      return
    }
    const hasCommercialItems =
      (totals?.products?.length || 0) > 0 ||
      (snapshotPayload?.all_subscription_line_items?.length || 0) > 0 ||
      (snapshotPayload?.all_service_lines?.length || 0) > 0
    if (!hasCommercialItems) {
      showToast('Cannot export proposal: at least one valid commercial item is required.', 'warning')
      return
    }

    if (format === 'pdf') {
      setIsExportingPdf(true)
    } else {
      setIsExportingDocx(true)
    }

    try {
      const res = await exportProposal(effectiveProposalId, format)
      const disposition = res.headers?.['content-disposition'] || ''
      let filename = `Proposal_${clientInfo?.proposalCode || effectiveProposalId}.${format}`
      const match = disposition.match(/filename="?([^"]+)"?/)
      if (match && match[1]) {
        filename = match[1]
      }

      const blob = new Blob([res.data], {
        type: format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)

      showToast(`Proposal exported successfully as ${filename}`, 'success')
    } catch (err) {
      const errStatus = err.response?.status
      let detail = describeApiError(err, 'Export failed')
      // If error response was returned as a blob (axios responseType: 'blob'), try reading text
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text()
          const parsed = JSON.parse(text)
          if (parsed?.detail) detail = parsed.detail
        } catch {
          // ignore parse error
        }
      }
      if (errStatus === 409) {
        showToast(detail || 'Proposal inputs changed. Please recalculate pricing before exporting.', 'warning')
      } else if (errStatus === 422) {
        showToast(detail || 'Cannot export proposal: at least one valid commercial item is required.', 'warning')
      } else if (errStatus === 404) {
        showToast(detail || 'No saved calculation snapshot found. Calculate pricing first.', 'error')
      } else {
        showToast(`Export failed: ${detail}`, 'error')
      }
    } finally {
      setIsExportingDocx(false)
      setIsExportingPdf(false)
    }
  }

  const hasProposalScope = (countryConfigs || []).length > 0
  const activeModalResult = modalCalcResult ?? calcApiResult

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      <CatalogueTopNav activeSection="proposals" />

      <SummaryStrip
        clientName={clientInfo?.clientName || 'Untitled Proposal'}
        countriesValue={`${summaryCounts.countriesCount} Configured`}
        productLinesValue={`${summaryCounts.totalFamilies} Families (${summaryCounts.totalPacks} Packs, ${summaryCounts.totalFeatures} Features)`}
        pricingFcv={totals ? formatMoney(totals.subscriptionContract, totals.currency) : 'Pending calculation'}
        servicesValue={totals ? formatMoney(totals.services, totals.currency) : 'Pending calculation'}
        grandTotal={totals ? formatMoney(totals.contractTotal, totals.currency) : 'Pending calculation'}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 sm:px-6 py-2.5 text-[11px] font-medium flex items-center justify-between border-b transition-all animate-in slide-in-from-top-2 shrink-0 ${
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

      <div className="flex-1 overflow-y-auto bg-[#F8FAFC]">
        <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6" aria-label="Proposal Summary Workspace">
          {loadError && (
            <div role="alert" className="p-4 rounded-lg border border-rose-200 bg-rose-50 text-[12px] text-rose-900">
              {loadError}
            </div>
          )}
          {!hasProposalScope ? (
            <section aria-label="No Proposal Configured" className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs space-y-4 max-w-xl mx-auto mt-8">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 mx-auto">
                <Globe className="w-7 h-7" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h1 className="text-[19px] sm:text-[20px] font-bold text-slate-900">No Proposal Scope Configured</h1>
                <p className="text-[13px] text-slate-500 max-w-md mx-auto leading-relaxed">
                  No regional countries or product packages are configured yet.
                  Configure requirements in the Proposal Configurator before viewing commercial summaries.
                </p>
              </div>
              <div className="pt-2">
                <Link to="/calculator" className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors">
                  <span>Configure Proposal</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </section>
          ) : (
            <>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-3 border-b border-slate-200/80">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-[26px] sm:text-[28px] font-bold text-slate-900 tracking-tight leading-tight">Proposal Summary — {clientInfo.clientName}</h1>
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-orange-400 border border-slate-700">{currencyCode}</span>
                    {totals ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
                        <span>{totals.isStale ? 'Calculated (outdated)' : 'Calculated'} · Snapshot #{totals.snapshotId}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-amber-400" aria-hidden="true"></span>
                        <span>Pending Calculation</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] sm:text-[14px] text-slate-500">Consolidated pricing across all included products and countries, converted to a single reporting currency.</p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showDiscounts}
                    onClick={() => setShowDiscounts(!showDiscounts)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-[13px] font-semibold rounded-lg border transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-200 cursor-pointer ${showDiscounts ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                    aria-label="Show Discounts Toggle"
                  >
                    {showDiscounts ? <Eye className="w-4 h-4" aria-hidden="true" /> : <EyeOff className="w-4 h-4 text-slate-400" aria-hidden="true" />}
                    <span>{showDiscounts ? 'Hide Discounts' : 'Show Discounts'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportProposal('pdf')}
                    disabled={isExportingDocx || isExportingPdf}
                    className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-[13px] font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-60 cursor-pointer"
                    title="Export commercial summary report (.pdf)"
                    aria-label="Export PDF"
                  >
                    <FileDown className={`w-4 h-4 text-slate-600 ${isExportingPdf ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    <span>{isExportingPdf ? 'Exporting PDF…' : 'Export PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportProposal('docx')}
                    disabled={isExportingDocx || isExportingPdf}
                    className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-[13px] font-semibold rounded-lg bg-orange-600 border border-orange-600 text-white hover:bg-orange-700 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-60 cursor-pointer"
                    title="Export official Adrenalin proposal document (.docx) with final calculated commercial values"
                    aria-label="Export Proposal"
                  >
                    <FileText className={`w-4 h-4 text-white ${isExportingDocx ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    <span>{isExportingDocx ? 'Exporting…' : 'Export Proposal'}</span>
                  </button>

                  <button type="button" onClick={handleTriggerSave} disabled={isSaving} className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-[13px] font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-60 cursor-pointer">
                    <Save className="w-4 h-4 text-slate-600" aria-hidden="true" />
                    <span>{isSaving ? 'Saving…' : 'Save Proposal'}</span>
                  </button>

                  <button type="button" onClick={handleTriggerCalculation} disabled={isCalculating} className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-[13px] font-semibold rounded-lg bg-[#0B1528] text-white hover:bg-slate-800 transition-colors shadow-2xs disabled:opacity-60 cursor-pointer" title="Recalculate proposal totals">
                    <RefreshCw className={`w-4 h-4 text-orange-400 ${isCalculating ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>{isCalculating ? 'Calculating…' : 'Recalculate'}</span>
                  </button>
                </div>
              </div>

              <section aria-label="High-Level Proposal Financial Metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
                <SummaryMetricCard title="Countries" value={summaryCounts.countriesCount} subtitle={summaryCounts.countriesCount === 1 ? '1 Configured Country' : `${summaryCounts.countriesCount} Configured Countries`} icon={Globe} colorVariant="slate" />
                <SummaryMetricCard title="Product Lines" value={summaryCounts.totalFamilies} subtitle={`${summaryCounts.totalPacks} Packs, ${summaryCounts.totalFeatures} Add-ons`} icon={Package} colorVariant="slate" />
                <SummaryMetricCard title="Subscription (Annual)" value={totals ? formatMoney(totals.subscriptionAnnual, currencyCode) : 'Pending calculation'} subtitle="Platform + consumption, after discounts" icon={Key} colorVariant="blue" currencyCode={currencyCode} />
                <SummaryMetricCard title={`Subscription (${formatContractYears(totals?.termMonths)})`} value={totals ? formatMoney(totals.subscriptionContract, currencyCode) : 'Pending calculation'} subtitle="Over the contract term" icon={Calendar} colorVariant="slate" currencyCode={currencyCode} />
                <SummaryMetricCard title="Service Fees" value={totals ? formatMoney(totals.services, currencyCode) : 'Pending calculation'} subtitle="One-time professional services" icon={Briefcase} colorVariant="teal" currencyCode={currencyCode} />
                <SummaryMetricCard title="Grand Total (FCV)" value={totals ? formatMoney(totals.contractTotal, currencyCode) : 'Pending calculation'} subtitle={totals ? `Year 1: ${formatMoney(totals.annualTotal, currencyCode)} · ${currencyCode}` : `Consolidated in ${currencyCode}`} icon={DollarSign} colorVariant="orange" isGrandTotal={true} currencyCode={currencyCode} />
              </section>

              <section aria-label="Detailed Proposal Commercial Breakdown" className="space-y-3.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-[16px]">Multi-Country Commercial Breakdown</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-[12px]">{summaryCounts.countriesCount} {summaryCounts.countriesCount === 1 ? 'Region' : 'Regions'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-slate-500">Discounts Detail: <strong className={showDiscounts ? 'text-orange-600' : 'text-slate-600'}>{showDiscounts ? 'Visible' : 'Hidden'}</strong></span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-500">Financial Calculation: <strong className="text-slate-700 font-mono">{totals ? `Snapshot #${totals.snapshotId}` : 'Not calculated'}</strong></span>
                  </div>
                </div>

                <CalculationNotices totals={totals} />
                <ProposalFinancialTable showDiscounts={showDiscounts} snapshotPayload={snapshotPayload} />
              </section>

              <ProposalSummaryFooter countryConfigs={countryConfigs} clientInfo={clientInfo} />

              <div className="flex items-center justify-between pt-3 pb-6 border-t border-slate-200">
                <Link to={`/pricing-discounts${effectiveProposalId ? `?proposalId=${effectiveProposalId}` : ''}`} className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] text-[13px] font-medium rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs">
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Return to Pricing &amp; Discounts</span>
                </Link>
                <div className="flex items-center gap-2.5">
                  <Link to={`/calculator${effectiveProposalId ? `?proposalId=${effectiveProposalId}` : ''}`} className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-[13px] font-medium rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs">
                    <span>Edit Configurator Scope</span>
                  </Link>
                  <button type="button" onClick={handleTriggerSave} disabled={isSaving} className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[40px] text-[13px] font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors shadow-2xs disabled:opacity-60 cursor-pointer">
                    <Save className="w-4 h-4" aria-hidden="true" />
                    <span>{isSaving ? 'Saving…' : 'Save Final Proposal Draft'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <ProposalSaveModal
        isOpen={isSaveModalOpen}
        serializedData={serializeProposalToBackendSchema(clientInfo, countryConfigs)}
        onClose={() => setIsSaveModalOpen(false)}
        onConfirmSave={handleConfirmSave}
      />

      <CalculationModal
        isOpen={isCalcModalOpen}
        clientInfo={clientInfo}
        countryConfigs={countryConfigs}
        apiResult={activeModalResult}
        isLoading={isCalculating}
        onClose={() => setIsCalcModalOpen(false)}
        onRetryCalculation={handleTriggerCalculation}
      />
    </div>
  )
}

export default ProposalSummaryPage
