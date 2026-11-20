import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom'
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  ArrowLeft,
  DollarSign,
  AlertCircle,
  Send,
  Building2,
  Users,
  RotateCcw,
  History,
  FileCheck,
  TrendingDown,
  Layers,
  Check,
  X,
  ExternalLink,
} from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { SummaryMetricCard } from './components/SummaryMetricCard'
import { useProposal, getStoredProposalId, persistProposalId } from '../../context/ProposalContext'
import {
  getProposalReadiness,
  getProposalApprovalRoute,
  getProposalActivity,
  submitProposalForApproval,
  decideProposalApproval,
  recallProposalSubmission,
  listProposals,
} from '../../api/proposalsApi'
import { getMyApprovalAction } from '../../api/approvalsApi'
import { DecisionPanel } from '../approvals/components/DecisionPanel'
import { RouteTimeline } from '../approvals/components/RouteTimeline'
import { BreachTable } from '../approvals/components/BreachTable'

/** A configured percentage, or 'Not configured' when the Admin has not set it (no assumed value). */
function pctOrNotConfigured(value) {
  return value === null || value === undefined ? 'Not configured' : `${Number(value).toFixed(1)}%`
}

export function ProposalReviewSubmitPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const proposalIdParam = searchParams.get('proposalId')
  const { clientInfo, setClientInfo } = useProposal()

  // Determine proposal ID from: URL search params -> router location state -> context -> session storage
  const resolveInitialProposalId = () => {
    if (proposalIdParam && !isNaN(proposalIdParam)) return Number(proposalIdParam)
    if (location.state?.proposalId && !isNaN(location.state.proposalId)) return Number(location.state.proposalId)
    if (clientInfo?.proposalId && !isNaN(clientInfo.proposalId)) return Number(clientInfo.proposalId)
    const stored = getStoredProposalId()
    if (stored && !isNaN(stored)) return Number(stored)
    return null
  }

  const [activeProposalId, setActiveProposalId] = useState(resolveInitialProposalId)
  const proposalId = activeProposalId

  // Backend state
  const [readiness, setReadiness] = useState(null)
  const [approvalRoute, setApprovalRoute] = useState(null)
  const [routeError, setRouteError] = useState(null)
  const [activityLogs, setActivityLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Sync when URL query parameter updates
  useEffect(() => {
    if (proposalIdParam && !isNaN(proposalIdParam)) {
      const numParam = Number(proposalIdParam)
      if (numParam !== activeProposalId) {
        setActiveProposalId(numParam)
      }
    }
  }, [proposalIdParam, activeProposalId])

  // Discover latest active proposal from backend if no ID is stored in memory or URL
  useEffect(() => {
    let isMounted = true

    async function discoverActiveProposal() {
      if (activeProposalId) return
      try {
        setIsLoading(true)
        const proposals = await listProposals({ limit: 1 })
        if (isMounted && Array.isArray(proposals) && proposals.length > 0) {
          const latestId = proposals[0].id
          setActiveProposalId(latestId)
          persistProposalId(latestId)
          if (typeof setClientInfo === 'function') {
            setClientInfo((prev) => ({ ...prev, proposalId: latestId }))
          }
          if (navigate) {
            navigate(`?proposalId=${latestId}`, { replace: true })
          }
        } else {
          if (isMounted) setIsLoading(false)
        }
      } catch (err) {
        if (isMounted) setIsLoading(false)
      }
    }

    if (!activeProposalId) {
      discoverActiveProposal()
    }

    return () => {
      isMounted = false
    }
  }, [activeProposalId, setClientInfo, navigate])

  // Synchronize active proposal ID to context, session storage, and URL search params
  useEffect(() => {
    if (activeProposalId) {
      persistProposalId(activeProposalId)
      if (String(clientInfo?.proposalId) !== String(activeProposalId) && typeof setClientInfo === 'function') {
        setClientInfo((prev) => ({ ...prev, proposalId: Number(activeProposalId) }))
      }
      if (!proposalIdParam && setSearchParams) {
        setSearchParams({ proposalId: String(activeProposalId) }, { replace: true })
      }
    }
  }, [activeProposalId, proposalIdParam, clientInfo?.proposalId, setClientInfo, setSearchParams])

  // Submission form state
  const [approverNotes, setApproverNotes] = useState('')
  const [notifyApprovers, setNotifyApprovers] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionSuccess, setSubmissionSuccess] = useState(null)

  // Recall & Approval decision modal / action state
  const [isRecalling, setIsRecalling] = useState(false)
  const [myAction, setMyAction] = useState(null)
  const [isProcessingDecision, setIsProcessingDecision] = useState(false)
  const [decisionNotice, setDecisionNotice] = useState('')

  // Data fetching helper
  const loadData = useCallback(async () => {
    if (!proposalId) {
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      // Each call settles on its own: a slow or failing route, history or action query must not
      // blank the whole page. Only readiness (the page's core) is required.
      const [readinessRes, routeRes, activityRes, actionRes] = await Promise.allSettled([
        getProposalReadiness(proposalId),
        getProposalApprovalRoute(proposalId),
        getProposalActivity(proposalId),
        getMyApprovalAction(proposalId),
      ])
      if (readinessRes.status === 'rejected') throw readinessRes.reason

      setReadiness(readinessRes.value)
      setApprovalRoute(routeRes.status === 'fulfilled' ? routeRes.value : null)
      setRouteError(
        routeRes.status === 'rejected'
          ? routeRes.reason?.response?.data?.detail || routeRes.reason?.message || 'The approval route could not be loaded.'
          : null,
      )
      setActivityLogs(activityRes.status === 'fulfilled' ? activityRes.value || [] : [])
      setMyAction(actionRes.status === 'fulfilled' ? actionRes.value : null)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load proposal governance details.')
    } finally {
      setIsLoading(false)
    }
  }, [proposalId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle submit action
  const handleSubmit = async () => {
    if (!proposalId) return
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await submitProposalForApproval(proposalId, {
        actingUserId: 1,
        notes: approverNotes,
      })

      setSubmissionSuccess(res)
      await loadData()
    } catch (err) {
      const detail = err.response?.data?.detail
      if (typeof detail === 'object' && detail?.missing_items) {
        setError(`Cannot submit proposal. Incomplete items: ${detail.missing_items.join(', ')}`)
      } else {
        setError(typeof detail === 'string' ? detail : err.message || 'Submission failed.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle recall action
  const handleRecall = async () => {
    if (!proposalId) return
    if (!window.confirm('Are you sure you want to recall this proposal back to draft status?')) {
      return
    }

    setIsRecalling(true)
    setError(null)

    try {
      await recallProposalSubmission(proposalId, {
        reason: 'Recalled by author from governance review',
        actingUserId: 1,
      })
      setSubmissionSuccess(null)
      await loadData()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Recall failed.')
    } finally {
      setIsRecalling(false)
    }
  }

  // Handle approver decision
  const handleDecide = async (decision, notes) => {
    if (!myAction?.approval_id || !proposalId) return
    setIsProcessingDecision(true)
    setError(null)
    setDecisionNotice('')

    try {
      await decideProposalApproval(proposalId, myAction.approval_id, {
        decision,
        notes,
      })
      setDecisionNotice(decision === 'approved' ? 'Stage approved successfully.' : 'Proposal returned to Sales.')
      await loadData()
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Approval action failed.')
    } finally {
      setIsProcessingDecision(false)
    }
  }

  const isProposalSubmitted =
    readiness?.status === 'under_review' ||
    readiness?.status === 'submitted' ||
    readiness?.status === 'approved' ||
    readiness?.status === 'rejected' ||
    Boolean(submissionSuccess)

  // Format currency helpers
  const currency = readiness?.commercials?.currency || readiness?.currency || 'USD'
  const netTotal = readiness?.commercials?.net_total ?? 0
  const grossTotal = readiness?.commercials?.gross_total ?? 0
  const effectiveDiscount = readiness?.commercials?.effective_discount_pct ?? 0
  const discountBreachesCount = readiness?.commercials?.discount_breaches_count ?? 0

  const formatAmount = (amt) => {
    if (amt === null || amt === undefined) return '0.00'
    return Number(amt).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F8FAFC] text-slate-800 font-sans">
      <CatalogueTopNav activeSection="review" />

      <div className="flex-1 overflow-y-auto min-h-0 bg-[#F8FAFC]">
        <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-24">
          {/* Top Header Card */}
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-bold text-orange-600">
                  Step 6 of 6 · Governance Review
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                  Review Proposal & Submit for Approval
                </h1>
                <p className="text-[13px] text-slate-500 mt-1">
                  Verify completeness across all six workflow steps, review authoritative calculations, and route through automated commercial governance.
                </p>
              </div>

              {/* Proposal Code & Version Badge */}
              {readiness && (
                <div className="flex items-center gap-2">
                  <div className="px-3.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[12px] font-mono shadow-2xs">
                    <span className="text-slate-500 font-medium">Proposal: </span>
                    <span className="font-bold text-slate-900">{readiness.proposal_code}</span>
                    <span className="text-orange-600 font-semibold ml-1.5">(v{readiness.version_no})</span>
                  </div>
                </div>
              )}
            </div>

            {/* Dynamic Proposal Overview Strip */}
            {readiness && (
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Customer</span>
                  <span className="font-bold text-slate-800 truncate block mt-0.5" title={readiness.customer_name}>
                    {readiness.customer_name || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Deal Name</span>
                  <span className="font-bold text-slate-800 truncate block mt-0.5" title={readiness.deal_name}>
                    {readiness.deal_name || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Region / Deployment</span>
                  <span className="font-bold text-slate-800 block mt-0.5">
                    {readiness.region || 'Global'}
                    {readiness.primary_country && readiness.primary_country !== '—' ? ` (${readiness.primary_country})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Proposal Status</span>
                  <div className="mt-0.5">
                    <span
                      className={`inline-block px-2.5 py-0.5 text-[11px] font-bold rounded-full capitalize ${
                        readiness.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : readiness.status === 'under_review' || readiness.status === 'submitted'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : readiness.status === 'rejected'
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {readiness.status?.replace('_', ' ') || 'Draft'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Loading Indicator */}
          {isLoading && (
            <div className="bg-white rounded-xl p-10 border border-slate-200 shadow-2xs flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
              <div className="text-[14px] font-bold text-slate-800">Evaluating Proposal Governance &amp; Readiness…</div>
              <p className="text-[12px] text-slate-500 max-w-md">
                Checking 8-point workflow criteria, commercial calculation engine snapshots, and multi-tier approval routing.
              </p>
            </div>
          )}

          {/* Load Error Banner */}
          {!isLoading && error && proposalId && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 text-rose-950 flex items-start justify-between gap-4 shadow-2xs">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-900 text-sm">Failed to load proposal governance details</div>
                  <p className="text-[13px] text-rose-800 mt-1 leading-relaxed">{error}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="px-3.5 py-1.5 bg-white border border-rose-300 hover:bg-rose-50 text-rose-800 text-[12px] font-semibold rounded-lg shrink-0 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {/* Missing Proposal Warning (Only shown when genuinely no proposal exists) */}
          {!isLoading && !error && !proposalId && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-[13px] text-amber-900 flex items-start gap-3 shadow-2xs">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-950 text-base">No active proposal selected</div>
                <p className="mt-1 text-amber-800 leading-relaxed">
                  No active proposal is open in the current workflow. Please import a deal or configure a proposal to review completeness and trigger governance approval.
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <Link
                    to="/proposals/import"
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg shadow-2xs text-[12px] inline-flex items-center gap-1.5 transition-colors"
                  >
                    Import from HubSpot
                  </Link>
                  <Link
                    to="/calculator"
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg shadow-2xs text-[12px] inline-flex items-center gap-1.5 transition-colors"
                  >
                    Go to Configurator
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Submitted Banner */}
          {isProposalSubmitted && (
            <div
              className={`rounded-xl p-5 border flex items-start justify-between gap-4 shadow-2xs ${
                readiness?.status === 'approved'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : readiness?.status === 'rejected'
                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                  : 'bg-amber-50/70 border-amber-200 text-amber-950'
              }`}
            >
              <div className="flex items-start gap-3">
                {readiness?.status === 'approved' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                ) : readiness?.status === 'rejected' ? (
                  <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <Clock className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-base font-bold">
                    {readiness?.status === 'approved'
                      ? 'Proposal Formally Approved'
                      : readiness?.status === 'rejected'
                      ? 'Proposal Approval Returned / Rejected'
                      : approvalRoute?.current_stage
                      ? `In approval — awaiting ${approvalRoute.current_stage.stage_label}${approvalRoute.current_stage.assigned_user_name ? ` (${approvalRoute.current_stage.assigned_user_name})` : ''}`
                      : 'Proposal Under Governance Review'}
                  </div>
                  <p className="text-[13px] text-slate-600 mt-1 leading-relaxed">
                    {readiness?.status === 'approved'
                      ? 'All required multi-tier governance gates have approved this proposal. It is now ready for formal customer contracting.'
                      : readiness?.status === 'rejected'
                      ? 'One or more governance approvers have rejected or returned this proposal. You may review the decision feedback notes below, edit the configuration, and resubmit.'
                      : 'Proposal version is currently locked in under_review status awaiting multi-level signoff.'}
                  </p>
                </div>
              </div>

              {(readiness?.status === 'under_review' || readiness?.status === 'submitted') && (
                <button
                  type="button"
                  onClick={handleRecall}
                  disabled={isRecalling}
                  className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg shrink-0 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {isRecalling ? 'Recalling...' : 'Recall to Draft'}
                </button>
              )}
            </div>
          )}

          {/* Authoritative Commercial Summary Card */}
          {readiness?.commercials && (
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-[14px]">
                  <DollarSign className="w-4 h-4 text-orange-600" />
                  Authoritative Commercial Summary
                </div>
                {readiness.commercials.snapshot_id ? (
                  <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                    Engine Snapshot #{readiness.commercials.snapshot_id}
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Preliminary Draft Commercials
                  </span>
                )}
              </div>

              {/* Commercial Summary Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryMetricCard
                  title="Proposal Value (Net)"
                  value={`${currency} ${formatAmount(netTotal)}`}
                  subtitle="Contract Net After Discounts"
                  icon={DollarSign}
                  colorVariant="emerald"
                  currencyCode={currency}
                />

                <SummaryMetricCard
                  title="List Value (Gross)"
                  value={`${currency} ${formatAmount(grossTotal)}`}
                  subtitle="Base Rate Card Contract Total"
                  icon={Layers}
                  colorVariant="slate"
                  currencyCode={currency}
                />

                <SummaryMetricCard
                  title="Effective Discount"
                  value={`${effectiveDiscount.toFixed(1)}%`}
                  subtitle={
                    readiness?.discount_policy?.proposal_level
                      ? `Policy Ceiling: ${pctOrNotConfigured(readiness.discount_policy.proposal_level.ceiling_pct)}`
                      : 'Contract Weighted'
                  }
                  icon={TrendingDown}
                  colorVariant={readiness?.discount_policy?.proposal_level?.is_breached ? 'orange' : 'slate'}
                />

                <SummaryMetricCard
                  title="Discount Breaches"
                  value={`${discountBreachesCount} ${discountBreachesCount === 1 ? 'Breach' : 'Breaches'}`}
                  subtitle={
                    discountBreachesCount === 0
                      ? 'Compliant with Policy Ceilings'
                      : 'Escalation Approval Required'
                  }
                  icon={ShieldCheck}
                  colorVariant={discountBreachesCount === 0 ? 'emerald' : 'orange'}
                />
              </div>
            </div>
          )}

          {/* Two-Column Grid: Left (Checklist & Discount Policy) + Right (Approval Route & Actions & Timeline) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (7 cols): Readiness Checklist & Discount Policy Check */}
            <div className="lg:col-span-7 space-y-6">
              {/* 8-Point Readiness Checklist Card */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <div className="text-slate-900 font-bold text-[14px] flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      Readiness & Completeness Checklist
                    </div>
                    <div className="text-[12px] text-slate-500 mt-0.5">
                      All eight governance and commercial criteria must be fulfilled to enable submission.
                    </div>
                  </div>

                  {readiness && (
                    <span
                      className={`text-[12px] font-bold px-3 py-1 rounded-full ${
                        readiness.is_ready
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {readiness.completed_count} / {readiness.total_count} Verified
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                {readiness && (
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        readiness.is_ready ? 'bg-emerald-600' : 'bg-orange-500'
                      }`}
                      style={{ width: `${readiness.readiness_percentage}%` }}
                    />
                  </div>
                )}

                {/* Checklist Items */}
                <div className="space-y-2.5 pt-1">
                  {(readiness?.checklist || []).map((item) => (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${
                        item.is_complete
                          ? 'bg-slate-50/60 border-slate-200'
                          : 'bg-amber-50/40 border-amber-200 hover:bg-amber-50/60'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0 pr-3">
                        {item.is_complete ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[13px] font-bold ${
                                item.is_complete ? 'text-slate-800' : 'text-amber-950'
                              }`}
                            >
                              {item.label}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.2 rounded ${
                                item.is_complete
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.is_complete ? 'Complete' : 'Incomplete'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{item.details}</div>
                        </div>
                      </div>

                      {/* Open Action */}
                      {item.step_route && (
                        <Link
                          to={`${item.step_route}${item.step_route.includes('?') ? '&' : '?'}proposalId=${proposalId}`}
                          className={`px-3 py-1 font-semibold text-[11px] rounded-lg transition-colors shadow-2xs shrink-0 flex items-center gap-1 cursor-pointer ${
                            item.is_complete
                              ? 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'
                              : 'bg-orange-600 hover:bg-orange-700 text-white'
                          }`}
                        >
                          {item.is_complete ? 'Open' : 'Fix Now'}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Discount Policy Check Card */}
              {readiness?.discount_policy && (
                <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <div className="text-slate-900 font-bold text-[14px] flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-orange-600" />
                        Discount Policy Check & Governance Thresholds
                      </div>
                      <div className="text-[12px] text-slate-500 mt-0.5">
                        Evaluated dynamically against configured master approval thresholds in the database.
                      </div>
                    </div>

                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        readiness.discount_policy.breaches_count === 0
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {readiness.discount_policy.breaches_count === 0
                        ? 'Policy Compliant'
                        : `${readiness.discount_policy.breaches_count} Breach(es) Found`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                    {/* Line-Level Policy */}
                    {readiness.discount_policy.line_level && (
                      <div
                        className={`p-3.5 rounded-xl border ${
                          readiness.discount_policy.line_level.is_breached
                            ? 'bg-rose-50/40 border-rose-200'
                            : 'bg-slate-50/60 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">Line-Level Discount Policy</span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              readiness.discount_policy.line_level.is_breached
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {readiness.discount_policy.line_level.is_breached ? 'Breached' : 'Compliant'}
                          </span>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-600 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Max Line Discount:</span>
                            <span className="font-mono font-bold text-slate-900">
                              {readiness.discount_policy.line_level.actual_pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Configured Ceiling:</span>
                            <span className="font-mono text-slate-700">
                              {pctOrNotConfigured(readiness.discount_policy.line_level.ceiling_pct)}
                            </span>
                          </div>
                          {readiness.discount_policy.line_level.is_breached && readiness.discount_policy.line_level.required_role && (
                            <div className="pt-1 text-[11px] text-rose-700 font-medium">
                              Requires {readiness.discount_policy.line_level.required_role} approval
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Proposal-Level Policy */}
                    {readiness.discount_policy.proposal_level && (
                      <div
                        className={`p-3.5 rounded-xl border ${
                          readiness.discount_policy.proposal_level.is_breached
                            ? 'bg-rose-50/40 border-rose-200'
                            : 'bg-slate-50/60 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">Proposal-Level Discount Policy</span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              readiness.discount_policy.proposal_level.is_breached
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {readiness.discount_policy.proposal_level.is_breached ? 'Breached' : 'Compliant'}
                          </span>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-600 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Actual Overall Discount:</span>
                            <span className="font-mono font-bold text-slate-900">
                              {readiness.discount_policy.proposal_level.actual_pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Configured Ceiling:</span>
                            <span className="font-mono text-slate-700">
                              {pctOrNotConfigured(readiness.discount_policy.proposal_level.ceiling_pct)}
                            </span>
                          </div>
                          {readiness.discount_policy.proposal_level.is_breached && readiness.discount_policy.proposal_level.required_role && (
                            <div className="pt-1 text-[11px] text-rose-700 font-medium">
                              Requires {readiness.discount_policy.proposal_level.required_role} approval
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* List of Breaches if any */}
                  {readiness.discount_policy.breaches?.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-950">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        Triggered Approval Governance Requirements:
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-amber-800 text-[11px] pl-1">
                        {readiness.discount_policy.breaches.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column (5 cols): Dynamic Approval Route, Submit Form, and Activity History */}
            <div className="lg:col-span-5 space-y-6">
              {/* Decision Panel if user has authority to decide open stage */}
              {myAction?.can_decide && myAction.approval_id && (
                <DecisionPanel action={myAction} onDecide={handleDecide} busy={isProcessingDecision} />
              )}
              {decisionNotice && (
                <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800 font-medium">
                  {decisionNotice}
                </div>
              )}

              {/* Dynamic Approval Chain Stepper */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-[14px]">
                    <ShieldCheck className="w-4 h-4 text-orange-600" />
                    Governance Approval Route
                  </div>
                  <span className="text-[11px] text-slate-500">Policy Engine</span>
                </div>

                {routeError && (
                  <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900" role="status">
                    {typeof routeError === 'string' ? routeError : 'The approval route could not be loaded.'} The rest of the page is up to date; reload to try again.
                  </div>
                )}
                {approvalRoute?.configuration_issues?.length > 0 && (
                  <div role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
                    <div className="font-semibold">Approval workflow not fully configured — submission is blocked</div>
                    <ul className="mt-1 list-disc pl-5">
                      {approvalRoute.configuration_issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {approvalRoute?.approval_stages && (
                  <div className="space-y-4 pt-1">
                    {approvalRoute.approval_stages.map((stage, idx) => {
                      const isLast = idx === approvalRoute.approval_stages.length - 1
                      return (
                        <div key={stage.role_id || idx} className="relative flex items-start gap-3.5">
                          {/* Connecting Line */}
                          {!isLast && (
                            <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-slate-200 -mb-4" />
                          )}

                          {/* Node Circle */}
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[12px] shrink-0 z-10 ${
                              stage.status === 'approved'
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : stage.status === 'rejected'
                                ? 'bg-rose-600 text-white shadow-2xs'
                                : stage.is_required
                                ? 'bg-orange-50 border-2 border-orange-600 text-orange-700'
                                : 'bg-slate-100 border border-slate-200 text-slate-400'
                            }`}
                          >
                            {stage.status === 'approved' ? (
                              <Check className="w-4 h-4" strokeWidth={3} />
                            ) : stage.status === 'rejected' ? (
                              <X className="w-4 h-4" strokeWidth={3} />
                            ) : (
                              stage.stage_level
                            )}
                          </div>

                          {/* Stage Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-[13px] font-bold text-slate-900">
                                {stage.role_name}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize ${
                                  stage.status === 'approved'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : stage.status === 'rejected'
                                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                    : stage.status === 'pending'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : stage.is_required
                                    ? 'bg-slate-100 text-slate-700'
                                    : 'bg-slate-50 text-slate-400'
                                }`}
                              >
                                {stage.status?.replace('_', ' ') || 'Pending'}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                              {stage.reason}
                            </div>

                            {stage.assigned_user_name && (
                              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                                <Users className="w-3 h-3 text-slate-400" />
                                <span>{stage.assigned_user_name}</span>
                                {stage.region && stage.region !== 'Global' && (
                                  <span className="text-slate-400">· {stage.region}</span>
                                )}
                              </div>
                            )}

                            {stage.decision_notes && (
                              <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-700 font-mono">
                                "{stage.decision_notes}"
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Submission Form Card (If not yet submitted) */}
              {!isProposalSubmitted && (
                <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-4">
                  <div className="text-slate-900 font-bold text-[14px]">
                    Submit for Approval
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Notes to Approvers (Business Justification)
                    </label>
                    <textarea
                      rows={3}
                      value={approverNotes}
                      onChange={(e) => setApproverNotes(e.target.value)}
                      placeholder="Provide deal context, competitive pressure, or commercial discount justification..."
                      className="w-full p-3 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 shadow-2xs"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="notifyApprovers"
                      checked={notifyApprovers}
                      onChange={(e) => setNotifyApprovers(e.target.checked)}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                    />
                    <label htmlFor="notifyApprovers" className="text-[12px] text-slate-700 cursor-pointer">
                      Notify required approvers via email and dashboard alert
                    </label>
                  </div>

                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-[12px] text-rose-800">
                      {error}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!readiness?.is_ready || isSubmitting}
                    className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-lg text-[14px] transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Clock className="w-4 h-4 animate-spin" />
                        Submitting for Governance Review...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Submit for Approval
                      </>
                    )}
                  </button>

                  {!readiness?.is_ready && (
                    <p className="text-[11px] text-amber-700 text-center font-medium">
                      Submit is disabled until all 8 checklist criteria are fulfilled.
                    </p>
                  )}
                </div>
              )}

              {/* Activity Timeline Card */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-[14px]">
                    <History className="w-4 h-4 text-orange-600" />
                    Activity History & Audit Trail
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {activityLogs.length} Events
                  </span>
                </div>

                <div className="space-y-3 pt-1 max-h-96 overflow-y-auto pr-1">
                  {activityLogs.length === 0 ? (
                    <div className="text-[12px] text-slate-400 text-center py-4">
                      No audit events recorded yet.
                    </div>
                  ) : (
                    activityLogs.map((log) => {
                      const dt = log.occurred_at ? new Date(log.occurred_at) : null
                      const formattedTime = dt
                        ? dt.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'

                      return (
                        <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[12px] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">{log.title || log.action}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{formattedTime}</span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            By <span className="font-semibold text-slate-700">{log.actor_name || 'System'}</span>
                            {log.actor_email && <span className="text-slate-400"> ({log.actor_email})</span>}
                          </div>
                          {log.after?.notes && (
                            <div className="text-[11px] text-slate-600 font-mono bg-white p-1.5 rounded border border-slate-200 mt-1">
                              "{log.after.notes}"
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Navigation */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(`/proposals${proposalId ? `?proposalId=${proposalId}` : ''}`)}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-2xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous: Proposal Summary
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}

export default ProposalReviewSubmitPage
