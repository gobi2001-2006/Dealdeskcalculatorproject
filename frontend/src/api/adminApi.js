import apiClient from './client'

/** Admin module API (backend: /api/admin). Every call carries the acting user (sign-in token, or X-User-Id in development; see client.js). */

export function adminErrorMessage(error, fallback = 'Request failed.') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join(' ')
  if (detail && typeof detail === 'object') return detail.message || JSON.stringify(detail)
  if (error?.response?.status === 401) return 'You are not signed in. Sign in and try again.'
  return error?.message || fallback
}

const data = (p) => p.then((r) => r.data)

export const adminApi = {
  me: () => data(apiClient.get('/admin/me')),
  meta: () => data(apiClient.get('/admin/meta')),

  listUsers: (search) => data(apiClient.get('/admin/users', { params: search ? { search } : {} })),
  createUser: (body) => data(apiClient.post('/admin/users', body)),
  updateUser: (id, body) => data(apiClient.patch(`/admin/users/${id}`, body)),
  deleteUser: (id) => data(apiClient.delete(`/admin/users/${id}`)),

  listRegions: () => data(apiClient.get('/admin/regions')),
  createRegion: (body) => data(apiClient.post('/admin/regions', body)),
  updateRegion: (id, body) => data(apiClient.patch(`/admin/regions/${id}`, body)),
  deleteRegion: (id) => data(apiClient.delete(`/admin/regions/${id}`)),

  getMatrix: () => data(apiClient.get('/admin/roles-permissions')),
  saveMatrix: (grants) => data(apiClient.put('/admin/roles-permissions', { grants })),
  resetMatrix: () => data(apiClient.post('/admin/roles-permissions/reset')),

  getWorkflow: () => data(apiClient.get('/admin/workflow')),
  saveWorkflow: (body) => data(apiClient.put('/admin/workflow', body)),

  listRules: () => data(apiClient.get('/admin/notifications/rules')),
  updateRule: (eventCode, body) => data(apiClient.put(`/admin/notifications/rules/${eventCode}`, body)),
  previewRule: (eventCode, body) => data(apiClient.post(`/admin/notifications/rules/${eventCode}/preview`, body)),
  resetRuleTemplate: (eventCode) => data(apiClient.post(`/admin/notifications/rules/${eventCode}/reset`)),
  testSend: (eventCode, userId, proposalId = null) =>
    data(
      apiClient.post(`/admin/notifications/rules/${eventCode}/test-send`, {
        user_id: userId,
        ...(proposalId ? { proposal_id: proposalId } : {}),
      }),
    ),
  emailLog: (params) => data(apiClient.get('/admin/notifications/log', { params })),
  getSender: () => data(apiClient.get('/admin/notifications/sender')),
  saveSender: (body) => data(apiClient.put('/admin/notifications/sender', body)),
}

export default adminApi
