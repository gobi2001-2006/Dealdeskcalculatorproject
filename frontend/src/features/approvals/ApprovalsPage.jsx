import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, History, Route, ShieldCheck, XCircle } from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { getApprovalInbox, getMyApprovalAction } from '../../api/approvalsApi'
import { DecisionPanel } from './components/DecisionPanel'
import { RouteTimeline } from './components/RouteTimeline'
import { BreachTable } from './components/BreachTable'
import {
  decideProposalApproval,
  getProposalActivity,
  getProposalApprovalRoute,
  getProposalReadiness,
} from '../../api/proposalsApi'

/*
 * Approval Inbox (Phase 3). Every value on this page comes from the API:
 * /approvals/inbox, /approvals/{id}/my-action, /proposals/{id}/approval-route, /readiness and /activity.
 * Decisions use the existing decision endpoint, which enforces permissions, stage order and the
 * comment rule on the server and sends the configured notifications.
 */

const TABS = [
  { key: 'awaiting_me', label: 'Awaiting me', match: (i) => i.awaiting_me, empty: 'No proposals are waiting for you.' },
  { key: 'in_progress', label: 'In progress', match: (i) => i.status === 'submitted', empty: 'No proposal is in approval.' },
  { key: 'completed', label: 'Completed', match: (i) => i.status === 'approved' || i.status === 'rejected', empty: 'No approved or rejected proposals yet.' },
  { key: 'all', label: 'All', match: () => true, empty: 'No proposals yet.' },
]

function errorText(err, fallback) {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail?.message) return detail.message
  return err?.message || fallback
}

function formatMoney(value, currency) {
  if (value === null || value === undefined) return '—'
  if (!currency) return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function waitingFor(iso) {
  if (!iso) return null
  const hours = Math.max(0, (Date.now() - new Date(iso).getTime()) / 36e5)
  return hours < 24 ? `${Math.round(hours)} h` : `${Math.floor(hours / 24)} d`
}

const titleCase = (s) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '')

function StatusPill({ item }) {
  const text = item.current_stage?.stage_label || titleCase(item.status)
  const tone =
    item.status === 'approved'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : item.status === 'rejected'
        ? 'bg-rose-50 text-rose-800 border-rose-200'
        : item.status === 'submitted'
          ? 'bg-amber-50 text-amber-800 border-amber-200'
          : 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
      {text}
    </span>
  )
}

