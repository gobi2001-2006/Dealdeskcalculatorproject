import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CataloguePage } from '../features/catalogue/CataloguePage'

function renderCataloguePage() {
  return render(
    <MemoryRouter>
      <CataloguePage />
    </MemoryRouter>,
  )
}

describe('Product Catalogue Feature Tests', () => {
  it('renders the top navigation, summary strip, sidebar, and initial product catalogue', () => {
    renderCataloguePage()

    // 1. Top navigation
    expect(screen.getByText('DEAL DESK')).toBeInTheDocument()
    expect(screen.getByText('Commercial Engine')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Product Catalog/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pack Builder/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Proposal Configurator/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Proposal Summary/i })).toBeInTheDocument()

    // 2. Summary strip
    expect(screen.getByText(/Global Enterprise Master/i)).toBeInTheDocument()
    expect(screen.getByText('Client')).toBeInTheDocument()
    expect(screen.getByText('Product Lines')).toBeInTheDocument()

    // 3. Left sidebar - L1 Families
    const sidebar = screen.getByRole('complementary', { name: /L1 Product Families/i })
    expect(within(sidebar).getByText('All Products')).toBeInTheDocument()
    expect(within(sidebar).getByText('Talent Acquisition')).toBeInTheDocument()
    expect(within(sidebar).getByText('Core HR & Workforce')).toBeInTheDocument()
    expect(within(sidebar).getByRole('button', { name: /Add a new product family/i })).toBeInTheDocument()

    // 4. Products table
    expect(screen.getByText('TA-ATS-001')).toBeInTheDocument()
    expect(screen.getByText('Applicant Tracking System (ATS)')).toBeInTheDocument()

    // 5. Product types legend indicators
    expect(screen.getAllByText('Adrenalin Native').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AI Agent Module').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Partner Integrated').length).toBeGreaterThan(0)
  })

  it('filters products when a family is selected in the sidebar', () => {
    renderCataloguePage()

    const sidebar = screen.getByRole('complementary', { name: /L1 Product Families/i })
    const payrollButton = within(sidebar).getByRole('button', { name: /Payroll & Benefits/i })

    fireEvent.click(payrollButton)

    // Heading should change to selected family
    expect(screen.getByRole('heading', { name: /Payroll & Benefits/i, level: 1 })).toBeInTheDocument()

    // Payroll products should be visible
    expect(screen.getByText('PAY-ENG-001')).toBeInTheDocument()
    expect(screen.getByText('Multi-Country Payroll Engine')).toBeInTheDocument()

    // Talent Acquisition products should NOT be visible
    expect(screen.queryByText('TA-ATS-001')).not.toBeInTheDocument()
  })

  it('filters products via search input across name, sub-item, and code', () => {
    renderCataloguePage()

    const searchInput = screen.getByRole('searchbox', { name: /Search name or code/i })

    // Search by code
    fireEvent.change(searchInput, { target: { value: 'TA-ATS-001' } })
    expect(screen.getByText('Applicant Tracking System (ATS)')).toBeInTheDocument()
    expect(screen.queryByText('CHR-ORG-001')).not.toBeInTheDocument()

    // Clear and search by partner
    fireEvent.change(searchInput, { target: { value: 'HackerRank' } })
    expect(screen.getByText('Technical Assessment Platform')).toBeInTheDocument()
    expect(screen.getByText('TA-PRT-005')).toBeInTheDocument()
    expect(screen.queryByText('Multi-Country Payroll Engine')).not.toBeInTheDocument()
  })

  it('allows creating a new product family and selects it with 0 products', async () => {
    renderCataloguePage()

    // Click + Add Family button
    const addFamilyBtn = screen.getByRole('button', { name: /Add a new product family/i })
    fireEvent.click(addFamilyBtn)

    // Modal opens
    expect(screen.getByRole('heading', { name: /Add Product Family/i })).toBeInTheDocument()

    const nameInput = screen.getByLabelText(/Family Name/i)
    fireEvent.change(nameInput, { target: { value: 'Compensation & Equity' } })

    const createBtn = screen.getByRole('button', { name: /Create Family/i })
    fireEvent.click(createBtn)

    // Family is created and appears in sidebar
    await waitFor(() => {
      const sidebar = screen.getByRole('complementary', { name: /L1 Product Families/i })
      expect(within(sidebar).getByText('Compensation & Equity')).toBeInTheDocument()
    })

    // It is selected and shows 0 items
    expect(screen.getByRole('heading', { name: /Compensation & Equity/i, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/0 items/i)).toBeInTheDocument()
    expect(screen.getByText(/No products in this family yet/i)).toBeInTheDocument()
  })

  it('rejects duplicate family names ignoring letter case and surrounding whitespace', () => {
    renderCataloguePage()

    const addFamilyBtn = screen.getByRole('button', { name: /Add a new product family/i })
    fireEvent.click(addFamilyBtn)

    const nameInput = screen.getByLabelText(/Family Name/i)
    // Try to add existing "Talent Acquisition" with lowercase and extra spaces
    fireEvent.change(nameInput, { target: { value: '   talent acquisition   ' } })

    const createBtn = screen.getByRole('button', { name: /Create Family/i })
    fireEvent.click(createBtn)

    // Inline error message should display
    expect(
      screen.getByText(/A product family with this name already exists/i),
    ).toBeInTheDocument()

    // Modal should remain open
    expect(screen.getByRole('heading', { name: /Add Product Family/i })).toBeInTheDocument()
  })

  it('allows adding a new product row and updates product counts', () => {
    renderCataloguePage()

    expect(screen.getByText(/Showing 22 of 22 products/i)).toBeInTheDocument()

    // Click + Add Row
    const addRowBtn = screen.getByRole('button', { name: /Add product row/i })
    fireEvent.click(addRowBtn)

    // Inline form inputs appear
    const solutionInput = screen.getByLabelText(/New solution name/i)
    const subItemInput = screen.getByLabelText(/New partner or sub-item/i)
    const codeInput = screen.getByLabelText(/New product code/i)

    fireEvent.change(solutionInput, { target: { value: 'AI Candidate Sifter Pro' } })
    fireEvent.change(subItemInput, { target: { value: 'High-volume candidate funnel filter' } })
    fireEvent.change(codeInput, { target: { value: 'TA-SIFT-999' } })

    const saveBtn = screen.getByRole('button', { name: /Save product row/i })
    fireEvent.click(saveBtn)

    // New product is present in table
    expect(screen.getByText('AI Candidate Sifter Pro')).toBeInTheDocument()
    expect(screen.getByText('TA-SIFT-999')).toBeInTheDocument()

    // Total count incremented to 23
    expect(screen.getByText(/Showing 23 of 23 products/i)).toBeInTheDocument()
  })

  it('provides a delete action with confirmation interaction', () => {
    renderCataloguePage()

    expect(screen.getByText('TA-ATS-001')).toBeInTheDocument()

    // Click Delete on TA-ATS-001
    const deleteBtn = screen.getByRole('button', { name: /Delete product TA-ATS-001/i })
    fireEvent.click(deleteBtn)

    // Delete confirmation modal opens
    expect(screen.getByRole('heading', { name: /Delete Product/i })).toBeInTheDocument()
    expect(screen.getByText(/Are you sure you want to remove/i)).toBeInTheDocument()

    // Confirm Delete
    const confirmBtn = screen.getByRole('button', { name: /Confirm Delete/i })
    fireEvent.click(confirmBtn)

    // Product is removed
    expect(screen.queryByText('TA-ATS-001')).not.toBeInTheDocument()

    // Total count decrements to 21
    expect(screen.getByText(/Showing 21 of 21 products/i)).toBeInTheDocument()
  })
})
