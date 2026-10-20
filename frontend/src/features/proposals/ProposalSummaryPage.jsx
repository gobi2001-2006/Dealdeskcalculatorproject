import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
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
import { serializeProposalToBackendSchema } from '../calculator/calculatorData'
import {
  requestProposalCalculation,
  saveProposalDraft,
} from '../../api/proposalsApi'
import { useProposal } from '../../context/ProposalContext'

export function ProposalSummaryPage() {
  const {
    clientInfo,
    countryConfigs,
    lineItemDiscounts,
    overallDiscounts,
    serviceDiscounts,
  } = useProposal()

  // Local Presentation & Action States
  const [showDiscounts, setShowDiscounts] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')

  // Modals & API States
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isCalcModalOpen, setIsCalcModalOpen] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [calcApiResult, setCalcApiResult] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg)
    setToastType(type)
    setTimeout(() => {
      setToastMessage('')
    }, 4500)
  }

  // Serialized payload for backend integration
  const serializedPayload = useMemo(() => {
    return serializeProposalToBackendSchema(clientInfo, countryConfigs || [])
  }, [clientInfo, countryConfigs])

  // Summary counts for metrics and top summary strip
  const summaryCounts = useMemo(() => {
    let totalFamilies = 0
    let totalPacks = 0
    let totalFeatures = 0
    let totalServices = 0

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
      totalFamilies,
      totalPacks,
      totalFeatures,
      totalServices,
      totalCommercialLines: totalPacks + totalFeatures + totalServices,
    }
  }, [countryConfigs])

  // Handle Save Proposal action
  const handleTriggerSave = () => {
    setIsSaveModalOpen(true)
  }

  const handleConfirmSave = async () => {
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

  // Handle Check/Recalculate with backend pricing engine
  const handleTriggerCalculation = async () => {
    setIsCalculating(true)
    setIsCalcModalOpen(true)
    const res = await requestProposalCalculation(serializedPayload)
    setCalcApiResult(res)
    setIsCalculating(false)
  }

  // Empty state check
  const hasProposalScope = (countryConfigs || []).length > 0

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation: Dark navy header with Proposal Summary highlighted */}
      <CatalogueTopNav activeSection="proposals" />

      {/* 2. White Commercial Summary Strip */}
      <SummaryStrip
        clientName={clientInfo?.clientName || 'Untitled Proposal'}
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

      {/* 3. Main Workspace: Warm-Grey Background */}
      <div className="flex-1 overflow-y-auto bg-[#F8FAFC]">
        <main
          className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6"
          aria-label="Proposal Summary Workspace"
        >
          {!hasProposalScope ? (
            /* Empty State */
            <section
              aria-label="No Proposal Configured"
              className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs space-y-4 max-w-xl mx-auto mt-8"
            >
              <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 mx-auto">
                <Globe className="w-7 h-7" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg font-bold text-slate-900">
                  No Proposal Scope Configured
                </h1>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  There are no regional countries or product packages configured yet.
                  Configure your customer requirements on Page 4 (Proposal Configurator)
                  before viewing consolidated commercial summaries.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/calculator"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors"
                >
                  <span>Configure Proposal</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </section>
          ) : (
            <>
              {/* Page Header and Action Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200/80">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                      Proposal Summary — {clientInfo.clientName}
                    </h1>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-orange-400 border border-slate-700">
                      {clientInfo.reportingCurrency}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
                      <span>Consolidated Proposal</span>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Consolidated pricing across all included products and countries, converted to a single reporting currency.
                  </p>
                </div>

                {/* Actions Toolbar */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Action A: Show Discounts Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showDiscounts}
                    onClick={() => setShowDiscounts(!showDiscounts)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-200 ${
                      showDiscounts
                        ? 'bg-orange-600 text-white border-orange-600 shadow-orange-100'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                    aria-label="Show Discounts Toggle"
                  >
                    {showDiscounts ? (
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    )}
                    <span>{showDiscounts ? 'Hide Discounts' : 'Show Discounts'}</span>
                  </button>

                  {/* Action B: Export PDF (Disabled with tooltip) */}
                  <div className="relative group">
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed shadow-2xs opacity-75"
                      title="PDF export requires backend reporting service deployment (Wave 5)"
                    >
                      <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Export PDF</span>
                    </button>
                  </div>

                  {/* Action C: Generate Proposal Doc (Disabled / Coming Soon) */}
                  <div className="relative group">
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed shadow-2xs opacity-75"
                      title="Proposal document generation requires backend document engine deployment"
                    >
                      <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Generate Proposal Doc</span>
                    </button>
                  </div>

                  {/* Save Proposal Prototype */}
                  <button
                    type="button"
                    onClick={handleTriggerSave}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-orange-200"
                  >
                    <Save className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                    <span>Save Proposal</span>
                  </button>

                  {/* Check Pricing Engine */}
                  <button
                    type="button"
                    onClick={handleTriggerCalculation}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0B1528] text-white hover:bg-slate-800 transition-colors shadow-2xs"
                    title="Validate with FastAPI pricing calculation engine"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${isCalculating ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>Check Pricing Engine</span>
                  </button>
                </div>
              </div>

              {/* 4. Six Summary Metric Cards Grid */}
              <section
                aria-label="High-Level Proposal Financial Metrics"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5"
              >
                {/* Card 1 — Countries */}
                <SummaryMetricCard
                  title="Countries"
                  value={summaryCounts.countriesCount}
                  subtitle={
                    summaryCounts.countriesCount === 1
                      ? '1 Configured Country'
                      : `${summaryCounts.countriesCount} Configured Countries`
                  }
                  icon={Globe}
                  colorVariant="slate"
                />

                {/* Card 2 — Product Lines */}
                <SummaryMetricCard
                  title="Product Lines"
                  value={summaryCounts.totalFamilies}
                  subtitle={`${summaryCounts.totalPacks} Packs, ${summaryCounts.totalFeatures} Add-ons`}
                  icon={Package}
                  colorVariant="slate"
                />

                {/* Card 3 — License Fees */}
                <SummaryMetricCard
                  title="License Fees"
                  value="Pending backend calculation"
                  subtitle="Upfront / Platform Fees"
                  icon={Key}
                  colorVariant="blue"
                  currencyCode={clientInfo.reportingCurrency}
                />

                {/* Card 4 — Rental / PEPM */}
                <SummaryMetricCard
                  title="Rental / PEPM"
                  value="Pending backend calculation"
                  subtitle="Recurring over term"
                  icon={Calendar}
                  colorVariant="slate"
                  currencyCode={clientInfo.reportingCurrency}
                />

                {/* Card 5 — Service Fees */}
                <SummaryMetricCard
                  title="Service Fees"
                  value="Pending backend calculation"
                  subtitle="Professional Services"
                  icon={Briefcase}
                  colorVariant="teal"
                  currencyCode={clientInfo.reportingCurrency}
                />

                {/* Card 6 — Grand Total */}
                <SummaryMetricCard
                  title="Grand Total"
                  value="Pending backend calculation"
                  subtitle={`Consolidated in ${clientInfo.reportingCurrency}`}
                  icon={DollarSign}
                  colorVariant="orange"
                  isGrandTotal={true}
                  currencyCode={clientInfo.reportingCurrency}
                />
              </section>

              {/* 5. Detailed Proposal Summary Table */}
              <section
                aria-label="Detailed Proposal Commercial Breakdown"
                className="space-y-3"
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">
                      Multi-Country Commercial Breakdown
                    </span>
                    <span className="text-slate-400">•</span>
                    <span>
                      {summaryCounts.countriesCount}{' '}
                      {summaryCounts.countriesCount === 1 ? 'Region' : 'Regions'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-slate-400">
                      Discounts Detail:{' '}
                      <strong className={showDiscounts ? 'text-orange-600' : 'text-slate-600'}>
                        {showDiscounts ? 'Visible' : 'Hidden'}
                      </strong>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-400">
                      Financial Calculation:{' '}
                      <strong className="text-slate-600 font-mono">Backend-Owned</strong>
                    </span>
                  </div>
                </div>

                <ProposalFinancialTable
                  countryConfigs={countryConfigs}
                  clientInfo={clientInfo}
                  lineItemDiscounts={lineItemDiscounts}
                  overallDiscounts={overallDiscounts}
                  serviceDiscounts={serviceDiscounts}
                  showDiscounts={showDiscounts}
                  calculationResult={calcApiResult?.data}
                />
              </section>

              {/* 6. Footer and Financial Definitions */}
              <ProposalSummaryFooter
                countryConfigs={countryConfigs}
                clientInfo={clientInfo}
              />

              {/* Navigation Bar at Bottom */}
              <div className="flex items-center justify-between pt-2 pb-6 border-t border-slate-200">
                <Link
                  to="/pricing-discounts"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Return to Pricing & Discounts</span>
                </Link>

                <div className="flex items-center gap-2">
                  <Link
                    to="/calculator"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                  >
                    <span>Edit Configurator Scope</span>
                  </Link>

                  <button
                    type="button"
                    onClick={handleTriggerSave}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors shadow-2xs"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Save Final Proposal Draft</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Save Proposal Modal */}
      <ProposalSaveModal
        isOpen={isSaveModalOpen}
        serializedData={serializedPayload}
        onClose={() => setIsSaveModalOpen(false)}
        onConfirmSave={handleConfirmSave}
      />

      {/* Calculation Engine Status Modal */}
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

export default ProposalSummaryPage
