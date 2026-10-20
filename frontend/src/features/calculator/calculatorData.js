/**
 * PROPOSAL CONFIGURATOR DATA & HELPER UTILITIES
 * 
 * Reuses existing master data:
 * - Product Catalogue: INITIAL_PRODUCT_FAMILIES, INITIAL_PRODUCTS
 * - Pack Builder: INITIAL_PACKS
 * - Rate Card & Masters: INITIAL_COUNTRIES, INITIAL_PRICING_TIERS, DEPLOYMENT_MODELS, PRICING_MODELS, INITIAL_HOURLY_RATES
 * 
 * CRITICAL PRICING RULE:
 * Pricing is backend-owned. The frontend does not calculate commercial totals (PEPM, discounts, FCV).
 * When backend pricing API is pending, status displays 'Pricing pending backend calculation'.
 */

import { INITIAL_COUNTRIES } from '../../data/rateCardData'
import { INITIAL_PRODUCTS } from '../../data/catalogueData'
import { INITIAL_PACKS } from '../../data/packsData'

/**
 * Master currency catalogue extracted and normalized from rate cards and country records.
 */
export const MASTER_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar', country: 'North America / Global' },
  { code: 'EUR', symbol: '€', name: 'Euro', country: 'Europe' },
  { code: 'GBP', symbol: '£', name: 'British Pound', country: 'United Kingdom' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', country: 'India' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', country: 'United Arab Emirates' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal', country: 'Saudi Arabia' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', country: 'Malaysia' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', country: 'Philippines' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', country: 'Kenya' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', country: 'South Africa' },
]

export const INITIAL_CLIENT_INFO = {
  clientName: 'Acme Global Enterprise',
  dealCode: 'DEAL-2026-0042',
  reportingCurrency: 'USD',
  notes: 'Multi-region enterprise transformation. Initial scope covering India and North America operations.',
}

/**
 * Creates a default country configuration for the proposal.
 */
