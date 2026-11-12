/**
 * PROPOSAL CONFIGURATOR STATE HELPERS
 *
 * Pricing is backend-owned: the frontend never calculates commercial totals.
 * Calculations run through POST /api/proposals/{id}/calculate and are read back from the
 * saved calculation snapshot.
 *
 * Nothing in this module invents business data: new proposals start empty and every id
 * must come from a saved master record.
 */

import { lineCountryIdOf, lineTargetKey, proposalTermMonths } from '../../api/proposalsApi'
import { monthsToYears, validateContractYears, yearsToMonths } from '../../utils/contractDuration'

/** A new, empty proposal header. */
export const INITIAL_CLIENT_INFO = {
  proposalId: null,
  proposalCode: '',
  customerId: null,
  clientName: '',
  dealId: null,
  dealCode: '',
  reportingCurrency: '',
  reportingCurrencyId: null,
  notes: '',
}

/** The pack version a proposal should reference: the active one, else none (never a guess). */
export function activePackVersion(pack) {
  return (pack?.pack_versions || []).find((v) => v.status === 'active') || null
}

/** Describe a saved service rate exactly as stored (no derived prices). */
export function describeServiceRate(sr) {
  if (!sr) return ''
  const code = sr.currency?.code || ''
  const parts = []
  if (sr.daily_rate !== null && sr.daily_rate !== undefined) parts.push(`${code} ${Number(sr.daily_rate).toLocaleString()}/day`)
  if (sr.hourly_rate !== null && sr.hourly_rate !== undefined) {
    parts.push(`${code} ${Number(sr.hourly_rate).toLocaleString()}/hr × ${Number(sr.hours_per_day)} h/day`)
  }
  return parts.join(' · ')
}

/** Currency code of a country record from GET /api/masters/countries (nested currency). */
export function countryCurrencyCode(country) {
  if (!country) return ''
  if (country.currency && typeof country.currency === 'object') return country.currency.code || ''
  if (typeof country.currency === 'string') return country.currency
  return country.currency_code || ''
}

/**
 * A new country block. `country` is a saved country record (or null for an empty block).
 * Tier, deployment model, pricing model, headcount and term are left for the user to choose.
 */
export function createDefaultCountryConfig(country = null, index = 1) {
  return {
    id: `cfg-country-${Date.now()}-${index}`,
    countryId: country ? Number(country.id) : null,
    countryName: country?.name || '',
    currency: countryCurrencyCode(country),
    currencySymbol: country?.currency?.symbol || '',
    pricingTierId: null,
    deploymentModelId: null,
    pricingModelId: null,
    contractYears: '',
    headcount: '',
    families: [],
    serviceLines: [],
  }
}

/**
 * Validation helpers
 */
export function validateClientName(clientName) {
  if (!clientName || !clientName.trim()) {
    return 'Client or deal name is required.'
  }
  if (clientName.trim().length < 2) {
    return 'Client name must be at least 2 characters.'
  }
  return ''
}

/** Contract duration is entered in whole years (stored in months on the proposal). */
export function validateContractTerm(years) {
  return validateContractYears(years)
}

export function validateHeadcount(headcount) {
  const num = Number(headcount)
  if (headcount === '' || headcount === null || headcount === undefined) {
    return 'Headcount is required for this pricing model.'
  }
  if (!Number.isInteger(num) || num <= 0) {
    return 'Headcount must be a positive whole number.'
  }
  return ''
}

/** A service line needs a saved service rate and a positive effort in man-days. */
export function validateServiceLine(service) {
  const errors = {}
  if (!service.roleName || !service.roleName.trim()) {
    errors.roleName = 'Service description or role is required.'
  }
  if (!service.serviceRateId) {
    errors.serviceRateId = 'Select a saved service rate for this country.'
  }
  const days = Number(service.hoursOrDays)
  if (service.hoursOrDays === '' || isNaN(days) || days <= 0) {
    errors.hoursOrDays = 'Effort must be greater than 0 man-days.'
  }
  return errors
}

/**
 * Preview of what will be sent to the backend (shown in the save dialog).
 * Prices and the unit of measure are resolved by the backend from the rate card.
 */
