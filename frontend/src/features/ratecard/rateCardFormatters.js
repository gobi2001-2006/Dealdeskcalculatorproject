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
