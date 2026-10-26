import {
  Calculator,
  X,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Layers,
} from 'lucide-react'

export function CalculationModal({
  isOpen,
  apiResult,
  isLoading,
  onClose,
  onRetryCalculation,
}) {
  if (!isOpen) return null

  const isSuccess = apiResult && apiResult.status === 'success' && apiResult.data
  const isError = apiResult && (apiResult.status === 'error' || apiResult.status === 'unavailable')

  const calcData = apiResult?.data || {}
  const snapshot = calcData.snapshot_payload || {}
  const rawProducts = snapshot.products || []
  const products = Array.isArray(rawProducts)
    ? rawProducts
    : typeof rawProducts === 'object'
    ? Object.entries(rawProducts).map(([key, val]) => ({
        product_name: val.product_name || key,
        product_code: val.product_code || key,
        reporting_currency_code: val.reporting_currency_code || calcData.reporting_currency_code || 'USD',
        product_reporting_total: val.product_reporting_total || val.subscription_total_net || val.subscription_total_after_discount || 0,
        native_currency_code: val.native_currency_code || calcData.reporting_currency_code || 'USD',
        product_native_total: val.product_native_total || val.subscription_total_net || 0,
        subscription_subtotal_before_discount: val.subscription_subtotal_before_discount || val.subscription_total_base || 0,
        subscription_total_after_discount: val.subscription_total_after_discount || val.subscription_total_net || 0,
        service_subtotal_before_discount: val.service_subtotal_before_discount || val.services_total_base || 0,
        service_total_after_discount: val.service_total_after_discount || val.services_total_net || 0,
        fx_rate_multiplier: val.fx_rate_multiplier || 1,
        line_items: val.line_items || [],
      }))
    : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calculation-modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#0B1528] text-white px-5 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-orange-400">
              <Calculator className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="calculation-modal-title" className="text-sm font-bold text-white tracking-wide">
                Authoritative Commercial Calculation Engine
              </h2>
              <p className="text-[11px] text-slate-300">
                FastAPI deterministic pricing calculations, rate resolver, and immutable audit snapshot.
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

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {isLoading ? (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto" aria-hidden="true" />
              <div className="text-xs font-semibold text-slate-800">
                Connecting to backend pricing engine...
              </div>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Resolving rate card entries across country, deployment model, pricing architecture, customer tier, and currency peg rates.
              </p>
            </div>
          ) : isError ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-3 text-xs text-rose-900">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <div className="font-bold">
                    Calculation Engine Error {apiResult.statusCode ? `(HTTP ${apiResult.statusCode})` : ''}
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-800">
                    {apiResult.message}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                <div className="font-bold text-slate-900">Troubleshooting Guidance:</div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                  <li>Ensure the proposal is saved and pinned to an active rate card version.</li>
                  <li>Verify that rate cards exist for the configured countries and pricing models.</li>
                  <li>Ensure each country block has valid customer tier and employee volume.</li>
                </ul>
              </div>
            </div>
          ) : isSuccess ? (
            <div className="space-y-4">
              {/* Grand Total Hero Box */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#0B1528] to-[#1E293B] text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-md">
                <div>
                  <div className="text-[11px] font-semibold tracking-wider text-orange-400 uppercase">
                    Total Proposal Value ({calcData.reporting_currency_code})
                  </div>
                  <div className="text-2xl font-black font-mono tracking-tight mt-0.5">
                    {calcData.reporting_currency_code}{' '}
                    {Number(calcData.total_proposal_contract_reporting_currency ?? calcData.total_proposal_reporting_currency).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  {calcData.contract_term_months && calcData.contract_term_months !== 12 && (
                    <div className="text-[11px] text-orange-200 font-mono mt-0.5">
                      Full Contract ({calcData.contract_term_months} Mo) | Annual ARR: {calcData.reporting_currency_code}{' '}
                      {Number(calcData.total_proposal_annual_reporting_currency ?? calcData.total_proposal_reporting_currency).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-300 mt-1 flex items-center gap-2">
                    <span>Audit Snapshot #{calcData.snapshot_id}</span>
                    <span>•</span>
                    <span>Version {calcData.version_no}</span>
                    <span>•</span>
                    <span>{new Date(calcData.calculated_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:self-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span>Verified Snapshot</span>
                  </span>
                </div>
              </div>

              {/* Product Breakdowns */}
              {products.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-orange-600" aria-hidden="true" />
                    <span>Product & Module Consolidated Results ({products.length})</span>
                  </div>

                  {products.map((prod, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                        <div>
                          <span className="font-bold text-slate-900 text-sm">
                            {prod.product_name}
                          </span>
                          <span className="ml-2 font-mono text-[11px] text-slate-500">
                            ({prod.product_code})
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="font-bold font-mono text-slate-900">
                            {prod.reporting_currency_code}{' '}
                            {Number(prod.product_reporting_total).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          {prod.native_currency_code !== prod.reporting_currency_code && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              Native: {prod.native_currency_code}{' '}
                              {Number(prod.product_native_total).toLocaleString()} (FX: {prod.fx_rate_multiplier})
                            </div>
                          )}
                        </div>
                      </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-slate-500 block text-[10px]">Subscription Subtotal</span>
                          <span className="font-semibold text-slate-800 font-mono">
                            {prod.native_currency_code} {Number(prod.subscription_subtotal_before_discount).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-slate-500 block text-[10px]">Subscription Total (Net)</span>
                          <span className="font-semibold text-slate-800 font-mono">
                            {prod.native_currency_code} {Number(prod.subscription_total_after_discount).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-slate-500 block text-[10px]">Service Subtotal</span>
                          <span className="font-semibold text-slate-800 font-mono">
                            {prod.native_currency_code} {Number(prod.service_subtotal_before_discount).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-slate-500 block text-[10px]">Service Total (Net)</span>
                          <span className="font-semibold text-slate-800 font-mono">
                            {prod.native_currency_code} {Number(prod.service_total_after_discount).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Line items details */}
                      {prod.line_items && prod.line_items.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Priced Line Items
                          </div>
                          <div className="border border-slate-200 rounded overflow-hidden">
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                                <tr>
                                  <th className="py-1 px-2">Line</th>
                                  <th className="py-1 px-2">Volume</th>
                                  <th className="py-1 px-2 text-right">Unit Rate</th>
                                  <th className="py-1 px-2 text-right">Consumption Fee</th>
                                  <th className="py-1 px-2 text-right">Fixed Fee</th>
                                  <th className="py-1 px-2 text-right">Net Sub Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {prod.line_items.map((li, lIdx) => (
                                  <tr key={lIdx}>
                                    <td className="py-1 px-2 font-mono">{li.target_name || li.item_name || `Line ${li.line_number || lIdx + 1}`}</td>
                                    <td className="py-1 px-2 font-mono">{li.average_monthly_volume ?? li.quantity ?? '—'}</td>
                                    <td className="py-1 px-2 text-right font-mono">{Number(li.rate_per_unit ?? li.base_unit_rate ?? 0).toFixed(2)}</td>
                                    <td className="py-1 px-2 text-right font-mono">{Number(li.annual_consumption_fee ?? li.total_base ?? 0).toLocaleString()}</td>
                                    <td className="py-1 px-2 text-right font-mono">{Number(li.platform_fee ?? 0).toLocaleString()}</td>
                                    <td className="py-1 px-2 text-right font-mono font-bold text-slate-900">
                                      {Number(li.item_subscription_after_discount ?? li.total_base ?? 0).toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                  Calculation completed successfully. No itemized products configured.
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No calculation executed yet. Click "Calculate Pricing" to execute commercial pricing.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>PostgreSQL Immutable Snapshot Audit</span>
          </div>

          <div className="flex items-center gap-2">
            {isError && (
              <button
                type="button"
                onClick={onRetryCalculation}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs"
              >
                Retry Calculation
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CalculationModal
