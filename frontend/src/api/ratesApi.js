import apiClient from './client'

/**
 * Deal Desk Rates & Master Data API client.
 * Connects Page 3 (Rate Card & Masters) to FastAPI backend endpoints:
 * - Masters: Countries, Currencies, Customer Tiers, Deployment Models, Pricing Models, FX Rates, UOMs
 * - Pricing: Rate Card Versions, Service Rates, Commercial Rate Cards
 */

// ============================================================================
// Master Data APIs
// ============================================================================

export async function getCountries(status) {
  const params = status ? { status } : {}
  const res = await apiClient.get('/masters/countries', { params })
  return res.data
}

export async function createCountry(payload) {
  const res = await apiClient.post('/masters/countries', payload)
  return res.data
}

export async function updateCountry(id, payload) {
  const res = await apiClient.patch(`/masters/countries/${id}`, payload)
  return res.data
}

export async function deleteCountry(id) {
  await apiClient.delete(`/masters/countries/${id}`)
}

export async function getCurrencies(status) {
  const params = status ? { status } : {}
  const res = await apiClient.get('/masters/currencies', { params })
  return res.data
}

export async function createCurrency(payload) {
  const res = await apiClient.post('/masters/currencies', payload)
  return res.data
}

export async function getCustomerTiers(status) {
  const params = status ? { status } : {}
  const res = await apiClient.get('/masters/customer-tiers', { params })
  return res.data
}

export async function createCustomerTier(payload) {
  const res = await apiClient.post('/masters/customer-tiers', payload)
  return res.data
}

export async function updateCustomerTier(id, payload) {
  const res = await apiClient.patch(`/masters/customer-tiers/${id}`, payload)
  return res.data
}

export async function deleteCustomerTier(id) {
  await apiClient.delete(`/masters/customer-tiers/${id}`)
}

export async function getDeploymentModels(status) {
  const params = status ? { status } : {}
  const res = await apiClient.get('/masters/deployment-models', { params })
  return res.data
}

export async function createDeploymentModel(payload) {
  const res = await apiClient.post('/masters/deployment-models', payload)
  return res.data
}

export async function updateDeploymentModel(id, payload) {
  const res = await apiClient.patch(`/masters/deployment-models/${id}`, payload)
  return res.data
}

export async function deleteDeploymentModel(id) {
  await apiClient.delete(`/masters/deployment-models/${id}`)
}

export async function getDeploymentPricingOptions() {
  const res = await apiClient.get('/masters/deployment-pricing-options')
  return res.data
}

export async function getPricingModels(status) {
  const params = status ? { status } : {}
  const res = await apiClient.get('/masters/pricing-models', { params })
  return res.data
}

export async function createPricingModel(payload) {
  const res = await apiClient.post('/masters/pricing-models', payload)
  return res.data
}

export async function updatePricingModel(id, payload) {
  const res = await apiClient.patch(`/masters/pricing-models/${id}`, payload)
  return res.data
}

export async function deletePricingModel(id) {
  await apiClient.delete(`/masters/pricing-models/${id}`)
}

export async function getUnitsOfMeasure(params) {
  const res = await apiClient.get('/masters/units-of-measure', { params })
  return res.data
}

export async function createUnitOfMeasure(payload) {
  const res = await apiClient.post('/masters/units-of-measure', payload)
  return res.data
}

export async function updateUnitOfMeasure(id, payload) {
  const res = await apiClient.patch(`/masters/units-of-measure/${id}`, payload)
  return res.data
}

export async function deleteUnitOfMeasure(id) {
  await apiClient.delete(`/masters/units-of-measure/${id}`)
}

export async function getAllowedUomsForPricingModel(pricingModelId) {
  const res = await apiClient.get(`/masters/pricing-models/${pricingModelId}/allowed-uoms`)
  return res.data
}

/** Approval thresholds in effect today (approval_thresholds table). Display only: not enforced yet. */
export async function getApprovalThresholds() {
  const res = await apiClient.get('/masters/approval-thresholds')
  return res.data
}

export async function getFxRates(params) {
  const res = await apiClient.get('/masters/fx-rates', { params })
  return res.data
}

