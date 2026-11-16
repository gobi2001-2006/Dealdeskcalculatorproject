/**
 * Signed-in session (Phase 2 login page).
 *
 * Holds the access token returned by POST /api/auth/login and the user's roles / permissions.
 * The password is never stored anywhere. "Keep me signed in" keeps the session in localStorage
 * (survives a browser restart); otherwise it lives in sessionStorage (ends with the tab).
 * The token expires on the server's schedule (expires_in) either way.
 *
 * Legacy / development: when nobody is signed in, VITE_DEALDESK_USER_ID still identifies a
 * user (it is not authentication); see legacyDevUserId().
 */

const KEY = 'dealdesk.session'
let memory = null

function stores() {
  const out = []
  try {
    out.push(window.sessionStorage)
  } catch {
    /* storage unavailable (private mode, blocked) */
  }
  try {
    out.push(window.localStorage)
  } catch {
    /* storage unavailable */
  }
  return out
}

function isValid(session) {
  return Boolean(session?.token) && Number(session.expiresAt) > Date.now()
}

/** The current session, or null when nobody is signed in or the token has expired. */
export function getSession() {
  if (memory && isValid(memory)) return memory
  memory = null
  for (const store of stores()) {
    try {
      const raw = store.getItem(KEY)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (isValid(parsed)) {
        memory = parsed
        return memory
      }
      store.removeItem(KEY)
    } catch {
      /* unreadable entry: ignore */
    }
  }
  return null
}

/** Save the response of /auth/login (or /auth/demo-login). */
export function saveSession({ access_token: token, expires_in: expiresIn, user }, remember = false) {
  memory = { token, user, remember: Boolean(remember), expiresAt: Date.now() + Number(expiresIn || 0) * 1000 }
  const [sessionStore, localStore] = [safe(() => window.sessionStorage), safe(() => window.localStorage)]
  const keep = remember ? localStore : sessionStore
  const drop = remember ? sessionStore : localStore
  try {
    drop?.removeItem(KEY)
    keep?.setItem(KEY, JSON.stringify(memory))
  } catch {
    /* the session still works for this page load (memory) */
  }
  return memory
}

export function clearSession() {
  memory = null
  for (const store of stores()) {
    try {
      store.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }
}

export function getToken() {
  return getSession()?.token || null
}

export function currentUser() {
  return getSession()?.user || null
}

/** Development identification without sign-in (VITE_DEALDESK_USER_ID); null when not configured. */
export function legacyDevUserId() {
  const id = Number(import.meta.env.VITE_DEALDESK_USER_ID)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** The acting user's id: the signed-in user, else the development id, else null. */
export function actingUserId() {
  return currentUser()?.id ?? legacyDevUserId()
}

/**
 * Where a user lands after signing in when no page was requested. Decided by the permissions the
 * backend returned (data from Admin -> Roles & Permissions), never by role names.
 */
export function landingPathFor(user) {
  const perms = new Set(user?.permissions || [])
  const approves = perms.has('approval.line_discount') || perms.has('approval.proposal_discount')
  const buildsProposals = perms.has('proposal.edit_configurator') || perms.has('proposal.import_hubspot')
  if (approves && !buildsProposals) return '/approvals'
  if (buildsProposals) return '/proposals/import'
  if (perms.has('admin.masters')) return '/catalogue'
  if ([...perms].some((p) => p.startsWith('admin.'))) return '/admin'
  if (perms.has('proposal.view')) return '/proposals'
  return '/'
}

function safe(fn) {
  try {
    return fn()
  } catch {
    return null
  }
}
