import { Trash2, AlertTriangle, Lock } from 'lucide-react'
import { fixedFeeBasisLabel, unitRateBasisLabel } from './rateCardFormatters'

/**
 * Rate grid with one row per pack/feature rate schedule (one schedule per unit of measure).
 *
 * variant 'platform' (fixed fee + recurring unit rate):
 *   a platform fee per customer tier, one UOM, and a subscription rate that is either one value for
 *   every tier or set per tier (row.perTierRates).
 * variant 'license' (one-time unit rate + AMC):
 *   per tier, a licence fee per user and an AMC %, plus one UOM.
 *
 * Tier columns come from the backend tier list and UOM options from the pricing model's allowed UOMs.
 * Rows are plain view models; every edit is reported to the parent, which saves it.
 */
export function PlatformRatesTable({
  rows = [],
  nameHeader = 'Pack',
  variant = 'platform',
  pricingTiers = [],
  allowedUoms = [],
  lockedUomId = null,
  fixedFeeBasis = null,
  unitRateBasis = null,
  currencySymbol = '',
  isVersionLocked = false,
  onChange,
  onRemove,
}) {
  const isLicense = variant === 'license'
  const periodLabel = unitRateBasisLabel(unitRateBasis)
  const lockedUom = lockedUomId ? allowedUoms.find((u) => String(u.id) === String(lockedUomId)) : null
  const inputClass =
    'px-2.5 py-1.5 text-right font-mono text-[13px] sm:text-[14px] border rounded focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed bg-white'

  return (
    <div className="space-y-2">
      <p className="px-5 pt-3 text-[11px] text-slate-500">
        {isLicense
          ? `Licence fee = ${currencySymbol} per user, charged once (by tier). AMC = % of the licence total, charged every year (by tier).`
          : `Platform = ${currencySymbol} ${fixedFeeBasisLabel(fixedFeeBasis)} (by tier). Subscription = ${currencySymbol} per unit${periodLabel ? ` per ${periodLabel}` : ''}.`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[12px] sm:text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-[11px] uppercase font-bold text-slate-600 tracking-wider border-b border-slate-200">
              <th className="py-2.5 px-4 font-semibold min-w-[200px]">{nameHeader}</th>
              {pricingTiers.map((tier, idx) => (
                <th
                  key={tier.id}
                  className="py-2.5 px-3 font-semibold text-right whitespace-nowrap min-w-[110px] bg-amber-50/70 text-amber-900 border-l border-amber-200/70"
                  title={tier.description || tier.name}
                >
                  <div>{tier.code || `Tier ${idx + 1}`}</div>
                  {tier.name && tier.name !== tier.code && (
                    <div className="normal-case font-medium text-[10px] text-amber-700/80 tracking-normal">{tier.name}</div>
                  )}
                  {isLicense && (
                    <div className="normal-case font-medium text-[10px] text-amber-700/80 tracking-normal">
                      Licence / user · AMC %
                    </div>
                  )}
                </th>
              ))}
              <th className="py-2.5 px-3 font-semibold min-w-[170px] bg-sky-50/70 text-sky-900 border-l border-sky-200/70">
                UOM
              </th>
              {!isLicense && (
                <th className="py-2.5 px-3 font-semibold text-right whitespace-nowrap min-w-[130px] bg-sky-50/70 text-sky-900">
                  Subscription Rate ({currencySymbol})
                </th>
              )}
              <th className="py-2.5 px-3 font-semibold text-center w-12">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const uomValue = lockedUomId ? String(lockedUomId) : row.uomId != null ? String(row.uomId) : ''
              const uomIsAllowed = !uomValue || allowedUoms.some((u) => String(u.id) === uomValue)
              return (
                <tr key={row.key || row.id} className="hover:bg-slate-50/70 transition-colors align-top">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 text-[13px]">{row.name}</div>
                    {row.code && (
                      <span className="inline-block mt-1 font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {row.code}
                      </span>
                    )}
                    {Array.isArray(row.items) && row.items.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {row.items.map((it) => (
                          <span
                            key={it.id || it.feature_id}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-800 border border-orange-200"
                            title={it.is_required === false ? 'Optional pack feature' : 'Required pack feature'}
                          >
                            {it.name || it.feature?.name}
                            {it.is_required === false ? ' (Optional)' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  {pricingTiers.map((tier, idx) => {
                    const tierLabel = tier.code || `Tier ${idx + 1}`
                    return (
                      <td key={tier.id} className="py-3 px-3 text-right bg-amber-50/20 border-l border-amber-100">
                        {isLicense ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="inline-flex items-center gap-1">
                              <span className="text-[11px] text-amber-600 font-mono">{currencySymbol}</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={isVersionLocked}
                                aria-label={`${row.name} ${tierLabel} Licence Fee per User`}
                                value={row.tierRates?.[tier.id] ?? ''}
                                onChange={(e) => onChange(row.id, { tierId: tier.id, unitRate: e.target.value })}
                                placeholder="—"
                                className={`w-28 border-amber-200 ${inputClass}`}
                              />
                            </div>
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                disabled={isVersionLocked}
                                aria-label={`${row.name} ${tierLabel} AMC Percentage`}
                                value={row.tierAmc?.[tier.id] ?? ''}
                                onChange={(e) => onChange(row.id, { tierId: tier.id, amcPercentage: e.target.value })}
                                placeholder="—"
                                className={`w-20 border-amber-200 ${inputClass}`}
                              />
                              <span className="text-[11px] text-amber-600 font-mono">%</span>
                            </div>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1">
                            <span className="text-[11px] text-amber-600 font-mono">{currencySymbol}</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              disabled={isVersionLocked}
                              aria-label={`${row.name} ${tierLabel} Platform Fee`}
                              value={row.tierFees?.[tier.id] ?? ''}
                              onChange={(e) => onChange(row.id, { tierId: tier.id, fixedFee: e.target.value })}
                              placeholder="—"
                              className={`w-28 border-amber-200 ${inputClass}`}
                            />
                          </div>
                        )}
                      </td>
                    )
                  })}

                  <td className="py-3 px-3 bg-sky-50/20 border-l border-sky-100">
                    <select
                      aria-label={`${row.name} Unit of Measure`}
                      value={uomValue}
                      disabled={isVersionLocked || Boolean(lockedUomId)}
                      onChange={(e) => onChange(row.id, { uomId: e.target.value ? Number(e.target.value) : null })}
                      className="w-full pl-2.5 pr-6 py-1.5 text-[13px] border border-sky-200 rounded bg-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                    >
                      <option value="">{allowedUoms.length ? 'Select UOM' : 'No UOMs available'}</option>
                      {!uomIsAllowed && (
                        <option value={uomValue}>{row.uomName || `UOM #${uomValue}`} (not allowed)</option>
                      )}
                      {allowedUoms.map((u) => (
                        <option key={u.id} value={String(u.id)}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                    {lockedUomId && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Locked by pricing model{lockedUom ? `: ${lockedUom.name}` : ''}</span>
                      </div>
                    )}
                    {!uomIsAllowed && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700">
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>This UOM is not allowed for the pricing model. Choose another.</span>
                      </div>
                    )}
                  </td>

                  {!isLicense && (
                    <td className="py-3 px-3 text-right bg-sky-50/20">
                      {row.perTierRates ? (
                        <div className="flex flex-col items-end gap-1.5">
                          {pricingTiers.map((tier, idx) => (
                            <label key={tier.id} className="inline-flex items-center gap-1 text-[10px] text-sky-800">
                              <span className="w-12 text-right">{tier.code || `Tier ${idx + 1}`}</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={isVersionLocked}
                                aria-label={`${row.name} ${tier.code || `Tier ${idx + 1}`} Subscription Rate`}
                                value={row.tierRates?.[tier.id] ?? ''}
                                onChange={(e) => onChange(row.id, { tierId: tier.id, unitRate: e.target.value })}
                                placeholder="—"
                                className={`w-24 border-sky-200 ${inputClass}`}
                              />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1">
                          <span className="text-[11px] text-sky-700 font-mono">{currencySymbol}</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={isVersionLocked}
                            aria-label={`${row.name} Subscription Rate`}
                            value={row.subscriptionRate ?? ''}
                            onChange={(e) => onChange(row.id, { subscriptionRate: e.target.value })}
                            placeholder="—"
                            className={`w-28 border-sky-200 ${inputClass}`}
                          />
                        </div>
                      )}
                      {!isVersionLocked && (
                        <button
                          type="button"
                          onClick={() => onChange(row.id, { perTierRates: !row.perTierRates })}
                          className="mt-1 block ml-auto text-[10px] font-semibold text-sky-700 hover:text-sky-900 underline cursor-pointer"
                        >
                          {row.perTierRates ? 'Use one rate for all tiers' : 'Set rate per tier'}
                        </button>
                      )}
                    </td>
                  )}

                  <td className="py-3 px-3 text-center">
                    {!isVersionLocked && (
                      <button
                        type="button"
                        onClick={() => onRemove(row.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title={`Remove rate for ${row.name}${row.uomName ? ` (${row.uomName})` : ''}`}
                        aria-label={`Remove ${row.name} rate`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
