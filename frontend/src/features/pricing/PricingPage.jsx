import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import {
  getProposal,
  calculateProposal,
  getLatestCalculation,
} from '../../api/proposalsApi'
import { INITIAL_PACKS } from '../../data/packsData'
import { INITIAL_PRODUCTS } from '../../data/catalogueData'
import { deserializeBackendProposal } from '../calculator/calculatorData'

export function PricingPage() {
  const {
    clientInfo,
    setClientInfo,
    countryConfigs,
    setCountryConfigs,
    focusedCountryId,
    setFocusedCountryId,
    focusedFamilyId,
    setFocusedFamilyId,
    lineItemDiscounts,
    updateLineItemDiscount,
    overallDiscounts,
    updateOverallDiscount,
    setOverallDiscounts,
    serviceDiscounts,
    updateServiceDiscount,
    updateCountry,
    approvalPolicies,
    calcApiResult,
    setCalcApiResult,
  } = useProposal()

  const [searchParams] = useSearchParams()
  const urlProposalId = searchParams?.get('proposalId')
  const effectiveProposalId = urlProposalId || clientInfo?.proposalId || null

  // Local feedback state
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [isSaving, setIsSaving] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg)
    setToastType(type)
    setTimeout(() => {
      setToastMessage('')
    }, 4500)
  }

  // Load proposal details and latest calculation snapshot if proposal ID is present
  useEffect(() => {
    let isMounted = true

    async function loadProposalData() {
      if (!effectiveProposalId) return

      try {
        const backendProposal = await getProposal(effectiveProposalId)
        if (isMounted && backendProposal) {
          const deserialized = deserializeBackendProposal(backendProposal)
          if (deserialized.clientInfo) {
            setClientInfo(deserialized.clientInfo)
          }
          if (deserialized.countryConfigs?.length > 0) {
            setCountryConfigs(deserialized.countryConfigs)
            if (!focusedCountryId) {
              setFocusedCountryId(deserialized.countryConfigs[0].id)
            }
          }
        }
      } catch (err) {
        // Log non-critical warning if proposal details cannot be retrieved
        console.warn('Could not load proposal details:', err)
      }

      try {
        const latest = await getLatestCalculation(effectiveProposalId)
        if (isMounted && latest) {
          setCalcApiResult({
            status: 'success',
            proposalId: effectiveProposalId,
            data: latest,
            isBackendCalculation: true,
          })

          // Hydrate overall country discount from latest snapshot if not already entered
          const firstProduct = latest.snapshot_payload?.products?.[0]
          if (firstProduct && Number(firstProduct.subscription_discount_pct) > 0) {
            setOverallDiscounts((prev) => {
              const activeId = focusedCountryId || 'c-in'
              if (!prev[activeId] || prev[activeId].value === '') {
                return {
                  ...prev,
                  [activeId]: {
                    type: 'percentage',
                    value: String(firstProduct.subscription_discount_pct),
                    reason: prev[activeId]?.reason || '',
                  },
                }
              }
              return prev
            })
          }
        }
      } catch (err) {
        // 404 is normal when the proposal has not yet been calculated
        if (err.response?.status !== 404) {
          console.warn('Could not load latest calculation snapshot:', err)
        }
      }
    }

    loadProposalData()

    return () => {
      isMounted = false
    }
  }, [effectiveProposalId])

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

  // Build calculation request payload resolving authoritative product codes
  const buildCalculationPayload = () => {
    const primaryTerm =
      Number(activeCountry?.contractTerm) ||
      Number(countryConfigs?.[0]?.contractTerm) ||
      12

    const productSubscriptionDiscounts = {}
    const productServiceDiscounts = {}

    // 1. Gather all known valid product codes for this proposal
    const knownProductCodes = new Set()

    ;(calcApiResult?.data?.snapshot_payload?.products || []).forEach((p) => {
      if (p.product_code) knownProductCodes.add(p.product_code)
    })

    ;(calcApiResult?.data?.snapshot_payload?.all_subscription_line_items || []).forEach((li) => {
      if (li.product_code) knownProductCodes.add(li.product_code)
    })

    ;(activeCountry?.families || []).forEach((fam) => {
      if (fam.selectedPackId) {
        const pack = INITIAL_PACKS.find((p) => p.id === fam.selectedPackId)
        if (pack?.code) knownProductCodes.add(pack.code)
      }
      ;(fam.selectedFeatureIds || []).forEach((featId) => {
        const feat = INITIAL_PRODUCTS.find((p) => p.id === featId)
        if (feat?.code) knownProductCodes.add(feat.code)
      })
    })

    // 2. If country-level overall discount is entered, apply to all known products
    const overallVal = overallDiscounts[activeCountry?.id]?.value
    if (overallVal !== '' && overallVal !== null && overallVal !== undefined) {
      const oVal = Number(overallVal)
      if (!isNaN(oVal) && oVal >= 0 && oVal <= 100) {
        knownProductCodes.forEach((code) => {
          productSubscriptionDiscounts[code] = oVal
        })
      }
    }

    // 3. Line-item specific overrides
    ;(activeCountry?.families || []).forEach((fam) => {
      const packKey = `${activeCountry.id}:${fam.id}:pack`
      const packDisc = lineItemDiscounts[packKey]
      if (packDisc && packDisc.value !== '' && packDisc.type === 'percentage') {
        const pVal = Number(packDisc.value)
        if (!isNaN(pVal) && pVal >= 0 && pVal <= 100) {
          const snapshotLine = (calcApiResult?.data?.snapshot_payload?.all_subscription_line_items || []).find(
            (li) =>
              String(li.pack_version_id) === String(fam.selectedPackId) ||
              String(li.pack_id) === String(fam.selectedPackId)
          )
          const packCode =
            snapshotLine?.product_code ||
            INITIAL_PACKS.find((p) => p.id === fam.selectedPackId)?.code
          if (packCode) {
            productSubscriptionDiscounts[packCode] = pVal
          }
        }
      }

      ;(fam.selectedFeatureIds || []).forEach((featId) => {
        const featKey = `${activeCountry.id}:${fam.id}:feature:${featId}`
        const featDisc = lineItemDiscounts[featKey]
        if (featDisc && featDisc.value !== '' && featDisc.type === 'percentage') {
          const fVal = Number(featDisc.value)
          if (!isNaN(fVal) && fVal >= 0 && fVal <= 100) {
            const snapshotFeatLine = (calcApiResult?.data?.snapshot_payload?.all_subscription_line_items || []).find(
              (li) => String(li.feature_id) === String(featId)
            )
            const featCode =
              snapshotFeatLine?.product_code ||
              INITIAL_PRODUCTS.find((p) => p.id === featId)?.code
            if (featCode) {
              productSubscriptionDiscounts[featCode] = fVal
            }
          }
        }
      })
    })

    // 4. Professional services discounts
    const snapshotServices = calcApiResult?.data?.snapshot_payload?.all_service_lines || []
    if (snapshotServices.length > 0) {
      ;(activeCountry?.serviceLines || []).forEach((srv) => {
        const srvDisc = serviceDiscounts[srv.id]
        if (srvDisc && srvDisc.value !== '') {
          const num = Number(srvDisc.value)
          if (!isNaN(num) && num >= 0 && num <= 100) {
            const matchingSrv = snapshotServices.find(
              (s) => s.role_name === srv.roleName || String(s.id) === String(srv.id)
            )
            const targetCode =
              matchingSrv?.attached_product_code ||
              matchingSrv?.product_code ||
              Array.from(knownProductCodes)[0]
            if (targetCode) {
              productServiceDiscounts[targetCode] = num
            }
          }
        }
      })
    }

    return {
      contract_term_months: primaryTerm,
      product_subscription_discounts: productSubscriptionDiscounts,
      product_service_discounts: productServiceDiscounts,
    }
  }

  // Handle Save Pricing action
  const handleSavePricing = async () => {
    if (!effectiveProposalId) {
      showToast(
        'Pricing & discount configuration saved in frontend state (not persisted to PostgreSQL).',
        'warning'
      )
      return
    }

    // Validate line discounts before submission
    const invalidLine = Object.entries(lineItemDiscounts).find(([_, disc]) => {
      if (disc?.value !== '' && disc?.value !== null && disc?.value !== undefined) {
        const val = Number(disc.value)
        return isNaN(val) || val < 0 || (disc.type === 'percentage' && val > 100)
      }
      return false
    })

    if (invalidLine) {
      showToast('Please fix invalid discount values before saving.', 'error')
      return
    }

    const overallVal = overallDiscounts[activeCountry?.id]?.value
    if (overallVal !== '' && overallVal !== null && overallVal !== undefined) {
      const oVal = Number(overallVal)
      if (isNaN(oVal) || oVal < 0 || oVal > 100) {
        showToast('Overall country discount must be between 0% and 100%.', 'error')
        return
      }
    }

    setIsSaving(true)
    try {
      const payload = buildCalculationPayload()

      const calcResult = await calculateProposal(effectiveProposalId, payload)

      setCalcApiResult({
        status: 'success',
        proposalId: effectiveProposalId,
        data: calcResult,
        isBackendCalculation: true,
      })

      showToast(
        'Pricing & discounts successfully calculated and saved to PostgreSQL.',
        'success'
      )
    } catch (err) {
      const errMsg =
        err.response?.data?.detail || err.message || 'Failed to calculate and save pricing.'
      showToast(typeof errMsg === 'object' ? JSON.stringify(errMsg) : errMsg, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Recalculate
  const handleRecalculate = async () => {
    if (!effectiveProposalId) {
      showToast('No active proposal to recalculate against backend.', 'warning')
      return
    }

    setIsCalculating(true)
    try {
      const payload = buildCalculationPayload()

      const calcResult = await calculateProposal(effectiveProposalId, payload)

      setCalcApiResult({
        status: 'success',
        proposalId: effectiveProposalId,
        data: calcResult,
        isBackendCalculation: true,
      })

      showToast('Pricing recalculation completed.', 'success')
    } catch (err) {
      const errMsg =
        err.response?.data?.detail || err.message || 'Pricing recalculation failed.'
      showToast(typeof errMsg === 'object' ? JSON.stringify(errMsg) : errMsg, 'error')
    } finally {
      setIsCalculating(false)
    }
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

  const snapshotData = calcApiResult?.data
  const pricingFcvFormatted = snapshotData
    ? `${activeCountry?.currencySymbol || '$'} ${Number(
        snapshotData.snapshot_payload?.products?.reduce(
          (sum, p) =>
            sum +
            Number(
              p.contract_subscription_total_after_discount ??
                p.subscription_total_after_discount ??
                0
            ),
          0
        ) || 0
      ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'Pending backend calculation'

  const servicesValueFormatted = snapshotData
    ? `${activeCountry?.currencySymbol || '$'} ${Number(
        snapshotData.snapshot_payload?.all_service_lines?.reduce(
          (sum, s) => sum + Number(s.service_line_total ?? 0),
          0
        ) || 0
      ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'Pending backend calculation'

  const grandTotalFormatted = snapshotData
    ? `${activeCountry?.currencySymbol || '$'} ${Number(
        snapshotData.total_proposal_contract_reporting_currency ??
          snapshotData.total_proposal_reporting_currency ??
          0
      ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'Pending backend calculation'

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      {/* 1. Top Navigation: Dark navy top header with Pricing & Discounts highlighted */}
      <CatalogueTopNav activeSection="pricing" />

      {/* 2. Commercial Summary Strip */}
      <SummaryStrip
        clientName={clientInfo?.clientName || 'Untitled Proposal'}
        countriesValue={`${summaryCounts.countriesCount} Configured`}
        productLinesValue={`${summaryCounts.totalFamilies} Families (${summaryCounts.totalPacks} Packs, ${summaryCounts.totalFeatures} Features)`}
        pricingFcv={pricingFcvFormatted}
        servicesValue={servicesValueFormatted}
        grandTotal={grandTotalFormatted}
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
            calculationSnapshot={calcApiResult?.data}
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
            calculationSnapshot={calcApiResult?.data}
            isSaving={isSaving}
            isCalculating={isCalculating}
            onSavePrototype={handleSavePricing}
            onRecalculate={handleRecalculate}
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
