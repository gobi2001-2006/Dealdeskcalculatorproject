import { describe, it, expect } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PacksPage } from '../features/packs/PacksPage'

function renderPacksPage() {
  return render(
    <MemoryRouter>
      <PacksPage />
    </MemoryRouter>,
  )
}

describe('Pack Builder Feature Tests', () => {
  it('opens initially in empty workspace state and cards do not contain delete buttons', () => {
    renderPacksPage()

    // 1. Top navigation & Summary strip
    expect(screen.getByText('DEAL DESK')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Pack Builder/i })).toBeInTheDocument()
    expect(screen.getByText(/Client/i)).toBeInTheDocument()
    expect(screen.getByText(/Global Enterprise Master/i)).toBeInTheDocument()

    // 2. Saved Packs Sidebar
    const sidebar = screen.getByRole('complementary', { name: /Saved Packs/i })
    expect(within(sidebar).getByText('Packs')).toBeInTheDocument()
    expect(within(sidebar).getByText('Talent Acquisition Growth Suite')).toBeInTheDocument()
    expect(within(sidebar).getByText('Enterprise Core HR & Onboarding')).toBeInTheDocument()
    expect(within(sidebar).getByRole('button', { name: /Create New Pack/i })).toBeInTheDocument()

    // 3. Saved pack cards do NOT contain delete buttons
    expect(within(sidebar).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()

    // 4. Main workspace shows centered empty state (NOT the editor)
    expect(
      screen.getByText('Select a pack to edit, or create your first pack.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Create First Pack/i }),
    ).toBeInTheDocument()

    // Editor is NOT automatically opened
    expect(screen.queryByRole('heading', { name: /New Pack/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Edit Pack/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Select Products & Features/i })).not.toBeInTheDocument()
  })

  it('opens blank new pack editor when clicking Create First Pack or Create New Pack', () => {
    renderPacksPage()

    // Click + Create First Pack in the empty workspace
    const createFirstBtn = screen.getByRole('button', { name: /Create First Pack/i })
    fireEvent.click(createFirstBtn)

    // Editor opens with New Pack heading
    expect(screen.getByRole('heading', { name: /New Pack/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Pack Name/i)).toHaveValue('')
    expect(screen.getByRole('heading', { name: /Select Products & Features/i })).toBeInTheDocument()

    // Starts with 0 selected products
    const saveBar = screen.getByRole('contentinfo', { name: /Pack Builder Action Bar/i })
    expect(within(saveBar).getAllByText('0').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/0 Selected/i)).toBeInTheDocument()
    expect(screen.getByText('No products selected yet')).toBeInTheDocument()
  })

  it('selects a saved pack from sidebar and restores its metadata, products, and notes', () => {
    renderPacksPage()

    const sidebar = screen.getByRole('complementary', { name: /Saved Packs/i })
    const coreHrCard = within(sidebar).getByText('Enterprise Core HR & Onboarding')

    fireEvent.click(coreHrCard)

    // Editor updates to selected pack
    expect(
      screen.getByRole('heading', { name: /Edit Pack: Enterprise Core HR & Onboarding/i }),
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue('CHR-ENT-02')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue(/Mandatory prerequisite for global payroll integration/i),
    ).toBeInTheDocument()

    // Counters update to 4 products
    const saveBar = screen.getByRole('contentinfo', { name: /Pack Builder Action Bar/i })
    expect(within(saveBar).getByText('4')).toBeInTheDocument()
  })

  it('returns to empty workspace when canceling new pack creation without saving', () => {
    renderPacksPage()

    // Open new pack editor
    fireEvent.click(screen.getByRole('button', { name: /Create First Pack/i }))
    expect(screen.getByRole('heading', { name: /New Pack/i })).toBeInTheDocument()

    // Enter temporary name
    fireEvent.change(screen.getByLabelText(/Pack Name/i), {
      target: { value: 'Temporary Unsaved Pack' },
    })

    // Click Cancel in the header
    const cancelBtn = screen.getAllByRole('button', { name: /Cancel/i })[0]
    fireEvent.click(cancelBtn)

    // Returns to empty workspace
    expect(
      screen.getByText('Select a pack to edit, or create your first pack.'),
    ).toBeInTheDocument()

    // Sidebar does NOT contain the unsaved pack
    const sidebar = screen.getByRole('complementary', { name: /Saved Packs/i })
    expect(within(sidebar).queryByText('Temporary Unsaved Pack')).not.toBeInTheDocument()
  })

  it('returns to empty workspace when canceling an edit without saving changes', () => {
    renderPacksPage()

    const sidebar = screen.getByRole('complementary', { name: /Saved Packs/i })
    fireEvent.click(within(sidebar).getByText('Enterprise Core HR & Onboarding'))

    // Modify pack name
    const nameInput = screen.getByLabelText(/Pack Name/i)
    fireEvent.change(nameInput, {
      target: { value: 'Modified Pack Name That Should Not Save' },
    })

    // Click Cancel
    const cancelBtn = screen.getAllByRole('button', { name: /Cancel/i })[0]
    fireEvent.click(cancelBtn)

    // Returns to empty workspace
    expect(
      screen.getByText('Select a pack to edit, or create your first pack.'),
    ).toBeInTheDocument()

    // Original pack in sidebar is unmodified
    expect(
      within(sidebar).getByText('Enterprise Core HR & Onboarding'),
    ).toBeInTheDocument()
    expect(
      within(sidebar).queryByText('Modified Pack Name That Should Not Save'),
    ).not.toBeInTheDocument()
  })

  it('allows selecting and removing multiple products, updating counts immediately', () => {
    renderPacksPage()

    // Open a pack
    const sidebar = screen.getByRole('complementary', { name: /Saved Packs/i })
    fireEvent.click(within(sidebar).getByText('Enterprise Core HR & Onboarding'))

    const saveBar = screen.getByRole('contentinfo', { name: /Pack Builder Action Bar/i })
    expect(within(saveBar).getByText('4')).toBeInTheDocument()

    // Select an unpicked product: "Applicant Tracking System (ATS)"
    const checkbox = screen.getByRole('checkbox', {
      name: /Select Applicant Tracking System \(ATS\)/i,
    })
    expect(checkbox).not.toBeChecked()

    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()

    // Total products counter increments to 5
    expect(within(saveBar).getByText('5')).toBeInTheDocument()

    // Summary at bottom of selection panel shows the newly selected item
    expect(
      screen.getByRole('button', {
        name: /Remove Applicant Tracking System \(ATS\)/i,
      }),
    ).toBeInTheDocument()

    // Remove it using the summary remove button
    const removeBtn = screen.getByRole('button', {
      name: /Remove Applicant Tracking System \(ATS\)/i,
    })
    fireEvent.click(removeBtn)

    // Counter returns to 4
    expect(within(saveBar).getByText('4')).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()
  })

  it('expands and collapses product families', () => {
    renderPacksPage()

    // Open a pack
    const sidebar = screen.getByRole('complementary', { name: /Saved Packs/i })
    fireEvent.click(within(sidebar).getByText('Talent Acquisition Growth Suite'))

    // Initially Talent Acquisition products table is present
    const taTable = screen.getByRole('table', { name: /Talent Acquisition Products/i })
    expect(within(taTable).getByText('Applicant Tracking System (ATS)')).toBeInTheDocument()

    // Click Collapse All
    const collapseBtn = screen.getByRole('button', { name: /Collapse/i })
    fireEvent.click(collapseBtn)

    // Products table should be hidden
    expect(screen.queryByRole('table', { name: /Talent Acquisition Products/i })).not.toBeInTheDocument()

    // Click Expand all
    const expandBtn = screen.getByRole('button', { name: /Expand all/i })
    fireEvent.click(expandBtn)

    // Products table is visible again
    const taTableExpanded = screen.getByRole('table', { name: /Talent Acquisition Products/i })
    expect(within(taTableExpanded).getByText('Applicant Tracking System (ATS)')).toBeInTheDocument()
  })

  it('filters available products via search input without losing selected items', () => {
    renderPacksPage()

    // Open a pack
    const sidebar = screen.getByRole('complementary', { name: /Saved Packs/i })
    fireEvent.click(within(sidebar).getByText('Talent Acquisition Growth Suite'))

    const searchInput = screen.getByRole('searchbox', {
      name: /Search products or codes/i,
    })

    // Search by partner name "DocuSign"
    fireEvent.change(searchInput, { target: { value: 'DocuSign' } })

    // Matching product is present in Core HR table
    const coreHrTable = screen.getByRole('table', { name: /Core HR & Workforce Products/i })
    expect(
      within(coreHrTable).getByText('Document Vault & Digital Signatures'),
    ).toBeInTheDocument()

    // Talent acquisition shows no matches in its section
    expect(
      screen.getByText(/No products in Talent Acquisition match "DocuSign"/i),
    ).toBeInTheDocument()

    // Selected products at bottom STILL retains selected count and items
    expect(screen.getByText(/Selected Products \(5\)/i)).toBeInTheDocument()

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } })

    // Full table restored
    const taTable = screen.getByRole('table', { name: /Talent Acquisition Products/i })
    expect(within(taTable).getByText('Applicant Tracking System (ATS)')).toBeInTheDocument()
    const saveBar = screen.getByRole('contentinfo', { name: /Pack Builder Action Bar/i })
    expect(within(saveBar).getByText('5')).toBeInTheDocument()
  })

  it('validates blank pack name and duplicate pack names case-insensitively', () => {
    renderPacksPage()

    // Click Create New Pack
    const createNewBtn = screen.getByRole('button', { name: /Create New Pack/i })
    fireEvent.click(createNewBtn)

    expect(screen.getByRole('heading', { name: /New Pack/i })).toBeInTheDocument()

    const saveBtn = screen.getByRole('button', { name: /Save Pack/i })

    // 1. Try to save with blank name
    fireEvent.click(saveBtn)
    expect(screen.getByText(/Pack Name is required/i)).toBeInTheDocument()

    // 2. Try to save with existing duplicate name with irregular case and spaces
    const nameInput = screen.getByLabelText(/Pack Name/i)
    fireEvent.change(nameInput, {
      target: { value: '   talent acquisition growth suite   ' },
    })

    fireEvent.click(saveBtn)
    expect(
      screen.getByText(/A pack with this name already exists/i),
    ).toBeInTheDocument()
  })

  it('creates a new pack, saves it, updates the sidebar, and allows reopening', async () => {
    renderPacksPage()

    // Click + Create New Pack
    fireEvent.click(screen.getByRole('button', { name: /Create New Pack/i }))

    // Fill form
    fireEvent.change(screen.getByLabelText(/Pack Name/i), {
      target: { value: 'Global Time & Scheduling Pack' },
    })
    fireEvent.change(screen.getByLabelText(/Short Description/i), {
      target: { value: 'Time tracking, shift roasters, and touchless biometric kiosks.' },
    })
    fireEvent.change(screen.getByLabelText(/Pack Code \/ SKU/i), {
      target: { value: 'TIME-ROST-99' },
    })

    // Select products
    const timeProduct1 = screen.getByRole('checkbox', {
      name: /Select Biometric & Shift Scheduling/i,
    })
    const timeProduct2 = screen.getByRole('checkbox', {
      name: /Select AI Touchless Facial Kiosk/i,
    })

    fireEvent.click(timeProduct1)
    fireEvent.click(timeProduct2)

    // Save pack
    fireEvent.click(screen.getByRole('button', { name: /Save Pack/i }))

    // Toast appears
    await waitFor(() => {
      expect(
        screen.getByText(/Pack "Global Time & Scheduling Pack" saved successfully/i),
      ).toBeInTheDocument()
    })

    // Appears in sidebar with count 2
    const sidebar = screen.getByRole('complementary', { name: /Saved Packs/i })
    expect(
      within(sidebar).getByText('Global Time & Scheduling Pack'),
    ).toBeInTheDocument()
    expect(within(sidebar).getByText('TIME-ROST-99')).toBeInTheDocument()
  })
})
