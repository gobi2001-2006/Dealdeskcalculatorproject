import { ShieldCheck, CheckSquare, Clock, AlertCircle } from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'

export function ApprovalsPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800 font-sans">
      {/* 1. Header Navigation */}
      <CatalogueTopNav activeSection="approvals" />

      {/* 2. Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Page Title & Status Strip */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200">
                Governance Workflow
              </span>
              <span className="text-slate-400 text-xs">/</span>
              <span className="text-xs text-slate-500 font-medium">Commercial Control</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-emerald-600" aria-hidden="true" />
              Approvals & Governance
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage commercial discount thresholds, finance margin sign-offs, and deal approval delegations.
            </p>
          </div>
        </div>

        {/* Informational Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                <CheckSquare className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Active
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Commercial Delegations</h3>
            <p className="text-xs text-slate-600">
              Role-based discount margin thresholds linked to Deal Desk governance tiers.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-100">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Audit Ready
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Approval Queues</h3>
            <p className="text-xs text-slate-600">
              In-flight proposal approvals pending Commercial Operations or Regional Finance sign-off.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100">
                <AlertCircle className="w-5 h-5" />
              </div>
              <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Policy
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Exception Requests</h3>
            <p className="text-xs text-slate-600">
              Non-standard terms, custom SLA provisions, and overall margin exception policies.
            </p>
          </div>
        </div>

        {/* Empty state / information panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-2xl mx-auto shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 mx-auto mb-3 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-slate-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Governance Engine Configured</h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto mb-4">
            Approval rules are active in calculation and validation stages. Proposals exceeding standard discount policies automatically flag governance workflows upon submission.
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Approval Thresholds Synchronized
          </div>
        </div>
      </main>
    </div>
  )
}

export default ApprovalsPage