function InboxRow({ item, active, onSelect }) {
  const title = [item.company, item.deal_name].filter(Boolean).join(' — ') || item.proposal_code
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.proposal_id)}
        aria-current={active ? 'true' : undefined}
        className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
          active ? 'bg-emerald-50/70 border-l-4 border-l-emerald-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[14px] font-semibold text-slate-900 leading-snug">{title}</span>
          <StatusPill item={item} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-500">
          <span className="font-mono">{item.proposal_code}</span>
          <span>{item.region}</span>
          <span className="font-mono">{formatMoney(item.net_total, item.currency)}</span>
          {item.breach_count > 0 && (
            <span className="inline-flex items-center gap-1 text-rose-700">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              {item.breach_count} breach{item.breach_count === 1 ? '' : 'es'}
            </span>
          )}
          {item.awaiting_me && item.submitted_at && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <Clock className="w-3 h-3" aria-hidden="true" />
              waiting {waitingFor(item.submitted_at)}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

function Kpi({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-mono font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

function Card({ icon: Icon, title, children, actions }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs">
      <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-100">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          {Icon && <Icon className="w-4 h-4 text-slate-500" aria-hidden="true" />}
          {title}
        </h2>
        {actions}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

function Detail({ item, onDecided }) {
  const pid = item.proposal_id
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([
      getProposalApprovalRoute(pid),
      getProposalReadiness(pid).catch(() => null),
      getProposalActivity(pid).catch(() => []),
      getMyApprovalAction(pid).catch(() => null),
    ])
      .then(([route, readiness, activity, action]) => {
        if (alive) setData({ route, readiness, activity, action })
      })
      .catch((err) => {
        if (alive) setError(errorText(err, 'Could not load this proposal.'))
      })
    return () => {
      alive = false
    }
  }, [pid, reloadKey])

  const decide = async (decision, notes) => {
    setBusy(true)
    setError('')
    try {
      await decideProposalApproval(pid, data.action.approval_id, { decision, notes })
      setNotice(decision === 'approved' ? 'Approved.' : 'Returned to Sales.')
      setReloadKey((k) => k + 1)
      onDecided()
    } catch (err) {
      setError(errorText(err, 'The decision was not recorded.'))
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <p className="p-8 text-[14px] text-rose-700" role="alert">{error}</p>
  if (!data) return <p className="p-8 text-[14px] text-slate-500">Loading…</p>

  const { route, readiness, activity, action } = data
  const ceilings = route.ceilings || {}
  const stageStatus = Object.fromEntries((route.approval_stages || []).map((s) => [s.stage_code, s.status]))
  const lineRows = (route.line_breaches || []).map((b) => ({ where: b.label, pct: b.discount_pct }))
  const propRows = (route.proposal_breaches || []).map((b) => ({ where: `${b.country} · ${b.kind}`, pct: b.discount_pct }))
  const title = [item.company, item.deal_name].filter(Boolean).join(' — ') || item.proposal_code
  const discountTone = propRows.length || lineRows.length ? 'text-rose-700' : 'text-slate-900'

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {[item.proposal_code, item.region, item.owner_name && `Owner ${item.owner_name}`, item.created_at && `Created ${formatDate(item.created_at)}`]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill item={item} />
          <Link to={`/proposals/review?proposalId=${pid}`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-800 hover:bg-slate-50">
            Open proposal <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800" role="status">{notice}</p>}
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800" role="alert">{error}</p>}
      {(route.configuration_issues || []).length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900" role="status">
          {route.configuration_issues.join(' ')}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="Net value" value={formatMoney(route.net_total, route.currency)} />
        <Kpi label="List value" value={formatMoney(route.list_total, route.currency)} />
        <Kpi label="Effective discount" value={route.overall_discount_pct === null || route.overall_discount_pct === undefined ? '—' : `${route.overall_discount_pct}%`} tone={discountTone} />
        <Kpi label="Readiness" value={readiness ? `${readiness.completed_count}/${readiness.total_count}` : '—'} />
      </div>

      {item.current_stage && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] text-slate-700">
          <Clock className="w-4 h-4 text-amber-600" aria-hidden="true" />
          Awaiting <strong className="text-slate-900">{item.current_stage.stage_label}</strong> — {item.current_stage.assigned_user_name}
        </div>
      )}

      {action?.can_decide && action.approval_id && <DecisionPanel key={action.approval_id} action={action}onDecide={decide} busy={busy} />}

      <Card icon={Route} title="Approval route">
        <RouteTimeline route={route} proposalStatus={item.status} currentCode={item.current_stage?.stage_code} />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card icon={AlertTriangle} title="Commercial — discount breaches">
          <BreachTable title="Line-level discounts" ceiling={ceilings.line_pct} rows={lineRows}
            approved={stageStatus.commercial_line === 'approved'} />
          <BreachTable title="Proposal-level discounts" ceiling={ceilings.proposal_pct} rows={propRows}
            approved={stageStatus.commercial_proposal === 'approved'} />
        </Card>
        <Card icon={History} title={`History${activity.length > 0 ? ` (${activity.length})` : ''}`}>
          {activity.length === 0 ? (
            <p className="text-[13px] text-slate-500">No activity recorded.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto pr-2">
              <ol className="space-y-4 border-l-2 border-slate-200 pl-4 py-1">
                {activity.map((a) => {
                  const note = a.after?.notes || a.after?.rejection_notes || a.after?.reason
                  return (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-emerald-600 bg-white" aria-hidden="true" />
                      <div className="text-[14px] font-semibold text-slate-900">{a.title}</div>
                      <div className="font-mono text-[12px] text-slate-500">{formatDate(a.occurred_at)} · {a.actor_name}</div>
                      {note && <blockquote className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-[13px] italic text-slate-700">“{note}”</blockquote>}
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

export function ApprovalsPage() {
  const [params, setParams] = useSearchParams()
  const [inbox, setInbox] = useState(null)
  const [error, setError] = useState('')
  const tabKey = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'awaiting_me'
  const selectedId = Number(params.get('proposalId')) || null

  const [inboxKey, setInboxKey] = useState(0)

  useEffect(() => {
    let alive = true
    getApprovalInbox()
      .then((data) => {
        if (!alive) return
        setInbox(data)
        setError('')
      })
      .catch((err) => {
        if (!alive) return
        setError(
          err?.response?.status === 403
            ? 'Your role cannot view proposals (Roles & Permissions → View proposals & pricing).'
            : errorText(err, 'Could not load the approval inbox.'),
        )
      })
    return () => {
      alive = false
    }
  }, [inboxKey])
  const load = () => setInboxKey((k) => k + 1)

  const tab = TABS.find((t) => t.key === tabKey)
  const items = useMemo(() => (inbox?.items || []).filter(tab.match), [inbox, tab])
  const selected = (inbox?.items || []).find((i) => i.proposal_id === selectedId) || null
  const setParam = (next) => setParams({ tab: tabKey, ...(selectedId ? { proposalId: selectedId } : {}), ...next })

  return (
    <div className="h-screen overflow-hidden bg-slate-100 flex flex-col text-slate-800 font-sans">
      <CatalogueTopNav activeSection="approvals" />
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-[13px] font-semibold text-emerald-800">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" /> Approval Inbox
        </span>
        <span className="text-[12px] text-slate-500">Decisions follow the approval workflow configured by the Admin.</span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside className="md:w-[420px] md:shrink-0 bg-white border-r border-slate-200 flex flex-col min-h-0 max-h-[45vh] md:max-h-none">
          <div role="tablist" aria-label="Approval inbox" className="shrink-0 flex flex-wrap gap-1 px-3 py-2 border-b border-slate-200">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={t.key === tabKey}
                onClick={() => setParam({ tab: t.key })}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                  t.key === tabKey ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t.label}
                <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-mono text-slate-600">{inbox?.counts?.[t.key] ?? '–'}</span>
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {error && <p className="p-4 text-[13px] text-rose-700" role="alert">{error}</p>}
            {!inbox && !error && <p className="p-4 text-[13px] text-slate-500">Loading…</p>}
            {inbox && items.length === 0 && <p className="p-8 text-center text-[14px] text-slate-500">{tab.empty}</p>}
            {items.length > 0 && (
              <ul aria-label={`${tab.label} proposals`}>
                {items.map((i) => (
                  <InboxRow key={i.proposal_id} item={i} active={i.proposal_id === selectedId}
                    onSelect={(id) => setParam({ proposalId: id })} />
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="flex-1 min-h-0 overflow-y-auto" data-testid="approval-detail">
          {selected ? (
            <Detail key={selected.proposal_id} item={selected} onDecided={load} />
          ) : (
            <p className="p-12 text-center text-[14px] text-slate-500">Select a proposal to review.</p>
          )}
        </main>
      </div>
    </div>
  )
}

export default ApprovalsPage
