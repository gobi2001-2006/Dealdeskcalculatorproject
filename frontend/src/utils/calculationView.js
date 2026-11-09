/**
 * Read-only helpers for displaying a backend calculation result
 * (POST /api/proposals/{id}/calculate or GET .../calculations/latest).
 *
 * Every amount comes from the backend. A missing amount is shown as "—", never as 0.
 */

/** Shown in place of an amount until the backend has calculated the proposal. */
export const NOT_CALCULATED = 'Not calculated yet'

/** Format a backend amount in its currency; null/undefined/NaN -> '—'. */
export function formatMoney(value, currencyCode, { decimals = 2 } = {}) {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (Number.isNaN(num)) return '—'
  if (!currencyCode) return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num)
  } catch {
    return `${currencyCode} ${num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
  }
}

/** '' (no discount) or a number 0..100 is valid; anything else returns an error message. */
export function validateDiscountPct(raw) {
  if (raw === '' || raw === null || raw === undefined) return ''
  const n = Number(raw)
  if (Number.isNaN(n)) return 'Enter a number.'
  if (n < 0 || n > 100) return 'Discount must be between 0% and 100%.'
  return ''
}

/**
 * The single percentage applied to every product in a snapshot for one discount field,
 * or '' when none was applied. Returns { value, mixed } where mixed=true means products differ.
 */
export function uniformProductDiscount(calcData, field) {
  const values = (calcData?.snapshot_payload?.products || [])
    .filter((p) => field !== 'service_discount_pct' || Number(p.service_subtotal_before_discount) > 0)
    .map((p) => Number(p[field] || 0))
  const distinct = [...new Set(values)]
  if (distinct.length === 0 || (distinct.length === 1 && distinct[0] === 0)) return { value: '', mixed: false }
  return { value: String(distinct[0]), mixed: distinct.length > 1 }
}

/** Totals in the reporting currency, exactly as returned by the backend (null when not provided). */
export function readCalculationTotals(calcData) {
  if (!calcData) return null
  const payload = calcData.snapshot_payload || {}
  const pick = (...values) => {
    for (const v of values) if (v !== null && v !== undefined) return v
    return null
  }
  return {
    snapshotId: calcData.snapshot_id ?? null,
    calculatedAt: calcData.calculated_at ?? null,
    currency: pick(calcData.reporting_currency_code, payload.reporting_currency_code),
    termMonths: pick(calcData.contract_term_months, payload.contract_term_months),
    // Year-one view: annual subscription + one-time services.
    annualTotal: pick(calcData.total_proposal_annual_reporting_currency, payload.total_proposal_annual_reporting_currency),
    // Full contract value (FCV): subscription over the term + one-time services.
    contractTotal: pick(calcData.total_proposal_contract_reporting_currency, payload.total_proposal_contract_reporting_currency),
    // Split (only in snapshots calculated after Oct 2026; null for older ones).
    subscriptionAnnual: pick(payload.total_subscription_annual_reporting_currency),
    subscriptionContract: pick(payload.total_subscription_contract_reporting_currency),
    services: pick(payload.total_services_reporting_currency),
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    isStale: calcData.is_stale ?? null,
    products: Array.isArray(payload.products) ? payload.products : [],
  }
}
