/**
 * PACK BUILDER DEMO DATASET
 * 
 * DISCLAIMER:
 * Illustrative presentation data for the Deal Desk Pack Builder view.
 * Bundles products from the Product Catalogue into commercial packaging presets.
 * Does NOT represent live PostgreSQL records or server-side pricing calculations.
 */

export const PRESET_COLORS = [
  { name: 'Orange', hex: '#F26522' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Purple', hex: '#7C3AED' },
  { name: 'Rose', hex: '#E11D48' },
  { name: 'Cyan', hex: '#0891B2' },
  { name: 'Amber', hex: '#D97706' },
]

export const INITIAL_PACKS = [
  {
    id: 'pack-ta-growth',
    name: 'Talent Acquisition Growth Suite',
    description: 'Full recruitment automation bundle with ATS and AI interview copilots.',
    code: 'TA-GROWTH-01',
    familyId: 'fam-ta',
    color: '#F26522',
    productIds: [
      'prod-ta-01', // Applicant Tracking System (ATS) - Adrenalin Native
      'prod-ta-02', // Candidate Sourcing & Career Portal - Adrenalin Native
      'prod-ta-03', // AI Resume Matcher & Ranking - AI Agent Module
      'prod-ta-04', // Automated Interview Scheduler - AI Agent Module
      'prod-ta-05', // Technical Assessment Platform - Partner Integrated
    ],
    notes: 'Includes standard ATS configuration and initial candidate screening copilot. Candidate volume capped at 5,000 active applicants per annum under standard SLA.',
    createdAt: '2026-03-15',
    updatedAt: '2026-04-10',
  },
  {
    id: 'pack-chr-ent',
    name: 'Enterprise Core HR & Onboarding',
    description: 'Complete employee record lifecycle and automated transitions.',
    code: 'CHR-ENT-02',
    familyId: 'fam-chr',
    color: '#2563EB',
    productIds: [
      'prod-chr-01', // Employee Master & Org Hierarchy - Adrenalin Native
      'prod-chr-02', // Lifecycle Transitions - Adrenalin Native
      'prod-chr-03', // Document Vault & Digital Signatures - Partner Integrated
      'prod-chr-04', // HR Policy Copilot - AI Agent Module
    ],
    notes: 'Mandatory prerequisite for global payroll integration. Provides unlimited org chart restructuring and self-service employee portal.',
    createdAt: '2026-03-20',
    updatedAt: '2026-04-12',
  },
  {
    id: 'pack-pay-global',
    name: 'Multi-Country Global Payroll Pack',
    description: 'Statutory tax processing, banking rail, and flexible benefits.',
    code: 'PAY-GLOBAL-03',
    familyId: 'fam-pay',
    color: '#059669',
    productIds: [
      'prod-pay-01', // Multi-Country Payroll Engine - Adrenalin Native
      'prod-pay-02', // Flexible Benefits & Insurance - Adrenalin Native
      'prod-pay-03', // Expense & Claims Copilot - AI Agent Module
      'prod-pay-04', // Direct Banking Settlement - Partner Integrated
    ],
    notes: 'Covers localized payroll rules for up to 5 operating legal entities. Additional country rule modules may be attached as add-ons.',
    createdAt: '2026-04-01',
    updatedAt: '2026-04-14',
  },
  {
    id: 'pack-prf-exec',
    name: 'Executive Performance & OKR Suite',
    description: 'Goal cascading, continuous 360 reviews, and AI feedback copilot.',
    code: 'PRF-EXEC-04',
    familyId: 'fam-prf',
    color: '#7C3AED',
    productIds: [
      'prod-prf-01', // OKR & Continuous Check-ins - Adrenalin Native
      'prod-prf-02', // Annual Appraisal & Calibration - Adrenalin Native
      'prod-prf-03', // Performance Review Copilot - AI Agent Module
    ],
    notes: 'Preset designed for mid-to-large enterprises adopting agile quarterly OKRs alongside annual merit and calibration workflows.',
    createdAt: '2026-04-05',
    updatedAt: '2026-04-15',
  },
]

/**
 * Calculates counts of products by product type for a given list of product IDs.
 */
export function calculatePackTypeCounts(productIds = [], allProducts = []) {
  const selectedProducts = allProducts.filter((p) => productIds.includes(p.id))

  let nativeCount = 0
  let aiAgentCount = 0
  let partnerCount = 0

  for (const prod of selectedProducts) {
    if (prod.type === 'Adrenalin Native') {
      nativeCount++
    } else if (prod.type === 'AI Agent Module') {
      aiAgentCount++
    } else if (prod.type === 'Partner Integrated') {
      partnerCount++
    }
  }

  return {
    total: selectedProducts.length,
    native: nativeCount,
    aiAgent: aiAgentCount,
    partner: partnerCount,
  }
}
