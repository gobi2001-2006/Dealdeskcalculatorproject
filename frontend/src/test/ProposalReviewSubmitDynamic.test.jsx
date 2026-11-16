import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProposalProvider } from '../context/ProposalContext'
import { ProposalReviewSubmitPage } from '../features/proposals/ProposalReviewSubmitPage'
import * as proposalsApi from '../api/proposalsApi'

vi.mock('../api/proposalsApi', () => ({
  getProposalReadiness: vi.fn(),
  getProposalApprovalRoute: vi.fn(),
  getProposalActivity: vi.fn(),
  submitProposalForApproval: vi.fn(),
  decideProposalApproval: vi.fn(),
  recallProposalSubmission: vi.fn(),
}))

describe('Step 6: Review & Submit Dynamic Implementation', () => {
  const mockProposalId = 99

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dynamic proposal overview, commercial cards, checklist, discount policy, and approval route', async () => {
    // Dynamic mock matching a real backend response for an enterprise proposal
    proposalsApi.getProposalReadiness.mockResolvedValue({
      proposal_id: 99,
      proposal_code: 'PROP-GULF-2026-001',
      proposal_version_id: 142,
      version_no: 2,
      status: 'draft',
      customer_name: 'Gulf Crest Bank PJSC',
      customer_code: 'CUST-GCB-001',
      deal_name: 'Gulf Crest Bank - Enterprise HCM & Payroll',
      deal_code: 'DEAL-18452213307',
      region: 'Middle East',
      primary_country: 'United Arab Emirates',
      currency: 'AED',
      currency_symbol: 'AED',
      is_ready: true,
      completed_count: 8,
      total_count: 8,
      readiness_percentage: 100,
      checklist: [
        { id: 'deal_imported', label: 'HubSpot Deal / CRM Association', is_complete: true, details: 'Deal ID: 18452213307', step_route: '/proposals/import' },
        { id: 'configurator', label: 'Countries & Products Configured', is_complete: true, details: '1 country, 5 products configured', step_route: '/calculator' },
        { id: 'executive_summary', label: 'Executive Summary Narrative', is_complete: true, details: 'Present', step_route: '/proposals/content?section=executive_summary' },
        { id: 'scope_of_work', label: 'Scope of Work Narrative', is_complete: true, details: 'Present', step_route: '/proposals/content?section=scope_of_work' },
        { id: 'customization_integration', label: 'Customization & Integrations Scope', is_complete: true, details: 'Present', step_route: '/proposals/content?section=customization_integration' },
        { id: 'terms_conditions', label: 'Commercial Terms & Conditions', is_complete: true, details: 'Present', step_route: '/proposals/content?section=terms_conditions' },
        { id: 'fitment_document', label: 'Fitment Analysis Document', is_complete: true, details: 'Fitment confirmed', step_route: '/proposals/content?section=fitment_document' },
        { id: 'payment_milestones', label: 'Payment Milestones Breakdown', is_complete: true, details: '4 milestones configured (100% total)', step_route: '/proposals/content?section=terms_conditions' },
      ],
      commercials: {
        snapshot_id: 301,
        calculated_at: '2026-11-15T12:00:00Z',
        currency: 'AED',
        currency_symbol: 'AED',
        net_total: 850000.0,
        gross_total: 1000000.0,
        annual_total: 280000.0,
        effective_discount_pct: 15.0,
        overall_discount_pct: 15.0,
        gross_margin_pct: 58.5,
        discount_breaches_count: 1,
      },
      discount_policy: {
        line_level: {
          policy_name: 'Line-Level Discount Policy',
          actual_pct: 12.0,
          ceiling_pct: 15.0,
          is_breached: false,
          required_role: 'Pricing Desk',
        },
        proposal_level: {
          policy_name: 'Proposal-Level Discount Policy',
          actual_pct: 15.0,
          ceiling_pct: 10.0,
          is_breached: true,
          required_role: 'Business Head',
        },
        gm_floor: {
          policy_name: 'Gross Margin Floor Policy',
          actual_pct: 58.5,
          floor_pct: 50.0,
          is_breached: false,
          required_role: 'Business Head',
        },
        breaches_count: 1,
        breaches: [
          'Overall proposal discount of 15.0% exceeds policy ceiling of 10.0% (Requires Business Head approval)',
        ],
      },
    })

    proposalsApi.getProposalApprovalRoute.mockResolvedValue({
      proposal_id: 99,
      proposal_code: 'PROP-GULF-2026-001',
      proposal_version_id: 142,
      overall_discount_pct: 15.0,
      max_line_discount_pct: 12.0,
      gross_margin_pct: 58.5,
      approval_stages: [
        {
          stage_level: 1,
          role_id: 4,
          role_code: 'sales_lead',
          role_name: 'Sales Lead',
          assigned_user_name: 'Tariq Mansoor',
          region: 'Middle East',
          reason: 'Standard Commercial & Technical Review Gate',
          is_required: true,
          status: 'pending_submission',
        },
        {
          stage_level: 2,
          role_id: 2,
          role_code: 'pricing_desk',
          role_name: 'Pricing Desk Analyst',
          assigned_user_name: 'Pricing Team',
          region: 'Global',
          reason: 'Discount Review (Overall: 15.0%, Max Line: 12.0%)',
          is_required: true,
          status: 'pending_submission',
        },
        {
          stage_level: 3,
          role_id: 5,
          role_code: 'business_head',
          role_name: 'Business Head (Middle East)',
          assigned_user_name: 'Farhan Qureshi',
          region: 'Middle East',
          reason: 'Regional Business Head Signoff for Middle East territory',
          is_required: true,
          status: 'pending_submission',
        },
      ],
    })

    proposalsApi.getProposalActivity.mockResolvedValue([
      {
        id: 1001,
        action: 'DEAL_IMPORTED_FROM_HUBSPOT',
        title: 'Deal Imported from HubSpot',
        actor_name: 'Tariq Mansoor',
        actor_email: 'tariq@adrenalin.test',
        occurred_at: '2026-11-15T10:00:00Z',
        after: { notes: 'Imported Gulf Crest Bank deal from CRM' },
      },
      {
        id: 1002,
        action: 'PROPOSAL_CONTENT_UPDATED',
        title: 'Proposal Content Updated',
        actor_name: 'Tariq Mansoor',
        actor_email: 'tariq@adrenalin.test',
        occurred_at: '2026-11-15T10:30:00Z',
        after: { notes: 'Saved Executive Summary and Scope of Work' },
      },
    ])

    render(
      <MemoryRouter>
        <ProposalProvider initialProposal={{ clientInfo: { proposalId: mockProposalId } }}>
          <ProposalReviewSubmitPage />
        </ProposalProvider>
      </MemoryRouter>
    )

    // Verify Proposal Overview header
    await waitFor(() => {
      expect(screen.getByText('PROP-GULF-2026-001')).toBeInTheDocument()
      expect(screen.getByText('Gulf Crest Bank PJSC')).toBeInTheDocument()
      expect(screen.getByText(/Gulf Crest Bank - Enterprise HCM/)).toBeInTheDocument()
      expect(screen.getByText(/Middle East \(United Arab Emirates\)/)).toBeInTheDocument()
    })

    // Verify Authoritative Commercial Summary Cards
    expect(screen.getByText('Authoritative Commercial Summary')).toBeInTheDocument()
    expect(screen.getByText('AED 850,000.00')).toBeInTheDocument()
    expect(screen.getByText('AED 1,000,000.00')).toBeInTheDocument()
    expect(screen.getAllByText('15.0%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('1 Breach')).toBeInTheDocument()

    // Verify 8-point checklist
    expect(screen.getByText('8 / 8 Verified')).toBeInTheDocument()
    expect(screen.getByText('HubSpot Deal / CRM Association')).toBeInTheDocument()
    expect(screen.getByText('Countries & Products Configured')).toBeInTheDocument()
    expect(screen.getByText('Executive Summary Narrative')).toBeInTheDocument()
    expect(screen.getByText('Scope of Work Narrative')).toBeInTheDocument()
    expect(screen.getByText('Customization & Integrations Scope')).toBeInTheDocument()
    expect(screen.getByText('Commercial Terms & Conditions')).toBeInTheDocument()
    expect(screen.getByText('Fitment Analysis Document')).toBeInTheDocument()
    expect(screen.getByText('Payment Milestones Breakdown')).toBeInTheDocument()

    // Verify Discount Policy check
    expect(screen.getByText(/Discount Policy Check & Governance Thresholds/i)).toBeInTheDocument()
    expect(screen.getByText(/Overall proposal discount of 15.0% exceeds policy ceiling/i)).toBeInTheDocument()

    // Verify Approval Route
    expect(screen.getByText('Sales Lead')).toBeInTheDocument()
    expect(screen.getByText('Pricing Desk Analyst')).toBeInTheDocument()
    expect(screen.getByText('Business Head (Middle East)')).toBeInTheDocument()

    // Verify Activity History
    expect(screen.getByText('Activity History & Audit Trail')).toBeInTheDocument()
    expect(screen.getByText('Deal Imported from HubSpot')).toBeInTheDocument()
    expect(screen.getByText('Proposal Content Updated')).toBeInTheDocument()
  })

  it('disables submit button and shows incomplete warning when proposal is not ready', async () => {
    proposalsApi.getProposalReadiness.mockResolvedValue({
      proposal_id: 101,
      proposal_code: 'PROP-EMPTY-001',
      version_no: 1,
      status: 'draft',
      is_ready: false,
      completed_count: 2,
      total_count: 8,
      readiness_percentage: 25,
      checklist: [
        { id: 'deal_imported', label: 'HubSpot Deal / CRM Association', is_complete: true, details: 'Associated', step_route: '/proposals/import' },
        { id: 'configurator', label: 'Countries & Products Configured', is_complete: true, details: 'Configured', step_route: '/calculator' },
        { id: 'executive_summary', label: 'Executive Summary Narrative', is_complete: false, details: 'Section is empty.', step_route: '/proposals/content?section=executive_summary' },
        { id: 'scope_of_work', label: 'Scope of Work Narrative', is_complete: false, details: 'Section is empty.', step_route: '/proposals/content?section=scope_of_work' },
        { id: 'customization_integration', label: 'Customization & Integrations Scope', is_complete: false, details: 'Section is empty.', step_route: '/proposals/content?section=customization_integration' },
        { id: 'terms_conditions', label: 'Commercial Terms & Conditions', is_complete: false, details: 'Section is empty.', step_route: '/proposals/content?section=terms_conditions' },
        { id: 'fitment_document', label: 'Fitment Analysis Document', is_complete: false, details: 'Attachment missing.', step_route: '/proposals/content?section=fitment_document' },
        { id: 'payment_milestones', label: 'Payment Milestones Breakdown', is_complete: false, details: 'No payment milestones configured.', step_route: '/proposals/content?section=terms_conditions' },
      ],
      commercials: {
        snapshot_id: null,
        currency: 'USD',
        net_total: 0.0,
        gross_total: 0.0,
        effective_discount_pct: 0.0,
        discount_breaches_count: 0,
      },
    })

    proposalsApi.getProposalApprovalRoute.mockResolvedValue({
      proposal_id: 101,
      approval_stages: [
        { stage_level: 1, role_id: 4, role_name: 'Sales Lead', is_required: true, status: 'pending_submission' },
      ],
    })

    render(
      <MemoryRouter>
        <ProposalProvider initialProposal={{ clientInfo: { proposalId: 101 } }}>
          <ProposalReviewSubmitPage />
        </ProposalProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('2 / 8 Verified')).toBeInTheDocument()
    })

    const submitBtn = screen.getByRole('button', { name: /Submit for Approval/i })
    expect(submitBtn).toBeDisabled()
    expect(screen.getByText(/Submit is disabled until all 8 checklist criteria are fulfilled/i)).toBeInTheDocument()
  })
})
