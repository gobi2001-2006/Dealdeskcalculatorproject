/**
 * Display labels for a rate resolved by POST /api/rates/resolve.
 * The unit of measure and billing periods come from the backend (rate card + pricing model);
 * nothing here assumes employees or a monthly rate.
 */

const PERIODS = { monthly: 'month', annual: 'year' }

/** 'month' | 'year' | null (unknown) for the rate's unit_rate_basis. */
export function unitRatePeriod(rate) {
  return PERIODS[rate?.unit_rate_basis] || null
}

/** Unit a quantity is entered in, e.g. "Interviews / month". */
export function quantityUnitLabel(rate) {
  const uom = rate?.uom_name || 'units'
  const period = unitRatePeriod(rate)
  return period ? `${uom} / ${period}` : uom
}

/** e.g. "INR 85.00 per Interviews / month", or "INR 200000.00 per user (one-time) + AMC 7% / year". */
export function describeUnitRate(rate) {
  if (rate?.unit_rate === null || rate?.unit_rate === undefined) return ''
  const period = unitRatePeriod(rate)
  const base = `${rate.currency_code} ${Number(rate.unit_rate).toFixed(2)} per ${rate.uom_name || 'unit'}`
  if (rate.unit_rate_basis === 'one_time') {
    const amc = rate.amc_percentage !== null && rate.amc_percentage !== undefined ? ` + AMC ${Number(rate.amc_percentage)}% / year` : ''
    return `${base} (one-time)${amc}`
  }
  return `${base}${period ? ` / ${period}` : ''}`
}

/** e.g. "platform fee INR 300,000 / year" or "platform fee INR 300,000 (one-time)". */
export function describeFixedFee(rate) {
  if (rate?.fixed_fee === null || rate?.fixed_fee === undefined) return ''
  const suffix = rate.fixed_fee_basis === 'one_time' ? ' (one-time)' : rate.fixed_fee_basis === 'annual' ? ' / year' : ''
  return `platform fee ${rate.currency_code} ${Number(rate.fixed_fee).toLocaleString()}${suffix}`
}

/**
 * Heading and help text for the country volume input, which becomes every selected pack's quantity.
 * `packUnits` is a list of { uomName, period } for the packs whose rate card has been resolved.
 */
export function describeCountryVolume(packUnits, countryName) {
  const names = [...new Set(packUnits.map((u) => u.uomName).filter(Boolean))]
  const periods = [...new Set(packUnits.map((u) => u.period).filter(Boolean))]
  const period = periods.length === 1 ? periods[0] : null
  if (names.length === 1) {
    return {
      heading: `${names[0]} — Country Deployment Volume`,
      unit: period ? `${names[0]} / ${period}` : names[0],
      help: `Quantity of ${names[0]} used for every selected pack in ${countryName}. The unit of measure comes from the pack's rate card.`,
      mixed: false,
    }
  }
  if (names.length > 1) {
    return {
      heading: 'Pack Quantity — Country Deployment Volume',
      unit: 'units',
      help: `The selected packs in ${countryName} are priced in different units (${names.join(', ')}). This one quantity is applied to each of them.`,
      mixed: true,
    }
  }
  return {
    heading: 'Pack Quantity — Country Deployment Volume',
    unit: 'units',
    help: `Quantity used for every selected pack in ${countryName}. Its unit of measure appears once a pack's rate card is found.`,
    mixed: false,
  }
}
