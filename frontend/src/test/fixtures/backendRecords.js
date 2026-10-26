/**
 * TEST FIXTURE ONLY - backend-shaped records used by mocked API calls in automated tests.
 * Never imported by production code. Values mirror the DEV seed / pricing-PDF worked example.
 *
 * Ids are deliberately non-sequential (e.g. tier ids 7 and 3) so tests catch code that
 * guesses ids or maps by list position.
 */

export const currencies = [
  { id: 5, code: 'INR', name: 'Indian Rupee', symbol: '₹', status: 'active' },
  { id: 6, code: 'USD', name: 'US Dollar', symbol: '$', status: 'active' },
]

export const countries = [
  { id: 1, iso_code: 'IN', name: 'India', currency_id: 5, currency: currencies[0], status: 'active' },
  { id: 2, iso_code: 'US', name: 'United States', currency_id: 6, currency: currencies[1], status: 'active' },
]

export const tiers = [
  { id: 7, code: 'T1', name: 'Tier 1', status: 'active' },
  { id: 3, code: 'T2', name: 'Tier 2', status: 'active' },
]

export const deployments = [{ id: 11, code: 'shared_cloud', name: 'Shared Cloud', status: 'active' }]

export const pricingModels = [
  { id: 12, code: 'platform_subscription', name: 'Platform Subscription', uom_locked_id: null, status: 'active' },
]

export const deploymentPricingOptions = [{ deployment_model_id: 11, pricing_model_id: 12 }]

export const unitsOfMeasure = [{ id: 13, code: 'candidate', name: 'Candidate', status: 'active' }]

export const families = [{ id: 10, code: 'TA', name: 'Talent Acquisition', status: 'active' }]

export const products = [
  { id: 20, product_family_id: 10, code: 'TA_MAX', name: 'TA Max', status: 'active' },
  { id: 21, product_family_id: 10, code: 'TA_ADD', name: 'TA Add-ons', status: 'active' },
]

export const features = [
  { id: 30, product_id: 20, code: 'TA_REC', name: 'Recruit', classification: 'native', status: 'active' },
  { id: 31, product_id: 20, code: 'TA_AGENT', name: 'AI Agent', classification: 'ai_enabled', status: 'active' },
  { id: 32, product_id: 21, code: 'TA_SOLO', name: 'Standalone Add-on', classification: 'native', status: 'active' },
]

export const packs = [
  {
    id: 40,
    code: 'TA_PREMIUM',
    name: 'TA Premium',
    variant: 'premium',
    product_family_id: 10,
    status: 'active',
    pack_versions: [
      { id: 41, pack_id: 40, version_no: 1, status: 'superseded', pack_items: [{ pack_version_id: 41, feature_id: 30, is_required: true }] },
      {
        id: 42,
        pack_id: 40,
        version_no: 2,
        status: 'active',
        pack_items: [
          { pack_version_id: 42, feature_id: 30, is_required: true },
          { pack_version_id: 42, feature_id: 31, is_required: true },
        ],
      },
    ],
  },
]

export const serviceRates = [
  { id: 50, role_name: 'Implementation Consultant', country_id: 1, currency: currencies[0], hourly_rate: '1500', hours_per_day: '8', daily_rate: null, status: 'active' },
  { id: 51, role_name: 'US Architect', country_id: 2, currency: currencies[1], hourly_rate: '200', hours_per_day: '8', daily_rate: null, status: 'active' },
]

/** A saved proposal as returned by GET /api/proposals/{id}. */
export function savedProposal(overrides = {}) {
  return {
    id: 900,
    code: 'PROP-2026-000900',
    deal_id: 800,
    customer_id: 700,
    currency_id: 6,
    status: 'draft',
    customer: { id: 700, name: 'Retail Co', customer_tier_id: 7 },
    deal: { id: 800, code: 'DEAL-800' },
    currency: currencies[1],
    countries: [
      { id: 600, proposal_id: 900, country_id: 1, deployment_model_id: 11, pricing_model_id: 12, user_headcount: 250, is_primary_deployment: true },
    ],
    versions: [
      {
        id: 500,
        version_no: 1,
        status: 'draft',
        line_items: [
          { id: 1001, line_number: 1, pack_version_id: 42, feature_id: null, uom_id: 13, quantity: '250.0000', discount_pct: null, pack_version: { id: 42, pack_id: 40 } },
          { id: 1002, line_number: 2, pack_version_id: null, feature_id: 32, uom_id: 13, quantity: '100.0000', discount_pct: '10.0000', feature: features[2] },
        ],
        service_lines: [
          { id: 2001, role_name: 'Implementation Consultant', service_rate_id: 50, days_or_hours: '12.0000', discount_pct: null, currency: currencies[0] },
        ],
      },
    ],
    ...overrides,
  }
}