export async function createFxRate(payload) {
  const res = await apiClient.post('/masters/fx-rates', payload)
  return res.data
}

export async function deleteFxRate(id) {
  await apiClient.delete(`/masters/fx-rates/${id}`)
}

// ============================================================================
// Rate Card & Service Rates APIs
// ============================================================================

export async function getRateCardVersions(status) {
  const params = status ? { status } : {}
  const res = await apiClient.get('/rates/versions', { params })
  return res.data
}

export async function getActiveRateCardVersion() {
  const res = await apiClient.get('/rates/versions/active')
  return res.data
}

/**
 * Resolves the applicable commercial rate-card entry for the six pricing dimensions:
 * POST /api/rates/resolve
 */
export async function resolveRateCard(payload) {
  const res = await apiClient.post('/rates/resolve', payload)
  return res.data
}

export async function createRateCardVersion(payload) {
  const res = await apiClient.post('/rates/versions', payload)
  return res.data
}

export async function activateRateCardVersion(id, activatedBy) {
  const params = activatedBy ? { activated_by: activatedBy } : {}
  const res = await apiClient.post(`/rates/versions/${id}/activate`, null, { params })
  return res.data
}

export async function getServiceRates(params) {
  const res = await apiClient.get('/rates/service-rates', { params })
  return res.data
}

export async function createServiceRate(payload) {
  const res = await apiClient.post('/rates/service-rates', payload)
  return res.data
}

export async function updateServiceRate(id, payload) {
  const res = await apiClient.patch(`/rates/service-rates/${id}`, payload)
  return res.data
}

export async function deleteServiceRate(id) {
  await apiClient.delete(`/rates/service-rates/${id}`)
}

export async function getRateCards(params) {
  const res = await apiClient.get('/rates/rate-cards', { params })
  return res.data
}

/**
 * Units of measure that have a saved rate schedule for a pack or feature under the given
 * country / deployment / pricing model / tier, in the active rate card version.
 * Used when an item is priced under more than one UOM (e.g. ESS and non-ESS) so the user can choose.
 */
export async function getRateScheduleUoms(dims) {
  const version = await getActiveRateCardVersion()
  const cards = await getRateCards({ ...dims, rate_card_version_id: version?.id })
  const byId = new Map()
  ;(Array.isArray(cards) ? cards : []).forEach((rc) => {
    if (!byId.has(rc.uom_id)) byId.set(rc.uom_id, { id: rc.uom_id, name: rc.uom?.name || `UOM #${rc.uom_id}` })
  })
  return [...byId.values()]
}

export async function upsertRateCard(payload) {
  const res = await apiClient.post('/rates/rate-cards', payload)
  return res.data
}

export async function updateRateCard(id, payload) {
  const res = await apiClient.patch(`/rates/rate-cards/${id}`, payload)
  return res.data
}

export async function deleteRateCard(id) {
  await apiClient.delete(`/rates/rate-cards/${id}`)
}

export async function deleteRateCardGroup(params) {
  await apiClient.delete('/rates/rate-cards/group', { params })
}

export async function updateRateCardGroupUom(params) {
  const res = await apiClient.patch('/rates/rate-cards/group-uom', null, { params })
  return res.data
}

// Platform + Subscription: save every tier row of one pack or feature in one transaction
// (a platform fee per tier, plus one UOM and one subscription rate for the item).
export async function saveRateCardTarget(payload) {
  const res = await apiClient.put('/rates/rate-cards/target', payload)
  return res.data
}

/**
 * Fetch available roles from /masters/roles (or fallback to /rates/service-rates).
 * Fully database-driven roles for Change Request Rates and service scopes.
 */
export async function getMasterRoles() {
  try {
    const res = await apiClient.get('/masters/roles')
    if (Array.isArray(res.data) && res.data.length > 0) return res.data
  } catch (err) {
    console.warn('Could not fetch /masters/roles, falling back to service-rates:', err)
  }
  try {
    const sr = await apiClient.get('/rates/service-rates')
    if (Array.isArray(sr.data)) {
      const names = [...new Set(sr.data.map((r) => r.role_name).filter(Boolean))]
      return names.map((name, idx) => ({ id: idx + 1, name }))
    }
  } catch {}
  return []
}
