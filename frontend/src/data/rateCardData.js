/**
 * RATE CARD & MASTERS DATASET
 * 
 * DISCLAIMER:
 * Master data models and demo rate cards for Page 3 (Rate Card & Masters).
 * 
 * CRITICAL PRICING RULE:
 * The frontend must NOT implement pricing formulas or independently calculate commercial totals.
 * Values for Annual Subscription Price, Total Annual Price, PEPM contract values, day rates,
 * and currency-converted totals belong to the backend pricing engine.
 * Where backend integration is pending, display 'Pending backend calculation'.
 */

export const INITIAL_COUNTRIES = [
  { id: 'c-in', name: 'India', currency: 'INR', symbol: '₹' },
  { id: 'c-ae', name: 'UAE', currency: 'AED', symbol: 'AED' },
  { id: 'c-sa', name: 'Saudi Arabia', currency: 'SAR', symbol: 'SAR' },
  { id: 'c-my', name: 'Malaysia', currency: 'MYR', symbol: 'RM' },
  { id: 'c-ph', name: 'Philippines', currency: 'PHP', symbol: '₱' },
  { id: 'c-ke', name: 'Kenya', currency: 'KES', symbol: 'KSh' },
  { id: 'c-za', name: 'South Africa', currency: 'ZAR', symbol: 'R' },
  { id: 'c-na', name: 'North America', currency: 'USD', symbol: '$' },
  { id: 'c-eu', name: 'Europe', currency: 'EUR', symbol: '€' },
]

export const INITIAL_PRICING_TIERS = [
  {
    id: 'tier-1',
    code: 'Tier 1',
    name: 'Enterprise',
    description: 'Large enterprise scale (>10,000 employees). Dedicated SLA and custom governance controls.',
  },
  {
    id: 'tier-2',
    code: 'Tier 2',
    name: 'Mid-Market',
    description: 'Mid-size organizations (2,500 - 10,000 employees). Standard enterprise SLA and multi-tenant hosting.',
  },
  {
    id: 'tier-3',
    code: 'Tier 3',
    name: 'Growth',
    description: 'Growth and emerging organizations (<2,500 employees). Standard self-service onboarding and core SLA.',
  },
]

export const DEPLOYMENT_MODELS = [
  {
    id: 'dep-shared',
    code: 'Shared Cloud',
    name: 'Shared Cloud',
    description: 'Multi-tenant vendor-managed public cloud. Standard high-availability compute and pooled database.',
  },
  {
    id: 'dep-private',
    code: 'Private Cloud',
    name: 'Private Cloud',
    description: 'Dedicated single-tenant cloud environment with isolated VPC, dedicated compute, and custom encryption keys.',
  },
  {
    id: 'dep-onprem',
    code: 'On-Premises',
    name: 'On-Premises',
    description: 'Customer-hosted datacenter installation on client-managed infrastructure and network architecture.',
  },
]

export const PRICING_MODELS = [
  {
    id: 'pm-pepm',
    code: 'PEPM',
    name: 'PEPM',
    description: 'Per Active Employee Per Month (PEPM) recurring subscription. Rates configured per headcount tier.',
    unitOfMeasure: 'Active Employees (with ESS)',
  },
  {
    id: 'pm-platform',
    code: 'Platform Subscription',
    name: 'Platform Subscription',
    description: 'Hybrid structure combining fixed annual platform access fee with employee consumption tier rates.',
    unitOfMeasure: 'Active Employees (with ESS)',
  },
]

export const INITIAL_HOURLY_RATES = [
  {
    id: 'hr-1',
    serviceLine: 'Enterprise Solution Architecture',
    country: 'North America',
    currency: 'USD',
    hourlyRate: '220',
    standardHoursPerDay: 8,
  },
  {
    id: 'hr-2',
    serviceLine: 'Core HR Implementation & Migration',
    country: 'North America',
    currency: 'USD',
    hourlyRate: '165',
    standardHoursPerDay: 8,
  },
  {
    id: 'hr-3',
    serviceLine: 'Custom Integration & API Engineering',
    country: 'India',
    currency: 'INR',
    hourlyRate: '4500',
    standardHoursPerDay: 8,
  },
  {
    id: 'hr-4',
    serviceLine: 'Multi-Country Payroll Configuration',
    country: 'UAE',
    currency: 'AED',
    hourlyRate: '550',
    standardHoursPerDay: 8,
  },
]