/**
 * A calculation result (POST .../calculate or GET .../calculations/latest) with the amounts the
 * backend PostgreSQL test computes for the same inputs (5% overall, 10% services, 24 months).
 */
export function calculationResult(overrides = {}) {
  const product = {
    product_id: 20,
    product_name: 'TA Max',
    product_code: 'TA_MAX',
    native_currency_code: 'INR',
    contract_term_months: 24,
    subscription_subtotal_before_discount: 675800,
    subscription_discount_pct: 5,
    subscription_discount_amount: 33790,
    subscription_total_after_discount: 642010,
    contract_subscription_total_after_discount: 1284020,
    service_subtotal_before_discount: 144000,
    service_discount_pct: 10,
    service_discount_amount: 14400,
    service_total_after_discount: 129600,
    product_native_total: 771610,
    contract_product_native_total: 1413620,
    fx_rate_multiplier: 0.012,
    currency_pair: 'INR/USD',
    fx_effective_date: '2026-01-01',
    reporting_currency_code: 'USD',
    product_reporting_total: 9259.32,
    contract_product_reporting_total: 16963.44,
    subscription_reporting_total: 7704.12,
    contract_subscription_reporting_total: 15408.24,
    service_reporting_total: 1555.2,
    line_items: [
      {
        line_item_id: 1001, pack_version_id: 42, feature_id: null, target_name: 'TA Premium v2', currency_code: 'INR',
        platform_fee: 380000, rate_per_unit: 80, average_monthly_volume: 250,
        item_subscription_before_discount: 620000, item_discount_pct: 0, item_discount_amount: 0,
        item_subscription_after_discount: 620000, contract_subscription_after_discount: 1240000, product_code: 'TA_MAX',
      },
      {
        line_item_id: 1002, pack_version_id: null, feature_id: 32, target_name: 'Standalone Add-on', currency_code: 'INR',
        platform_fee: 50000, rate_per_unit: 10, average_monthly_volume: 100,
        item_subscription_before_discount: 62000, item_discount_pct: 10, item_discount_amount: 6200,
        item_subscription_after_discount: 55800, contract_subscription_after_discount: 111600, product_code: 'TA_MAX',
      },
    ],
    service_lines: [
      { service_line_id: 2001, role_name: 'Implementation Consultant', man_days: 12, day_rate: 12000, service_line_total: 144000, currency_code: 'INR', attached_product_code: 'TA_MAX' },
    ],
  }
  const payload = {
    inputs_fingerprint: 'abc',
    reporting_currency_code: 'USD',
    contract_term_months: 24,
    warnings: [],
    total_proposal_annual_reporting_currency: 9259.32,
    total_proposal_contract_reporting_currency: 16963.44,
    total_proposal_reporting_currency: 9259.32,
    total_subscription_annual_reporting_currency: 7704.12,
    total_subscription_contract_reporting_currency: 15408.24,
    total_services_reporting_currency: 1555.2,
    products: [product],
    all_subscription_line_items: product.line_items,
    all_service_lines: product.service_lines,
  }
  return {
    snapshot_id: 77,
    proposal_id: 900,
    proposal_version_id: 500,
    version_no: 1,
    calculated_at: '2026-10-26T10:00:00+00:00',
    reporting_currency_code: 'USD',
    total_proposal_reporting_currency: 9259.32,
    contract_term_months: 24,
    total_proposal_annual_reporting_currency: 9259.32,
    total_proposal_contract_reporting_currency: 16963.44,
    is_stale: false,
    snapshot_payload: payload,
    ...overrides,
  }
}
