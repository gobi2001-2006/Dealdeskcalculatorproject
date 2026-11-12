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
  updateProposalCountry,
  lineTargetKey,
  lineCountryIdOf,
  primaryCountryBlock,
  proposalTermMonths,
  describeApiError,
} from '../../api/proposalsApi'
import { yearsToMonths } from '../../utils/contractDuration'
import { deserializeBackendProposal } from '../calculator/calculatorData'
import { getApprovalThresholds } from '../../api/ratesApi'
import { buildCatalogueLookup, loadCatalogueMasters } from '../../utils/catalogueLookup'
import {
  formatMoney,
  readCalculationTotals,
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

// Overall discounts are set per country (business decision 2026-11-06) and stored on each
// country block. Screen state is keyed by the country master id.
const DISCOUNT_KINDS = {
  subscription: { pct: 'subscription_discount_pct', reason: 'subscription_discount_reason', subtotal: 'subscription_subtotal_before_discount' },
  service: { pct: 'service_discount_pct', reason: 'service_discount_reason', subtotal: 'service_subtotal_before_discount' },
}

const toPct = (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? null : Number(v))
const toText = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Each country's stored overall discount. Proposals priced before country-level storage sent the
 * discount with the calculation only: for a country with nothing stored, the % its products got in
 * the latest snapshot is shown (when they all got the same one), and saving stores it on the country.
 */
function countryDiscountsFrom(detail, latest, kind) {
  const f = DISCOUNT_KINDS[kind]
  const primaryCountryId = primaryCountryBlock(detail?.countries)?.country_id
  const products = latest?.snapshot_payload?.products || []
  const out = {}
  ;(detail?.countries || []).forEach((block) => {
    const key = String(block.country_id)
    if (block[f.pct] !== null && block[f.pct] !== undefined) {
      out[key] = { value: String(Number(block[f.pct])), reason: block[f.reason] || '' }
      return
    }
    const pcts = [
      ...new Set(
        products
          .filter((p) => Number(p.country_id ?? primaryCountryId) === Number(block.country_id))
          .filter((p) => Number(p[f.subtotal]) > 0)
          .map((p) => Number(p[f.pct]) || 0),
      ),
    ]
    out[key] = { value: pcts.length === 1 && pcts[0] > 0 ? String(pcts[0]) : '', reason: block[f.reason] || '' }
  })
  return out
}

/** The PATCH body that makes a country block hold the discounts on screen ({} when nothing changed). */
function countryDiscountPatch(block, subscription = {}, service = {}) {
  const patch = {}
  const wanted = { subscription, service }
  Object.entries(DISCOUNT_KINDS).forEach(([kind, f]) => {
    const pct = toPct(wanted[kind].value)
    const stored = block[f.pct] === null || block[f.pct] === undefined ? null : Number(block[f.pct])
    if (pct !== stored) patch[f.pct] = pct
    const reason = toText(wanted[kind].reason)
    if (reason !== (block[f.reason] || null)) patch[f.reason] = reason
  })
  return patch
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
  // Discount state on screen belongs to exactly one proposal: saving is allowed only once that
  // proposal's own saved discounts have loaded (never with another proposal's values).
  const [discountsLoadedFor, setDiscountsLoadedFor] = useState(null)
  // Approval thresholds come from the approval_thresholds table (display only, not enforced).
  const [thresholds, setThresholds] = useState(null)
  const [thresholdError, setThresholdError] = useState('')

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg)
    setToastType(type)
    setTimeout(() => setToastMessage(''), 6000)
  }

  // Load the catalogue, approval thresholds, the saved proposal and its latest calculation snapshot.
  useEffect(() => {
    let isMounted = true

    getApprovalThresholds()
      .then((rows) => isMounted && setThresholds(rows))
      .catch((err) => isMounted && setThresholdError(describeApiError(err)))

    async function load() {
      const masters = await loadCatalogueMasters()
      if (!isMounted) return
      setCatalogue(masters)
      if (!effectiveProposalId) return

      // The shared context still holds the previous proposal's discounts when another one opens:
      // clear them before loading, so nothing (values or screen-only reasons) carries over.
      const sameProposal = String(clientInfo?.proposalId) === String(effectiveProposalId)
      setDiscountsLoadedFor(null)
      if (!sameProposal) {
        setLineItemDiscounts({})
        setOverallDiscounts({})
        setServiceDiscounts({})
      }

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
        // Line discounts come from the saved line items (reasons are screen-only, kept only while
        // the same proposal stays open).
        setLineItemDiscounts((prev) => {
          const next = {}
          Object.entries(restored.lineDiscountsByTarget).forEach(([key, pct]) => {
            next[key] = { value: String(pct), reason: sameProposal ? prev[key]?.reason || '' : '' }
          })
          return next
        })
        // Overall subscription / services discounts are stored on each country block.
        setOverallDiscounts(countryDiscountsFrom(detail, latest, 'subscription'))
        setServiceDiscounts(countryDiscountsFrom(detail, latest, 'service'))

        if (latest) {
          setCalcApiResult({ status: 'success', proposalId: effectiveProposalId, data: latest, isBackendCalculation: true })
        } else {
          setCalcApiResult(null)
        }
        setLoadError('')
        setDiscountsLoadedFor(String(effectiveProposalId))
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

  const emptyDiscount = { value: '', reason: '' }
  const activeKey = activeCountry ? String(activeCountry.countryId) : ''
  const overall = overallDiscounts[activeKey] || emptyDiscount
  const service = serviceDiscounts[activeKey] || emptyDiscount

  // Save line discounts and each country's overall discounts, then recalculate.
  const handleSavePricing = async () => {
    if (!effectiveProposalId) {
      showToast('Save the proposal on the Proposal Configurator first; discounts are applied to a saved proposal.', 'warning')
      return
    }
    if (discountsLoadedFor !== String(effectiveProposalId)) {
      showToast(`The saved discounts of proposal #${effectiveProposalId} have not loaded; reload the page before saving.`, 'error')
      return
    }
    const invalid =
      Object.values(lineItemDiscounts).some((d) => validateDiscountPct(d?.value)) ||
      Object.values(overallDiscounts).some((d) => validateDiscountPct(d?.value)) ||
      Object.values(serviceDiscounts).some((d) => validateDiscountPct(d?.value))
    if (invalid) {
      showToast('Please fix invalid discount values (0% to 100%) before saving.', 'error')
      return
    }
    setIsSaving(true)
    try {
      // 1. Line discounts are stored on the proposal line items.
      const detail = await getProposal(effectiveProposalId)
      // Contract term: saved on the proposal (months); older proposals: the latest calculation's
      // term or the duration on screen. It is sent only when the proposal has none saved.
      const term =
        proposalTermMonths(detail, calcApiResult?.data) ?? yearsToMonths(countryConfigs?.[0]?.contractYears)
      if (!term) {
        showToast('Set the contract duration (years) on the Proposal Configurator before calculating.', 'error')
        return
      }
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

      // 2. Each country's overall subscription / services discount (and justification) is stored
      //    on its country block; the backend applies it to that country's products only.
      for (const block of detail.countries || []) {
        const key = String(block.country_id)
        const patch = countryDiscountPatch(block, overallDiscounts[key], serviceDiscounts[key])
        if (Object.keys(patch).length > 0) {
          await updateProposalCountry(effectiveProposalId, block.id, patch)
        }
      }

      // 3. Recalculate: the backend reads every discount from the saved proposal.
      const result = await calculateProposal(
        effectiveProposalId,
        detail.contract_term_months ? {} : { contract_term_months: term },
      )
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
              setOverallDiscounts((prev) => ({ ...prev, [activeKey]: { ...(prev[activeKey] || emptyDiscount), ...patch } }))
            }
            onUpdateServiceDiscount={(patch) =>
              setServiceDiscounts((prev) => ({ ...prev, [activeKey]: { ...(prev[activeKey] || emptyDiscount), ...patch } }))
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
          <ApprovalPoliciesCard thresholds={thresholds} loadError={thresholdError} />
        </aside>
      </div>
    </div>
  )
}

export default PricingPage
