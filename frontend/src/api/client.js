import axios from 'axios'
import { clearSession, getToken, legacyDevUserId } from '../auth/session'

/**
 * Deal Desk API Client (FastAPI Backend Interface)
 * 
 * Reserved client for backend API communication.
 * In upcoming milestones, this client will connect to backend services:
 * - Master Data & SKUs (Milestone 2)
 * - Pricing Engine & Calculations (Milestone 3)
 * - Proposals Persistence (Milestone 4)
 * 
 * Note: No fake financial calculations or fabricated endpoints are implemented here.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // 60 s: headroom for a serverless database waking up (Neon cold start + TLS). Endpoints should
  // still answer in a few seconds; the inbox and route no longer issue a query per proposal/stage.
  timeout: 60000,
})

// Identify the acting user to the backend so permissions are enforced server-side:
//  - signed in: the access token from the login page (Authorization: Bearer ...);
//  - otherwise (development only): VITE_DEALDESK_USER_ID as X-User-Id (identification, not authentication).
apiClient.interceptors?.request?.use((config) => {
  config.headers = config.headers || {}
  const token = getToken()
  if (token) {
    if (!config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`
    return config
  }
  const id = legacyDevUserId()
  if (id && !config.headers['X-User-Id']) config.headers['X-User-Id'] = String(id)
  return config
})

// An expired or revoked sign-in: drop the session and return to the login page.
apiClient.interceptors?.response?.use(
  (response) => response,
  (error) => {
    const url = String(error?.config?.url || '')
    if (error?.response?.status === 401 && getToken() && !url.startsWith('/auth/login')) {
      clearSession()
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        const from = `${window.location.pathname}${window.location.search}`
        window.location.assign(`/login?expired=1&from=${encodeURIComponent(from)}`)
      }
    }
    return Promise.reject(error)
  },
)

export default apiClient
