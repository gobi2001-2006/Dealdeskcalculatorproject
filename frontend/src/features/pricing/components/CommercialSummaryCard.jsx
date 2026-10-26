import {
  Clock,
  ArrowLeft,
  ArrowRight,
  Save,
  TrendingUp,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatMoney, readCalculationTotals } from '../../../utils/calculationView'

export function CommercialSummaryCard({
  clientInfo,
  calculationSnapshot = null,
  isSaving = false,
  isCalculating = false,
  onSavePrototype,
  onRecalculate = null,
}) {
  // Every figure below is read from the backend calculation result.
  const totals = readCalculationTotals(calculationSnapshot)
  const hasCalculation = Boolean(totals?.snapshotId)
  const repCurrency = totals?.currency || clientInfo?.reportingCurrency || ''
  const query = clientInfo?.proposalId ? `?proposalId=${clientInfo.proposalId}` : ''

  return (
    <section
      role="region"
      aria-label="Commercial Summary and Financial Metrics"
      className="bg-[#0B1528] text-white rounded-xl p-5 border border-slate-800 shadow-md space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-orange-400" aria-hidden="true" />
            <span>Commercial Summary</span>
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {clientInfo.clientName}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-orange-400 border border-slate-700">
          {repCurrency}
        </span>
      </div>

      {/* Two-Column Financial Metric Rows */}
      <div className="space-y-3 text-xs">
        {/* Pricing FCV */}
        <div className="flex items-start justify-between gap-3">
          <span className="text-slate-400 font-medium">
            Subscription FCV (Net, {totals?.termMonths ?? '—'} mo):
          </span>
          {hasCalculation ? (
            <span
              className="font-mono text-white font-semibold text-right max-w-[160px] break-words"
              title="Authoritative net subscription FCV from backend pricing engine"
            >
              {formatMoney(totals.subscriptionContract, totals.currency)}
            </span>
          ) : (
            <span
              className="font-mono text-slate-400 italic text-right max-w-[160px] break-words"
              title="Awaiting backend calculation"
            >
              Pending backend calculation
            </span>
          )}
        </div>

        {/* Service Fees */}
        <div className="flex items-start justify-between gap-3">
          <span className="text-slate-400 font-medium">
            Professional Services:
          </span>
          {hasCalculation ? (
            <span
              className="font-mono text-white font-semibold text-right max-w-[160px] break-words"
              title="Authoritative professional services total from backend pricing engine"
            >
              {formatMoney(totals.services, totals.currency)}
            </span>
          ) : (
            <span
              className="font-mono text-slate-400 italic text-right max-w-[160px] break-words"
              title="Awaiting backend calculation"
            >
              Pending backend calculation
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-slate-800 my-1" />

        {/* Total Revenue in Reporting Currency */}
        <div className="flex items-start justify-between gap-3 pt-1">
          <div>
            <span className="text-sm font-bold text-white block">
              Total Contract Revenue
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              (Consolidated in {repCurrency})
            </span>
          </div>
          {hasCalculation && totals.contractTotal != null ? (
            <span
              className="text-sm font-bold text-orange-400 font-mono text-right max-w-[160px] break-words"
              title="Authoritative calculation from backend pricing engine"
            >
              {formatMoney(totals.contractTotal, totals.currency)}
            </span>
          ) : (
            <span
              className="text-sm font-bold text-orange-400 font-mono text-right max-w-[160px] break-words"
              title="Authoritative calculation from backend pricing engine"
            >
              Pending backend calculation
            </span>
          )}
        </div>

        {/* Gross Margin */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-slate-400 font-medium">
            Gross Margin (%):
          </span>
          <span
            className="px-2 py-0.5 rounded text-[11px] font-mono text-slate-400 bg-slate-800/80 border border-slate-700"
            title="Gross margin is calculated by backend finance service"
          >
            Not calculated (no cost-rate engine yet)
          </span>
        </div>

        {/* Calculation Status */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-slate-400 font-medium">
            Calculation Status:
          </span>
          {hasCalculation ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              <span>
                {totals.isStale ? 'Outdated' : 'Calculated'} (Snapshot #{totals.snapshotId})
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-300 font-medium">
              <Clock className="w-3 h-3 text-amber-400" aria-hidden="true" />
              <span>Pending Backend Engine</span>
            </span>
          )}
        </div>

        {/* Approval Decision Status */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-slate-400 font-medium">
            Approval Status:
          </span>
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Not implemented (approval workflow pending)
          </span>
        </div>
      </div>

      {/* Financial Disclaimer */}
      <p className="text-[10px] text-slate-500 italic leading-relaxed pt-2 border-t border-slate-800">
        Financial integrity notice: Margin percentages and consolidated revenue totals are backend-owned and populated by the FastAPI calculation engine.
      </p>

      {/* Action Buttons */}
      <div className="space-y-2 pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={onSavePrototype}
          disabled={isSaving || isCalculating}
          className="w-full inline-flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white shadow-2xs transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
        >
          {isSaving ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Saving & Calculating...</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Save Discounts &amp; Recalculate</span>
            </>
          )}
        </button>

        {onRecalculate && (
          <button
            type="button"
            onClick={onRecalculate}
            disabled={isSaving || isCalculating}
            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 border border-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCalculating ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Recalculate with Discounts</span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Link
            to={`/calculator${query}`}
            className="inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" aria-hidden="true" />
            <span>Page 4 Config</span>
          </Link>

          <Link
            to={`/proposals${query}`}
            className="inline-flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 border border-slate-700 transition-colors"
          >
            <span>Page 6 Summary</span>
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}

export default CommercialSummaryCard
