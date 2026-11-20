import apiClient from './client'

/** GET /api/approvals/inbox — proposals the signed-in user can see, with counts per tab. */
export async function getApprovalInbox() {
  const res = await apiClient.get('/approvals/inbox')
  return res.data
}

/** GET /api/approvals/{proposalId}/my-action — the open stage and whether this user may decide it. */
export async function getMyApprovalAction(proposalId) {
  const res = await apiClient.get(`/approvals/${proposalId}/my-action`)
  return res.data
}
