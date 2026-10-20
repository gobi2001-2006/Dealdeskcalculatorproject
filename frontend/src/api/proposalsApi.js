import apiClient from './client'

/**
 * Proposals API Service Layer
 * 
 * Interacts with backend API endpoints for proposal calculation and persistence.
 * Strictly adheres to backend capabilities:
 * - Pricing calculations are backend-owned; no fake totals are computed in frontend.
 * - When calculation or persistence endpoints are not yet deployed, the service
 *   returns explicit pending/unavailable states and never invents fake success responses.
 */

/**
 * Request pricing calculation from backend engine.
 * If endpoint does not exist yet (FastAPI 404/network error), returns explicit pending state.
 */
export async function requestProposalCalculation(proposalPayload) {
  try {
    // Attempt backend calculation endpoint if available
    const response = await apiClient.post('/proposals/calculate', proposalPayload)
    return {
      status: 'success',
      data: response.data,
      isBackendCalculation: true,
    }
  } catch (error) {
    // Backend pricing engine endpoint is not yet deployed (404/ECONNREFUSED)
    const isUnavailable =
      !error.response || error.response.status === 404 || error.response.status === 503
    return {
      status: 'unavailable',
      pending: true,
      statusCode: error.response?.status,
      message: isUnavailable
        ? 'Pricing engine API endpoint is not yet available. Financial calculations remain backend-owned.'
        : error.message || 'API calculation request failed',
      data: null,
    }
  }
}

/**
 * Save proposal draft to backend.
 * If endpoint is not available, returns prototype status without claiming PostgreSQL persistence.
 */
export async function saveProposalDraft(proposalPayload) {
  try {
    const response = await apiClient.post('/proposals', proposalPayload)
    return {
      status: 'persisted',
      isPersisted: true,
      data: response.data,
      message: 'Proposal successfully saved to PostgreSQL database.',
    }
  } catch (error) {
    // Backend proposal persistence is not yet deployed
    return {
      status: 'prototype_saved',
      isPersisted: false,
      isPrototype: true,
      statusCode: error.response?.status,
      message:
        'Backend proposal persistence API is not yet available. Draft saved locally in frontend state (not persisted to PostgreSQL).',
      payload: proposalPayload,
    }
  }
}
