import apiClient from './client'

/**
 * Pack Builder API client.
 * Connects to FastAPI backend routes:
 * - GET /api/packs/
 * - POST /api/packs/
 * - GET /api/packs/detail/{pack_id}
 * - PATCH /api/packs/{pack_id}
 * - DELETE /api/packs/{pack_id}
 * - GET /api/packs/{pack_version_id}
 * - POST /api/packs/versions
 * - POST /api/packs/versions/{pack_version_id}/items/{feature_id}
 * - DELETE /api/packs/versions/{pack_version_id}/items/{feature_id}
 */

/**
 * Fetches all packs with nested versions.
 * @param {string} [status]
 * @returns {Promise<Array<any>>}
 */
export async function getPacks(status) {
  const params = status ? { status } : {}
  const response = await apiClient.get('/packs/', { params })
  return response.data
}

/**
 * Creates a new pack bundle.
 * @param {{code: string, name: string, variant: string, product_family_id?: number|null, status?: string, initial_version?: number, feature_ids?: number[]}} payload
 * @returns {Promise<any>}
 */
export async function createPack(payload) {
  const response = await apiClient.post('/packs/', payload)
  return response.data
}

/**
 * Retrieves a single pack by ID.
 * @param {number} packId
 * @returns {Promise<any>}
 */
export async function getPackDetail(packId) {
  const response = await apiClient.get(`/packs/detail/${packId}`)
  return response.data
}

/**
 * Updates pack metadata.
 * @param {number} packId
 * @param {{code?: string, name?: string, variant?: string, product_family_id?: number|null, status?: string}} payload
 * @returns {Promise<any>}
 */
export async function updatePack(packId, payload) {
  const response = await apiClient.patch(`/packs/${packId}`, payload)
  return response.data
}

/**
 * Deletes a pack bundle.
 * @param {number} packId
 * @returns {Promise<void>}
 */
export async function deletePack(packId) {
  await apiClient.delete(`/packs/${packId}`)
}

/**
 * Retrieves a pack version with constituent features/items.
 * @param {number} packVersionId
 * @returns {Promise<any>}
 */
export async function getPackVersion(packVersionId) {
  const response = await apiClient.get(`/packs/${packVersionId}`)
  return response.data
}

/**
 * Creates a new pack version.
 * @param {{pack_id: number, version_no: number, status?: string, list_price_ref?: number|null}} payload
 * @returns {Promise<any>}
 */
export async function createPackVersion(payload) {
  const response = await apiClient.post('/packs/versions', payload)
  return response.data
}

/**
 * Updates a pack version (e.g. status transition).
 * @param {number} packVersionId
 * @param {{status?: string, list_price_ref?: number|null, locked_at?: string|null}} payload
 * @returns {Promise<any>}
 */
export async function updatePackVersion(packVersionId, payload) {
  const response = await apiClient.patch(`/packs/versions/${packVersionId}`, payload)
  return response.data
}

/**
 * Adds an item to a pack version.
 * @param {number} packVersionId
 * @param {number} featureId
 * @returns {Promise<any>}
 */
export async function addPackItem(packVersionId, featureId, isRequired = true) {
  const params = { is_required: isRequired }
  const response = await apiClient.post(
    `/packs/versions/${packVersionId}/items/${featureId}`,
    null,
    { params },
  )
  return response.data
}

/**
 * Removes an item from a pack version.
 * @param {number} packVersionId
 * @param {number} featureId
 * @returns {Promise<void>}
 */
export async function removePackItem(packVersionId, featureId) {
  await apiClient.delete(`/packs/versions/${packVersionId}/items/${featureId}`)
}

/**
 * Synchronizes all items in a pack version with their requirement flags.
 * @param {number} packVersionId
 * @param {Array<{feature_id: number, is_required: boolean}>} items
 * @returns {Promise<Array<any>>}
 */
export async function syncPackItems(packVersionId, items) {
  const response = await apiClient.put(`/packs/versions/${packVersionId}/items`, items)
  return response.data
}

/**
 * Updates requirement status for an existing feature in a pack version.
 * @param {number} packVersionId
 * @param {number} featureId
 * @param {boolean} isRequired
 * @returns {Promise<any>}
 */
export async function updatePackItem(packVersionId, featureId, isRequired) {
  const params = { is_required: isRequired }
  const response = await apiClient.patch(
    `/packs/versions/${packVersionId}/items/${featureId}`,
    null,
    { params },
  )
  return response.data
}
