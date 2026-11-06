import { ShieldCheck, Info } from 'lucide-react'

// Threshold categories stored in approval_thresholds.threshold_type (backend check constraint).
// Labels only: every value shown comes from the database.
const THRESHOLD_ROWS = [
  { type: 'gm_floor', label: 'Gross-Margin Floor' },
  { type: 'line_discount', label: 'Line-Item Discount Ceiling' },
  { type: 'overall_discount', label: 'Overall Discount Ceiling' },
  { type: 'service_discount', label: 'Services Discount Ceiling' },
]

/**
 * Approval thresholds as configured in the approval_thresholds table.
 * `thresholds`: rows from GET /api/masters/approval-thresholds (null while loading).
 * Nothing enforces them yet, so the card says so; no value is invented when none is configured.
 */
export function ApprovalPoliciesCard({ thresholds = null, loadError = '' }) {
  return (
    <section
      role="region"
      aria-label="Approval Governance Policies"
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4"
    >
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-orange-600" aria-hidden="true" />
          <h2 className="text-xs font-bold text-slate-900 tracking-tight">Approval Governance Policies</h2>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          Not enforced yet
        </span>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Delegation of authority (DoA) thresholds from the approval_thresholds master table.
      </p>

      {loadError && <p className="text-[11px] text-rose-600">Could not load approval thresholds: {loadError}</p>}

      <div className="space-y-2.5 text-xs">
        {THRESHOLD_ROWS.map(({ type, label }) => {
          const rows = (thresholds || []).filter((t) => t.threshold_type === type)
          return (
            <div
              key={type}
              className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3"
            >
              <span className="font-semibold text-slate-800">{label}</span>
              <div className="text-right">
                {thresholds === null && !loadError ? (
                  <span className="text-[11px] text-slate-400">Loading…</span>
                ) : rows.length === 0 ? (
                  <span className="text-[11px] text-slate-500 italic">Not configured</span>
                ) : (
                  rows.map((t) => (
                    <span key={t.id} className="block font-mono font-bold text-slate-900">
                      {Number(t.value_pct)}%
                      {t.region && <span className="ml-1 font-sans font-normal text-[10px] text-slate-500">({t.region})</span>}
                    </span>
                  ))
                )}
              </div>
            </div>
          )
        })}

        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <span className="font-semibold text-slate-800">Approval Routing Workflow:</span>
          <span className="text-[11px] font-mono text-slate-500 italic bg-white px-2 py-0.5 rounded border border-slate-200">
            Pending backend configuration
          </span>
        </div>
      </div>

      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2 text-[10px] text-slate-500 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Approval decisions and routing steps are governed by the backend governance service.
          The frontend does not enforce policy rules or auto-decide approval status.
        </span>
      </div>
    </section>
  )
}

export default ApprovalPoliciesCard
