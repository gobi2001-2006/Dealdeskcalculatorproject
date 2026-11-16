import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getSession, legacyDevUserId } from '../../auth/session'

/**
 * Route guard for every application page.
 *  - Signed in (valid token): the page opens.
 *  - Development only: VITE_DEALDESK_USER_ID set -> the page opens without signing in (existing setup).
 *    Production builds must leave it unset (and the backend should set DEALDESK_ALLOW_USER_ID_HEADER=false).
 *  - Otherwise: the login page, which returns to the requested page after signing in.
 * What a user may do on a page is still decided by the backend's permission checks.
 */
export function RequireAuth() {
  const location = useLocation()
  if (getSession() || legacyDevUserId()) return <Outlet />
  const from = `${location.pathname}${location.search}`
  return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />
}

export default RequireAuth
