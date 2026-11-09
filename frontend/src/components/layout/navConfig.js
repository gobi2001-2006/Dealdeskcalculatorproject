import {
  Package,
  Layers,
  Database,
  Calculator,
  Percent,
  FileText,
} from 'lucide-react'

/**
 * Single source of truth for the app's navigation and the short guidance shown on each page.
 *
 * The app has two kinds of pages:
 * - Setup: maintained occasionally (what you sell, how it is bundled, what it costs).
 * - Proposal: the 3-step flow used for every deal (configure → discount → review).
 */

export const SETUP_PAGES = [
  {
    key: 'catalogue',
    label: 'Product Catalog',
    shortLabel: 'Catalog',
    to: '/catalogue',
    icon: Package,
    title: 'Product Catalog',
    purpose: 'List every product family and product you sell. Packs and rates are built from these.',
    howTo: 'Pick a family on the left, then use “Add Row” to add a product. Use the pencil icon to edit a row.',
    next: { label: 'Build packs', key: 'packs' },
  },
  {
    key: 'packs',
    label: 'Pack Builder',
    shortLabel: 'Packs',
    to: '/packs',
    icon: Layers,
    title: 'Pack Builder',
    purpose: 'Bundle catalog products into packs that are sold and priced together.',
    howTo: 'Create a pack, tick the products it includes, then save it.',
    next: { label: 'Set rates', key: 'rate-cards' },
  },
  {
    key: 'rate-cards',
    label: 'Rate Card & Masters',
    shortLabel: 'Rates',
    to: '/rate-cards',
    icon: Database,
    title: 'Rate Card & Masters',
    purpose: 'Set prices: countries, currencies, customer tiers, and a rate for every pack, feature and service role.',
    howTo: 'Choose deployment, pricing model and country at the top, then add pack, feature and service rates. Reference lists are on the right.',
    next: { label: 'Start a proposal', key: 'calculator' },
  },
]

export const PROPOSAL_STEPS = [
  {
    key: 'calculator',
    step: 1,
    label: 'Proposal Configurator',
    shortLabel: 'Configure',
    to: '/calculator',
    icon: Calculator,
    title: 'Configure the proposal',
    purpose: 'Enter the client, add each country, and choose packs, features and services.',
    howTo: 'Fill in the client details, click “Add Country”, pick products for each country, then click “Calculate Pricing”.',
    next: { label: 'Apply discounts', key: 'pricing' },
  },
  {
    key: 'pricing',
    step: 2,
    label: 'Pricing & Discounts',
    shortLabel: 'Discounts',
    to: '/pricing-discounts',
    icon: Percent,
    title: 'Apply discounts',
    purpose: 'Review the price of each product and apply discounts where needed.',
    howTo: 'Pick a country and product on the left, enter discounts, then click “Save Discounts & Recalculate”.',
    next: { label: 'Review summary', key: 'proposals' },
  },
  {
    key: 'proposals',
    step: 3,
    label: 'Proposal Summary',
    shortLabel: 'Summary',
    to: '/proposals',
    icon: FileText,
    title: 'Review the summary',
    purpose: 'See the final totals by country and product, in one reporting currency.',
    howTo: 'Check the totals. If anything is marked outdated, click “Recalculate”.',
    next: null,
  },
]

const ALIASES = {
  configurator: 'calculator',
  discounts: 'pricing',
  'pricing-discounts': 'pricing',
}

export const ALL_PAGES = [...SETUP_PAGES, ...PROPOSAL_STEPS]

export function resolvePageKey(activeSection) {
  return ALIASES[activeSection] || activeSection
}

export function findPage(key) {
  return ALL_PAGES.find((p) => p.key === resolvePageKey(key)) || null
}

/** Proposal pages keep the open proposal id in the link so it survives a refresh. */
export function pageHref(page, proposalQuery = '') {
  if (!page) return '/'
  const isProposalPage = PROPOSAL_STEPS.some((s) => s.key === page.key)
  return isProposalPage ? `${page.to}${proposalQuery}` : page.to
}
