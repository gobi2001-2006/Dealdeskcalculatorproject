import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import apiClient from '../api/client'
import { CataloguePage } from '../features/catalogue/CataloguePage'
import { installFakeApi, httpError } from './fixtures/fakeApi'
import * as fx from './fixtures/backendRecords'

vi.mock('../api/client')

/** A small in-memory catalogue backend that persists creates/deletes for the test. */
function catalogueBackend(overrides = {}) {
  const db = {
    families: [...fx.families, { id: 11, code: 'PAY', name: 'Payroll & Benefits', status: 'active' }],
    products: [...fx.products, { id: 22, product_family_id: 11, code: 'PAY_ENG', name: 'Payroll Engine', status: 'active' }],
    features: [...fx.features, { id: 33, product_id: 22, code: 'PAY_ENG-001', name: 'Gross-to-Net', classification: 'partner', partner_name: 'Gross-to-Net', status: 'active' }],
  }
  let next = 100
  const api = installFakeApi(apiClient, {
    'GET /catalogue/families': () => db.families,
    'GET /catalogue/products': () => db.products,
    'GET /catalogue/features': () => db.features,
    'POST /catalogue/families': (body) => {
      const rec = { id: next++, ...body }
      db.families.push(rec)
      return rec
    },
    'POST /catalogue/products': (body) => {
      const rec = { id: next++, ...body }
      db.products.push(rec)
      return rec
    },
    'POST /catalogue/features': (body) => {
      const rec = { id: next++, ...body }
      db.features.push(rec)
      return rec
    },
    'DELETE /catalogue/features/:id': (_b, { id }) => {
      db.features = db.features.filter((f) => String(f.id) !== id)
      return null
    },
    'DELETE /catalogue/products/:id': (_b, { id }) => {
      db.products = db.products.filter((p) => String(p.id) !== id)
      return null
    },
    ...overrides,
  })
  return { api, db }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CataloguePage />
    </MemoryRouter>,
  )
}

