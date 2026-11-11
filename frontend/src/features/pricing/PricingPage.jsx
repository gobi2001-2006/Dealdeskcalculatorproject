import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
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
import { CalculationNotices } from '../../components/common/CalculationNotices'
import { useProposal } from '../../context/ProposalContext'
import {
  getProposal,
  calculateProposal,
  getLatestCalculation,
  updateProposalLineItem,
  lineTargetKey,
  lineCountryIdOf,
  describeApiError,
} from '../../api/proposalsApi'
import { deserializeBackendProposal } from '../calculator/calculatorData'
import { buildCatalogueLookup, loadCatalogueMasters } from '../../utils/catalogueLookup'
import {
  formatMoney,
  readCalculationTotals,
  uniformProductDiscount,
  validateDiscountPct,
} from '../../utils/calculationView'

function draftVersionOf(detail) {
  return (detail?.versions || []).filter((v) => v.status === 'draft').sort((a, b) => b.version_no - a.version_no)[0] || null
}

/** Country + target keys of saved lines or calculated lines (both carry country_id). */
function targetKeysOf(lines) {
  return new Set(
    (lines || []).map((li) =>
      lineTargetKey({ packVersionId: li.pack_version_id, featureId: li.feature_id, countryId: li.country_id }),
    ),
  )
}

