import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { SummaryStrip } from '../catalogue/SummaryStrip'
import { IncludedProductsSidebar } from './components/IncludedProductsSidebar'
import { PricingEditor } from './components/PricingEditor'
import { CommercialSummaryCard } from './components/CommercialSummaryCard'
import { ApprovalPoliciesCard } from './components/ApprovalPoliciesCard'
import { useProposal } from '../../context/ProposalContext'

export function PricingPage() {
  const {
    clientInfo,
    countryConfigs,
    focusedCountryId,
    setFocusedCountryId,
    focusedFamilyId,
    setFocusedFamilyId,
    lineItemDiscounts,
    updateLineItemDiscount,
    overallDiscounts,
    updateOverallDiscount,
    serviceDiscounts,
    updateServiceDiscount,
    updateCountry,
    approvalPolicies,
  } = useProposal()

  // Local feedback state
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg)
    setToastType(type)
    setTimeout(() => {
      setToastMessage('')
    }, 4500)
  }

  // Active country for center editor
  const activeCountry = useMemo(() => {
    if (!countryConfigs || countryConfigs.length === 0) return null
    return (
      countryConfigs.find((c) => c.id === focusedCountryId) ||
      countryConfigs[0]
    )
  }, [countryConfigs, focusedCountryId])

  // Summary counts for top commercial strip
  const summaryCounts = useMemo(() => {
    let totalFamilies = 0
    let totalPacks = 0
    let totalFeatures = 0

    ;(countryConfigs || []).forEach((c) => {
      totalFamilies += c.families.length
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
    }
  }, [countryConfigs])

  // Handle prototype save action
  const handleSavePrototype = () => {
    showToast(
      'Pricing & discount configuration saved in frontend state (not persisted to PostgreSQL).',
      'warning'
    )
  }

  // Handle service lines update from editor
  const handleUpdateServiceLines = (countryId, updatedServiceLines) => {
    const targetCountry = countryConfigs.find((c) => c.id === countryId)
    if (targetCountry) {
      updateCountry({
        ...targetCountry,
        serviceLines: updatedServiceLines,
      })
      showToast('Service lines updated in frontend state.', 'success')
    }
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation: Dark navy top header with Pricing & Discounts highlighted */}
      <CatalogueTopNav activeSection="pricing" />

      {/* 2. Existing White Commercial Summary Strip */}
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

      {/* 3. Three-Column Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#F8FAFC]">
        {/* Left Column — Included Products */}
        <IncludedProductsSidebar
          countryConfigs={countryConfigs || []}
          focusedCountryId={focusedCountryId || countryConfigs?.[0]?.id}
          focusedFamilyId={focusedFamilyId}
          onSelectCountry={(cId) => setFocusedCountryId(cId)}
          onSelectFamily={(fId) => setFocusedFamilyId(fId)}
        />

        {/* Center Column — Pricing & Discounts Editor */}
        <main
          className="flex-1 flex flex-col overflow-y-auto"
          aria-label="Pricing and Discounts Main Editor"
        >
          <PricingEditor
            countryConfig={activeCountry}
            focusedFamilyId={focusedFamilyId}
            lineItemDiscounts={lineItemDiscounts}
            overallDiscounts={overallDiscounts}
            serviceDiscounts={serviceDiscounts}
            onUpdateLineDiscount={updateLineItemDiscount}
            onUpdateOverallDiscount={updateOverallDiscount}
            onUpdateServiceDiscount={updateServiceDiscount}
            onUpdateServiceLines={handleUpdateServiceLines}
          />
        </main>

        {/* Right Column — Commercial Summary and Approval Information */}
        <aside
          aria-label="Commercial Summary and Governance Policies"
          className="w-full lg:w-80 xl:w-96 p-4 sm:p-5 border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50/70 shrink-0 overflow-y-auto space-y-5"
        >
          <CommercialSummaryCard
            clientInfo={clientInfo}
            onSavePrototype={handleSavePrototype}
          />

          <ApprovalPoliciesCard
            policies={approvalPolicies}
          />
        </aside>
      </div>
    </div>
  )
}

export default PricingPage
