import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProposalProvider, ACTIVE_PROPOSAL_STORAGE_KEY } from '../context/ProposalContext'
import { ProposalReviewSubmitPage } from '../features/proposals/ProposalReviewSubmitPage'
import * as proposalsApi from '../api/proposalsApi'

vi.mock('../api/proposalsApi', () => ({
  getProposalReadiness: vi.fn(),
  getProposalApprovalRoute: vi.fn(),
  getProposalActivity: vi.fn(),
  submitProposalForApproval: vi.fn(),
  decideProposalApproval: vi.fn(),
  recallProposalSubmission: vi.fn(),
  listProposals: vi.fn(),
  getProposal: vi.fn(),
  getLatestCalculation: vi.fn(),
}))

describe('Proposal Review & Submit — Active Proposal Selection & Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
  })

  it('retrieves active proposal from sessionStorage / context when opening /proposals/review without URL params', async () => {
    // Simulate active proposal ID saved in previous workflow step
    sessionStorage.setItem(ACTIVE_PROPOSAL_STORAGE_KEY, '42')

    proposalsApi.getProposalReadiness.mockResolvedValue({
      proposal_id: 42,
      proposal_code: 'PROP-2026-0042',
      proposal_version_id: 101,
      version_no: 1,
      status: 'draft',
      customer_name: 'Acme Corporation',
      deal_name: 'Acme Enterprise HRMS',
      region: 'Middle East',
      primary_country: 'United Arab Emirates',
      currency: 'AED',
      currency_symbol: 'AED',
      is_ready: true,
      completed_count: 8,
      total_count: 8,
      readiness_percentage: 100,
      checklist: [
        { id: 'deal_imported', label: 'HubSpot Deal / CRM Association', is_complete: true, details: 'Linked', step_route: '/proposals/import' },
        { id: 'configurator', label: 'Countries & Products Configured', is_complete: true, details: 'Configured', step_route: '/calculator' },
        { id: 'executive_summary', label: 'Executive Summary Narrative', is_complete: true, details: 'Present', step_route: '/proposals/content?section=executive_summary' },
        { id: 'scope_of_work', label: 'Scope of Work Narrative', is_complete: true, details: 'Present', step_route: '/proposals/content?section=scope_of_work' },
        { id: 'customization_integration', label: 'Customization & Integrations Scope', is_complete: true, details: 'Present', step_route: '/proposals/content?section=customization_integration' },
        { id: 'terms_conditions', label: 'Commercial Terms & Conditions', is_complete: true, details: 'Present', step_route: '/proposals/content?section=terms_conditions' },
        { id: 'fitment_document', label: 'Fitment Analysis Document', is_complete: true, details: 'Present', step_route: '/proposals/content?section=fitment_document' },
        { id: 'payment_milestones', label: 'Payment Milestones Breakdown', is_complete: true, details: '100% total', step_route: '/proposals/content?section=terms_conditions' },
      ],
      commercials: {
        snapshot_id: 205,
        currency: 'AED',
        currency_symbol: 'AED',
        net_total: 500000,
        gross_total: 600000,
        effective_discount_pct: 16.7,
        discount_breaches_count: 0,
      },
      discount_policy: {
        line_level: { policy_name: 'Line-Level Discount Policy', actual_pct: 10, ceiling_pct: 15, is_breached: false, required_role: 'Pricing Desk' },
        proposal_level: { policy_name: 'Proposal-Level Discount Policy', actual_pct: 16.7, ceiling_pct: 20, is_breached: false, required_role: 'Business Head' },
        gm_floor: { policy_name: 'Gross Margin Floor Policy', actual_pct: 60, floor_pct: 50, is_breached: false, required_role: 'Business Head' },
        breaches_count: 0,
        breaches: [],
      },
    })

    proposalsApi.getProposalApprovalRoute.mockResolvedValue({
      proposal_id: 42,
      proposal_code: 'PROP-2026-0042',
      proposal_version_id: 101,
      overall_discount_pct: 16.7,
      max_line_discount_pct: 10,
      gross_margin_pct: 60,
      total_contract_value: 500000,
      currency: 'AED',
      requires_approval: true,
      highest_approval_stage: 'Pricing Desk',
      summary_reason: 'Normal discount governance',
      stages: [
        {
          stage_id: 'sales_lead',
          stage_order: 1,
          role_name: 'Sales Lead',
          assigned_user_name: 'Priya Sharma',
          is_required: true,
          status: 'pending',
          reason: 'Initial sales review',
        },
      ],
    })

    proposalsApi.getProposalActivity.mockResolvedValue([])

    render(
      <MemoryRouter initialEntries={['/proposals/review']}>
        <ProposalProvider>
          <Routes>
            <Route path="/proposals/review" element={<ProposalReviewSubmitPage />} />
          </Routes>
        </ProposalProvider>
      </MemoryRouter>
    )

    // Should load proposal #42 details without displaying "No active proposal selected"
    await waitFor(() => {
      expect(screen.getByText('PROP-2026-0042')).toBeInTheDocument()
      expect(screen.getByText('Acme Corporation')).toBeInTheDocument()
      expect(screen.getByText('Acme Enterprise HRMS')).toBeInTheDocument()
      expect(screen.queryByText('No active proposal selected')).not.toBeInTheDocument()
    })

    // Verify Commercial calculations and 8-point checklist are rendered
    expect(screen.getByText('Authoritative Commercial Summary')).toBeInTheDocument()
    expect(screen.getByText('AED 500,000.00')).toBeInTheDocument()
    expect(screen.getByText('8 / 8 Verified')).toBeInTheDocument()
  })

  it('displays proper error banner with retry button when backend fails, NOT "No active proposal selected"', async () => {
    sessionStorage.setItem(ACTIVE_PROPOSAL_STORAGE_KEY, '42')
    proposalsApi.getProposalReadiness.mockRejectedValue(new Error('Backend database timeout'))

    render(
      <MemoryRouter initialEntries={['/proposals/review?proposalId=42']}>
        <ProposalProvider>
          <Routes>
            <Route path="/proposals/review" element={<ProposalReviewSubmitPage />} />
          </Routes>
        </ProposalProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load proposal governance details')).toBeInTheDocument()
      expect(screen.getAllByText('Backend database timeout').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
      expect(screen.queryByText('No active proposal selected')).not.toBeInTheDocument()
    })
  })

  it('displays "No active proposal selected" only when genuinely no proposal exists anywhere', async () => {
    // No proposal in session storage or URL
    proposalsApi.listProposals.mockResolvedValue([])

    render(
      <MemoryRouter initialEntries={['/proposals/review']}>
        <ProposalProvider>
          <Routes>
            <Route path="/proposals/review" element={<ProposalReviewSubmitPage />} />
          </Routes>
        </ProposalProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('No active proposal selected')).toBeInTheDocument()
      expect(screen.getByText(/No active proposal is open in the current workflow/)).toBeInTheDocument()
      expect(screen.getAllByRole('link', { name: /import from hubspot/i }).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByRole('link', { name: /go to configurator/i }).length).toBeGreaterThanOrEqual(1)
    })
  })
})