/** Product-level discounts for the calculation request, keyed by the product keys in `calcData`. */
function productDiscounts(calcData, overallPct, servicePct) {
  const product_subscription_discounts = {}
  const product_service_discounts = {}
  ;(calcData?.snapshot_payload?.products || []).forEach((p) => {
    // "<code>@<country>" when a product is sold in more than one country; older snapshots have only product_code.
    const key = p.product_key || p.product_code
    if (overallPct > 0 && Number(p.subscription_subtotal_before_discount) > 0) {
      product_subscription_discounts[key] = overallPct
    }
    if (servicePct > 0 && Number(p.service_subtotal_before_discount) > 0) {
      product_service_discounts[key] = servicePct
    }
  })
  return { product_subscription_discounts, product_service_discounts }
}

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
    setLineItemDiscounts,
    updateLineItemDiscount,
    overallDiscounts,
    setOverallDiscounts,
    serviceDiscounts,
    setServiceDiscounts,
    approvalPolicies,
    calcApiResult,
    setCalcApiResult,
  } = useProposal()

  const [searchParams] = useSearchParams()
  const urlProposalId = searchParams?.get('proposalId')
  const effectiveProposalId = urlProposalId || clientInfo?.proposalId || null

  const [catalogue, setCatalogue] = useState({ families: [], packs: [], features: [], products: [], countries: [], loadErrors: [] })
  const lookup = useMemo(() => buildCatalogueLookup(catalogue), [catalogue])
  const [savedLineItems, setSavedLineItems] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [isSaving, setIsSaving] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg)
    setToastType(type)
    setTimeout(() => setToastMessage(''), 6000)
  }

  // Load the catalogue, the saved proposal and its latest calculation snapshot.
  useEffect(() => {
    let isMounted = true

    async function load() {
      const masters = await loadCatalogueMasters()
      if (!isMounted) return
      setCatalogue(masters)
      if (!effectiveProposalId) return

      try {
        const detail = await getProposal(effectiveProposalId)
        let latest = null
        try {
          latest = await getLatestCalculation(effectiveProposalId)
        } catch (err) {
          if (err.response?.status !== 404) throw err
        }
        if (!isMounted) return

        const restored = deserializeBackendProposal(detail, { masters, latestCalc: latest })
        if (String(clientInfo?.proposalId) !== String(effectiveProposalId) || countryConfigs.length === 0) {
          setClientInfo(restored.clientInfo)
          setCountryConfigs(restored.countryConfigs)
          if (restored.countryConfigs[0]) setFocusedCountryId(restored.countryConfigs[0].id)
        }
        setSavedLineItems(restored.lineItems)
        // Line discounts come from the saved line items (reasons are screen-only).
        setLineItemDiscounts((prev) => {
          const next = {}
          Object.entries(restored.lineDiscountsByTarget).forEach(([key, pct]) => {
            next[key] = { value: String(pct), reason: prev[key]?.reason || '' }
          })
          return next
        })
        if (latest) {
          setCalcApiResult({ status: 'success', proposalId: effectiveProposalId, data: latest, isBackendCalculation: true })
          // Product-level discounts are recorded on the snapshot.
          const overall = uniformProductDiscount(latest, 'subscription_discount_pct')
          const service = uniformProductDiscount(latest, 'service_discount_pct')
          setOverallDiscounts((prev) => ({ proposal: { value: overall.value, reason: prev.proposal?.reason || '' } }))
          setServiceDiscounts((prev) => ({ proposal: { value: service.value, reason: prev.proposal?.reason || '' } }))
          if (overall.mixed || service.mixed) {
            showToast('The last calculation used different discounts per product; recalculating applies one value to all products.', 'warning')
          }
        } else {
          setCalcApiResult(null)
        }
        setLoadError('')
      } catch (err) {
        if (isMounted) setLoadError(`Could not load proposal #${effectiveProposalId}: ${describeApiError(err)}`)
      }
    }

    load()
    return () => {
      isMounted = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveProposalId])

  const activeCountry = useMemo(() => {
    if (!countryConfigs || countryConfigs.length === 0) return null
    return countryConfigs.find((c) => c.id === focusedCountryId) || countryConfigs[0]
  }, [countryConfigs, focusedCountryId])
  const isPrimary = Boolean(activeCountry && countryConfigs[0] && activeCountry.id === countryConfigs[0].id)

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
    return { countriesCount: countryConfigs?.length || 0, totalFamilies, totalPacks, totalFeatures }
  }, [countryConfigs])

  const overall = overallDiscounts.proposal || { value: '', reason: '' }
  const service = serviceDiscounts.proposal || { value: '', reason: '' }

  // Save line discounts, then recalculate with the product-level discounts.
  const handleSavePricing = async () => {
    if (!effectiveProposalId) {
      showToast('Save the proposal on the Proposal Configurator first; discounts are applied to a saved proposal.', 'warning')
      return
    }
    const invalid =
      Object.values(lineItemDiscounts).some((d) => validateDiscountPct(d?.value)) ||
      validateDiscountPct(overall.value) ||
      validateDiscountPct(service.value)
    if (invalid) {
      showToast('Please fix invalid discount values (0% to 100%) before saving.', 'error')
      return
    }
    const term = Number(countryConfigs?.[0]?.contractTerm ?? calcApiResult?.data?.contract_term_months)
    if (!Number.isInteger(term) || term <= 0) {
      showToast('Set the contract term (months) on the Proposal Configurator before calculating.', 'error')
      return
    }

    setIsSaving(true)
    try {
      // 1. Line discounts are stored on the proposal line items.
      const detail = await getProposal(effectiveProposalId)
      const lines = (draftVersionOf(detail)?.line_items || []).map((li) => ({
        ...li,
        country_id: lineCountryIdOf(li, detail.countries),
      }))
      for (const li of lines) {
        const key = lineTargetKey({ packVersionId: li.pack_version_id, featureId: li.feature_id, countryId: li.country_id })
        const raw = lineItemDiscounts[key]?.value
        const wanted = raw === '' || raw === undefined || raw === null ? null : Number(raw)
        const current = li.discount_pct === null || li.discount_pct === undefined ? null : Number(li.discount_pct)
        if ((wanted || 0) !== (current || 0)) {
          await updateProposalLineItem(effectiveProposalId, li.id, { discount_pct: wanted })
        }
      }

      // 2. Product-level discounts are keyed by product code, taken from a calculation of the
      //    same set of lines. If the lines changed since the last snapshot, price once to learn them.
      const overallPct = Number(overall.value) || 0
      const servicePct = Number(service.value) || 0
      let codesFrom = calcApiResult?.data
      // Snapshots written before multi-region support have no country on their lines: they were
      // priced in the primary country, which lineCountryIdOf falls back to.
      const snapshotKeys = targetKeysOf(
        (codesFrom?.snapshot_payload?.all_subscription_line_items || []).map((li) => ({
          ...li,
          country_id: lineCountryIdOf(li, detail.countries),
        })),
      )
      const currentKeys = targetKeysOf(lines)
      const sameLines = snapshotKeys.size === currentKeys.size && [...currentKeys].every((k) => snapshotKeys.has(k))
      if ((overallPct > 0 || servicePct > 0) && !sameLines) {
        codesFrom = await calculateProposal(effectiveProposalId, { contract_term_months: term })
      }

      const result = await calculateProposal(effectiveProposalId, {
        ...productDiscounts(codesFrom, overallPct, servicePct),
        contract_term_months: term,
      })
      setCalcApiResult({ status: 'success', proposalId: effectiveProposalId, data: result, isBackendCalculation: true })
      setSavedLineItems(lines)
      showToast(`Discounts saved and proposal recalculated (snapshot #${result.snapshot_id}).`, 'success')
    } catch (err) {
      showToast(describeApiError(err, 'Failed to save discounts and recalculate.'), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const totals = calcApiResult?.status === 'success' ? readCalculationTotals(calcApiResult.data) : null
  const pending = 'Pending calculation'

  return (
    <div className="h-screen w-full flex flex-col bg-slate-100 overflow-hidden text-slate-800 antialiased font-sans">
      <CatalogueTopNav activeSection="pricing" />

      <SummaryStrip
        clientName={clientInfo?.clientName || 'Untitled Proposal'}
        countriesValue={`${summaryCounts.countriesCount} Configured`}
        productLinesValue={`${summaryCounts.totalFamilies} Families (${summaryCounts.totalPacks} Packs, ${summaryCounts.totalFeatures} Features)`}
        pricingFcv={totals ? formatMoney(totals.subscriptionContract, totals.currency) : pending}
        servicesValue={totals ? formatMoney(totals.services, totals.currency) : pending}
        grandTotal={totals ? formatMoney(totals.contractTotal, totals.currency) : pending}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 sm:px-6 py-2.5 text-[11px] font-medium flex items-center justify-between border-b transition-all shrink-0 ${
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

      {(loadError || catalogue.loadErrors.length > 0 || !effectiveProposalId) && (
        <div role="alert" className="px-4 sm:px-6 py-2.5 text-[11px] border-b bg-amber-50 text-amber-900 border-amber-200 space-y-0.5">
          {!effectiveProposalId && (
            <div>
              No saved proposal is open. <Link className="underline font-semibold" to="/calculator">Configure and save a proposal</Link> first.
            </div>
          )}
          {loadError && <div>{loadError}</div>}
          {catalogue.loadErrors.map((e) => (
            <div key={e}>Could not load {e}</div>
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#F8FAFC]">
        <IncludedProductsSidebar
          lookup={lookup}
          countryConfigs={countryConfigs || []}
          focusedCountryId={focusedCountryId || countryConfigs?.[0]?.id}
          focusedFamilyId={focusedFamilyId}
          onSelectCountry={(cId) => setFocusedCountryId(cId)}
          onSelectFamily={(fId) => setFocusedFamilyId(fId)}
        />

        <main className="flex-1 flex flex-col overflow-y-auto" aria-label="Pricing and Discounts Main Editor">
          <PricingEditor
            countryConfig={activeCountry}
            isPrimary={isPrimary}
            primaryCountryId={countryConfigs?.[0]?.countryId}
            focusedFamilyId={focusedFamilyId}
            lookup={lookup}
            savedLineKeys={savedLineItems ? targetKeysOf(savedLineItems) : null}
            lineItemDiscounts={lineItemDiscounts}
            overallDiscount={overall}
            serviceDiscount={service}
            calculationSnapshot={calcApiResult?.data}
            onUpdateLineDiscount={updateLineItemDiscount}
            onUpdateOverallDiscount={(patch) =>
              setOverallDiscounts((prev) => ({ proposal: { ...(prev.proposal || { value: '', reason: '' }), ...patch } }))
            }
            onUpdateServiceDiscount={(patch) =>
              setServiceDiscounts((prev) => ({ proposal: { ...(prev.proposal || { value: '', reason: '' }), ...patch } }))
            }
          />
        </main>

        <aside
          aria-label="Commercial Summary and Governance Policies"
          className="w-full lg:w-80 xl:w-96 p-4 sm:p-5 border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50/70 shrink-0 overflow-y-auto space-y-5"
        >
          <CalculationNotices totals={totals} />
          <CommercialSummaryCard
            clientInfo={clientInfo}
            calculationSnapshot={calcApiResult?.status === 'success' ? calcApiResult.data : null}
            isSaving={isSaving}
            isCalculating={isSaving}
            onSavePrototype={handleSavePricing}
          />
          <ApprovalPoliciesCard policies={approvalPolicies} />
        </aside>
      </div>
    </div>
  )
}

export default PricingPage