export function serializeProposalToBackendSchema(clientInfo, countryConfigs) {
  const lineItems = []
  const serviceLines = []

  const serializedCountries = (countryConfigs || []).map((country, cIdx) => {
    ;(country.families || []).forEach((fam) => {
      if (fam.selectedPackId) {
        lineItems.push({
          pack_version_id: fam.selectedPackId,
          feature_id: null,
          quantity: country.headcount,
          uom_id: 'resolved from the rate card on save',
        })
      }
      ;(fam.selectedFeatureIds || []).forEach((featId) => {
        lineItems.push({
          pack_version_id: null,
          feature_id: featId,
          quantity: fam.featureHeadcounts?.[featId] ?? fam.headcount ?? country.headcount,
          uom_id: 'resolved from the rate card on save',
        })
      })
    })
    ;(country.serviceLines || []).forEach((srv) => {
      serviceLines.push({
        role_name: srv.roleName,
        service_rate_id: srv.serviceRateId || null,
        days_or_hours: Number(srv.hoursOrDays) || 0,
        effort_unit: 'man-days',
      })
    })
    return {
      country_id: country.countryId,
      country_name: country.countryName,
      currency: country.currency,
      user_headcount: country.headcount,
      customer_tier_id: country.pricingTierId,
      deployment_model_id: country.deploymentModelId,
      pricing_model_id: country.pricingModelId,
      contract_term_months: yearsToMonths(country.contractYears),
      is_primary_deployment: cIdx === 0,
    }
  })

  return {
    proposal: {
      id: clientInfo.proposalId || null,
      code: clientInfo.proposalCode || '(generated on save)',
      deal_code: clientInfo.dealCode || '(generated on save)',
      customer_name: clientInfo.clientName,
      reporting_currency: clientInfo.reportingCurrency,
      reporting_currency_id: Number(clientInfo.reportingCurrencyId) || null,
      status: clientInfo.status || 'draft',
    },
    proposal_countries: serializedCountries,
    proposal_line_items: lineItems,
    proposal_service_lines: serviceLines,
    calculation: 'Prices, discounts and totals are calculated by the backend engine.',
  }
}

function familyIdForPackVersion(packs, packVersionId) {
  const pack = (packs || []).find((p) =>
    (p.pack_versions || []).some((v) => Number(v.id) === Number(packVersionId)),
  )
  return pack?.product_family_id ?? null
}

function familyIdForFeature(products, feature) {
  if (!feature) return null
  const product = (products || []).find((p) => Number(p.id) === Number(feature.product_id))
  return product?.product_family_id ?? null
}

/**
 * Turn a saved proposal (GET /api/proposals/{id}) back into configurator state.
 *
 * - `masters.packs` / `masters.products` map lines to their product family.
 * - `masters.countries` supplies each country's currency.
 * - `latestCalc` (GET .../calculations/latest) supplies the contract term, which the
 *   backend records only on the calculation snapshot.
 *
 * Line items and service lines belong to their country block (proposal_country_id); lines
 * saved before multi-region support have none and belong to the primary country block.
 */