export const INITIAL_EXCHANGE_RATES = [
  {
    id: 'fx-1',
    sourceCurrency: 'USD',
    targetCurrency: 'INR',
    ratePerUnit: '83.25',
    effectiveDate: '2026-04-01',
    source: 'Corporate Treasury',
  },
  {
    id: 'fx-2',
    sourceCurrency: 'USD',
    targetCurrency: 'AED',
    ratePerUnit: '3.6725',
    effectiveDate: '2026-04-01',
    source: 'Central Bank Peg',
  },
  {
    id: 'fx-3',
    sourceCurrency: 'USD',
    targetCurrency: 'SAR',
    ratePerUnit: '3.7510',
    effectiveDate: '2026-04-01',
    source: 'Central Bank Peg',
  },
  {
    id: 'fx-4',
    sourceCurrency: 'USD',
    targetCurrency: 'EUR',
    ratePerUnit: '0.9240',
    effectiveDate: '2026-04-01',
    source: 'Corporate Treasury',
  },
  {
    id: 'fx-5',
    sourceCurrency: 'USD',
    targetCurrency: 'MYR',
    ratePerUnit: '4.7210',
    effectiveDate: '2026-04-01',
    source: 'Corporate Treasury',
  },
]

/**
 * Initial Pack Rates mapped to existing Pack Builder packages
 */
export const INITIAL_PACK_RATES = [
  {
    id: 'pr-1',
    packId: 'pack-ta-growth',
    packCode: 'TA-GROWTH-01',
    packName: 'Talent Acquisition Growth Suite',
    familyId: 'fam-ta',
    deploymentModel: 'Shared Cloud',
    pricingModel: 'PEPM',
    unitOfMeasure: 'Active Employees (with ESS)',
    tier1Rate: '45',
    tier2Rate: '55',
    tier3Rate: '68',
  },
  {
    id: 'pr-2',
    packId: 'pack-chr-ent',
    packCode: 'CHR-ENT-02',
    packName: 'Enterprise Core HR & Onboarding',
    familyId: 'fam-chr',
    deploymentModel: 'Shared Cloud',
    pricingModel: 'PEPM',
    unitOfMeasure: 'Active Employees (with ESS)',
    tier1Rate: '35',
    tier2Rate: '42',
    tier3Rate: '50',
  },
  {
    id: 'pr-3',
    packId: 'pack-pay-global',
    packCode: 'PAY-GLOBAL-03',
    packName: 'Multi-Country Global Payroll Pack',
    familyId: 'fam-pay',
    deploymentModel: 'Shared Cloud',
    pricingModel: 'PEPM',
    unitOfMeasure: 'Active Employees (with ESS)',
    tier1Rate: '60',
    tier2Rate: '72',
    tier3Rate: '85',
  },
  {
    id: 'pr-4',
    packId: 'pack-prf-exec',
    packCode: 'PRF-EXEC-04',
    packName: 'Executive Performance & OKR Suite',
    familyId: 'fam-prf',
    deploymentModel: 'Shared Cloud',
    pricingModel: 'PEPM',
    unitOfMeasure: 'Active Employees (with ESS)',
    tier1Rate: '28',
    tier2Rate: '34',
    tier3Rate: '40',
  },
  {
    id: 'pr-ps-1',
    packId: 'pack-ta-growth',
    packCode: 'TA-GROWTH-01',
    packName: 'Talent Acquisition Growth Suite',
    familyId: 'fam-ta',
    deploymentModel: 'Shared Cloud',
    pricingModel: 'Platform Subscription',
    pricingModelId: 2,
    unitOfMeasure: 'Active Employees (with ESS)',
    tier1Rate: '20',
    tier2Rate: '25',
    tier3Rate: '30',
    fixed_tier1Rate: '100000',
    fixed_tier2Rate: '120000',
    fixed_tier3Rate: '150000',
  },
]

