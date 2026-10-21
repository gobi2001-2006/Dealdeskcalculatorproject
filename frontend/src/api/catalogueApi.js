import apiClient from './client'

/**
 * Catalogue API service.
 * Connects to FastAPI backend routes under /api/catalogue:
 * - Product Families: List, Create, Get, Update, Delete
 * - Products: List, Create, Get, Update, Delete
 * - Features: List, Create, Update, Delete
 */

// ============================================================================
// Product Family API Endpoints
// ============================================================================

/**
 * Fetches all product families from the backend.
 * @param {string} [status]
 * @returns {Promise<Array<{id: number, code: string, name: string, sort_order: number|null, status: string}>>}
 */
export async function getCatalogueFamilies(status) {
  const params = status ? { status } : {}
  const response = await apiClient.get('/catalogue/families', { params })
  return response.data
}

/**
 * Creates a new product family.
 * @param {{code: string, name: string, sort_order?: number|null, status?: string}} payload
 * @returns {Promise<{id: number, code: string, name: string, sort_order: number|null, status: string}>}
 */
export async function createCatalogueFamily(payload) {
  const response = await apiClient.post('/catalogue/families', payload)
  return response.data
}

/**
 * Updates an existing product family.
 * @param {number} familyId
 * @param {{code?: string, name?: string, sort_order?: number|null, status?: string}} payload
 * @returns {Promise<{id: number, code: string, name: string, sort_order: number|null, status: string}>}
 */
export async function updateCatalogueFamily(familyId, payload) {
  const response = await apiClient.patch(`/catalogue/families/${familyId}`, payload)
  return response.data
}

/**
 * Deletes a product family.
 * @param {number} familyId
 * @returns {Promise<void>}
 */
export async function deleteCatalogueFamily(familyId) {
  await apiClient.delete(`/catalogue/families/${familyId}`)
}

// ============================================================================
// Product API Endpoints
// ============================================================================

/**
 * Fetches products, optionally filtered by family_id or status.
 * @param {number} [familyId]
 * @param {string} [status]
 * @returns {Promise<Array<{id: number, product_family_id: number, code: string, name: string, status: string}>>}
 */
export async function getCatalogueProducts(familyId, status) {
  const params = {}
  if (familyId !== undefined && familyId !== null) params.family_id = familyId
  if (status) params.status = status
  const response = await apiClient.get('/catalogue/products', { params })
  return response.data
}

/**
 * Creates a new product module.
 * @param {{product_family_id: number, code: string, name: string, status?: string}} payload
 * @returns {Promise<{id: number, product_family_id: number, code: string, name: string, status: string}>}
 */
export async function createCatalogueProduct(payload) {
  const response = await apiClient.post('/catalogue/products', payload)
  return response.data
}

/**
 * Updates an existing product module.
 * @param {number} productId
 * @param {{product_family_id?: number, code?: string, name?: string, status?: string}} payload
 * @returns {Promise<{id: number, product_family_id: number, code: string, name: string, status: string}>}
 */
export async function updateCatalogueProduct(productId, payload) {
  const response = await apiClient.patch(`/catalogue/products/${productId}`, payload)
  return response.data
}

/**
 * Deletes a product module.
 * @param {number} productId
 * @returns {Promise<void>}
 */
export async function deleteCatalogueProduct(productId) {
  await apiClient.delete(`/catalogue/products/${productId}`)
}

// ============================================================================
// Feature API Endpoints
// ============================================================================

/**
 * Fetches features, optionally filtered by product_id or status.
 * @param {number} [productId]
 * @param {string} [status]
 * @returns {Promise<Array<{id: number, product_id: number, code: string, name: string, classification: string, partner_name: string|null, status: string}>>}
 */
export async function getCatalogueFeatures(productId, status) {
  const params = {}
  if (productId !== undefined && productId !== null) params.product_id = productId
  if (status) params.status = status
  const response = await apiClient.get('/catalogue/features', { params })
  return response.data
}

/**
 * Creates a feature under a product.
 * @param {{product_id: number, code: string, name: string, classification: string, partner_name?: string|null, status?: string}} payload
 * @returns {Promise<{id: number, product_id: number, code: string, name: string, classification: string, partner_name: string|null, status: string}>}
 */
export async function createCatalogueFeature(payload) {
  const response = await apiClient.post('/catalogue/features', payload)
  return response.data
}

/**
 * Updates an existing feature.
 * @param {number} featureId
 * @param {{product_id?: number, code?: string, name?: string, classification?: string, partner_name?: string|null, status?: string}} payload
 * @returns {Promise<{id: number, product_id: number, code: string, name: string, classification: string, partner_name: string|null, status: string}>}
 */
export async function updateCatalogueFeature(featureId, payload) {
  const response = await apiClient.patch(`/catalogue/features/${featureId}`, payload)
  return response.data
}

/**
 * Deletes a feature.
 * @param {number} featureId
 * @returns {Promise<void>}
 */
export async function deleteCatalogueFeature(featureId) {
  await apiClient.delete(`/catalogue/features/${featureId}`)
}
