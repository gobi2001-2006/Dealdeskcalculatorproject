/**
 * Rate Card Currency & Numerical Formatting Helpers
 */

export const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  SGD: 'S$',
  AED: 'AED',
  SAR: 'SAR',
  MYR: 'RM',
  PHP: '₱',
  KES: 'KSh',
  ZAR: 'R',
  AUD: 'A$',
  CAD: 'C$',
  JPY: '¥',
  CHF: 'CHF',
}

/**
 * Resolves the appropriate currency symbol for a country object or currency code string.
 * Falls back to currency code or '$' if unknown.
 */
export function getCurrencySymbol(countryOrCode, fallback = '$') {
  if (!countryOrCode) return fallback

  // If passed a country object
  if (typeof countryOrCode === 'object') {
    const code = (
      typeof countryOrCode.currency === 'string'
        ? countryOrCode.currency
        : countryOrCode.currency?.code || countryOrCode.currencyCode || countryOrCode.code || ''
    ).toUpperCase()

    // 1. Check if explicit symbol is provided
    const explicitSymbol = countryOrCode.symbol || countryOrCode.currency?.symbol
    if (explicitSymbol && typeof explicitSymbol === 'string' && explicitSymbol.trim() !== '') {
      // If explicit symbol is generic '$' but we have a more specific symbol for the currency (e.g., SGD -> S$)
      if (explicitSymbol === '$' && code && code !== 'USD' && CURRENCY_SYMBOLS[code]) {
        return CURRENCY_SYMBOLS[code]
      }
      return explicitSymbol
    }

    // 2. Lookup from dictionary or fallback to code
    return CURRENCY_SYMBOLS[code] || code || fallback
  }

  // If passed a string (currency code or symbol)
  const str = String(countryOrCode).trim()
  if (str.length <= 2 && !/^[A-Z]{2}$/.test(str)) {
    // Likely already a symbol like ₹, $, €
    return str
  }

  const code = str.toUpperCase()
  return CURRENCY_SYMBOLS[code] || code || fallback
}

/**
 * Formats a monetary number with proper thousand separators without altering precision.
 */
export function formatCurrencyAmount(amount, symbol = '$') {
  if (amount === undefined || amount === null || amount === '') return ''
  const num = parseFloat(amount)
  if (isNaN(num)) return String(amount)
  return `${symbol} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

const UNIT_BASIS_LABELS = { monthly: 'month', annual: 'year' }
const FIXED_BASIS_LABELS = { annual: 'annual fee', one_time: 'one-time fee' }

/** "per unit per month" style label for a pricing model's unit_rate_basis (from the backend). */
export function unitRateBasisLabel(basis) {
  return UNIT_BASIS_LABELS[basis] || null
}

/** "annual fee" style label for a pricing model's fixed_fee_basis (from the backend). */
export function fixedFeeBasisLabel(basis) {
  return FIXED_BASIS_LABELS[basis] || 'fee'
}

/**
 * Platform + Subscription keeps one UOM and one subscription rate per pack/feature, written to
 * every tier row. Derive that shared value from the saved tier rows; `mixed` flags legacy data
 * where tiers disagree, so the UI can warn instead of silently showing one tier's value.
 */
export function deriveSharedValue(values) {
  const present = values.filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
  const distinct = [...new Set(present.map((v) => String(Number(v))))]
  const first = present.length > 0 ? Number(present[0]) : NaN
  return {
    value: present.length === 0 ? '' : Number.isFinite(first) ? String(first) : String(present[0]),
    mixed: distinct.length > 1,
  }
}

/** Returns an error message, or '' when the platform inputs are valid. */
export function validatePlatformRateInputs(tiers, fixedTierRates, subscriptionRate) {
  const isBlank = (v) => v === undefined || v === null || String(v).trim() === ''
  for (const tier of tiers) {
    const v = fixedTierRates[tier.id]
    if (!isBlank(v) && (isNaN(Number(v)) || Number(v) < 0)) {
      return `Platform fee for ${tier.name || tier.code} must be a non-negative number.`
    }
  }
  if (!tiers.some((t) => !isBlank(fixedTierRates[t.id]))) {
    return 'Enter the platform fee for at least one customer tier.'
  }
  if (!isBlank(subscriptionRate) && (isNaN(Number(subscriptionRate)) || Number(subscriptionRate) < 0)) {
    return 'Subscription rate must be a non-negative number.'
  }
  return ''
}

/**
 * Which rate grid a pricing model needs, from its components and billing bases (master data):
 *   'license'  - one-time unit rate (e.g. licence fee per user) with an AMC %
 *   'platform' - a fixed fee per tier plus a recurring unit rate
 *   'default'  - a recurring unit rate only (e.g. PEPM)
 */
export function rateLayoutFor(pricingModel) {
  if (!pricingModel) return 'default'
  const unitBasis = pricingModel.unitRateBasis ?? pricingModel.unit_rate_basis
  const hasFixed = pricingModel.hasFixedComponent ?? pricingModel.has_fixed_component
  const hasUnit = pricingModel.hasUnitComponent ?? pricingModel.has_unit_component
  if (unitBasis === 'one_time') return 'license'
  if (hasFixed && hasUnit) return 'platform'
  return 'default'
}
