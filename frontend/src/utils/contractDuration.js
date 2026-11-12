/**
 * Contract duration: entered and shown in YEARS, stored and priced in MONTHS.
 *
 * The backend (proposals.contract_term_months, calculation snapshots, the pricing engine) keeps
 * months; this is the only place that converts. MONTHS_PER_YEAR is a calendar constant, not a
 * business setting.
 */
export const MONTHS_PER_YEAR = 12

/** "5" -> 60. Returns null unless the input is a positive whole number of years. */
export function yearsToMonths(years) {
  if (years === '' || years === null || years === undefined) return null
  const n = Number(years)
  if (!Number.isInteger(n) || n <= 0) return null
  return n * MONTHS_PER_YEAR
}

/** 60 -> 5, 18 -> 1.5, missing -> ''. Older snapshots may hold a term that is not whole years. */
export function monthsToYears(months) {
  if (months === '' || months === null || months === undefined) return ''
  const n = Number(months)
  if (!Number.isFinite(n) || n <= 0) return ''
  return Math.round((n / MONTHS_PER_YEAR) * 100) / 100
}

/** 5 -> "5 years", 1 -> "1 year", missing -> fallback. */
export function formatYears(years, fallback = '—') {
  if (years === '' || years === null || years === undefined || Number.isNaN(Number(years))) return fallback
  const n = Number(years)
  return `${n} ${n === 1 ? 'year' : 'years'}`
}

/** 60 -> "5 years", 12 -> "1 year", missing -> fallback. */
export function formatContractYears(months, fallback = '—') {
  return formatYears(monthsToYears(months), fallback)
}

/** Validation message for the years field ('' when valid). Whole years only. */
export function validateContractYears(years) {
  if (years === '' || years === null || years === undefined) return 'Contract duration in years is required.'
  const n = Number(years)
  if (Number.isNaN(n)) return 'Contract duration must be a number of years.'
  if (n <= 0) return 'Contract duration must be at least 1 year.'
  if (!Number.isInteger(n)) return 'Contract duration must be a whole number of years (e.g. 1, 3, 5).'
  return ''
}
