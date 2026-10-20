import {
  Calculator,
  X,
  Clock,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'

export function CalculationModal({
  isOpen,
  clientInfo,
  countryConfigs,
  apiResult,
  isLoading,
  onClose,
  onRetryCalculation,
}) {
  if (!isOpen) return null

  const isPending = !apiResult || apiResult.pending || apiResult.status === 'unavailable'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calculation-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#0B1528] text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-orange-400">
              <Calculator className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="calculation-modal-title" className="text-sm font-bold text-white tracking-wide">
                Commercial Pricing Engine Status
              </h2>
              <p className="text-[11px] text-slate-300">
                Authoritative backend calculations and currency consolidation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {isLoading ? (
            <div className="py-8 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto" aria-hidden="true" />
              <div className="text-xs font-semibold text-slate-800">
                Connecting to backend pricing engine...
              </div>
              <p className="text-[11px] text-slate-500">
                Validating customer tier bands and compiling line-item calculations.
              </p>
            </div>
          ) : isPending ? (
            <div className="space-y-4">
              {/* Status pill */}
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-2">
                    <span>Pricing Pending Backend Calculation</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-200 text-amber-900">
                      HTTP {apiResult?.statusCode || '404'}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    The backend pricing calculation endpoint (`POST /proposals/calculate`) is pending deployment in Wave 5.
                    Per strict Deal Desk governance rules, <strong>pricing calculations remain strictly backend-owned</strong> and are never fabricated in the browser.
                  </p>
                </div>
              </div>

              {/* Submitted Parameters Summary */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                <div className="font-bold text-slate-900">
                  Submitted Proposal Parameters:
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400">Client:</span>{' '}
                    <strong className="text-slate-800">{clientInfo.clientName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Reporting Currency:</span>{' '}
                    <strong className="text-slate-800">{clientInfo.reportingCurrency}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Deployment Countries:</span>{' '}
                    <strong className="text-slate-800">{countryConfigs.length} Regional Scope(s)</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Financial Engine:</span>{' '}
                    <strong className="text-slate-800">FastAPI Pricing Engine</strong>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed italic">
                Notice: PEPM contract values, multi-currency conversion, platform subscription tiers, discretionary discounts, and tax liabilities will populate here once backend calculations are activated.
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              <div className="flex items-center gap-2 font-bold mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span>Backend Calculation Confirmed</span>
              </div>
              <p className="text-[11px]">
                Authoritative pricing figures received from the backend pricing engine.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>Strict Backend Governance</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onRetryCalculation}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Retry Backend</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CalculationModal
