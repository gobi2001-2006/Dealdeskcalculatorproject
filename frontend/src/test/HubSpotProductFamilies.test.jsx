import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProposalProvider, useProposal } from '../context/ProposalContext'
import { HubSpotImportPage } from '../features/proposals/HubSpotImportPage'
import * as hubspotApi from '../api/hubspotApi'
import * as catalogueApi from '../api/catalogueApi'

vi.mock('../api/catalogueApi', () => ({
  getCatalogueFamilies: vi.fn(),
}))

vi.mock('../api/hubspotApi', () => ({
  getHubspotStatus: vi.fn(),
  searchHubspotDeals: vi.fn(),
  getHubspotDealDetails: vi.fn(),
  importHubspotDeal: vi.fn(),
  getProposalHubspotStatus: vi.fn(),
}))

const mockInitialFamilies = [
  { id: 101, code: 'CORE_HCM', name: 'Global Workforce HCM', status: 'active' },
  { id: 102, code: 'PAYROLL_INTL', name: 'Multi-Country Payroll', status: 'active' },
]

const mockDealDetails = {
  hubspot_deal_id: '18452209731',
  deal_name: 'Acme Global Workforce Deal',
  company_name: 'Acme Corp',
  country: 'India',
  region: 'India',
  sub_region: 'South',
  currency: 'USD',
  amount: 500000,
  deal_owner: 'Priya Sharma',
  close_date: '2026-12-31',
  deal_type: 'New Business',
  product_family_ids: [101],
  products: ['Global Workforce HCM'],
  company: { name: 'Acme Corp', industry: 'Software', employees: 1200 },
  contacts: [
    { id: 'c1', name: 'John Doe', email: 'john@acme.com', role_title: 'VP HR', is_primary: true, is_included: true },
  ],
}

