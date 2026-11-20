import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import apiClient from '../api/client'
import { ProposalProvider } from '../context/ProposalContext'
import { ApprovalsPage } from '../features/approvals/ApprovalsPage'
import { installFakeApi } from './fixtures/fakeApi'

vi.mock('../api/client')

// Every value below is test data returned by the (fake) API; the page must show only what it returns.
const ITEM = {
  proposal_id: 7, proposal_code: 'P-7', deal_name: 'Test Deal', company: 'Test Co', owner_name: 'Olive Owner',
  region: 'Test Region', status: 'submitted', currency: 'EUR', net_total: 900, list_total: 1000,
  effective_discount_pct: 10, breach_count: 1, awaiting_me: true, created_at: '2026-01-01T10:00:00Z',
  submitted_at: '2026-01-02T10:00:00Z', configuration_issues: [],
  current_stage: { stage_code: 'commercial_line', stage_label: 'Stage One', role_name: 'Role A',
    assigned_user_name: 'Ann Approver', approval_id: 55 },
}
const ROUTE = {
  route_source: 'admin_configuration', net_total: 900, list_total: 1000, currency: 'EUR', overall_discount_pct: 10,
  ceilings: { line_pct: 12, proposal_pct: null }, line_breaches: [{ label: 'Line X', discount_pct: 14 }],
  proposal_breaches: [], configuration_issues: [],
  approval_stages: [{ stage_level: 1, stage_code: 'commercial_line', stage_label: 'Stage One', role_name: 'Role A',
    assigned_user_name: 'Ann Approver', is_required: true, status: 'pending', reason: 'r', approval_id: 55 }],
}

function routes(overrides = {}) {
  return {
    'GET /approvals/inbox': () => ({ items: [ITEM], counts: { awaiting_me: 1, in_progress: 1, completed: 0, all: 1 } }),
    'GET /approvals/:id/my-action': () => ({ approval_id: 55, stage_label: 'Stage One', can_decide: true }),
    'GET /proposals/:id/approval-route': () => ROUTE,
    'GET /proposals/:id/readiness': () => ({ completed_count: 7, total_count: 8 }),
    'GET /proposals/:id/activity': () => [{ id: 1, title: 'Submitted', actor_name: 'Olive Owner',
      occurred_at: '2026-01-02T10:00:00Z', after: { notes: 'Please approve' } }],
    'POST /proposals/:id/approvals/:aid/decision': () => ({ success: true }),
    ...overrides,
  }
}

const renderPage = (url = '/approvals') =>
  render(
    <ProposalProvider>
      <MemoryRouter initialEntries={[url]}>
        <ApprovalsPage />
      </MemoryRouter>
    </ProposalProvider>,
  )

describe('Approvals page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows empty states from the API counts and no sample proposals', async () => {
    installFakeApi(apiClient, routes({ 'GET /approvals/inbox': () => ({ items: [], counts: { awaiting_me: 0, in_progress: 0, completed: 0, all: 0 } }) }))
    renderPage()
    expect(await screen.findByText('No proposals are waiting for you.')).toBeInTheDocument()
    expect(screen.getByText('Select a proposal to review.')).toBeInTheDocument()
  })

  it('lists inbox items and shows the selected proposal from the API', async () => {
    installFakeApi(apiClient, routes())
    renderPage('/approvals?tab=awaiting_me&proposalId=7')
    const list = await screen.findByRole('list', { name: 'Awaiting me proposals' })
    expect(within(list).getByText('Test Co — Test Deal')).toBeInTheDocument()
    const detail = screen.getByTestId('approval-detail')
    expect(await within(detail).findByText('Line X')).toBeInTheDocument()
    expect(within(detail).getByText(/ceiling 12%/)).toBeInTheDocument()
    expect(within(detail).getByText(/ceiling not configured/)).toBeInTheDocument()
    expect(within(detail).getByText('7/8')).toBeInTheDocument()
    expect(within(detail).getByText('“Please approve”')).toBeInTheDocument()
  })

  it('offers a decision only when the server says this user may decide', async () => {
    installFakeApi(apiClient, routes({ 'GET /approvals/:id/my-action': () => ({ approval_id: 55, stage_label: 'Stage One', can_decide: false }) }))
    renderPage('/approvals?tab=all&proposalId=7')
    await screen.findByText('Line X')
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
  })

  it('requires a comment to reject and sends the decision to the existing endpoint', async () => {
    const api = installFakeApi(apiClient, routes())
    renderPage('/approvals?tab=awaiting_me&proposalId=7')
    fireEvent.click(await screen.findByRole('button', { name: /Reject/ }))
    expect(screen.getByText('A comment is required when returning a proposal.')).toBeInTheDocument()
    expect(api.writes()).toHaveLength(0)

    fireEvent.change(screen.getByLabelText(/Comment/), { target: { value: 'Fix scope' } })
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    await waitFor(() => expect(api.writes()).toHaveLength(1))
    expect(api.writes()[0]).toMatchObject({ path: '/proposals/7/approvals/55/decision', body: { decision: 'rejected', notes: 'Fix scope' } })
  })

  it('says when the approval workflow is not configured', async () => {
    installFakeApi(apiClient, routes({ 'GET /proposals/:id/approval-route': () => ({ ...ROUTE, approval_stages: [] }) }))
    renderPage('/approvals?tab=all&proposalId=7')
    expect(await screen.findByText(/The approval workflow is not configured/)).toBeInTheDocument()
  })
})
