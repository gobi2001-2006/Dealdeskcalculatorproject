import {
  Globe,
  Layers,
  Package,
  Sparkles,
  Briefcase,
  Percent,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { formatMoney, validateDiscountPct } from '../../../utils/calculationView'
import { buildCatalogueLookup } from '../../../utils/catalogueLookup'
import { lineTargetKey } from '../../../api/proposalsApi'

function PendingCell() {
  return (
    <span className="text-[11px] font-mono text-slate-500 italic" title="Calculated by the backend engine">
      Pending calculation
    </span>
  )
}

function DiscountInput({ id, label, value, reason, error, onValue, onReason, disabled, reasonPlaceholder = 'Reason (kept on screen only)' }) {
  return (
    <div className="space-y-1.5 max-w-xs">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center px-2 py-1 rounded-md border border-slate-300 bg-slate-50 text-[10px] font-bold text-slate-600">
          %
        </span>
        <input
          id={id}
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={value}
          disabled={disabled}
          onChange={(e) => onValue(e.target.value)}
          placeholder="0"
          aria-label={label}
          aria-invalid={Boolean(error)}
          className={`w-20 px-2 py-1 text-xs rounded border bg-white text-slate-900 focus:outline-none font-medium disabled:bg-slate-100 ${
            error ? 'border-rose-400 focus:ring-2 focus:ring-rose-200' : 'border-slate-300 focus:border-orange-500'
          }`}
        />
        <input
          type="text"
          value={reason}
          disabled={disabled}
          onChange={(e) => onReason(e.target.value)}
          placeholder={reasonPlaceholder}
          aria-label={`${label} reason`}
          className="flex-1 min-w-[100px] px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:border-orange-500 disabled:bg-slate-100"
        />
      </div>
      {error && (
        <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

/**
 * Pricing & Discounts editor for one country block.
 *
 * Discount levels follow the pricing guide (section 4):
 *  - line discount (%) per pack / standalone feature  -> saved on the proposal line item
 *  - overall subscription discount (%) per country     -> saved on the country block
 *  - overall services discount (%) per country         -> saved on the country block
 * (Overall discounts are set per country: business decision 2026-11-06.)
 * All amounts are read from the latest backend calculation; nothing is computed here.
 */
// Billing period of the unit rate, from the backend calculation (pricing model's unit_rate_basis).
function unitBasisSuffix(basis) {
  if (basis === 'monthly') return ' / mo'
  if (basis === 'annual') return ' / yr'
  if (basis === 'one_time') return ' (one-time)'
  return ''
}

export function PricingEditor({
  countryConfig,
  isPrimary = true,
  primaryCountryId = null,
  focusedFamilyId,
  lookup = buildCatalogueLookup(),
  savedLineKeys = null,
  lineItemDiscounts = {},
  overallDiscount = { value: '', reason: '' },
  serviceDiscount = { value: '', reason: '' },
  calculationSnapshot = null,
  onUpdateLineDiscount,
  onUpdateOverallDiscount,
  onUpdateServiceDiscount,
}) {
  if (!countryConfig) {
    return <div className="flex-1 p-8 text-center text-slate-400">No country selected.</div>
  }

  const snapshot = calculationSnapshot?.snapshot_payload || {}
  const snapshotLines = Array.isArray(snapshot.all_subscription_line_items) ? snapshot.all_subscription_line_items : []
  const snapshotServices = Array.isArray(snapshot.all_service_lines) ? snapshot.all_service_lines : []
  const snapshotProducts = Array.isArray(snapshot.products) ? snapshot.products : []
  // Calculated lines carry the country they were priced in; older snapshots priced everything in the primary country.
  const countryOf = (row) => Number(row.country_id ?? primaryCountryId)
  const calcLine = (key) =>
    snapshotLines.find(
      (li) => lineTargetKey({ packVersionId: li.pack_version_id, featureId: li.feature_id, countryId: countryOf(li) }) === key,
    ) || null
  const countryProducts = snapshotProducts.filter((p) => countryOf(p) === Number(countryConfig.countryId))

  const overallError = validateDiscountPct(overallDiscount.value)
  const serviceError = validateDiscountPct(serviceDiscount.value)

  const renderLineRow = ({ key, icon, title, subtitle, quantity }) => {
    const calculated = calcLine(key)
    const disc = lineItemDiscounts[key] || { value: '', reason: '' }
    const err = validateDiscountPct(disc.value)
    const notSaved = savedLineKeys && !savedLineKeys.has(key)
    return (
      <tr key={key} className="hover:bg-slate-50/60 transition-colors">
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {icon}
            <div className="min-w-0">
              <div className="font-bold text-slate-900 text-xs">{title}</div>
              <div className="text-[10px] font-mono text-slate-500">{subtitle}</div>
            </div>
          </div>
        </td>
        <td className="py-3 px-3">
          {calculated ? (
            <span className="text-[11px] font-mono text-slate-800 font-semibold">
              {formatMoney(calculated.rate_per_unit, calculated.currency_code)} / {calculated.uom_name || 'unit'}
              {unitBasisSuffix(calculated.unit_rate_basis)}
              {calculated.unit_rate_basis === 'one_time' && calculated.amc_percentage != null && (
                <span className="text-[10px] text-slate-500 font-normal block">+ AMC {Number(calculated.amc_percentage)}% / yr</span>
              )}
              {Number(calculated.platform_fee) > 0 && (
                <span className="text-[10px] text-slate-500 font-normal block">
                  + {formatMoney(calculated.platform_fee, calculated.currency_code)} platform
                  {calculated.fixed_fee_basis === 'one_time' ? ' (one-time)' : calculated.fixed_fee_basis === 'annual' ? ' / yr' : ''}
                </span>
              )}
            </span>
          ) : (
            <PendingCell />
          )}
        </td>
        <td className="py-3 px-3 text-[11px] font-mono text-slate-800">
          {calculated ? calculated.average_monthly_volume : quantity ?? '—'}
        </td>
        <td className="py-3 px-3">
          {calculated ? (
            <span className="text-[11px] font-mono text-slate-800 font-semibold">
              {formatMoney(calculated.item_subscription_before_discount, calculated.currency_code)}
            </span>
          ) : (
            <PendingCell />
          )}
        </td>
        <td className="py-3 px-4">
          {(
            <DiscountInput
              id={`line-discount-${key}`}
              label={`Discount for ${title}`}
              value={disc.value}
              reason={disc.reason || ''}
              error={err || (notSaved ? 'This line is not saved yet; save it on the Proposal Configurator first.' : '')}
              disabled={notSaved}
              onValue={(v) => onUpdateLineDiscount(key, { value: v })}
              onReason={(r) => onUpdateLineDiscount(key, { reason: r })}
            />
          )}
        </td>
        <td className="py-3 px-3 text-right">
          {calculated ? (
            <span className="text-[11px] font-mono text-emerald-700 font-bold">
              {formatMoney(calculated.item_subscription_after_discount, calculated.currency_code)}
            </span>
          ) : (
            <PendingCell />
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto">
      {/* Country Scope Banner */}
      <section role="region" aria-label="Country Scope Banner" className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0B1528] text-white flex items-center justify-center font-bold">
              <Globe className="w-4 h-4 text-orange-400" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">{countryConfig.countryName || 'Country'}</h2>
                {countryConfig.currency && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-orange-100 text-orange-800 border border-orange-200">
                    {countryConfig.currency}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {isPrimary ? 'Primary country' : 'Additional country'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Headcount {countryConfig.headcount || '—'} · Contract term {countryConfig.contractTerm || '—'} months
              </p>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-slate-600">
          Priced with {countryConfig.countryName || 'this country'}&apos;s rate card and currency; totals are converted to the
          reporting currency on the Proposal Summary.
        </p>
      </section>

      {/* Product family line items */}
      <div className="space-y-6">
        {countryConfig.families.length === 0 ? (
          <div className="p-8 rounded-xl bg-white border border-dashed border-slate-300 text-center space-y-2">
            <Layers className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-slate-800">
              No packs or features configured for {countryConfig.countryName || 'this country'}
            </h3>
            <p className="text-[11px] text-slate-500">Add them on the Proposal Configurator.</p>
          </div>
        ) : (
          countryConfig.families.map((fam) => {
            const family = lookup.family(fam.familyId)
            const pack = fam.selectedPackId ? lookup.packVersion(fam.selectedPackId) : null
            return (
              <section
                key={fam.id}
                id={`family-section-${fam.id}`}
                aria-label={`${family.name} Pricing Section`}
                className={`bg-white rounded-xl border transition-all overflow-hidden shadow-xs ${
                  focusedFamilyId === fam.id ? 'ring-2 ring-orange-500 border-orange-500' : 'border-slate-200'
                }`}
              >
                <header className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-orange-600 shadow-2xs">
                    <Package className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 tracking-tight">{family.name}</h3>
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-bold">{family.code}</span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs" aria-label={`${family.name} line items`}>
                    <thead className="bg-slate-50/60 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th scope="col" className="py-2.5 px-4 min-w-[220px]">Item</th>
                        <th scope="col" className="py-2.5 px-3 min-w-[130px]">Rate Card</th>
                        <th scope="col" className="py-2.5 px-3">Quantity</th>
                        <th scope="col" className="py-2.5 px-3 min-w-[120px]">Annual Gross</th>
                        <th scope="col" className="py-2.5 px-4 min-w-[260px]">Line Discount</th>
                        <th scope="col" className="py-2.5 px-3 min-w-[120px] text-right">Annual Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {pack &&
                        renderLineRow({
                          key: lineTargetKey({ packVersionId: fam.selectedPackId, countryId: Number(countryConfig.countryId) }),
                          icon: <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#F26522]" aria-hidden="true" />,
                          title: pack.name,
                          subtitle: `${pack.code}${pack.versionNo ? ` · v${pack.versionNo}` : ''} · ${pack.featureIds.length} features`,
                          quantity: countryConfig.headcount,
                        })}
                      {(fam.selectedFeatureIds || []).map((featId) => {
                        const feat = lookup.feature(featId)
                        return renderLineRow({
                          key: lineTargetKey({ featureId: featId, countryId: Number(countryConfig.countryId) }),
                          icon: <Sparkles className="w-3.5 h-3.5 text-orange-500 shrink-0" aria-hidden="true" />,
                          title: feat.name,
                          subtitle: `${feat.code}${feat.productName ? ` · ${feat.productName}` : ''} · à la carte`,
                          quantity: fam.featureHeadcounts?.[featId] ?? fam.headcount ?? countryConfig.headcount,
                        })
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })
        )}
      </div>

      {(
        <>
          {/* Overall subscription discount (per country) */}
          <section aria-label="Overall Subscription Discount" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-orange-600" aria-hidden="true" />
              <h3 className="text-xs font-bold text-slate-900">
                Overall Subscription Discount — {countryConfig.countryName || 'this country'}
              </h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Set for {countryConfig.countryName || 'this country'} only. The backend applies it to this country&apos;s
              subscription subtotals after line discounts; other countries keep their own discount.
            </p>
            <DiscountInput
              id="overall-subscription-discount"
              label="Overall subscription discount"
              value={overallDiscount.value}
              reason={overallDiscount.reason || ''}
              error={overallError}
              reasonPlaceholder="Justification (saved with this country)"
              onValue={(v) => onUpdateOverallDiscount({ value: v })}
              onReason={(r) => onUpdateOverallDiscount({ reason: r })}
            />
            {countryProducts.length > 0 && (
              <table className="w-full text-left text-[11px]" aria-label="Subscription totals by product">
                <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-1.5">Product</th>
                    <th className="py-1.5 text-right">Subtotal</th>
                    <th className="py-1.5 text-right">Discount</th>
                    <th className="py-1.5 text-right">Annual Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {countryProducts.map((p) => (
                    <tr key={p.product_key || p.product_code}>
                      <td className="py-1.5 font-sans">{p.product_name} <span className="text-slate-400">({p.product_code})</span></td>
                      <td className="py-1.5 text-right">{formatMoney(p.subscription_subtotal_before_discount, p.native_currency_code)}</td>
                      <td className="py-1.5 text-right">
                        {p.subscription_discount_pct}% · {formatMoney(p.subscription_discount_amount, p.native_currency_code)}
                      </td>
                      <td className="py-1.5 text-right font-bold text-emerald-700">
                        {formatMoney(p.subscription_total_after_discount, p.native_currency_code)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Services: one overall discount per product */}
          <section aria-label="Professional Services Pricing" className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-orange-600" aria-hidden="true" />
              <h3 className="text-xs font-bold text-slate-900">Professional Services</h3>
            </div>
            <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
              <span>
                Service lines are edited on the Proposal Configurator. Individual service lines are never discounted:
                one overall services discount is set for {countryConfig.countryName || 'this country'}.
              </span>
            </p>

            {(countryConfig.serviceLines || []).length === 0 ? (
              <p className="text-[11px] text-slate-400">No service lines for {countryConfig.countryName || 'this country'}.</p>
            ) : (
              <table className="w-full text-left text-[11px]" aria-label="Service lines">
                <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-1.5">Role</th>
                    <th className="py-1.5 text-right">Man-days</th>
                    <th className="py-1.5 text-right">Day rate</th>
                    <th className="py-1.5 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {countryConfig.serviceLines.map((srv) => {
                    const calc =
                      snapshotServices.find((s) => srv.backendId && Number(s.service_line_id) === Number(srv.backendId)) || null
                    return (
                      <tr key={srv.id}>
                        <td className="py-1.5 font-semibold text-slate-900">{srv.roleName}</td>
                        <td className="py-1.5 text-right font-mono">{srv.hoursOrDays}</td>
                        <td className="py-1.5 text-right font-mono">
                          {calc ? formatMoney(calc.day_rate, calc.currency_code) : <PendingCell />}
                        </td>
                        <td className="py-1.5 text-right font-mono font-bold">
                          {calc ? formatMoney(calc.service_line_total, calc.currency_code) : <PendingCell />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            <DiscountInput
              id="overall-services-discount"
              label="Overall services discount"
              value={serviceDiscount.value}
              reason={serviceDiscount.reason || ''}
              error={serviceError}
              reasonPlaceholder="Justification (saved with this country)"
              disabled={(countryConfig.serviceLines || []).length === 0}
              onValue={(v) => onUpdateServiceDiscount({ value: v })}
              onReason={(r) => onUpdateServiceDiscount({ reason: r })}
            />
            {countryProducts.some((p) => Number(p.service_subtotal_before_discount) > 0) && (
              <ul className="text-[11px] font-mono text-slate-700 space-y-0.5">
                {countryProducts
                  .filter((p) => Number(p.service_subtotal_before_discount) > 0)
                  .map((p) => (
                    <li key={p.product_key || p.product_code} className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                      {p.product_code}: {formatMoney(p.service_subtotal_before_discount, p.native_currency_code)} − {p.service_discount_pct}% ={' '}
                      <strong>{formatMoney(p.service_total_after_discount, p.native_currency_code)}</strong>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default PricingEditor