describe('Page 1 — Product Catalogue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders saved families and products from the backend', async () => {
    catalogueBackend()
    renderPage()
    expect(await screen.findByText('Live Database Connected (FastAPI / PostgreSQL)')).toBeInTheDocument()
    const sidebar = screen.getByRole('complementary', { name: /L1 Product Families/i })
    expect(within(sidebar).getByText('Talent Acquisition')).toBeInTheDocument()
    expect(within(sidebar).getByText('Payroll & Benefits')).toBeInTheDocument()
    expect(screen.getByText('TA_MAX')).toBeInTheDocument()
    expect(screen.getByText('PAY_ENG')).toBeInTheDocument()
    expect(screen.queryByText(/Global Enterprise Master/)).not.toBeInTheDocument()
  })

  it('shows an error and no demo catalogue when the backend is unavailable', async () => {
    installFakeApi(apiClient, {
      'GET /catalogue/families': () => { throw httpError(503, 'Database connection failed') },
      'GET /catalogue/products': () => [],
      'GET /catalogue/features': () => [],
    })
    renderPage()
    expect(await screen.findByText(/Catalogue backend unavailable \(Database connection failed\)/)).toBeInTheDocument()
    expect(screen.queryByText('TA-ATS-001')).not.toBeInTheDocument()
    expect(screen.queryByText(/Applicant Tracking System/)).not.toBeInTheDocument()
  })

  it('filters by family and by search text', async () => {
    catalogueBackend()
    renderPage()
    await screen.findByText('PAY_ENG')
    const sidebar = screen.getByRole('complementary', { name: /L1 Product Families/i })
    fireEvent.click(within(sidebar).getByRole('button', { name: /Payroll & Benefits/i }))
    expect(screen.getByRole('heading', { name: /Payroll & Benefits/i, level: 1 })).toBeInTheDocument()
    expect(screen.getByText('PAY_ENG')).toBeInTheDocument()
    expect(screen.queryByText('TA_MAX')).not.toBeInTheDocument()

    fireEvent.click(within(sidebar).getByText('All Products'))
    fireEvent.change(screen.getByLabelText(/Search name or code/i), { target: { value: 'add-ons' } })
    expect(screen.getByText('TA_ADD')).toBeInTheDocument()
    expect(screen.queryByText('TA_MAX')).not.toBeInTheDocument()
  })

  it('creates a product family through the API and selects it', async () => {
    const { api } = catalogueBackend()
    renderPage()
    await screen.findByText('TA_MAX')
    fireEvent.click(screen.getByRole('button', { name: /Add a new product family/i }))
    fireEvent.change(screen.getByLabelText(/Family Name/i), { target: { value: 'Compensation & Equity' } })
    fireEvent.click(screen.getByRole('button', { name: /Create Family/i }))

    await waitFor(() => expect(screen.getByRole('heading', { name: /Compensation & Equity/i, level: 1 })).toBeInTheDocument())
    expect(api.calls.find((c) => c.method === 'POST' && c.path === '/catalogue/families').body).toMatchObject({
      name: 'Compensation & Equity',
      status: 'active',
    })
  })

  it('rejects a duplicate family name regardless of case and spaces', async () => {
    const { api } = catalogueBackend()
    renderPage()
    await screen.findByText('TA_MAX')
    fireEvent.click(screen.getByRole('button', { name: /Add a new product family/i }))
    fireEvent.change(screen.getByLabelText(/Family Name/i), { target: { value: '   talent acquisition   ' } })
    fireEvent.click(screen.getByRole('button', { name: /Create Family/i }))
    expect(screen.getByText(/A product family with this name already exists/i)).toBeInTheDocument()
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('creates a product and its feature in the chosen family', async () => {
    const { api } = catalogueBackend()
    renderPage()
    await screen.findByText('TA_MAX')
    const sidebar = screen.getByRole('complementary', { name: /L1 Product Families/i })
    fireEvent.click(within(sidebar).getByRole('button', { name: /Talent Acquisition/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add product row/i }))
    fireEvent.change(screen.getByLabelText(/New solution name/i), { target: { value: 'Candidate Sifter' } })
    fireEvent.change(screen.getByLabelText(/New partner or sub-item/i), { target: { value: 'Funnel filter' } })
    fireEvent.change(screen.getByLabelText(/New product code/i), { target: { value: 'TA-SIFT-999' } })
    fireEvent.click(screen.getByRole('button', { name: /Save product row/i }))

    expect(await screen.findByText('TA-SIFT-999')).toBeInTheDocument()
    expect(api.calls.find((c) => c.path === '/catalogue/products' && c.method === 'POST').body).toMatchObject({
      product_family_id: 10, code: 'TA-SIFT-999', name: 'Candidate Sifter',
    })
    expect(api.calls.find((c) => c.path === '/catalogue/features' && c.method === 'POST').body).toMatchObject({
      name: 'Funnel filter', code: 'TA-SIFT-999-001',
    })
  })

  it('refuses to delete a product that has more features than the row shows', async () => {
    const { api } = catalogueBackend()
    renderPage()
    await screen.findByText('TA_MAX') // TA Max has two features (Recruit, AI Agent)
    fireEvent.click(screen.getByRole('button', { name: /Delete product TA_MAX/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Delete/i }))
    expect(await screen.findByText(/it has 2 features/)).toBeInTheDocument()
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('deletes a single-feature product (feature first, then product)', async () => {
    const { api } = catalogueBackend()
    renderPage()
    await screen.findByText('TA_ADD')
    fireEvent.click(screen.getByRole('button', { name: /Delete product TA_ADD/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Delete/i }))
    await waitFor(() => expect(screen.queryByText('TA_ADD')).not.toBeInTheDocument())
    expect(api.calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      '/catalogue/features/32',
      '/catalogue/products/21',
    ])
  })
})
