import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  ProposalContentPage,
  SECTIONS_CONFIG,
  calculateSection1Progress,
  calculateSection2Progress,
  calculateSection3Progress,
  calculateSection4Progress,
  calculateSection5Progress,
  calculateOverallProgress,
} from '../features/proposals/ProposalContentPage'
import { ProposalProvider } from '../context/ProposalContext'
import * as proposalsApi from '../api/proposalsApi'
import * as catalogueApi from '../api/catalogueApi'
import * as ratesApi from '../api/ratesApi'

vi.mock('../api/proposalsApi', () => ({
  getProposalContent: vi.fn(),
  updateProposalContent: vi.fn(),
  uploadProposalAttachment: vi.fn(),
  getProposalAttachments: vi.fn(),
  deleteProposalAttachment: vi.fn(),
  exportProposal: vi.fn(),
  getLatestCalculation: vi.fn(),
}))

vi.mock('../api/catalogueApi', () => ({
  getCatalogueFamilies: vi.fn(),
  createCatalogueFamily: vi.fn(),
  updateCatalogueFamily: vi.fn(),
  deleteCatalogueFamily: vi.fn(),
}))

vi.mock('../api/ratesApi', () => ({
  getMasterRoles: vi.fn(),
  getServiceRates: vi.fn(),
}))

