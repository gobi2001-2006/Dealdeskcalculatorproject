import { ShieldCheck, Info } from 'lucide-react'

export function ApprovalPoliciesCard({ policies }) {
  const floor = policies?.grossMarginFloor || '30.0'
  const lineCeiling = policies?.lineItemDiscountCeiling || '15.0'
  const overallCeiling = policies?.overallDiscountCeiling || '20.0'

  return (
    <section
      role="region"
      aria-label="Approval Governance Policies"
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-orange-600" aria-hidden="true" />
          <h2 className="text-xs font-bold text-slate-900 tracking-tight">
            Approval Governance Policies
          </h2>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          Demo settings — not enforced
        </span>
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        Delegation of authority (DoA) thresholds configured in backend governance matrices.
      </p>

      {/* Policy Fields */}
      <div className="space-y-2.5 text-xs">
        {/* Gross Margin Floor */}
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <div>
            <span className="font-semibold text-slate-800 block">
              Gross-Margin Floor
            </span>
            <span className="text-[10px] text-slate-400">
              Corporate target minimum
            </span>
          </div>
          <div className="text-right">
            <span className="font-mono font-bold text-slate-900">
              {floor}%
            </span>
            <span className="block text-[9px] text-amber-700 font-medium">
              Demo setting — not enforced
            </span>
          </div>
        </div>

        {/* Line-item Discount Ceiling */}
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <div>
            <span className="font-semibold text-slate-800 block">
              Line-Item Discount Ceiling
            </span>
            <span className="text-[10px] text-slate-400">
              Sales Lead delegation limit
            </span>
          </div>
          <div className="text-right">
            <span className="font-mono font-bold text-slate-900">
              {lineCeiling}%
            </span>
            <span className="block text-[9px] text-amber-700 font-medium">
              Demo setting — not enforced
            </span>
          </div>
        </div>

        {/* Overall Deal Discount Ceiling */}
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <div>
            <span className="font-semibold text-slate-800 block">
              Overall Deal Discount Ceiling
            </span>
            <span className="text-[10px] text-slate-400">
              Business Head threshold
            </span>
          </div>
          <div className="text-right">
            <span className="font-mono font-bold text-slate-900">
              {overallCeiling}%
            </span>
            <span className="block text-[9px] text-amber-700 font-medium">
              Demo setting — not enforced
            </span>
          </div>
        </div>

        {/* Workflow Approval Status */}
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <span className="font-semibold text-slate-800">
            Approval Routing Workflow:
          </span>
          <span className="text-[11px] font-mono text-slate-500 italic bg-white px-2 py-0.5 rounded border border-slate-200">
            Pending backend configuration
          </span>
        </div>
      </div>

      {/* Governance Explanatory Notice */}
      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2 text-[10px] text-slate-500 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Approval decisions and routing steps are governed by the backend Wave 5 governance service.
          The frontend does not enforce policy rules or auto-decide approval status.
        </span>
      </div>
    </section>
  )
}

export default ApprovalPoliciesCard
