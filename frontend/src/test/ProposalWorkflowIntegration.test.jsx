import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProposalProvider } from '../context/ProposalContext'
import { HubSpotImportPage } from '../features/proposals/HubSpotImportPage'
import { ProposalContentPage } from '../features/proposals/ProposalContentPage'
import { ProposalReviewSubmitPage } from '../features/proposals/ProposalReviewSubmitPage'
import { CatalogueTopNav } from '../features/catalogue/CatalogueTopNav'
import * as hubspotApi from '../api/hubspotApi'
import * as proposalsApi from '../api/proposalsApi'
import * as catalogueApi from '../api/catalogueApi'

vi.mock('../api/catalogueApi', () => ({
  getCatalogueFamilies: vi.fn(),
}))

vi.mock('../api/hubspotApi', () => ({
  getHubspotStatus: vi.fn(),
  searchHubspotDeals: vi.fn(),
  getHubspotDealDetails: vi.fn(),
  importHubspotDeal: vi.fn(),
}))

vi.mock('../api/proposalsApi', () => ({
  getProposal: vi.fn(),
  getProposalContent: vi.fn(),
  updateProposalContent: vi.fn(),
  getProposalReadiness: vi.fn(),
  getProposalApprovalRoute: vi.fn(),
  submitProposalForApproval: vi.fn(),
  getProposalActivity: vi.fn().mockResolvedValue([]),
  decideProposalApproval: vi.fn(),
  recallProposalSubmission: vi.fn(),
}))

