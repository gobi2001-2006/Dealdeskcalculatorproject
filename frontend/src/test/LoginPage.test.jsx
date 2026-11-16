import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import apiClient from '../api/client'
import { LoginPage } from '../features/auth/LoginPage'
import { RequireAuth } from '../features/auth/RequireAuth'
import { clearSession, getSession, landingPathFor, saveSession } from '../auth/session'
import { installFakeApi, httpError } from './fixtures/fakeApi'

vi.mock('../api/client')

const CONFIG_OFF = { password_login: true, demo_login_enabled: false, demo_roles: [], microsoft_sso_enabled: false, password_reset_enabled: false }
const DEMO_ROLES = [
  { code: 'sales_lead', label: 'Sales' }, { code: 'presales', label: 'Presales' },
  { code: 'business_head', label: 'Business Head' }, { code: 'legal', label: 'Legal' },
  { code: 'cfo', label: 'CFO' }, { code: 'ccxo', label: 'CCXO' }, { code: 'admin', label: 'Admin' },
]
const tokenFor = (user) => ({ access_token: `token-${user.id}`, token_type: 'bearer', expires_in: 3600, user })
const SALES = { id: 2, full_name: 'Sam Sales', email: 'sam@myadrenalin.com', roles: ['sales_lead'], role_labels: ['Sales'],
  permissions: ['proposal.view', 'proposal.edit_configurator', 'proposal.import_hubspot'] }
const APPROVER = { id: 3, full_name: 'Bea Head', email: 'bea@myadrenalin.com', roles: ['business_head'], role_labels: ['Business Head'],
  permissions: ['proposal.view', 'approval.line_discount'] }

function Where() {
  const loc = useLocation()
  return <div data-testid="where">{`${loc.pathname}${loc.search}`}</div>
}

function renderLogin(url = '/login') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