describe('Proposal Content – 5 Sections & Dynamic Completion Calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    proposalsApi.getLatestCalculation.mockResolvedValue({ snapshot_payload: {} })
    proposalsApi.getProposalAttachments.mockResolvedValue([])
    proposalsApi.updateProposalContent.mockResolvedValue({ success: true })
    catalogueApi.getCatalogueFamilies.mockResolvedValue([
      { id: 1, code: 'TALENT_ACQ', name: 'Talent Acquisition' },
      { id: 2, code: 'TALENT_DEV', name: 'Talent Development' },
      { id: 3, code: 'WAGESYNC', name: 'WageSync' },
    ])
    ratesApi.getMasterRoles.mockResolvedValue([
      { id: 1, name: 'Functional Consultant' },
      { id: 2, name: 'Technical Consultant' },
      { id: 3, name: 'Project Manager' },
      { id: 4, name: 'Solution Architect' },
    ])
    ratesApi.getServiceRates.mockResolvedValue([])
  })

  describe('Pure Function Calculation Tests', () => {
    it('calculates 0% overall when all five sections are empty', () => {
      const result = calculateOverallProgress({})
      expect(result.overall).toBe(0)
      expect(result.completedCount).toBe(0)
      expect(result.isComplete).toBe(false)
      expect(result.sectionPercentages.executive_summary).toBe(0)
      expect(result.sectionPercentages.scope_of_work).toBe(0)
      expect(result.sectionPercentages.customization_integration).toBe(0)
      expect(result.sectionPercentages.terms_conditions).toBe(0)
      expect(result.sectionPercentages.fitment_document).toBe(0)
      expect(result.sectionStatus.executive_summary).toBe('empty')
    })

    it('calculates 20% overall when Executive Summary is completed', () => {
      const exec = {
        customer_introduction: 'Adrenalin HCM Overview',
        customer_objectives: 'Modernize HR operations',
        value_proposition: 'AI-first unified platform',
        conclusion: 'Strategic partnership',
      }
      expect(calculateSection1Progress(exec)).toBe(100)

      const result = calculateOverallProgress({ executive_summary: exec })
      expect(result.overall).toBe(20)
      expect(result.completedCount).toBe(1)
      expect(result.sectionStatus.executive_summary).toBe('completed')
    })

    it('calculates partial progress (50%) within Executive Summary when 2 of 4 fields are filled', () => {
      const exec = {
        customer_introduction: 'Introduction text',
        customer_objectives: 'Objectives text',
        value_proposition: '',
        conclusion: '',
      }
      expect(calculateSection1Progress(exec)).toBe(50)

      const result = calculateOverallProgress({ executive_summary: exec })
      expect(result.overall).toBe(10) // (50 + 0 + 0 + 0 + 0) / 5 = 10%
      expect(result.sectionStatus.executive_summary).toBe('in_progress')
    })

    it('calculates 40% overall when first two sections are fully completed', () => {
      const exec = {
        customer_introduction: 'Intro',
        customer_objectives: 'Objectives',
        value_proposition: 'Value',
        conclusion: 'Conclusion',
      }
      const sow = {
        license: 'Cloud SaaS license',
        implementation_plan: 'Phase 1-5 plan',
        in_scope: 'Core HR and Payroll',
        out_of_scope: 'Hardware infrastructure',
      }
      expect(calculateSection1Progress(exec)).toBe(100)
      expect(calculateSection2Progress(sow)).toBe(100)

      const result = calculateOverallProgress({
        executive_summary: exec,
        scope_of_work: sow,
      })
      expect(result.overall).toBe(40)
      expect(result.completedCount).toBe(2)
    })

    it('calculates 60% overall when first three sections are completed', () => {
      const exec = { customer_introduction: 'I', customer_objectives: 'O', value_proposition: 'V', conclusion: 'C' }
      const sow = { license: 'L', implementation_plan: 'P', in_scope: 'IS', out_of_scope: 'OS' }
      const ci = { none_required: true }

      expect(calculateSection3Progress(ci)).toBe(100)

      const result = calculateOverallProgress({
        executive_summary: exec,
        scope_of_work: sow,
        customization_integration: ci,
      })
      expect(result.overall).toBe(60)
      expect(result.completedCount).toBe(3)
    })

    it('calculates 80% overall when first four sections are completed', () => {
      const exec = { customer_introduction: 'I', customer_objectives: 'O', value_proposition: 'V', conclusion: 'C' }
      const sow = { license: 'L', implementation_plan: 'P', in_scope: 'IS', out_of_scope: 'OS' }
      const ci = { none_required: true }
      const tc = {
        commercial_tc: 'Net 30 days',
        payment_terms_text: 'Invoiced quarterly',
        terms_of_proposal: 'Valid 30 days',
        payment_milestones: [
          { milestone: 'M1', percentage: 50 },
          { milestone: 'M2', percentage: 50 },
        ],
      }

      expect(calculateSection4Progress(tc)).toBe(100)

      const result = calculateOverallProgress({
        executive_summary: exec,
        scope_of_work: sow,
        customization_integration: ci,
        terms_conditions: tc,
      })
      expect(result.overall).toBe(80)
      expect(result.completedCount).toBe(4)
    })

    it('calculates 100% overall when all five sections are completed', () => {
      const exec = { customer_introduction: 'I', customer_objectives: 'O', value_proposition: 'V', conclusion: 'C' }
      const sow = { license: 'L', implementation_plan: 'P', in_scope: 'IS', out_of_scope: 'OS' }
      const ci = { none_required: true }
      const tc = {
        commercial_tc: 'Commercial T&C',
        payment_terms_text: 'Payment terms',
        terms_of_proposal: 'Terms of proposal',
        payment_milestones: [{ milestone: 'Advance', percentage: 100 }],
      }
      const fit = {
        fitment_text: 'Fitment analysis',
        customer_requirements: 'Evaluated requirements',
        solution_fitment: 'Module coverage',
        remarks: 'Azure hosting Tier 4',
      }

      expect(calculateSection5Progress(fit)).toBe(100)

      const result = calculateOverallProgress({
        executive_summary: exec,
        scope_of_work: sow,
        customization_integration: ci,
        terms_conditions: tc,
        fitment_document: fit,
      })
      expect(result.overall).toBe(100)
      expect(result.completedCount).toBe(5)
      expect(result.isComplete).toBe(true)
    })
  })

  describe('UI & Acceptance Tests', () => {
    it('Acceptance 1 & 2: New proposal opens with exactly 5 sections, all empty, overall completion 0%', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 201,
        sections: {},
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 201, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Proposal Content' })).toBeInTheDocument()
      })

      // Verify exactly 5 sections exist in SECTIONS_CONFIG
      expect(SECTIONS_CONFIG).toHaveLength(5)
      expect(SECTIONS_CONFIG.map((s) => s.id)).toEqual([
        'executive_summary',
        'scope_of_work',
        'customization_integration',
        'terms_conditions',
        'fitment_document',
      ])

      // Verify the 5 sidebar section buttons
      const nav = screen.getByRole('navigation', { name: /Content Section Navigation/i })
      expect(within(nav).getByRole('button', { name: /Executive Summary/i })).toBeInTheDocument()
      expect(within(nav).getByRole('button', { name: /Scope of Work/i })).toBeInTheDocument()
      expect(within(nav).getByRole('button', { name: /Customization & Integrations/i })).toBeInTheDocument()
      expect(within(nav).getByRole('button', { name: /Terms & Conditions/i })).toBeInTheDocument()
      expect(within(nav).getByRole('button', { name: /Fitment Document/i })).toBeInTheDocument()

      // Header indicates 0%
      expect(screen.getByText(/PROPOSAL CONTENT · 0%/i)).toBeInTheDocument()

      // Top indicator banner displays 0%
      const topIndicator = screen.getByTestId('top-completion-indicator')
      expect(topIndicator).toHaveTextContent('0%')
      expect(topIndicator).toHaveTextContent('0 of 5 sections completed')

      // Section completion badge displays 0% complete
      const sectionBadge = screen.getByTestId('section-completion-badge')
      expect(sectionBadge).toHaveTextContent('0% complete')
    })

    it('Acceptance 3: Entering content into a field dynamically updates section progress and overall progress', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 202,
        sections: {},
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 202, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('section-completion-badge')).toHaveTextContent('0% complete')
      })

      // Enter Customer Introduction (1 of 4 required fields in Section 1 -> 25% for Section 1)
      const introTextarea = screen.getByPlaceholderText(/Describe customer identity/i)
      fireEvent.change(introTextarea, { target: { value: 'Adrenalin HCM platform for Gulf Crest Bank.' } })

      // Section 1 badge updates to 25% complete
      expect(screen.getByTestId('section-completion-badge')).toHaveTextContent('25% complete')

      // Overall completion updates from 0% to 5% ((25 + 0 + 0 + 0 + 0) / 5 = 5%)
      expect(screen.getByTestId('top-completion-indicator')).toHaveTextContent('5%')
      expect(screen.getByText(/PROPOSAL CONTENT · 5%/i)).toBeInTheDocument()
    })

    it('Acceptance 4: Completing Executive Summary via Insert Template updates overall progress to 20%', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 203,
        sections: {},
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 203, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('top-completion-indicator')).toHaveTextContent('0%')
      })

      // Click "Insert Template" in Executive Summary
      const insertBtn = screen.getByRole('button', { name: /Insert Template/i })
      fireEvent.click(insertBtn)

      // Section 1 completion becomes 100% complete
      expect(screen.getByTestId('section-completion-badge')).toHaveTextContent('100% complete')

      // Overall completion becomes 20%
      expect(screen.getByTestId('top-completion-indicator')).toHaveTextContent('20%')
      expect(screen.getByText(/PROPOSAL CONTENT · 20%/i)).toBeInTheDocument()
      expect(screen.getAllByText(/1 of 5 sections completed/i).length).toBeGreaterThanOrEqual(1)
    })

    it('Acceptance 5: Completing two sections updates overall progress to 40%', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 204,
        sections: {},
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 204, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      // Complete Section 1
      fireEvent.click(screen.getByRole('button', { name: /Insert Template/i }))
      expect(screen.getByTestId('top-completion-indicator')).toHaveTextContent('20%')

      // Switch to Section 2: Scope of Work
      const nav = screen.getByRole('navigation', { name: /Content Section Navigation/i })
      fireEvent.click(within(nav).getByRole('button', { name: /Scope of Work/i }))

      // Complete Section 2 via "Insert summary from Configurator"
      const insertSowBtn = screen.getByRole('button', { name: /Insert summary from Configurator/i })
      fireEvent.click(insertSowBtn)

      // Section 2 badge becomes 100% complete
      expect(screen.getByTestId('section-completion-badge')).toHaveTextContent('100% complete')

      // Overall completion becomes 40% (20% + 20%)
      expect(screen.getByTestId('top-completion-indicator')).toHaveTextContent('40%')
      expect(screen.getByText(/PROPOSAL CONTENT · 40%/i)).toBeInTheDocument()
      expect(screen.getAllByText(/2 of 5 sections completed/i).length).toBeGreaterThanOrEqual(1)
    })

    it('Acceptance 6: Completing all five sections reaches 100% overall completion', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 205,
        sections: {
          executive_summary: {
            customer_introduction: 'Intro',
            customer_objectives: 'Obj',
            value_proposition: 'Val',
            conclusion: 'Conc',
          },
          scope_of_work: {
            license: 'License',
            implementation_plan: 'Plan',
            in_scope: 'In Scope',
            out_of_scope: 'Out Scope',
          },
          customization_integration: {
            none_required: true,
          },
          terms_conditions: {
            commercial_tc: 'Commercial TC',
            payment_terms_text: 'Payment terms',
            terms_of_proposal: 'Terms of proposal',
            payment_milestones: [{ milestone: 'Signoff', percentage: 100 }],
          },
          fitment_document: {
            fitment_text: 'Fitment text',
            customer_requirements: 'Reqs',
            solution_fitment: 'Solution',
            remarks: 'Remarks',
          },
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 205, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('top-completion-indicator')).toHaveTextContent('100%')
        expect(screen.getByText(/PROPOSAL CONTENT · 100%/i)).toBeInTheDocument()
        expect(screen.getAllByText(/5 of 5 sections completed/i).length).toBeGreaterThanOrEqual(1)
        expect(screen.getByTestId('section-completion-badge')).toHaveTextContent('100% complete')
      })
    })

    it('Acceptance 7: Clearing content immediately decreases progress accordingly', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 206,
        sections: {},
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 206, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      // Fill Section 1
      fireEvent.click(screen.getByRole('button', { name: /Insert Template/i }))
      expect(screen.getByTestId('top-completion-indicator')).toHaveTextContent('20%')

      // Clear Customer Introduction
      const introTextarea = screen.getByPlaceholderText(/Describe customer identity/i)
      fireEvent.change(introTextarea, { target: { value: '' } })

      // Progress decreases from 100% to 75% for Section 1 -> Overall becomes 15% ((75 + 0 + 0 + 0 + 0) / 5 = 15%)
      expect(screen.getByTestId('section-completion-badge')).toHaveTextContent('75% complete')
      expect(screen.getByTestId('top-completion-indicator')).toHaveTextContent('15%')
      expect(screen.getByText(/PROPOSAL CONTENT · 15%/i)).toBeInTheDocument()
    })

    it('Acceptance 8 & 9: Saved content restores on reload and isolates between different proposals', async () => {
      // Proposal 1 has 40% completion
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 207,
        sections: {
          executive_summary: {
            customer_introduction: 'Intro',
            customer_objectives: 'Obj',
            value_proposition: 'Val',
            conclusion: 'Conc',
          },
          scope_of_work: {
            license: 'License',
            implementation_plan: 'Plan',
            in_scope: 'In Scope',
            out_of_scope: 'Out Scope',
          },
        },
      })

      const { unmount } = render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 207, clientName: 'Client Alpha' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('top-completion-indicator')).toHaveTextContent('40%')
      })

      unmount()

      // Proposal 2 has 0% completion
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 208,
        sections: {},
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 208, clientName: 'Client Beta' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByTestId('top-completion-indicator')).toHaveTextContent('0%')
        expect(screen.getByText(/PROPOSAL CONTENT · 0%/i)).toBeInTheDocument()
      })
    })

    it('Acceptance 10: Step navigation transitions smoothly through all 5 sections and offers Continue to Summary on the 5th section', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 209,
        sections: {},
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 209, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Executive Summary' })).toBeInTheDocument()
      })

      // Section 1 -> Section 2
      fireEvent.click(screen.getByRole('button', { name: /Next Section/i }))
      expect(screen.getByRole('heading', { name: 'Scope of Work' })).toBeInTheDocument()

      // Section 2 -> Section 3
      fireEvent.click(screen.getByRole('button', { name: /Next Section/i }))
      expect(screen.getByRole('heading', { name: /Customization & System Integrations/i })).toBeInTheDocument()

      // Section 3 -> Section 4
      fireEvent.click(screen.getByRole('button', { name: /Next Section/i }))
      expect(screen.getByRole('heading', { name: /Terms & Conditions, Payment Milestones & Rates/i })).toBeInTheDocument()

      // Section 4 -> Section 5
      fireEvent.click(screen.getByRole('button', { name: /Next Section/i }))
      expect(screen.getByRole('heading', { name: /Product Fitment & Technical Attachments/i })).toBeInTheDocument()

      // On Section 5: Button displays "Continue to Summary"
      expect(screen.getByRole('button', { name: /Continue to Summary/i })).toBeInTheDocument()
    })
  })

  describe('Database-Driven Customization, Integration & Role Fields', () => {
    it('renders Type dropdown with Customization, Integration, Report, Workflow', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 301,
        sections: {
          customization_integration: {
            none_required: false,
            items: [
              { id: 'item-1', type: 'Customization', title: 'Test Item', module: 'Talent Acquisition' },
            ],
          },
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 301, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      // Navigate to Section 3: Customization & Integrations
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Customization & Integrations/i })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('button', { name: /Customization & Integrations/i }))

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: /Type/i })).toBeInTheDocument()
      })

      const typeSelect = screen.getByRole('combobox', { name: /Type/i })
      const options = within(typeSelect).getAllByRole('option').map((o) => o.value)
      expect(options).toEqual(['Customization', 'Integration', 'Report', 'Workflow'])
    })

    it('Module dropdown dynamically renders L1 Product Families from database', async () => {
      catalogueApi.getCatalogueFamilies.mockResolvedValueOnce([
        { id: 10, name: 'Talent Acquisition' },
        { id: 11, name: 'Talent Development' },
        { id: 12, name: 'Platform Core' },
      ])

      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 302,
        sections: {
          customization_integration: {
            none_required: false,
            items: [
              { id: 'item-1', type: 'Workflow', title: 'Approval Workflow', module: 'Platform Core' },
            ],
          },
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 302, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      fireEvent.click(screen.getByRole('button', { name: /Customization & Integrations/i }))

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: /Module/i })).toBeInTheDocument()
      })

      const moduleSelect = screen.getByRole('combobox', { name: /Module/i })
      expect(moduleSelect.value).toBe('Platform Core')

      const optionTexts = within(moduleSelect).getAllByRole('option').map((o) => o.textContent)
      expect(optionTexts).toContain('Talent Acquisition')
      expect(optionTexts).toContain('Talent Development')
      expect(optionTexts).toContain('Platform Core')
    })

    it('Module dropdown displays empty state message when no L1 Product Families exist in database', async () => {
      catalogueApi.getCatalogueFamilies.mockResolvedValueOnce([])

      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 303,
        sections: {
          customization_integration: {
            none_required: false,
            items: [
              { id: 'item-1', type: 'Customization', title: 'Custom Form', module: '' },
            ],
          },
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 303, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      fireEvent.click(screen.getByRole('button', { name: /Customization & Integrations/i }))

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: /Module/i })).toBeInTheDocument()
      })

      const moduleSelect = screen.getByRole('combobox', { name: /Module/i })
      expect(within(moduleSelect).getByText(/No L1 Product Families available/i)).toBeInTheDocument()
    })

    it('Payment Milestones: Add Milestone creates an empty row, calculates total and validates 100%', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 304,
        sections: {
          terms_conditions: {
            payment_milestones: [],
          },
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 304, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      // Navigate to Section 4: Terms & Conditions
      fireEvent.click(screen.getByRole('button', { name: /Terms & Conditions/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Milestone/i })).toBeInTheDocument()
      })

      // Click Add Milestone
      fireEvent.click(screen.getByRole('button', { name: /Add Milestone/i }))

      // 1. Verify row starts completely empty: blank milestone description and 0%
      const descInput = screen.getByRole('textbox', { name: /Milestone description/i })
      expect(descInput.value).toBe('')

      const pctInput = screen.getByRole('spinbutton', { name: /Percentage/i })
      expect(pctInput.value).toBe('0')

      // 2. Warning is displayed because total (0%) !== 100%
      expect(screen.getByText(/Current Total: 0% ✗ Must equal 100%/i)).toBeInTheDocument()
      expect(screen.getByText(/Payment milestone total is currently 0%\. Add 100% to equal 100%/i)).toBeInTheDocument()

      // 3. User enters milestone and percentage (60%)
      fireEvent.change(descInput, { target: { value: 'Contract Signing & Blueprint' } })
      fireEvent.change(pctInput, { target: { value: '60' } })
      expect(descInput.value).toBe('Contract Signing & Blueprint')
      expect(pctInput.value).toBe('60')
      expect(screen.getByText(/Current Total: 60% ✗ Must equal 100%/i)).toBeInTheDocument()

      // 4. Add second milestone (40%) to equal 100%
      fireEvent.click(screen.getByRole('button', { name: /Add Milestone/i }))
      const allDescInputs = screen.getAllByRole('textbox', { name: /Milestone description/i })
      const allPctInputs = screen.getAllByRole('spinbutton', { name: /Percentage/i })
      expect(allDescInputs.length).toBe(2)
      expect(allDescInputs[1].value).toBe('')
      expect(allPctInputs[1].value).toBe('0')

      fireEvent.change(allDescInputs[1], { target: { value: 'Final UAT Signoff' } })
      fireEvent.change(allPctInputs[1], { target: { value: '40' } })

      // Total equals exactly 100% -> Valid!
      expect(screen.getByText(/Current Total: 100% ✓ Valid/i)).toBeInTheDocument()

      // 5. Remove first milestone
      const removeButtons = screen.getAllByRole('button', { name: /Remove milestone/i })
      fireEvent.click(removeButtons[0])

      // Only second milestone remains (40%) -> Invalid warning re-appears
      expect(screen.getAllByRole('textbox', { name: /Milestone description/i }).length).toBe(1)
      expect(screen.getByText(/Current Total: 40% ✗ Must equal 100%/i)).toBeInTheDocument()
    })

    it('Change Request Rates: + Role creates a completely empty row with normal text input and rate 0', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 305,
        sections: {
          terms_conditions: {
            change_request_rates: [],
          },
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 305, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      // Navigate to Section 4: Terms & Conditions
      fireEvent.click(screen.getByRole('button', { name: /Terms & Conditions/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Role/i })).toBeInTheDocument()
      })

      // Click + Role / Add Role
      fireEvent.click(screen.getByRole('button', { name: /Add Role/i }))

      // Verify row is created with normal text input (NOT a select/combobox) and rate 0
      expect(screen.queryByRole('combobox', { name: /Role/i })).toBeNull()

      const roleInput = screen.getByRole('textbox', { name: /Role/i })
      expect(roleInput).toBeInTheDocument()
      expect(roleInput.value).toBe('')

      const rateInput = screen.getByRole('spinbutton', { name: /Rate per day/i })
      expect(rateInput.value).toBe('0')

      // User enters custom role and daily rate
      fireEvent.change(roleInput, { target: { value: 'Senior Solutions Architect' } })
      fireEvent.change(rateInput, { target: { value: '45000' } })

      expect(roleInput.value).toBe('Senior Solutions Architect')
      expect(rateInput.value).toBe('45000')

      // Remove the role row
      const removeRoleBtn = screen.getByRole('button', { name: /Remove role/i })
      fireEvent.click(removeRoleBtn)
      expect(screen.queryByRole('textbox', { name: /Role/i })).toBeNull()
    })

    it('Change Request Rates: Existing saved proposal data displays in normal text inputs', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 306,
        sections: {
          terms_conditions: {
            change_request_rates: [
              { role: 'Lead Integration Engineer', rate_per_day: 38000, currency: 'INR' },
            ],
          },
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 306, clientName: 'Gulf Crest Bank' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      fireEvent.click(screen.getByRole('button', { name: /Terms & Conditions/i }))

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /Role/i })).toBeInTheDocument()
      })

      const roleInput = screen.getByRole('textbox', { name: /Role/i })
      expect(roleInput.value).toBe('Lead Integration Engineer')

      const rateInput = screen.getByRole('spinbutton', { name: /Rate per day/i })
      expect(rateInput.value).toBe('38000')
    })

    it('Change Request Rates: Automatically uses deal currency (e.g. AED or USD) in heading, inputs and prefill', async () => {
      // 1. Test AED deal currency
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 307,
        currency: 'AED',
        sections: {
          terms_conditions: {
            change_request_rates: [],
          },
        },
      })

      const { unmount } = render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 307, clientName: 'Gulf Crest Bank', currency: 'AED' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      fireEvent.click(screen.getByRole('button', { name: /Terms & Conditions/i }))

      await waitFor(() => {
        expect(screen.getByText(/Rate \/ Day \(AED\)/i)).toBeInTheDocument()
      })

      // Click + Role
      fireEvent.click(screen.getByRole('button', { name: /Add Role/i }))
      expect(screen.getByText('AED')).toBeInTheDocument()

      unmount()

      // 2. Test USD deal currency
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 308,
        currency: 'USD',
        sections: {
          terms_conditions: {
            change_request_rates: [],
          },
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 308, clientName: 'Global Corp', currency: 'USD' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      fireEvent.click(screen.getByRole('button', { name: /Terms & Conditions/i }))

      await waitFor(() => {
        expect(screen.getByText(/Rate \/ Day \(USD\)/i)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Add Role/i }))
      expect(screen.getByText('USD')).toBeInTheDocument()
    })

    it('Proposal Validity (Days): Defaults to 0 on new proposal and allows manual entry', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 309,
        sections: {
          terms_conditions: {},
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 309, clientName: 'New Client' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      fireEvent.click(screen.getByRole('button', { name: /Terms & Conditions/i }))

      await waitFor(() => {
        expect(screen.getByRole('spinbutton', { name: /Proposal Validity/i })).toBeInTheDocument()
      })

      const validityInput = screen.getByRole('spinbutton', { name: /Proposal Validity/i })
      // Initial value must strictly be 0
      expect(validityInput.value).toBe('0')

      // Manually enter 45 days
      fireEvent.change(validityInput, { target: { value: '45' } })
      expect(validityInput.value).toBe('45')

      // Manually enter 0 days
      fireEvent.change(validityInput, { target: { value: '0' } })
      expect(validityInput.value).toBe('0')
    })

    it('Proposal Validity (Days): Preserves previously saved validity value upon reopening', async () => {
      proposalsApi.getProposalContent.mockResolvedValueOnce({
        proposal_id: 310,
        sections: {
          terms_conditions: {
            proposal_validity_days: 60,
          },
        },
      })

      render(
        <MemoryRouter>
          <ProposalProvider initialProposal={{ clientInfo: { proposalId: 310, clientName: 'Existing Client' } }}>
            <ProposalContentPage />
          </ProposalProvider>
        </MemoryRouter>
      )

      fireEvent.click(screen.getByRole('button', { name: /Terms & Conditions/i }))

      await waitFor(() => {
        expect(screen.getByRole('spinbutton', { name: /Proposal Validity/i })).toBeInTheDocument()
      })

      const validityInput = screen.getByRole('spinbutton', { name: /Proposal Validity/i })
      expect(validityInput.value).toBe('60')
    })
  })
})