export function deserializeBackendProposal(backendProposal, { masters = {}, latestCalc = null } = {}) {
  const clientInfo = {
    proposalId: backendProposal.id,
    proposalCode: backendProposal.code,
    customerId: backendProposal.customer_id,
    clientName: backendProposal.customer?.name || '',
    dealId: backendProposal.deal_id,
    dealCode: backendProposal.deal?.code || '',
    reportingCurrency: backendProposal.currency?.code || '',
    reportingCurrencyId: backendProposal.currency_id,
    status: backendProposal.status,
    notes: '',
  }

  const draftVersion =
    (backendProposal.versions || [])
      .filter((v) => v.status === 'draft')
      .sort((a, b) => b.version_no - a.version_no)[0] ||
    [...(backendProposal.versions || [])].sort((a, b) => b.version_no - a.version_no)[0]
  // Every saved line carries the country it is priced in (country_id), for per-country keys.
  const lineItems = (draftVersion?.line_items || []).map((li) => ({
    ...li,
    country_id: lineCountryIdOf(li, backendProposal.countries),
  }))
  const serviceLines = draftVersion?.service_lines || []
  // Saved on the proposal (months); older proposals: the term of the latest calculation.
  const contractYears = monthsToYears(proposalTermMonths(backendProposal, latestCalc))

  const blocks = [...(backendProposal.countries || [])].sort((a, b) => {
    if (a.is_primary_deployment !== b.is_primary_deployment) return a.is_primary_deployment ? -1 : 1
    return a.id - b.id
  })

  const countryConfigs = blocks.map((c) => {
    const countryMaster =
      (masters.countries || []).find((m) => Number(m.id) === Number(c.country_id)) || c.country || {}
    const currencyCode = countryCurrencyCode(countryMaster)

    const familyMap = new Map()
    const familyEntry = (famId) => {
      const key = famId ?? 'unassigned'
      if (!familyMap.has(key)) {
        familyMap.set(key, { familyId: famId, selectedPackId: null, packUomId: null, selectedFeatureIds: [], featureHeadcounts: {}, featureUomIds: {} })
      }
      return familyMap.get(key)
    }
    // Each line belongs to its own country block (lines without one belong to the primary block).
    const inThisCountry = (line) => lineCountryIdOf(line, backendProposal.countries) === Number(c.country_id)
    lineItems.filter(inThisCountry).forEach((li) => {
      if (li.pack_version_id) {
        const entry = familyEntry(familyIdForPackVersion(masters.packs, li.pack_version_id))
        entry.selectedPackId = li.pack_version_id
        entry.packUomId = li.uom_id ?? null
      } else if (li.feature_id) {
        const entry = familyEntry(familyIdForFeature(masters.products, li.feature))
        if (!entry.selectedFeatureIds.includes(li.feature_id)) entry.selectedFeatureIds.push(li.feature_id)
        // The saved quantity of each standalone feature line.
        entry.featureHeadcounts[li.feature_id] = Number(li.quantity)
        entry.featureUomIds[li.feature_id] = li.uom_id ?? null
      }
    })

    return {
      id: `cfg-country-${c.id}`,
      backendId: c.id,
      countryId: c.country_id,
      countryName: countryMaster.name || '',
      currency: currencyCode,
      currencySymbol: countryMaster.currency?.symbol || '',
      pricingTierId: backendProposal.customer?.customer_tier_id ?? null,
      deploymentModelId: c.deployment_model_id ?? null,
      pricingModelId: c.pricing_model_id ?? null,
      contractYears,
      headcount: c.user_headcount ?? '',
      families: Array.from(familyMap.values()).map((f, fIdx) => ({
        id: `fam-cfg-${c.id}-${fIdx + 1}`,
        familyId: f.familyId,
        headcount: c.user_headcount ?? '',
        selectedPackId: f.selectedPackId,
        packUomId: f.packUomId,
        selectedFeatureIds: f.selectedFeatureIds,
        featureHeadcounts: f.featureHeadcounts,
        featureUomIds: f.featureUomIds,
      })),
      serviceLines: serviceLines.some(inThisCountry)
        ? serviceLines.filter(inThisCountry).map((sl) => ({
            id: `srv-${sl.id}`,
            backendId: sl.id,
            roleName: sl.role_name,
            serviceRateId: sl.service_rate_id,
            hoursOrDays: Number(sl.days_or_hours),
            unit: 'Man-days',
            currency: sl.currency?.code || currencyCode,
          }))
        : [],
    }
  })

  // Line discounts are stored on the line items; key them by country + target for Pricing & Discounts.
  const lineDiscountsByTarget = {}
  lineItems.forEach((li) => {
    if (li.discount_pct !== null && li.discount_pct !== undefined && Number(li.discount_pct) > 0) {
      const key = lineTargetKey({ packVersionId: li.pack_version_id, featureId: li.feature_id, countryId: li.country_id })
      lineDiscountsByTarget[key] = Number(li.discount_pct)
    }
  })

  return { clientInfo, countryConfigs, lineItems, lineDiscountsByTarget }
}
