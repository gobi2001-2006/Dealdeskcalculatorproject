import { useEffect, useId, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart3, Briefcase, Eye, EyeOff, Landmark, Puzzle, Scale, Star, Wrench } from 'lucide-react'
import { AdrenalinLogo } from './AdrenalinLogo'
import { BRAND_RING } from '../../components/brand/brandColors'
import { demoLogin, getAuthConfig, login } from '../../api/authApi'
import { getSession, landingPathFor, saveSession } from '../../auth/session'
import './LoginPage.css'

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Icons for the demo role buttons (display only; role codes and labels come from /api/auth/config).
const ROLE_ICONS = {
  sales_lead: { Icon: Briefcase, color: '#b5651d' },
  presales: { Icon: Puzzle, color: '#0d6e63' },
  business_head: { Icon: Landmark, color: '#6d3fae' },
  legal: { Icon: Scale, color: '#0369a1' },
  cfo: { Icon: BarChart3, color: '#15803d' },
  ccxo: { Icon: Star, color: '#c2410c' },
  admin: { Icon: Wrench, color: '#5d6470' },
}

/** Only same-app paths may be returned to after sign-in (no external or protocol-relative URLs). */
function safeReturnPath(from) {
  if (!from || typeof from !== 'string') return null
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/login')) return null
  return from
}