const emailInput = () => screen.getByLabelText(/work email/i)
const passwordInput = () => screen.getByLabelText(/^password$/i)
const submit = () => fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSession()
  })

  it('shows the branding, the form and the Microsoft button, without demo roles when the server disables them', async () => {
    installFakeApi(apiClient, { 'GET /auth/config': () => CONFIG_OFF })
    renderLogin()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('Use your Adrenalin work account.')).toBeInTheDocument()
    expect(screen.getByText(/One desk for every deal/)).toBeInTheDocument()
    expect(screen.getByText('Internal use only · Adrenalin Deal Desk')).toBeInTheDocument()
    expect(emailInput()).toHaveAttribute('placeholder', 'name@myadrenalin.com')
    expect(screen.getByRole('checkbox', { name: /keep me signed in/i })).toBeChecked()
    expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toHaveAttribute('aria-disabled', 'true')
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/auth/config'))
    expect(screen.queryByText(/sign in as a demo role/i)).not.toBeInTheDocument()
  })

  it('validates required fields and the email format before calling the server', async () => {
    const api = installFakeApi(apiClient, { 'GET /auth/config': () => CONFIG_OFF })
    renderLogin()
    submit()
    expect(await screen.findByText('Enter your work email.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    fireEvent.change(emailInput(), { target: { value: 'not-an-email' } })
    fireEvent.change(passwordInput(), { target: { value: 'x' } })
    submit()
    expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument()
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true')
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([])
  })

  it('shows and hides the password', () => {
    installFakeApi(apiClient, { 'GET /auth/config': () => CONFIG_OFF })
    renderLogin()
    expect(passwordInput()).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(passwordInput()).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(passwordInput()).toHaveAttribute('type', 'password')
  })

  it('signs in, keeps the session only as long as asked, and lands by permission', async () => {
    const api = installFakeApi(apiClient, {
      'GET /auth/config': () => CONFIG_OFF,
      'POST /auth/login': () => tokenFor(APPROVER),
    })
    renderLogin()
    fireEvent.change(emailInput(), { target: { value: ' bea@myadrenalin.com ' } })
    fireEvent.change(passwordInput(), { target: { value: 'Secret-123' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /keep me signed in/i })) // off: this tab only
    submit()
    expect(await screen.findByTestId('where')).toHaveTextContent('/approvals')
    expect(api.calls.find((c) => c.path === '/auth/login').body).toEqual({
      email: 'bea@myadrenalin.com', password: 'Secret-123', remember_me: false,
    })
    expect(getSession().user.id).toBe(3)
    expect(window.sessionStorage.getItem('dealdesk.session')).toContain('token-3')
    expect(window.localStorage.getItem('dealdesk.session')).toBeNull()
    // The password is never stored.
    expect(JSON.stringify({ ...window.sessionStorage, ...window.localStorage })).not.toContain('Secret-123')
  })

  it('returns to the page that was requested', async () => {
    installFakeApi(apiClient, { 'GET /auth/config': () => CONFIG_OFF, 'POST /auth/login': () => tokenFor(SALES) })
    renderLogin('/login?from=%2Fpricing-discounts%3FproposalId%3D31')
    fireEvent.change(emailInput(), { target: { value: 'sam@myadrenalin.com' } })
    fireEvent.change(passwordInput(), { target: { value: 'Secret-123' } })
    submit()
    expect(await screen.findByTestId('where')).toHaveTextContent('/pricing-discounts?proposalId=31')
    expect(window.localStorage.getItem('dealdesk.session')).toContain('token-2') // kept signed in
  })

  it('never redirects outside the application after sign-in', async () => {
    installFakeApi(apiClient, { 'GET /auth/config': () => CONFIG_OFF, 'POST /auth/login': () => tokenFor(SALES) })
    renderLogin('/login?from=%2F%2Fevil.example.com')
    fireEvent.change(emailInput(), { target: { value: 'sam@myadrenalin.com' } })
    fireEvent.change(passwordInput(), { target: { value: 'Secret-123' } })
    submit()
    expect(await screen.findByTestId('where')).toHaveTextContent('/proposals/import')
  })

  it('shows the server message for wrong credentials, stays on the page and clears the password', async () => {
    installFakeApi(apiClient, {
      'GET /auth/config': () => CONFIG_OFF,
      'POST /auth/login': () => {
        throw httpError(401, 'Incorrect email or password.')
      },
    })
    renderLogin()
    fireEvent.change(emailInput(), { target: { value: 'sam@myadrenalin.com' } })
    fireEvent.change(passwordInput(), { target: { value: 'wrong' } })
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(passwordInput()).toHaveValue('')
    expect(getSession()).toBeNull()
    expect(screen.queryByTestId('where')).not.toBeInTheDocument()
  })

  it('shows a loading state and sends one request however often the button is pressed', async () => {
    let resolve
    const api = installFakeApi(apiClient, {
      'GET /auth/config': () => CONFIG_OFF,
      'POST /auth/login': () => new Promise((r) => { resolve = r }),
    })
    renderLogin()
    fireEvent.change(emailInput(), { target: { value: 'sam@myadrenalin.com' } })
    fireEvent.change(passwordInput(), { target: { value: 'Secret-123' } })
    submit()
    const button = await screen.findByRole('button', { name: /signing in/i })
    expect(button).toBeDisabled()
    fireEvent.submit(button.closest('form'))
    fireEvent.submit(button.closest('form'))
    expect(api.calls.filter((c) => c.path === '/auth/login')).toHaveLength(1)
    resolve(tokenFor(SALES))
    expect(await screen.findByTestId('where')).toHaveTextContent('/proposals/import')
  })

  it('explains that Microsoft sign-in and password reset are not configured (nothing is simulated)', async () => {
    installFakeApi(apiClient, { 'GET /auth/config': () => CONFIG_OFF })
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in with microsoft/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/Microsoft sign-in is not configured/)
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/Password reset is not set up yet/)
    expect(getSession()).toBeNull()
  })

  it('offers the seven demo roles only when the server enables demo sign-in', async () => {
    const api = installFakeApi(apiClient, {
      'GET /auth/config': () => ({ ...CONFIG_OFF, demo_login_enabled: true, demo_roles: DEMO_ROLES }),
      'POST /auth/demo-login': () => tokenFor(SALES),
    })
    renderLogin()
    expect(await screen.findByText('Prototype — sign in as a demo role')).toBeInTheDocument()
    for (const role of DEMO_ROLES) expect(screen.getByRole('button', { name: role.label })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sales' }))
    expect(await screen.findByTestId('where')).toHaveTextContent('/proposals/import')
    expect(api.calls.find((c) => c.path === '/auth/demo-login').body).toEqual({ role_code: 'sales_lead' })
  })

  it('shows why a demo role cannot sign in', async () => {
    installFakeApi(apiClient, {
      'GET /auth/config': () => ({ ...CONFIG_OFF, demo_login_enabled: true, demo_roles: DEMO_ROLES }),
      'POST /auth/demo-login': () => {
        throw httpError(404, 'No active user has the Legal role. Assign one on Admin → Users first.')
      },
    })
    renderLogin()
    fireEvent.click(await screen.findByRole('button', { name: 'Legal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No active user has the Legal role')
  })

  it('tells the user when a session has expired', () => {
    installFakeApi(apiClient, { 'GET /auth/config': () => CONFIG_OFF })
    renderLogin('/login?expired=1')
    expect(screen.getByRole('alert')).toHaveTextContent('Your session has ended')
  })
})

describe('Route guard and session', () => {
  beforeEach(() => clearSession())
  afterEach(() => vi.unstubAllEnvs())

  function renderGuarded(url = '/approvals?tab=open') {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/login" element={<Where />} />
          <Route element={<RequireAuth />}>
            <Route path="*" element={<div data-testid="protected">protected page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  }

  it('sends a visitor who is not signed in to the login page, remembering the page', () => {
    vi.stubEnv('VITE_DEALDESK_USER_ID', '')
    renderGuarded()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/login?from=%2Fapprovals%3Ftab%3Dopen')
  })

  it('opens pages for a signed-in user', () => {
    vi.stubEnv('VITE_DEALDESK_USER_ID', '')
    saveSession(tokenFor(SALES), false)
    renderGuarded()
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('keeps the existing development setup working (VITE_DEALDESK_USER_ID)', () => {
    vi.stubEnv('VITE_DEALDESK_USER_ID', '1')
    renderGuarded()
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('treats an expired token as signed out', () => {
    vi.stubEnv('VITE_DEALDESK_USER_ID', '')
    saveSession({ ...tokenFor(SALES), expires_in: -1 }, true)
    expect(getSession()).toBeNull()
    renderGuarded()
    expect(screen.getByTestId('where')).toHaveTextContent('/login')
  })

  it('chooses the landing page from permissions, not role names', () => {
    expect(landingPathFor(APPROVER)).toBe('/approvals')
    expect(landingPathFor(SALES)).toBe('/proposals/import')
    expect(landingPathFor({ permissions: ['admin.users', 'admin.roles'] })).toBe('/admin')
    expect(landingPathFor({ permissions: ['admin.masters', 'admin.users'] })).toBe('/catalogue')
    expect(landingPathFor({ permissions: ['proposal.view'] })).toBe('/proposals')
    expect(landingPathFor({ permissions: [] })).toBe('/')
  })
})
