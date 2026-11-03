import { Fragment } from 'react'
import { Package, Sparkles, Briefcase } from 'lucide-react'
import { formatMoney } from '../../../utils/calculationView'

/**
 * Proposal Summary table, rendered entirely from the saved calculation snapshot.
 *
 * Line and product amounts are in the product's NATIVE currency (rate-card currency);
 * product totals are also shown converted to the REPORTING currency by the backend.
 */
export function ProposalFinancialTable({ snapshotPayload = null, showDiscounts = false }) {
  const products = Array.isArray(snapshotPayload?.products) ? snapshotPayload.products : []
  const reporting = snapshotPayload?.reporting_currency_code || ''
  const term = snapshotPayload?.contract_term_months

  if (!snapshotPayload) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
        No calculation has been saved for this proposal yet. Use “Calculate” to price it with the backend engine.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse" aria-label="Detailed Proposal Commercial Summary">
          <thead className="bg-slate-100/90 text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th scope="col" className="py-3 px-4 min-w-[280px]">Product / Line</th>
              <th scope="col" className="py-3 px-3 text-right min-w-[150px]">Subscription (annual)</th>
              <th scope="col" className="py-3 px-3 text-right min-w-[150px]">Subscription ({term ?? '—'} mo)</th>
              <th scope="col" className="py-3 px-3 text-right min-w-[130px]">Services (one-time)</th>
              <th scope="col" className="py-3 px-3 text-right min-w-[170px]">Total (FCV)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">The calculation contains no priced lines.</td>
              </tr>
            )}
            {products.map((p) => {
              const native = p.native_currency_code
              return (
                <Fragment key={p.product_key || p.product_code}>
                  <tr className="bg-[#0B1528] text-white">
                    <td className="py-2.5 px-4 font-bold" colSpan={5}>
                      {p.product_name} <span className="font-mono text-orange-300 text-[11px]">({p.product_code})</span>
                      {p.country_name && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-semibold text-orange-200">
                          Delivered from {p.country_name}
                        </span>
                      )}
                      <span className="ml-2 text-[10px] font-mono text-slate-300">
                        Native {native}
                        {native !== reporting ? ` → ${reporting} @ ${p.fx_rate_multiplier} (${p.currency_pair}${p.fx_effective_date ? `, ${p.fx_effective_date}` : ''})` : ''}
                      </span>
                    </td>
                  </tr>

                  {(p.line_items || []).map((li) => (
                    <tr key={`li-${li.line_item_id}`} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          {li.pack_version_id ? (
                            <Package className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-orange-500" aria-hidden="true" />
                          )}
                          <span className="font-semibold text-slate-900">{li.target_name}</span>
                          <span className="text-[10px] text-slate-500">
                            {li.pack_version_id ? 'Pack' : 'À la carte'} · {li.average_monthly_volume} units/mo
                          </span>
                        </div>
                        {showDiscounts && Number(li.item_discount_pct) > 0 && (
                          <div className="mt-1 ml-5 text-[10px] text-orange-700">
                            Line discount {li.item_discount_pct}% = −{formatMoney(li.item_discount_amount, li.currency_code)}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatMoney(li.item_subscription_after_discount, li.currency_code)}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatMoney(li.contract_subscription_after_discount, li.currency_code)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">—</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">—</td>
                    </tr>
                  ))}

                  {(p.service_lines || []).map((sl) => (
                    <tr key={`sl-${sl.service_line_id}`} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
                          <span className="font-semibold text-slate-900">{sl.role_name}</span>
                          <span className="text-[10px] text-slate-500">
                            {sl.man_days} man-days × {formatMoney(sl.day_rate, sl.currency_code)}/day
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400">—</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">—</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatMoney(sl.service_line_total, sl.currency_code)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">—</td>
                    </tr>
                  ))}

                  {showDiscounts && (Number(p.subscription_discount_pct) > 0 || Number(p.service_discount_pct) > 0) && (
                    <tr className="bg-orange-50/60 text-[11px] text-orange-900">
                      <td className="py-2 px-4" colSpan={5}>
                        Overall subscription discount {p.subscription_discount_pct}% (−{formatMoney(p.subscription_discount_amount, native)} annual)
                        {' · '}Services discount {p.service_discount_pct}% (−{formatMoney(p.service_discount_amount, native)})
                      </td>
                    </tr>
                  )}

                  <tr className="bg-slate-50 font-semibold text-slate-800">
                    <td className="py-2.5 px-4">Subtotal — {p.product_name} ({native})</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatMoney(p.subscription_total_after_discount, native)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatMoney(p.contract_subscription_total_after_discount, native)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatMoney(p.service_total_after_discount, native)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatMoney(p.contract_product_native_total, native)}</td>
                  </tr>
                  <tr className="bg-slate-50 text-slate-700">
                    <td className="py-2 px-4 text-[11px]">Converted to {reporting}</td>
                    <td className="py-2 px-3 text-right font-mono text-[11px]">{formatMoney(p.subscription_reporting_total, reporting)}</td>
                    <td className="py-2 px-3 text-right font-mono text-[11px]">{formatMoney(p.contract_subscription_reporting_total, reporting)}</td>
                    <td className="py-2 px-3 text-right font-mono text-[11px]">{formatMoney(p.service_reporting_total, reporting)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">{formatMoney(p.contract_product_reporting_total, reporting)}</td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-orange-600 text-white font-bold">
              <td className="py-3 px-4">Grand Total ({reporting})</td>
              <td className="py-3 px-3 text-right font-mono">{formatMoney(snapshotPayload.total_subscription_annual_reporting_currency, reporting)}</td>
              <td className="py-3 px-3 text-right font-mono">{formatMoney(snapshotPayload.total_subscription_contract_reporting_currency, reporting)}</td>
              <td className="py-3 px-3 text-right font-mono">{formatMoney(snapshotPayload.total_services_reporting_currency, reporting)}</td>
              <td className="py-3 px-3 text-right font-mono">{formatMoney(snapshotPayload.total_proposal_contract_reporting_currency, reporting)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export default ProposalFinancialTable
