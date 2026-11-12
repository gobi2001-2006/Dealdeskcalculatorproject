/**
 * PACK BUILDER UI CONSTANTS AND HELPERS
 *
 * Colour presets and a display helper only. Packs always come from the backend
 * (/api/packs/); no demo packs are shipped with the app.
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