export function createDefaultCountryConfig(countryId = 'c-in', index = 1) {
  const countryMaster = INITIAL_COUNTRIES.find((c) => c.id === countryId) || INITIAL_COUNTRIES[0]

  return {
    id: `cfg-country-${Date.now()}-${index}`,
    countryId: countryMaster.id,
    countryName: countryMaster.name,
    currency: countryMaster.currency,
    currencySymbol: countryMaster.symbol,
    pricingTierId: 'tier-1', // Default Tier 1 (Enterprise)
    deploymentModelId: 'dep-shared', // Default Shared Cloud
    pricingModelId: 'pm-pepm', // Default PEPM
    contractTerm: 36, // Default 36 months
    headcount: 5000, // Default 5,000 headcount
    // Dedicated state for Platform Subscription to ensure NO data loss when toggling
    platformSubscriptionConfig: {
      annualPlatformFee: '100000',
      monthlySubscriptionFee: '300',
      employeeCount: '10000',
    },
    families: [
      {
        id: `fam-cfg-${Date.now()}-1`,
        familyId: 'fam-ta',
        headcount: 5000,
        selectedPackId: 'pack-ta-growth',
        selectedFeatureIds: [], // À la carte features not in pack
      },
    ],
    serviceLines: [
      {
        id: `srv-cfg-${Date.now()}-1`,
        roleName: 'Enterprise Solution Architecture',
        hourlyRateId: 'hr-1',
        rateApplied: 220,
        hoursOrDays: 40,
        unit: 'Hours',
        discountPct: 0,
        currency: countryMaster.currency,
      },
    ],
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

export function validateContractTerm(term) {
  const num = Number(term)
  if (term === '' || term === null || term === undefined) {
    return 'Contract term in months is required.'
  }
  if (!Number.isInteger(num) || num <= 0) {
    return 'Contract term must be a positive whole number of months (e.g. 12, 24, 36).'
  }
  return ''
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

export function validateServiceLine(service) {
  const errors = {}
  if (!service.roleName || !service.roleName.trim()) {
    errors.roleName = 'Service description or role is required.'
  }
  const hours = Number(service.hoursOrDays)
  if (service.hoursOrDays === '' || isNaN(hours) || hours < 0) {
    errors.hoursOrDays = 'Quantity / hours must be a non-negative number.'
  }
  const rate = Number(service.rateApplied)
  if (service.rateApplied === '' || isNaN(rate) || rate < 0) {
    errors.rateApplied = 'Rate must be a non-negative number.'
  }
  return errors
}

/**
 * Formats a Proposal into the FastAPI Wave 5 Pydantic schema structure
 * for audit snapshots, local draft persistence, and future backend serialization.
 */
export function serializeProposalToBackendSchema(clientInfo, countryConfigs) {
  const proposalCode = clientInfo.dealCode || `PROP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`
  
  let lineNumber = 1
  const lineItems = []
  const serviceLines = []

  const serializedCountries = countryConfigs.map((country, cIdx) => {
    // Collect line items for packs and à la carte features
    country.families.forEach((fam) => {
      if (fam.selectedPackId) {
        const pack = INITIAL_PACKS.find((p) => p.id === fam.selectedPackId)
        lineItems.push({
          line_number: lineNumber++,
          country_id: country.countryId,
          pack_version_id: fam.selectedPackId,
          feature_id: null,
          item_name: pack?.name || 'Selected Commercial Pack',
          item_code: pack?.code || 'PACK-CUSTOM',
          family_id: fam.familyId,
          uom_id: 1, // UOM: Active Employees (with ESS)
          quantity: country.headcount || 1,
          list_unit_price: null, // Backend owned
          discount_pct: 0,
          net_unit_price: null, // Backend owned
          extended_amount: null, // Backend owned
          currency: country.currency,
          status: 'pending_backend_calculation',
        })
      }

      // Collect à la carte features
      if (fam.selectedFeatureIds && fam.selectedFeatureIds.length > 0) {
        fam.selectedFeatureIds.forEach((featId) => {
          const product = INITIAL_PRODUCTS.find((p) => p.id === featId)
          lineItems.push({
            line_number: lineNumber++,
            country_id: country.countryId,
            pack_version_id: null,
            feature_id: featId,
            item_name: product?.subItem || product?.solution || 'À la carte Feature',
            item_code: product?.code || 'FEAT-CUSTOM',
            family_id: fam.familyId,
            uom_id: 1,
            quantity: country.headcount || 1,
            list_unit_price: null, // Backend owned
            discount_pct: 0,
            net_unit_price: null, // Backend owned
            extended_amount: null, // Backend owned
            currency: country.currency,
            status: 'pending_backend_calculation',
          })
        })
      }
    })

    // Collect service lines
    country.serviceLines.forEach((srv) => {
      serviceLines.push({
        country_id: country.countryId,
        role_name: srv.roleName,
        service_rate_id: srv.hourlyRateId || null,
        days_or_hours: Number(srv.hoursOrDays) || 0,
        rate_applied: Number(srv.rateApplied) || 0,
        discount_pct: Number(srv.discountPct) || 0,
        extended_amount: null, // Backend owned
        currency: srv.currency || country.currency,
        status: 'pending_backend_calculation',
      })
    })

    return {
      country_id: country.countryId,
      country_name: country.countryName,
      currency: country.currency,
      user_headcount: country.headcount,
      pricing_tier_id: country.pricingTierId,
      deployment_model_id: country.deploymentModelId,
      pricing_model_id: country.pricingModelId,
      term_months: country.contractTerm,
      is_primary_deployment: cIdx === 0,
      pricing_status: 'pending_backend_calculation',
    }
  })

  return {
    proposal: {
      code: proposalCode,
      deal_code: clientInfo.dealCode,
      customer_name: clientInfo.clientName,
      reporting_currency: clientInfo.reportingCurrency,
      status: 'draft',
      notes: clientInfo.notes,
      created_at: new Date().toISOString(),
    },
    proposal_countries: serializedCountries,
    proposal_line_items: lineItems,
    proposal_service_lines: serviceLines,
    calculation_summary: {
      pricing_fcv: 'Pending backend calculation',
      services_total: 'Pending backend calculation',
      grand_total: 'Pending backend calculation',
      authoritative_pricing_engine: 'FastAPI Backend Engine (Wave 5)',
    },
  }
}