/**
 * Initial À la carte Feature Rates mapped to Product Catalogue
 */
export const INITIAL_FEATURE_RATES = [
  {
    id: 'fr-1',
    productId: 'prod-ta-03',
    productCode: 'TA-AI-003',
    featureName: 'AI Resume Matcher & Ranking',
    familyId: 'fam-ta',
    productType: 'AI Agent Module',
    deploymentModel: 'Shared Cloud',
    pricingModel: 'PEPM',
    unitOfMeasure: 'Active Employees (with ESS)',
    tier1Rate: '12',
    tier2Rate: '15',
    tier3Rate: '18',
  },
  {
    id: 'fr-2',
    productId: 'prod-chr-04',
    productCode: 'CHR-AI-004',
    featureName: 'HR Policy Copilot & Helpdesk',
    familyId: 'fam-chr',
    productType: 'AI Agent Module',
    deploymentModel: 'Shared Cloud',
    pricingModel: 'PEPM',
    unitOfMeasure: 'Active Employees (with ESS)',
    tier1Rate: '10',
    tier2Rate: '14',
    tier3Rate: '18',
  },
  {
    id: 'fr-3',
    productId: 'prod-pay-03',
    productCode: 'PAY-AI-003',
    featureName: 'Expense & Claims Copilot',
    familyId: 'fam-pay',
    productType: 'AI Agent Module',
    deploymentModel: 'Shared Cloud',
    pricingModel: 'PEPM',
    unitOfMeasure: 'Active Employees (with ESS)',
    tier1Rate: '14',
    tier2Rate: '18',
    tier3Rate: '22',
  },
  {
    id: 'fr-4',
    productId: 'prod-time-03',
    productCode: 'TIME-AI-003',
    featureName: 'AI Touchless Facial Kiosk',
    familyId: 'fam-time',
    productType: 'AI Agent Module',
    deploymentModel: 'Shared Cloud',
    pricingModel: 'PEPM',
    unitOfMeasure: 'Active Employees (with ESS)',
    tier1Rate: '8',
    tier2Rate: '11',
    tier3Rate: '15',
  },
  {
    id: 'fr-5',
    productId: 'prod-ta-04',
    productCode: 'TA-AI-004',
    featureName: 'Automated Interview Scheduler',
    familyId: 'fam-ta',
    productType: 'AI Agent Module',
    deploymentModel: 'Shared Cloud',
    pricingModel: 'PEPM',
    unitOfMeasure: 'Active Employees (with ESS)',
    tier1Rate: '16',
    tier2Rate: '20',
    tier3Rate: '25',
  },
]

/**
 * Reference Demonstration Values for Platform + Subscription pricing model.
 * 
 * Source: Excel Reference Specification:
 * Tier 1: Platform 100000, Monthly 300, Employees 10000
 * Tier 2: Platform 200000, Monthly 400, Employees 20000
 * Tier 3: Platform 300000, Monthly 500, Employees 30000
 * 
 * NOTE: The frontend stores and displays input configurations only.
 * Output fields (Annual Subscription Price & Total Annual Price) are NOT calculated here
 * and display 'Pending backend calculation'.
 */
export const SPREADSHEET_DEMO_PLATFORM_CONFIG = {
  tier1: {
    tierLabel: 'Tier 1',
    tierName: 'Enterprise',
    annualPlatformFee: '100000',
    monthlySubscriptionFee: '300',
    employeeCount: '10000',
  },
  tier2: {
    tierLabel: 'Tier 2',
    tierName: 'Mid-Market',
    annualPlatformFee: '200000',
    monthlySubscriptionFee: '400',
    employeeCount: '20000',
  },
  tier3: {
    tierLabel: 'Tier 3',
    tierName: 'Growth',
    annualPlatformFee: '300000',
    monthlySubscriptionFee: '500',
    employeeCount: '30000',
  },
}