describe('Proposal Module 6-Step Workflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    catalogueApi.getCatalogueFamilies.mockResolvedValue([
      { id: 10, code: 'HRMS', name: 'Core HRMS', status: 'active' },
      { id: 11, code: 'PAY', name: 'Payroll Middle East', status: 'active' },
      { id: 12, code: 'TA', name: 'Talent Acquisition', status: 'active' },
    ])
  })

  describe('Navigation & Two-Tier Menu', () => {
    it('renders all 6 workflow steps in CatalogueTopNav when Proposal section is active', () => {
      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 42 } }}>
            <CatalogueTopNav activeSection="calculator" />
          </ProposalProvider>
        </MemoryRouter>
      )

      // Primary Navigation
      expect(screen.getByRole('link', { name: 'Masters' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Proposal' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Approvals' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument()

      // Secondary Navigation (all 6 steps)
      const expectedSteps = [
        'Import from HubSpot',
        'Proposal Configurator',
        'Pricing & Discounts',
        'Proposal Content',
        'Proposal Summary',
        'Review & Submit',
      ]

      for (const stepName of expectedSteps) {
        const link = screen.getByRole('link', { name: stepName })
        expect(link).toBeInTheDocument()
        expect(link.getAttribute('href')).toContain('proposalId=42')
      }
    })
  })

  describe('Step 1: Import from HubSpot', () => {
    it('shows mock CRM badge and sample data when in development mode', async () => {
      hubspotApi.getHubspotStatus.mockResolvedValueOnce({
        configured: false,
        is_mock: true,
        mode: 'mock',
        message: 'Running in Development Mock CRM mode with sample data (e.g., Amazon, Standard Chartered).',
      })

      render(
        <MemoryRouter>
          <ProposalProvider>
            <HubSpotImportPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      expect(screen.getByText('Import Deal from HubSpot CRM')).toBeInTheDocument()
      expect(screen.getByText('Step 1 of 6 · CRM Integration')).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByText(/Development Mock CRM Active · Demo Data/i)).toBeInTheDocument()
        expect(screen.getByText(/Development & Testing Mode Active/i)).toBeInTheDocument()
      })
    })

    it('displays deal parameters and contacts when deal is selected and imports into proposal', async () => {
      hubspotApi.getHubspotStatus.mockResolvedValueOnce({
        configured: true,
        message: 'HubSpot CRM integration is configured and active.',
      })
      hubspotApi.searchHubspotDeals.mockResolvedValueOnce({
        configured: true,
        deals: [
          {
            hubspot_deal_id: '998877',
            deal_name: 'Acme HCM Enterprise',
            amount: 750000,
            currency: 'INR',
            stage: 'presentationscheduled',
            country: 'India',
            region: 'APAC',
          },
        ],
      })
      hubspotApi.getHubspotDealDetails.mockResolvedValueOnce({
        hubspot_deal_id: '998877',
        deal_name: 'Acme HCM Enterprise',
        amount: 750000,
        currency: 'INR',
        country: 'India',
        region: 'APAC',
        company: { name: 'Acme Corp', industry: 'Logistics', employees: 1200 },
        contacts: [
          { id: 'c1', name: 'Alice Smith', email: 'alice@acme.com', role_title: 'CHRO', is_primary: true, is_included: true },
          { id: 'c2', name: 'Bob Jones', email: 'bob@acme.com', role_title: 'CFO', is_primary: false, is_included: true },
        ],
      })
      hubspotApi.importHubspotDeal.mockResolvedValueOnce({
        success: true,
        proposal_id: 101,
        proposal_code: 'PROP-HS-998877',
        deal_id: 55,
        customer_id: 33,
        customer_name: 'Acme Corp',
        message: 'Successfully imported HubSpot Deal into proposal PROP-HS-998877.',
      })

      render(
        <MemoryRouter>
          <ProposalProvider>
            <HubSpotImportPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      // Search for deal
      const searchInput = screen.getByPlaceholderText(/Search by HubSpot Deal ID/i)
      fireEvent.change(searchInput, { target: { value: 'Acme' } })
      fireEvent.click(screen.getByRole('button', { name: /Fetch from HubSpot/i }))

      await waitFor(() => {
        expect(screen.getByText('Acme HCM Enterprise')).toBeInTheDocument()
      })

      // Click to select deal
      fireEvent.click(screen.getByText('Acme HCM Enterprise'))

      await waitFor(() => {
        expect(screen.getByDisplayValue('Acme HCM Enterprise')).toBeInTheDocument()
        expect(screen.getByText('Alice Smith')).toBeInTheDocument()
        expect(screen.getByText('bob@acme.com')).toBeInTheDocument()
      })

      // Click Confirm & Populate
      fireEvent.click(screen.getByRole('button', { name: /Confirm & Populate Proposal/i }))

      await waitFor(() => {
        expect(hubspotApi.importHubspotDeal).toHaveBeenCalledWith(
          expect.objectContaining({
            hubspot_deal_id: '998877',
            deal_name: 'Acme HCM Enterprise',
          })
        )
      })
    })

    it('loads 5 sample deals by default in demo mode and filters Gulf Crest Bank', async () => {
      const mockDeals = [
        { hubspot_deal_id: '18452209731', deal_name: 'Amazon – Global Workforce Deal', company_name: 'Amazon', amount: 1250000, currency: 'USD', stage: 'Qualified', country: 'India', region: 'India' },
        { hubspot_deal_id: '18452213307', deal_name: 'Gulf Crest Bank – HCM Transformation', company_name: 'Gulf Crest Bank', amount: 3400000, currency: 'AED', stage: 'Decision Maker Bought-In', country: 'United Arab Emirates', region: 'Middle East' },
        { hubspot_deal_id: '18452218840', deal_name: 'Straits Federal Bank – Talent Suite Rollout', company_name: 'Straits Federal Bank', amount: 2100000, currency: 'MYR', stage: 'Presentation Scheduled', country: 'Malaysia', region: 'APAC' },
        { hubspot_deal_id: '18452220115', deal_name: 'Savanna Telecom – Payroll & WageSync', company_name: 'Savanna Telecom', amount: 98000000, currency: 'KES', stage: 'Contract Sent', country: 'Kenya', region: 'Africa' },
        { hubspot_deal_id: '18452224902', deal_name: 'Deccan Steel – Learning Cloud', company_name: 'Deccan Steel', amount: 42000000, currency: 'INR', stage: 'Qualified', country: 'India', region: 'India' },
      ]

      hubspotApi.getHubspotStatus.mockResolvedValueOnce({
        configured: false,
        is_mock: true,
        mode: 'mock',
        message: 'Running in Development Mock CRM mode with sample data.',
      })
      hubspotApi.searchHubspotDeals.mockResolvedValueOnce({
        configured: false,
        is_mock: true,
        deals: mockDeals,
      })

      render(
        <MemoryRouter>
          <ProposalProvider>
            <HubSpotImportPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      // Step 4 verification: all 5 sample deals appear by default
      await waitFor(() => {
        expect(screen.getByText('Open Deals (5)')).toBeInTheDocument()
        expect(screen.getByText('Amazon – Global Workforce Deal')).toBeInTheDocument()
        expect(screen.getByText('Gulf Crest Bank – HCM Transformation')).toBeInTheDocument()
      })

      // Step 3 & 6 verification: search for Gulf Crest Bank
      hubspotApi.searchHubspotDeals.mockResolvedValueOnce({
        configured: false,
        is_mock: true,
        deals: [mockDeals[1]],
      })

      const searchInput = screen.getByPlaceholderText(/Search by HubSpot Deal ID/i)
      fireEvent.change(searchInput, { target: { value: 'Gulf Crest Bank' } })
      fireEvent.click(screen.getByRole('button', { name: /Fetch from HubSpot/i }))

      await waitFor(() => {
        expect(screen.getByText('Open Deals (1)')).toBeInTheDocument()
        expect(screen.getByText('Gulf Crest Bank – HCM Transformation')).toBeInTheDocument()
      })

      // Select Gulf Crest Bank
      hubspotApi.getHubspotDealDetails.mockResolvedValueOnce({
        hubspot_deal_id: '18452213307',
        deal_name: 'Gulf Crest Bank – HCM Transformation',
        company_name: 'Gulf Crest Bank',
        country: 'United Arab Emirates',
        region: 'Middle East',
        sub_region: 'GCC',
        currency: 'AED',
        amount: 3400000,
        deal_owner: 'Arjun Menon',
        close_date: '2027-01-31',
        deal_type: 'Enterprise Transformation',
        products: ['Adrenalin Core HCM', 'Payroll Middle East'],
        contacts: [
          { id: 'c4', name: 'Omar Al Haddad', email: 'omar.alhaddad@gulfcrest.com', role_title: 'Chief Human Resources Officer', is_primary: true, is_included: true },
        ],
      })

      fireEvent.click(screen.getByText('Gulf Crest Bank – HCM Transformation'))

      await waitFor(() => {
        expect(screen.getByDisplayValue('Gulf Crest Bank – HCM Transformation')).toBeInTheDocument()
        expect(screen.getAllByDisplayValue('Gulf Crest Bank').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('Omar Al Haddad')).toBeInTheDocument()
        expect(screen.getByText('omar.alhaddad@gulfcrest.com')).toBeInTheDocument()
        expect(screen.getByText('Payroll Middle East')).toBeInTheDocument()
      })
    })
  })

  describe('Step 4: Proposal Content', () => {
    it('renders all 5 content sections and validates 100% payment milestone sum', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 42,
        proposal_code: 'PROP-42',
        sections: {
          executive_summary: 'Existing executive narrative.',
          scope_of_work: 'Existing SOW.',
          customization_integration: 'Custom payroll API.',
          terms_conditions: 'Standard Net 30 terms.',
          fitment_document: 'Fitment verified.',
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 42, clientName: 'Enterprise Client' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      expect(screen.getByRole('heading', { name: 'Proposal Content' })).toBeInTheDocument()
      expect(screen.getByText('Step 4 of 6 · Document Narrative')).toBeInTheDocument()

      // Check the 5 section buttons
      expect(screen.getByRole('button', { name: /Executive Summary/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Scope of Work/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Customization & Integrations/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Terms & Conditions/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Fitment Document/i })).toBeInTheDocument()

      // Switch to Scope of Work and click Insert summary from Configurator
      fireEvent.click(screen.getByRole('button', { name: /Scope of Work/i }))
      const insertBtn = screen.getByRole('button', { name: /Insert summary from Configurator/i })
      expect(insertBtn).toBeInTheDocument()
      fireEvent.click(insertBtn)

      // Switch to Terms & Conditions
      fireEvent.click(screen.getByRole('button', { name: /Terms & Conditions/i }))
      expect(screen.getByText(/Payment Milestone Breakdown \(Must sum to 100%\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Current Total: 0% ✗ Must equal 100%/i)).toBeInTheDocument()

      // Add a milestone to reach 100%
      fireEvent.click(screen.getByRole('button', { name: /Add Milestone/i }))
      const milestoneInput = screen.getByRole('textbox', { name: /Milestone description/i })
      const pctInput = screen.getByRole('spinbutton', { name: /Percentage/i })
      fireEvent.change(milestoneInput, { target: { value: 'Contract Advance' } })
      fireEvent.change(pctInput, { target: { value: '100' } })
      expect(screen.getByText(/Current Total: 100% ✓ Valid/i)).toBeInTheDocument()
    })
  })

  describe('Step 6: Review & Submit', () => {
    it('renders readiness checklist and dynamic approval route, and triggers submission', async () => {
      proposalsApi.getProposalReadiness.mockResolvedValue({
        proposal_id: 42,
        proposal_code: 'PROP-42',
        version_no: 1,
        status: 'draft',
        is_ready: true,
        completed_count: 8,
        total_count: 8,
        checklist: [
          { id: 'deal_imported', label: 'HubSpot Deal / CRM Association', is_complete: true, details: 'Associated' },
          { id: 'configurator', label: 'Countries & Products Configured', is_complete: true, details: 'Configured' },
          { id: 'executive_summary', label: 'Executive Summary Narrative', is_complete: true, details: 'Present' },
          { id: 'scope_of_work', label: 'Scope of Work Narrative', is_complete: true, details: 'Present' },
          { id: 'customization_integration', label: 'Customization & Integrations Scope', is_complete: true, details: 'Present' },
          { id: 'terms_conditions', label: 'Commercial Terms & Payment Milestones', is_complete: true, details: 'Present' },
          { id: 'fitment_document', label: 'Fitment Analysis Document', is_complete: true, details: 'Present' },
          { id: 'calculation_snapshot', label: 'Authoritative Commercial Calculation', is_complete: true, details: 'Calculated' },
        ],
        commercials: {
          snapshot_id: 88,
          currency: 'INR',
          net_total: 1500000.0,
          annual_total: 500000.0,
          overall_discount_pct: 12.5,
          gross_margin_pct: 62.0,
        },
      })

      proposalsApi.getProposalApprovalRoute.mockResolvedValue({
        proposal_id: 42,
        approval_stages: [
          { stage_level: 1, role_id: 4, role_name: 'Sales Lead', is_required: true, status: 'pending_submission', reason: 'Technical Review' },
          { stage_level: 2, role_id: 2, role_name: 'Pricing Desk', is_required: true, status: 'pending_submission', reason: 'Discount Review (12.5%)' },
          { stage_level: 3, role_id: 5, role_name: 'Business Head (APAC)', is_required: true, status: 'pending_submission', reason: 'Regional Signoff' },
        ],
      })

      proposalsApi.submitProposalForApproval.mockResolvedValueOnce({
        success: true,
        proposal_id: 42,
        proposal_code: 'PROP-42',
        proposal_status: 'submitted',
        version_status: 'under_review',
        message: 'Proposal PROP-42 has been successfully submitted for approval.',
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 42 } }}>
            <ProposalReviewSubmitPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      expect(screen.getByText('Review Proposal & Submit for Approval')).toBeInTheDocument()
      expect(screen.getByText('Step 6 of 6 · Governance Review')).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.getByText('8 / 8 Verified')).toBeInTheDocument()
        expect(screen.getByText('Authoritative Commercial Summary')).toBeInTheDocument()
        expect(screen.getByText('Sales Lead')).toBeInTheDocument()
        expect(screen.getByText('Pricing Desk')).toBeInTheDocument()
        expect(screen.getByText('Business Head (APAC)')).toBeInTheDocument()
      })

      // Enter notes and submit
      const notesInput = screen.getByPlaceholderText(/Provide deal context/i)
      fireEvent.change(notesInput, { target: { value: 'Approved by regional VP in pipeline review.' } })

      const submitBtn = screen.getByRole('button', { name: /Submit for Approval/i })
      expect(submitBtn).not.toBeDisabled()
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(proposalsApi.submitProposalForApproval).toHaveBeenCalledWith(
          42,
          expect.objectContaining({
            notes: 'Approved by regional VP in pipeline review.',
          })
        )
      })
    })
  })
})

