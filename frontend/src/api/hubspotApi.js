import apiClient from './client'

/**
 * HubSpot Integration API Service
 */

export async function getHubspotStatus() {
  const response = await apiClient.get('/integrations/hubspot/status', { timeout: 8000 })
  return response.data
}

export async function searchHubspotDeals(query = '') {
  const response = await apiClient.get('/integrations/hubspot/deals', {
    params: { query },
    timeout: 8000,
  })
  return response.data
}

export async function getHubspotDealDetails(dealId) {
  const response = await apiClient.get(`/integrations/hubspot/deals/${dealId}`, {
    timeout: 8000,
  })
  return response.data
}

export async function importHubspotDeal(payload) {
  const response = await apiClient.post('/integrations/hubspot/import', payload, {
    timeout: 15000,
  })
  return response.data
}

export async function getProposalHubspotStatus(proposalId) {
  if (!proposalId) return { has_imported_deal: false }
  const response = await apiClient.get(`/integrations/hubspot/proposals/${proposalId}`, {
    timeout: 8000,
  })
  return response.data
}

