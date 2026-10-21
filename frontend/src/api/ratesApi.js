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

export async function getUnitsOfMeasure() {
  const res = await apiClient.get('/masters/units-of-measure')
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
