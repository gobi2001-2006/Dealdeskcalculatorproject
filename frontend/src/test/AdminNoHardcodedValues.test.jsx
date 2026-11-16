import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import apiClient from '../api/client'
import { ProposalProvider } from '../context/ProposalContext'
import { AdminPage } from '../features/admin/AdminPage'
import { installFakeApi } from './fixtures/fakeApi'

vi.mock('../api/client')

// Every business value below is test data returned by the (fake) API: the screens must show
// exactly what the backend returns, and "Not configured" when it returns nothing.
const META = {
  roles: [
    { code: 'sales_lead', label: 'Sales Lead', description: 'Builds proposals (from the database)' },
    { code: 'cfo', label: 'Chief Financial Officer', description: null },
    { code: 'admin', label: 'System Administrator', description: 'Configures the desk' },
  ],
  recipient_roles: ['sales', 'cfo'],
  recipient_labels: { sales: 'Sales Lead (proposal owner)', cfo: 'Chief Financial Officer' },
  merge_fields: ['recipient', 'proposal_id'],
  delivery_mode: 'simulated',
  global_region: 'Global',
  countries: [],
}
const ME = {
  user: { id: 1, full_name: 'Test Admin' }, roles: ['admin'], bootstrap_mode: false,
  permissions: ['admin.users', 'admin.roles', 'admin.workflow', 'admin.notifications'],
}
const EMPTY_WORKFLOW = {
  ceilings: {
    line_discount: { value_pct: null, configured: false },
    overall_discount: { value_pct: null, configured: false },
    gm_floor: { value_pct: null, configured: false },
  },
  test_effective_discount: false,
  sla: { sla_hours: null, reminder_hours: null, escalate_hours: null, escalation_role: null },
  stages: [],
  regions: [],
  submitter_roles: [],
}
const RULE = {
  event_code: 'final_completed', label: 'Final approval — completed', description: 'All approvals done',
  is_enabled: true, recipient_roles: ['sales'], include_approve_links: false,
  subject_template: 'Approved {{proposal_id}}', body_template: 'Hi {{recipient}}', sort_order: 1,
}

function routes(overrides = {}) {
  return {
    'GET /admin/me': () => ME,
    'GET /admin/meta': () => META,
    'GET /admin/users': () => [],
    'GET /admin/regions': () => [],
    'GET /admin/workflow': () => EMPTY_WORKFLOW,
    'GET /admin/notifications/rules': () => [],
    'GET /admin/notifications/log': () => [],
    ...overrides,
  }
}

function renderAdmin(tab) {
  return render(
    <ProposalProvider>
      <MemoryRouter initialEntries={[`/admin?tab=${tab}`]}>
        <AdminPage />
      </MemoryRouter>
    </ProposalProvider>,
  )
}

describe('Admin module shows backend data only', () => {
  beforeEach(() => vi.clearAllMocks())

  it('takes role names, descriptions and counts from the API', async () => {
    installFakeApi(apiClient, routes())
    renderAdmin('users')
    const card = await screen.findByTestId('role-card-sales_lead')
    expect(within(card).getByText('Sales Lead')).toBeInTheDocument()
    expect(within(card).getByText('Builds proposals (from the database)')).toBeInTheDocument()
    expect(within(card).getByText('0')).toBeInTheDocument() // no users -> 0, counted from records
    expect(within(screen.getByTestId('role-card-cfo')).getByText('No description')).toBeInTheDocument()
  })

  it('shows unconfigured ceilings, stages and submitters as not configured (no fallback values)', async () => {
    installFakeApi(apiClient, routes())
    renderAdmin('workflow')
    expect(await screen.findAllByText(/Not configured — enter a value and save/)).toHaveLength(3)
    expect(screen.queryByText(/currently uses/)).not.toBeInTheDocument()
    for (const label of [/Line-level discount ceiling/, /Proposal-level discount ceiling/, /Gross margin floor/]) {
      expect(screen.getByLabelText(label)).toHaveValue(null)
    }
    expect(screen.getByText(/No approval stages are configured/)).toBeInTheDocument()
    expect(screen.getByText('No active approval stages.')).toBeInTheDocument()
    expect(screen.getByText('No role can submit (Roles & Permissions)')).toBeInTheDocument()
    expect(screen.queryByText('Sales / Presales')).not.toBeInTheDocument()
  })

  it('names the submitting roles from the permission matrix', async () => {
    installFakeApi(apiClient, routes({
      'GET /admin/workflow': () => ({ ...EMPTY_WORKFLOW, submitter_roles: [{ code: 'sales_lead', label: 'Sales Lead' }] }),
    }))
    renderAdmin('workflow')
    const preview = await screen.findByRole('list', { name: 'Route preview' })
    expect(within(preview).getByText('Sales Lead')).toBeInTheDocument()
  })

  it('says when no notification rules exist', async () => {
    installFakeApi(apiClient, routes())
    renderAdmin('notifications')
    expect(await screen.findByText(/No notification rules are configured/)).toBeInTheDocument()
  })

  it('labels recipients from the API and previews with a real proposal or none', async () => {
    let previewBody = { subject: 'Approved {{proposal_id}}', body: 'Hi {{recipient}}', proposal_id: null,
      proposal_code: null, recipients: [], from_name: null, from_email: null }
    installFakeApi(apiClient, routes({
      'GET /admin/notifications/rules': () => [RULE],
      'POST /admin/notifications/rules/:code/preview': () => previewBody,
    }))
    const view = renderAdmin('notifications')
    expect(await screen.findByRole('columnheader', { name: 'Sales Lead (proposal owner)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Chief Financial Officer' })).toBeInTheDocument()
    expect(await screen.findByText('Not configured (Sender settings)')).toBeInTheDocument()
    expect(screen.getByText(/no proposal yet — merge fields are shown unfilled/)).toBeInTheDocument()
    expect(screen.getByText('No recipient resolves for this proposal')).toBeInTheDocument()

    view.unmount()
    previewBody = { subject: 'Approved P-77', body: 'Hi Dana', proposal_id: 77, proposal_code: 'P-77',
      recipients: [{ name: 'Dana Owner', email: 'dana@t.test', role: 'sales' }], from_name: 'Desk', from_email: 'desk@t.test' }
    renderAdmin('notifications')
    expect(await screen.findByText('Live preview · using P-77')).toBeInTheDocument()
    expect(screen.getByText('Desk <desk@t.test>')).toBeInTheDocument()
    expect(screen.getByText('Dana Owner <dana@t.test> · Sales Lead (proposal owner)')).toBeInTheDocument()
  })
})
