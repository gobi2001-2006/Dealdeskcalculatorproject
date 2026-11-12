import {
  Calculator,
  X,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Layers,
} from 'lucide-react'
import { CalculationNotices } from '../../../components/common/CalculationNotices'
import { formatMoney, readCalculationTotals } from '../../../utils/calculationView'
import { formatContractYears } from '../../../utils/contractDuration'

/** Per-product figures to show: base pricing (Proposal Configurator) or net (saved calculation). */
function productCells(prod, isBase, termMonths) {
  if (isBase) {
    return [
      ['Subscription — Year 1 (base)', prod.subscription_base_annual ?? prod.subscription_subtotal_before_discount],
      [`Subscription — ${formatContractYears(termMonths)} (base)`, prod.contract_subscription_base ?? prod.contract_subscription_subtotal_before_discount],
      ['Services — one-time (base)', prod.service_base ?? prod.service_subtotal_before_discount],
      ['Contract Value (base)', prod.contract_product_base_native_total ?? prod.contract_product_native_total],
    ]
  }
  return [
    ['Subscription Subtotal', prod.subscription_subtotal_before_discount],
    ['Subscription Total (Net)', prod.subscription_total_after_discount],
    ['Service Subtotal', prod.service_subtotal_before_discount],
    ['Service Total (Net)', prod.service_total_after_discount],
  ]
}

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
  const totals = readCalculationTotals(apiResult?.data)
  const products = totals?.products || []
  // 'base' = Proposal Configurator pricing without discounts; otherwise a saved (discounted) snapshot.
  const isBase = totals?.pricingStage === 'base'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calculation-modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#0B1528] text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-orange-400">
              <Calculator className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="calculation-modal-title" className="text-[16px] font-bold text-white tracking-wide">
                Commercial Calculation Breakdown
              </h2>
              <p className="text-[11px] text-slate-300">
                {isBase
                  ? 'Base pricing from the rate cards: no discounts applied, nothing saved as a snapshot.'
                  : 'Itemized pricing and calculation summary.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {isLoading ? (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto" aria-hidden="true" />
              <div className="text-[13px] font-semibold text-slate-800">
                Calculating pricing...
              </div>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Resolving rate card entries, discounts, and currency conversions.
              </p>
            </div>
          ) : isError ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-3 text-[12px] text-rose-900">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1">
                  <div className="font-bold text-[13px]">
                    Calculation Engine Error {apiResult.statusCode ? `(HTTP ${apiResult.statusCode})` : ''}
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-800">
                    {apiResult.message}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-[12px]">
                <div className="font-bold text-[13px] text-slate-900">Troubleshooting Guidance:</div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                  <li>Ensure the proposal is saved and pinned to an active rate card version.</li>
                  <li>Verify that rate cards exist for the configured countries and pricing models.</li>
                  <li>Ensure each country block has a valid customer tier and deployment volume.</li>
                </ul>
              </div>
            </div>
          ) : isSuccess ? (
            <div className="space-y-4">
              {/* Grand Total Hero Box */}
              <div className="p-5 rounded-xl bg-gradient-to-r from-[#0B1528] to-[#1E293B] text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-md">
                <div>
                  {/* Base results (Proposal Configurator) show undiscounted pricing only; saved results
                      (Proposal Summary) show the net figures, with the base total alongside. */}
                  <div className="text-[11px] font-semibold tracking-wider text-orange-400 uppercase" data-testid="fcv-label">
                    Full Contract Value ({totals.currency}, {formatContractYears(totals.termMonths)}){isBase ? '' : ' — net'}
                  </div>
                  <div className="text-[22px] sm:text-[28px] font-black font-mono tracking-tight mt-0.5" data-testid="fcv-value">
                    {formatMoney(isBase ? totals.baseContractTotal ?? totals.contractTotal : totals.contractTotal, totals.currency)}
                  </div>
                  <div className="text-[11px] text-orange-200 font-mono mt-0.5" data-testid="year1-value">
                    Year 1 (annual subscription + one-time services): {formatMoney(isBase ? totals.baseAnnualTotal ?? totals.annualTotal : totals.annualTotal, totals.currency)}
                  </div>
                  {!isBase && totals.baseContractTotal != null && (
                    <div className="text-[11px] text-slate-300 font-mono mt-0.5">
                      Before discounts: {formatMoney(totals.baseContractTotal, totals.currency)} (Year 1 {formatMoney(totals.baseAnnualTotal, totals.currency)})
                    </div>
                  )}
                  <div className="text-[11px] text-slate-300 mt-1 flex items-center gap-2">
                    <span>{calcData.snapshot_id ? `Snapshot #${calcData.snapshot_id}` : 'Preview — not saved as a snapshot'}</span>
                    <span>•</span>
                    <span>Version {calcData.version_no}</span>
                    <span>•</span>
                    <span>{new Date(calcData.calculated_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:self-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span>{isBase ? 'Base pricing — before discounts' : 'Saved snapshot — discounts applied'}</span>
                  </span>
                </div>
              </div>

              <CalculationNotices totals={totals} />

              {/* Product Breakdowns */}
              {products.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-[14px] sm:text-[15px] font-bold text-slate-900 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-orange-600" aria-hidden="true" />
                    <span>Product & Module Consolidated Results ({products.length})</span>
                  </div>

                  {products.map((prod, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3 text-[12px]"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                        <div>
                          <span className="font-bold text-slate-900 text-[14px]">
                            {prod.product_name}
                          </span>
                          <span className="ml-2 font-mono text-[11px] text-slate-500">
                            ({prod.product_code})
                          </span>
                          {prod.country_name && (
                            <span className="ml-2 px-2 py-0.5 rounded bg-orange-50 border border-orange-200 text-[10px] font-semibold text-orange-800">
                              {prod.country_name}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-bold font-mono text-slate-900 text-[14px]">
                            {prod.reporting_currency_code}{' '}
                            {Number(
                              isBase
                                ? prod.contract_product_base_reporting_total ?? prod.contract_product_reporting_total
                                : prod.contract_product_reporting_total,
                            ).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                            <span className="ml-1 font-sans font-normal text-[10px] text-slate-500">{isBase ? 'contract, base' : 'contract, net'}</span>
                          </div>
                          {prod.native_currency_code !== prod.reporting_currency_code && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              Native: {prod.native_currency_code}{' '}
                              {Number(isBase ? prod.contract_product_base_native_total ?? prod.contract_product_native_total : prod.contract_product_native_total).toLocaleString()} (FX: {prod.fx_rate_multiplier})
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        {productCells(prod, isBase, totals.termMonths).map(([label, value]) => (
                          <div key={label} className="p-2.5 rounded bg-white border border-slate-200">
                            <span className="text-slate-500 block text-[10px]">{label}</span>
                            <span className="font-semibold text-slate-800 font-mono text-[12px]">
                              {prod.native_currency_code} {Number(value ?? 0).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Line items details */}
                      {prod.line_items && prod.line_items.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Priced Line Items
                          </div>
                          <div className="border border-slate-200 rounded overflow-hidden">
                            <table className="w-full text-left text-[11px] sm:text-[12px]">
                              <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[11px] font-bold">
                                <tr>
                                  <th className="py-1.5 px-3">Line</th>
                                  <th className="py-1.5 px-3">Volume</th>
                                  <th className="py-1.5 px-3 text-right">Unit Rate</th>
                                  <th className="py-1.5 px-3 text-right">Consumption Fee</th>
                                  <th className="py-1.5 px-3 text-right">Fixed Fee</th>
                                  <th className="py-1.5 px-3 text-right">{isBase ? 'Year 1 Subtotal (base)' : 'Year 1 Subtotal (net)'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white font-mono">
                                {prod.line_items.map((li, lIdx) => (
                                  <tr key={lIdx}>
                                    <td className="py-1.5 px-3 font-mono">{li.target_name || li.item_name || `Line ${li.line_number || lIdx + 1}`}</td>
                                    <td className="py-1.5 px-3 font-mono">
                                      {li.average_monthly_volume ?? li.quantity ?? '—'}
                                      {li.uom_name && <span className="font-sans text-slate-500"> {li.uom_name}</span>}
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-mono">{Number(li.rate_per_unit ?? li.base_unit_rate ?? 0).toFixed(2)}</td>
                                    <td className="py-1.5 px-3 text-right font-mono">{Number(li.annual_consumption_fee ?? li.total_base ?? 0).toLocaleString()}</td>
                                    <td className="py-1.5 px-3 text-right font-mono">{Number(li.platform_fee ?? 0).toLocaleString()}</td>
                                    <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">
                                      {Number(
                                        (isBase ? li.item_subscription_before_discount : li.item_subscription_after_discount) ?? li.total_base ?? 0,
                                      ).toLocaleString()}
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
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-center text-[12px] text-slate-500">
                  Calculation completed successfully. No itemized products configured.
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-[12px] text-slate-400">
              No calculation executed yet. Click "Calculate Pricing" to execute commercial pricing.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span>
              {isBase
                ? 'Base pricing from the backend engine. Discounts are applied on Pricing & Discounts.'
                : 'Saved calculation snapshot'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isError && (
              <button
                type="button"
                onClick={onRetryCalculation}
                className="px-4 py-2 text-[13px] font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs cursor-pointer"
              >
                Retry Calculation
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors cursor-pointer"
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
