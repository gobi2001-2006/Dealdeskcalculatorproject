import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import apiClient from '../api/client'
import { ProposalProvider } from '../context/ProposalContext'
import { AdminPage } from '../features/admin/AdminPage'
import { installFakeApi } from './fixtures/fakeApi'

vi.mock('../api/client')

const META = {
  roles: [
    { code: 'sales_lead', label: 'Sales' }, { code: 'presales', label: 'Presales' },
    { code: 'business_head', label: 'Business Head' }, { code: 'legal', label: 'Legal' },
    { code: 'cfo', label: 'CFO' }, { code: 'ccxo', label: 'CCXO' }, { code: 'admin', label: 'Admin' },
  ],
  recipient_roles: ['sales', 'presales', 'business_head', 'legal', 'cfo', 'ccxo'],
  merge_fields: ['recipient', 'proposal_id', 'deal_name'],
  delivery_mode: 'simulated',
  global_region: 'Global',
  countries: [{ id: 1, name: 'India', iso_code: 'IN', region_id: 1 }],
}
const ADMIN_ME = {
  user: { id: 1, full_name: 'Ada Admin' }, roles: ['admin'], bootstrap_mode: false,
  permissions: ['admin.users', 'admin.roles', 'admin.workflow', 'admin.notifications'],
}
const USERS = [
  { id: 1, full_name: 'Ada Admin', email: 'ada@t.test', region: 'Global', is_active: true, last_login_at: null, role: 'admin', role_label: 'Admin', roles: ['admin'] },
  { id: 2, full_name: 'Rahul Iyer', email: 'rahul@t.test', region: 'India', is_active: true, last_login_at: null, role: 'business_head', role_label: 'Business Head', roles: ['business_head'] },
]
const REGIONS = [{ id: 1, name: 'India', sub_regions: null, status: 'active', business_head_user_id: 2, business_head_name: 'Rahul Iyer', countries: [] }]

function routes(overrides = {}) {
  return {
    'GET /admin/me': () => ADMIN_ME,
    'GET /admin/meta': () => META,
    'GET /admin/users': () => USERS,
    'GET /admin/regions': () => REGIONS,
    ...overrides,
  }
}

function renderAdmin(url = '/admin') {
  return render(
    <ProposalProvider>
      <MemoryRouter initialEntries={[url]}>
        <AdminPage />
      </MemoryRouter>
    </ProposalProvider>,
  )
}

describe('Admin module', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists users with role, region and active state, and counts users per role', async () => {
    installFakeApi(apiClient, routes())
    renderAdmin()
    const table = await screen.findByRole('table', { name: /Users table/i })
    expect(await within(table).findByDisplayValue('Rahul Iyer')).toBeInTheDocument()
    expect(within(table).getByRole('combobox', { name: /Region of Rahul Iyer/i })).toHaveValue('India')
    expect(within(table).getByRole('switch', { name: /Active: Rahul Iyer/i })).toHaveAttribute('aria-checked', 'true')
    expect(within(screen.getByTestId('role-card-business_head')).getByText('1')).toBeInTheDocument()
    // Region options come from the region master (+ Global), not hardcoded values.
    const opts = within(within(table).getByRole('combobox', { name: /Region of Ada Admin/i })).getAllByRole('option').map((o) => o.textContent)
    expect(opts).toEqual(['Not set', 'India', 'Global'])
  })

  it('adds a user and shows the backend duplicate-email error', async () => {
    const api = installFakeApi(apiClient, routes({
      'POST /admin/users': (body) => {
        if (body.email === 'rahul@t.test') {
          throw Object.assign(new Error('dup'), { response: { status: 409, data: { detail: 'A user with email rahul@t.test already exists.' } } })
        }
        return { id: 3, ...body, is_active: true, last_login_at: null, role_label: 'CFO', roles: [body.role] }
      },
    }))
    renderAdmin()
    await screen.findByRole('table', { name: /Users table/i })
    fireEvent.click(screen.getByRole('button', { name: /Add user/i }))
    const form = screen.getByRole('form', { name: /Add user/i })
    const [name, email] = within(form).getAllByRole('textbox')
    fireEvent.change(name, { target: { value: 'Dup' } })
    fireEvent.change(email, { target: { value: 'rahul@t.test' } })
    fireEvent.change(within(form).getAllByRole('combobox')[0], { target: { value: 'cfo' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(await screen.findByText(/already exists/)).toBeInTheDocument()

    fireEvent.change(email, { target: { value: 'cara@t.test' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Dup added.')).toBeInTheDocument()
    expect(api.calls.filter((c) => c.method === 'POST' && c.path === '/admin/users').at(-1).body)
      .toEqual({ full_name: 'Dup', email: 'cara@t.test', role: 'cfo', region: null })
  })

  it('changes a role inline and saves it through the backend', async () => {
    const api = installFakeApi(apiClient, routes({
      'PATCH /admin/users/:id': (body) => ({ ...USERS[1], ...body, role_label: 'Legal' }),
    }))
    renderAdmin()
    const select = await screen.findByRole('combobox', { name: /Role of Rahul Iyer/i })
    fireEvent.change(select, { target: { value: 'legal' } })
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH' && c.path === '/admin/users/2')).toBe(true))
    expect(api.calls.find((c) => c.method === 'PATCH').body).toEqual({ role: 'legal' })
  })

  it('saves the permission matrix with the ticked permissions', async () => {
    const matrix = {
      roles: [{ code: 'ccxo', label: 'CCXO' }, { code: 'admin', label: 'Admin' }],
      permissions: [
        { code: 'proposal.view', category: 'Proposal', label: 'View proposals & pricing', description: '' },
        { code: 'admin.users', category: 'Administration', label: 'Manage users', description: '' },
      ],
      grants: { ccxo: ['proposal.view'], admin: ['admin.users', 'proposal.view'] },
      locked: { admin: ['admin.users'] },
    }
    const api = installFakeApi(apiClient, routes({
      'GET /admin/roles-permissions': () => matrix,
      'PUT /admin/roles-permissions': (body) => ({ ...matrix, grants: body.grants }),
    }))
    renderAdmin('/admin?tab=roles')
    const box = await screen.findByRole('checkbox', { name: 'CCXO: Manage users' })
    expect(screen.getByRole('checkbox', { name: 'Admin: Manage users' })).toBeDisabled() // lock-out protection
    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }))
    await screen.findByText(/Permissions saved/)
    const put = api.calls.find((c) => c.method === 'PUT')
    expect(put.body.grants.ccxo.sort()).toEqual(['admin.users', 'proposal.view'])
  })

  it('hides tabs the acting user has no permission for', async () => {
    installFakeApi(apiClient, routes({
      'GET /admin/me': () => ({ ...ADMIN_ME, permissions: ['admin.notifications'] }),
      'GET /admin/notifications/rules': () => [],
      'GET /admin/notifications/log': () => [],
    }))
    renderAdmin()
    const tabs = await screen.findByRole('tablist', { name: /Admin sections/i })
    await waitFor(() => expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Email Notifications']))
  })
})
