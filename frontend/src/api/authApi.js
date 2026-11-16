import apiClient from './client'

/** Sign-in API (backend: app/api/routes/auth.py). */

/** Options the server offers: demo sign-in (dev only), Microsoft SSO and password reset flags. */
export async function getAuthConfig() {
  const res = await apiClient.get('/auth/config')
  return res.data
}

/** { access_token, token_type, expires_in, user: { id, full_name, email, roles, role_labels, permissions } } */
export async function login({ email, password, rememberMe }) {
  const res = await apiClient.post('/auth/login', { email, password, remember_me: Boolean(rememberMe) })
  return res.data
}

/** Development only: the server answers 404 unless DEALDESK_DEMO_LOGIN is enabled. */
export async function demoLogin(roleCode) {
  const res = await apiClient.post('/auth/demo-login', { role_code: roleCode })
  return res.data
}

export async function getCurrentUser() {
  const res = await apiClient.get('/auth/me')
  return res.data
}

export async function logout() {
  await apiClient.post('/auth/logout')
}
