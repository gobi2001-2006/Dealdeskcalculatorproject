function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const NODE_TONE = {
  approved: 'bg-emerald-600 border-emerald-600 text-white',
  rejected: 'bg-rose-600 border-rose-600 text-white',
  pending: 'bg-white border-amber-500 text-amber-700 ring-4 ring-amber-100',
  pending_submission: 'bg-white border-slate-300 text-slate-500',
  not_required: 'bg-white border-dashed border-slate-300 text-slate-400',
  cancelled: 'bg-white border-slate-300 text-slate-400',
}

export function RouteTimeline({ route, proposalStatus, currentCode }) {
  const stages = route?.approval_stages || []
  if (!stages.length) {
    return <p className="text-[13px] text-slate-500">The approval workflow is not configured (Admin → Approval Workflow).</p>
  }
  const submitted = proposalStatus !== 'draft'
  const done = proposalStatus === 'approved'

  return (
    <ol className="flex flex-wrap lg:flex-nowrap gap-y-6" aria-label="Approval route">
      <TimelineNode tone={submitted ? NODE_TONE.approved : NODE_TONE.pending_submission} mark={submitted ? '✓' : '1'}
        kicker="Submit" title={submitted ? 'Submitted' : 'Not submitted'} first />
      {stages.map((s) => {
        // Only the open stage is "waiting now"; later stages are queued (decided in order).
        const status = s.stage_code === currentCode ? 'pending' : s.status === 'pending' ? 'pending_submission' : s.status
        const tone = NODE_TONE[status] || NODE_TONE.pending_submission
        const mark = status === 'approved' ? '✓' : status === 'rejected' ? '✕' : status === 'not_required' ? '–' : s.stage_level
        return (
          <TimelineNode key={s.stage_code} tone={tone} mark={mark} kicker={s.stage_label}
            title={s.is_required ? s.role_name : 'Not required'}
            detail={s.is_required ? s.assigned_user_name : s.reason}
            note={s.decided_at ? formatDate(s.decided_at) : s.is_required ? s.reason : null} />
        )
      })}
      <TimelineNode tone={done ? NODE_TONE.approved : NODE_TONE.pending_submission} mark="✓" kicker="" title="Approved" />
    </ol>
  )
}

function TimelineNode({ tone, mark, kicker, title, detail, note, first }) {
  return (
    <li className="relative flex-1 min-w-[130px] px-2 text-center">
      {!first && <span className="hidden lg:block absolute top-4 right-1/2 w-full h-0.5 bg-slate-200 -z-0" aria-hidden="true" />}
      <span className={`relative z-10 mx-auto flex w-8 h-8 items-center justify-center rounded-full border-2 text-[13px] font-bold ${tone}`}>
        {mark}
      </span>
      {kicker && <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{kicker}</div>}
      <div className="text-[13px] font-semibold text-slate-900 leading-tight">{title}</div>
      {detail && <div className="text-[12px] text-slate-500">{detail}</div>}
      {note && <div className="text-[11px] text-slate-400">{note}</div>}
    </li>
  )
}