function signInError(error) {
  const status = error?.response?.status
  const detail = error?.response?.data?.detail
  if (status === 401) return typeof detail === 'string' ? detail : 'Incorrect email or password.'
  if (status === 422) return 'Check your work email and password.'
  if (status === 404 && typeof detail === 'string' && detail !== 'Not Found') return detail
  if (!error?.response) return 'Cannot reach the Deal Desk server. Check your connection and try again.'
  return 'Sign-in failed. Please try again.'
}

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = safeReturnPath(params.get('from'))
  const expired = params.get('expired') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(expired ? 'Your session has ended. Please sign in again.' : '')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [demoBusy, setDemoBusy] = useState(null)
  const [config, setConfig] = useState(null)
  const submittingRef = useRef(false)
  const ids = useId()
  const emailRef = useRef(null)

  useEffect(() => {
    let active = true
    getAuthConfig()
      .then((cfg) => active && setConfig(cfg))
      // Without the server's answer nothing optional is offered (no demo roles, no SSO).
      .catch(() => active && setConfig({ demo_login_enabled: false, demo_roles: [], microsoft_sso_enabled: false, password_reset_enabled: false }))
    emailRef.current?.focus()
    return () => {
      active = false
    }
  }, [])

  const existing = getSession()
  if (existing) return <Navigate to={returnTo || landingPathFor(existing.user)} replace />

  const finish = (result, keep) => {
    const session = saveSession(result, keep)
    navigate(returnTo || landingPathFor(session.user), { replace: true })
  }

  const validate = () => {
    const errors = {}
    const trimmed = email.trim()
    if (!trimmed) errors.email = 'Enter your work email.'
    else if (!EMAIL_PATTERN.test(trimmed)) errors.email = 'Enter a valid email address, e.g. name@myadrenalin.com.'
    if (!password) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submittingRef.current) return // no repeated submissions
    setNotice('')
    setFormError('')
    if (!validate()) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const result = await login({ email: email.trim(), password, rememberMe: remember })
      setPassword('')
      finish(result, remember)
    } catch (error) {
      setFormError(signInError(error))
      setPassword('')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const handleDemo = async (roleCode) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setDemoBusy(roleCode)
    setFormError('')
    setNotice('')
    try {
      finish(await demoLogin(roleCode), false)
    } catch (error) {
      setFormError(signInError(error))
    } finally {
      submittingRef.current = false
      setDemoBusy(null)
    }
  }

  const busy = submitting || Boolean(demoBusy)
  const emailErrorId = `${ids}-email-error`
  const passwordErrorId = `${ids}-password-error`
  const demoRoles = config?.demo_login_enabled ? config.demo_roles || [] : []

  return (
    <div className="login-page">
      <aside className="login-art" aria-hidden="false">
        <svg className="login-art__bg" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
          {/* Brand ring from the Adrenalin badge, drawn large and faint (artwork only). */}
          <g fill="none" strokeWidth="34" opacity="0.32">
            <path d="M247 347 A250 250 0 0 1 601 347" stroke={BRAND_RING.top} />
            <path d="M601 347 A250 250 0 0 1 601 701" stroke={BRAND_RING.right} />
            <path d="M601 701 A250 250 0 0 1 247 701" stroke={BRAND_RING.bottom} />
            <path d="M247 701 A250 250 0 0 1 247 347" stroke={BRAND_RING.left} />
          </g>
          <g stroke="#1e293b" strokeWidth="1" fill="none">
            <path d="M0 200 H600" />
            <path d="M0 260 H600" />
            <path d="M0 320 H600" />
          </g>
        </svg>
        <span className="login-art__spectrum" aria-hidden="true" />
        <AdrenalinLogo onDark height={28} className="login-art__logo" />
        <div className="login-art__copy">
          <h2>
            One desk for every deal —<br />
            from HubSpot to signed proposal.
          </h2>
          <p>
            Configure pricing across countries, build the proposal narrative, and route discount and final approvals
            to the right Business Head, Legal and CFO — with every decision on record.
          </p>
        </div>
        <div className="login-art__foot">Internal use only · Adrenalin Deal Desk</div>
      </aside>

      <main className="login-form-panel">
        <div className="login-box">
          <AdrenalinLogo height={34} className="login-box__logo" />
          <h1 className="login-box__title">Sign in</h1>
          <p className="login-box__sub">Use your Adrenalin work account.</p>

          {formError && (
            <div className="login-alert login-alert--error" role="alert">
              {formError}
            </div>
          )}
          {notice && (
            <div className="login-alert login-alert--info" role="status">
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate aria-label="Sign in">
            <div className="login-field">
              <label htmlFor={`${ids}-email`}>Work email</label>
              <input
                ref={emailRef}
                id={`${ids}-email`}
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                placeholder="name@myadrenalin.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }))
                }}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? emailErrorId : undefined}
                required
                disabled={busy}
              />
              {fieldErrors.email && (
                <span className="login-field__error" id={emailErrorId}>
                  {fieldErrors.email}
                </span>
              )}
            </div>

            <div className="login-field">
              <label htmlFor={`${ids}-password`}>Password</label>
              <div className="login-password">
                <input
                  id={`${ids}-password`}
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }))
                  }}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
                  required
                  disabled={busy}
                />
                <button
                  type="button"
                  className="login-password__toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  disabled={busy}
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
              {fieldErrors.password && (
                <span className="login-field__error" id={passwordErrorId}>
                  {fieldErrors.password}
                </span>
              )}
            </div>

            <div className="login-row">
              <label className="login-check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={busy} />
                <span>Keep me signed in</span>
              </label>
              <button
                type="button"
                className="login-link"
                onClick={() =>
                  setNotice(
                    config?.password_reset_enabled
                      ? ''
                      : 'Password reset is not set up yet. Ask your Deal Desk administrator to reset your password.',
                  )
                }
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" className="login-btn login-btn--primary" disabled={busy} aria-busy={submitting}>
              {submitting ? (
                <>
                  <span className="login-spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <button
            type="button"
            className="login-btn login-btn--sso"
            aria-disabled={!config?.microsoft_sso_enabled}
            onClick={() =>
              setNotice(
                config?.microsoft_sso_enabled
                  ? ''
                  : 'Microsoft sign-in is not configured for this application yet. Use your work email and password.',
              )
            }
          >
            <svg width="15" height="15" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
              <rect width="10" height="10" fill="#f25022" />
              <rect x="11" width="10" height="10" fill="#7fba00" />
              <rect y="11" width="10" height="10" fill="#00a4ef" />
              <rect x="11" y="11" width="10" height="10" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </button>

          {demoRoles.length > 0 && (
            <section className="login-demo" aria-label="Demo sign-in">
              <div className="login-divider">Prototype — sign in as a demo role</div>
              <div className="login-roles">
                {demoRoles.map((role) => {
                  const { Icon, color } = ROLE_ICONS[role.code] || { Icon: Briefcase, color: '#6b6354' }
                  return (
                    <button
                      key={role.code}
                      type="button"
                      className="login-role"
                      onClick={() => handleDemo(role.code)}
                      disabled={busy}
                      aria-busy={demoBusy === role.code}
                    >
                      <Icon size={17} color={color} aria-hidden="true" />
                      <span>{role.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="login-demo__note">Development only: switched on by DEALDESK_DEMO_LOGIN on the server.</p>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

export default LoginPage