describe('HubSpot Import - Dynamic L1 Product Family Master Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hubspotApi.getHubspotStatus.mockResolvedValue({
      configured: false,
      is_mock: true,
      mode: 'mock',
      message: 'Demo mode active',
    })
    hubspotApi.searchHubspotDeals.mockResolvedValue({
      deals: [
        {
          hubspot_deal_id: '18452209731',
          deal_name: 'Acme Global Workforce Deal',
          company_name: 'Acme Corp',
          amount: 500000,
          currency: 'USD',
          stage: 'Qualified',
          country: 'India',
          region: 'India',
        },
      ],
    })
    hubspotApi.getHubspotDealDetails.mockResolvedValue(mockDealDetails)
    hubspotApi.getProposalHubspotStatus.mockResolvedValue({ has_imported_deal: false })
  })

  it('fetches active L1 Product Families from database master API and renders them as selectable chips', async () => {
    catalogueApi.getCatalogueFamilies.mockResolvedValueOnce(mockInitialFamilies)

    render(
      <MemoryRouter>
        <ProposalProvider>
          <HubSpotImportPage />
        </ProposalProvider>
      </MemoryRouter>
    )

    // Select the deal from results
    await waitFor(() => {
      expect(screen.getByText('Acme Global Workforce Deal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Acme Global Workforce Deal'))

    // Verify catalogue master API was called with 'active' status
    await waitFor(() => {
      expect(catalogueApi.getCatalogueFamilies).toHaveBeenCalledWith('active')
    })

    // Verify dynamic family names appear
    await waitFor(() => {
      expect(screen.getByText('Global Workforce HCM')).toBeInTheDocument()
      expect(screen.getByText('Multi-Country Payroll')).toBeInTheDocument()
    })

    // Verify hardcoded legacy values are NOT rendered
    expect(screen.queryByText('Adrenalin Core HCM')).not.toBeInTheDocument()
    expect(screen.queryByText('Learning Management')).not.toBeInTheDocument()
  })

  it('supports loading, empty, and API error states with retry functionality', async () => {
    // 1. Error state
    catalogueApi.getCatalogueFamilies.mockRejectedValueOnce(new Error('Network timeout connecting to database'))

    render(
      <MemoryRouter>
        <ProposalProvider>
          <HubSpotImportPage />
        </ProposalProvider>
      </MemoryRouter>
    )

    // Select the deal from results
    await waitFor(() => {
      expect(screen.getByText('Acme Global Workforce Deal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Acme Global Workforce Deal'))

    await waitFor(() => {
      expect(screen.getByText(/Failed to load product families/i)).toBeInTheDocument()
    })

    // Retry should trigger reload
    catalogueApi.getCatalogueFamilies.mockResolvedValueOnce([])
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))

    // 2. Empty state
    await waitFor(() => {
      expect(screen.getByText(/No active product families found in catalogue/i)).toBeInTheDocument()
    })
  })

  it('acceptance test: automatically renders a newly created L1 Product Family and passes it to Configurator', async () => {
    // Simulate new L1 family created through Masters/Admin (id: 103, code: 'AI_RECRUIT', name: 'AI Talent & Automation')
    const familiesWithNew = [
      ...mockInitialFamilies,
      { id: 103, code: 'AI_RECRUIT', name: 'AI Talent & Automation', status: 'active' },
    ]
    catalogueApi.getCatalogueFamilies.mockResolvedValue(familiesWithNew)

    hubspotApi.importHubspotDeal.mockResolvedValueOnce({
      success: true,
      proposal_id: 88,
      proposal_code: 'PROP-HS-88',
      deal_id: 44,
      deal_code: 'DEAL-HS-88',
      customer_id: 12,
      customer_name: 'Acme Corp',
      product_family_ids: [101, 103],
      products: ['Global Workforce HCM', 'AI Talent & Automation'],
      message: 'Deal imported successfully!',
    })

    let contextState = null
    function ContextInspector() {
      contextState = useProposal()
      return null
    }

    render(
      <MemoryRouter>
        <ProposalProvider>
          <ContextInspector />
          <HubSpotImportPage />
        </ProposalProvider>
      </MemoryRouter>
    )

    // Select the deal
    await waitFor(() => {
      expect(screen.getByText('Acme Global Workforce Deal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Acme Global Workforce Deal'))

    // Verify the new L1 family appears dynamically without code change
    await waitFor(() => {
      expect(screen.getByText('AI Talent & Automation')).toBeInTheDocument()
    })

    // Select the newly added family (id 103)
    fireEvent.click(screen.getByText('AI Talent & Automation'))

    // Confirm import
    fireEvent.click(screen.getByRole('button', { name: /Import Deal into Proposal/i }))

    await waitFor(() => {
      expect(hubspotApi.importHubspotDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          product_family_ids: expect.arrayContaining([101, 103]),
        })
      )
    })

    // Verify ProposalContext countryConfigs receives the selected families for the Configurator
    await waitFor(() => {
      expect(contextState.countryConfigs[0].families).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ familyId: 101 }),
          expect.objectContaining({ familyId: 103 }),
        ])
      )
    })
  })

  it('preserves already-selected family IDs even if a family is later deactivated', async () => {
    // Family 99 is deactivated in master, so getCatalogueFamilies('active') won't return it
    catalogueApi.getCatalogueFamilies.mockImplementation((status) => {
      if (status === 'active') {
        return Promise.resolve(mockInitialFamilies)
      }
      return Promise.resolve([
        ...mockInitialFamilies,
        { id: 99, code: 'LEGACY_MODULE', name: 'Legacy Enterprise Payroll', status: 'inactive' },
      ])
    })

    // Existing proposal has family 99 previously selected
    hubspotApi.getProposalHubspotStatus.mockResolvedValueOnce({
      has_imported_deal: true,
      proposal_id: 999,
      hubspot_deal_id: '18452209731',
      deal_name: 'Existing Proposal Deal',
      product_family_ids: [99, 101],
      products: ['Legacy Enterprise Payroll', 'Global Workforce HCM'],
      imported_at: '10 Nov 2026, 12:00',
      imported_by: 'Test User',
    })

    render(
      <MemoryRouter>
        <ProposalProvider initialProposal={{ clientInfo: { proposalId: 999 } }}>
          <HubSpotImportPage />
        </ProposalProvider>
      </MemoryRouter>
    )

    // Verify that the deactivated family is preserved in the UI and marked appropriately
    await waitFor(() => {
      expect(screen.getByText('Legacy Enterprise Payroll')).toBeInTheDocument()
      expect(screen.getByText('(inactive)')).toBeInTheDocument()
    })
  })

  it('transitions to post-import summary view with "Deal on this proposal" and "Contacts" tables when confirmed', async () => {
    catalogueApi.getCatalogueFamilies.mockResolvedValue(mockInitialFamilies)
    hubspotApi.importHubspotDeal.mockResolvedValueOnce({
      success: true,
      proposal_id: 505,
      proposal_code: 'PROP-HS-18452209731',
      deal_id: 11,
      deal_code: 'DEAL-HS-18452209731',
      customer_id: 22,
      customer_name: 'Acme Corp',
      hubspot_deal_id: '18452209731',
      deal_name: 'Acme Global Workforce Deal',
      product_family_ids: [101],
      products: ['Global Workforce HCM'],
      imported_at: '15 Nov 2026, 10:00',
      imported_by: 'Priya Sharma',
      contacts: [
        { id: 'c1', name: 'John Doe', email: 'john@acme.com', role_title: 'VP HR', phone: '+1234567890', is_primary: true, is_included: true },
      ],
      message: 'Deal imported successfully!',
    })

    render(
      <MemoryRouter>
        <ProposalProvider>
          <HubSpotImportPage />
        </ProposalProvider>
      </MemoryRouter>
    )

    // Select the deal
    await waitFor(() => {
      expect(screen.getByText('Acme Global Workforce Deal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Acme Global Workforce Deal'))

    // Wait for deal details to load and confirm button to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm & Populate Proposal/i })).toBeInTheDocument()
    })

    // Click confirm
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Populate Proposal/i }))

    // Verify transition to post-import view
    await waitFor(() => {
      expect(screen.getByText(/Deal successfully imported and linked/i)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /Deal on this proposal/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /Contacts/i })).toBeInTheDocument()
      expect(screen.getAllByText('Primary').length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByRole('button', { name: /Proceed to Configurator/i })[0]).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /Edit Parameters/i })[0]).toBeInTheDocument()
    })

    // Verify left panel highlights the linked deal
    expect(screen.getByText('Linked')).toBeInTheDocument()
  })

  it('restores post-import view and allows previewing other deals with Return to Linked Deal', async () => {
    catalogueApi.getCatalogueFamilies.mockResolvedValue(mockInitialFamilies)
    hubspotApi.searchHubspotDeals.mockResolvedValue({
      deals: [
        {
          hubspot_deal_id: '18452209731',
          deal_name: 'Acme Global Workforce Deal',
          company_name: 'Acme Corp',
          amount: 500000,
          currency: 'USD',
          stage: 'Qualified',
          country: 'India',
          region: 'India',
        },
        {
          hubspot_deal_id: '998877',
          deal_name: 'Second Enterprise Deal',
          company_name: 'Beta LLC',
          amount: 250000,
          currency: 'USD',
          stage: 'Negotiation',
          country: 'Germany',
          region: 'Europe',
        },
      ],
    })

    hubspotApi.getProposalHubspotStatus.mockResolvedValue({
      has_imported_deal: true,
      proposal_id: 777,
      proposal_code: 'PROP-HS-18452209731',
      hubspot_deal_id: '18452209731',
      deal_name: 'Acme Global Workforce Deal',
      company_name: 'Acme Corp',
      country: 'India',
      currency: 'USD',
      region: 'India',
      sub_region: 'South',
      product_family_ids: [101],
      products: ['Global Workforce HCM'],
      imported_at: '15 Nov 2026, 10:00',
      imported_by: 'Priya Sharma',
      contacts: [
        { id: 'c1', name: 'John Doe', email: 'john@acme.com', role_title: 'VP HR', phone: '+123', is_primary: true, is_included: true },
      ],
    })

    hubspotApi.getHubspotDealDetails.mockImplementation((id) => {
      if (id === '998877') {
        return Promise.resolve({
          hubspot_deal_id: '998877',
          deal_name: 'Second Enterprise Deal',
          company_name: 'Beta LLC',
          country: 'Germany',
          region: 'Europe',
          sub_region: 'DACH',
          currency: 'USD',
          amount: 250000,
          deal_owner: 'Hans Gruber',
          close_date: '2027-03-31',
          deal_type: 'New Business',
          product_family_ids: [101],
          products: ['Global Workforce HCM'],
          contacts: [{ id: 'c2', name: 'Hans', email: 'hans@beta.de', role_title: 'CTO', is_primary: true, is_included: true }],
        })
      }
      return Promise.resolve(mockDealDetails)
    })

    render(
      <MemoryRouter initialEntries={['/proposals/import-hubspot?proposalId=777']}>
        <ProposalProvider initialProposal={{ clientInfo: { proposalId: 777 } }}>
          <HubSpotImportPage />
        </ProposalProvider>
      </MemoryRouter>
    )

    // Should load straight into post-import view
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Deal on this proposal/i })).toBeInTheDocument()
      expect(screen.getAllByText('Acme Global Workforce Deal').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Linked')).toBeInTheDocument()
    })

    // Now click the second deal from the left panel to preview it
    await waitFor(() => {
      expect(screen.getByText('Second Enterprise Deal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Second Enterprise Deal'))

    // Should show preview banner without overwriting the proposal's linked deal
    await waitFor(() => {
      expect(screen.getByText(/Previewing Deal #998877/i)).toBeInTheDocument()
      expect(screen.getByText(/Deal #18452209731 is currently linked/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Return to Linked Deal/i })).toBeInTheDocument()
    })

    // Click Return to Linked Deal
    fireEvent.click(screen.getByRole('button', { name: /Return to Linked Deal/i }))

    // Should return to post-import summary view
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Deal on this proposal/i })).toBeInTheDocument()
      expect(screen.queryByText(/Previewing Deal #998877/i)).not.toBeInTheDocument()
    })
  })
})
