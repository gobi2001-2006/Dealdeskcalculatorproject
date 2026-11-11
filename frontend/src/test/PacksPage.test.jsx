import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import apiClient from '../api/client'
import { PacksPage } from '../features/packs/PacksPage'
import { installFakeApi, httpError } from './fixtures/fakeApi'
import * as fx from './fixtures/backendRecords'

vi.mock('../api/client')

/** In-memory pack backend; returns the fake api (calls) and the data it mutates. */
function packBackend(overrides = {}) {
  const db = {
    packs: JSON.parse(JSON.stringify(fx.packs)),
    products: [...fx.products, { id: 23, product_family_id: 10, code: 'TA_EMPTY', name: 'No Features Yet', status: 'active' }],
    features: [...fx.features],
  }
  let next = 300
  const api = installFakeApi(apiClient, {
    'GET /packs/': () => db.packs,
    'GET /packs/detail/:id': (_b, { id }) => db.packs.find((p) => String(p.id) === id),
    'GET /catalogue/families': () => fx.families,
    'GET /catalogue/products': () => db.products,
    'GET /catalogue/features': () => db.features,
    'POST /packs/': (body) => {
      const pack = {
        id: next++, ...body, product_family_id: body.product_family_id,
        pack_versions: [{ id: next++, version_no: 1, status: 'active', pack_items: body.items.map((i) => ({ ...i })) }],
      }
      db.packs.push(pack)
      return pack
    },
    'PATCH /packs/:id': (body, { id }) => Object.assign(db.packs.find((p) => String(p.id) === id), body),
    'PUT /packs/versions/:id/items': (items, { id }) => {
      db.packs.forEach((p) => p.pack_versions.forEach((v) => { if (String(v.id) === id) v.pack_items = items }))
      return items
    },
    'POST /packs/versions': (body) => {
      const ver = { id: next++, ...body, pack_items: [] }
      db.packs.find((p) => p.id === body.pack_id).pack_versions.push(ver)
      return ver
    },
    'PATCH /packs/versions/:id': (body, { id }) => {
      db.packs.forEach((p) => p.pack_versions.forEach((v) => {
        if (String(v.id) === id) Object.assign(v, body)
        else if (body.status === 'active' && v.status === 'active' && p.pack_versions.some((x) => String(x.id) === id)) v.status = 'superseded'
      }))
      return body
    },
    'DELETE /packs/:id': (_b, { id }) => {
      db.packs = db.packs.filter((p) => String(p.id) !== id)
      return null
    },
    ...overrides,
  })
  return { api, db }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PacksPage />
    </MemoryRouter>,
  )
}

describe('Page 2 — Pack Builder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists saved packs and opens in the empty workspace', async () => {
    packBackend()
    renderPage()
    const sidebar = screen.getByRole('complementary', { name: /Saved Packs/i })
    expect(await within(sidebar).findByText('TA Premium')).toBeInTheDocument()
    expect(screen.getByText('Select a pack to edit, or create your first pack.')).toBeInTheDocument()
    expect(within(sidebar).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('shows the backend error and no demo packs when the backend is unavailable', async () => {
    installFakeApi(apiClient, {
      'GET /packs/': () => { throw httpError(503, 'Database connection failed') },
      'GET /catalogue/families': () => [],
      'GET /catalogue/products': () => [],
      'GET /catalogue/features': () => [],
    })
    renderPage()
    expect(await screen.findByText(/Service unavailable/)).toBeInTheDocument()
    expect(screen.queryByText('Talent Acquisition Growth Suite')).not.toBeInTheDocument()
  })

  it('opens the active version of a saved pack with its products', async () => {
    packBackend()
    renderPage()
    const sidebar = screen.getByRole('complementary', { name: /Saved Packs/i })
    fireEvent.click(await within(sidebar).findByText('TA Premium'))
    expect(await screen.findByRole('heading', { name: /Edit Pack: TA Premium/i })).toBeInTheDocument()
    expect(screen.getByText(/v2 \(active\)/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('TA_PREMIUM')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove TA Max/i })).toBeInTheDocument()
  })

  it('creates a pack containing every feature of each selected product', async () => {
    const { api } = packBackend()
    renderPage()
    await screen.findByText('TA Premium')
    fireEvent.click(screen.getByRole('button', { name: /Create First Pack/i }))
    fireEvent.change(screen.getByLabelText(/Pack Name/i), { target: { value: 'TA Starter' } })
    fireEvent.change(screen.getByLabelText(/Pack Code/i), { target: { value: 'TA_STARTER' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Select TA Max/i }))
    fireEvent.click(screen.getByRole('button', { name: /Save Pack/i }))

    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST' && c.path === '/packs/')).toBe(true))
    const body = api.calls.find((c) => c.method === 'POST' && c.path === '/packs/').body
    expect(body).toMatchObject({ name: 'TA Starter', code: 'TA_STARTER' })
    expect(body.items.map((i) => i.feature_id).sort()).toEqual([30, 31]) // both features of TA Max
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/catalogue/features')).toBe(false)
  })

  it('refuses to pack a product without features instead of inventing one', async () => {
    const { api } = packBackend()
    renderPage()
    await screen.findByText('TA Premium')
    fireEvent.click(screen.getByRole('button', { name: /Create First Pack/i }))
    fireEvent.change(screen.getByLabelText(/Pack Name/i), { target: { value: 'Empty Pack' } })
    fireEvent.change(screen.getByLabelText(/Pack Code/i), { target: { value: 'EMPTY' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Select No Features Yet/i }))
    fireEvent.click(screen.getByRole('button', { name: /Save Pack/i }))

    expect(await screen.findByText(/have no saved features yet: No Features Yet/)).toBeInTheDocument()
    expect(api.writes()).toEqual([])
  })

  it('updates pack metadata without changing its status and syncs the working version', async () => {
    const { api } = packBackend()
    renderPage()
    fireEvent.click(await screen.findByText('TA Premium'))
    await screen.findByRole('heading', { name: /Edit Pack: TA Premium/i })
    fireEvent.change(screen.getByLabelText(/Pack Name/i), { target: { value: 'TA Premium Plus' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Pack/i }))

    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true))
    const patch = api.calls.find((c) => c.method === 'PATCH' && c.path === '/packs/40')
    expect(patch.body).toMatchObject({ name: 'TA Premium Plus' })
    expect(patch.body).not.toHaveProperty('status')
    expect(api.calls.find((c) => c.method === 'PUT').path).toBe('/packs/versions/42/items')
  })

  it('keeps the exact saved features of a partially included product when saving', async () => {
    const { api, db } = packBackend()
    // Version 2 contains only Recruit (30) of TA Max, not AI Agent (31).
    db.packs[0].pack_versions[1].pack_items = [{ pack_version_id: 42, feature_id: 30, is_required: true }]
    renderPage()
    fireEvent.click(await screen.findByText('TA Premium'))
    await screen.findByRole('heading', { name: /Edit Pack: TA Premium/i })
    fireEvent.change(screen.getByLabelText(/Pack Name/i), { target: { value: 'TA Premium (renamed)' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Pack/i }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true))
    expect(api.calls.find((c) => c.method === 'PUT').body).toEqual([{ feature_id: 30, is_required: true }])
  })

  it('creates a draft version that becomes the editable version and can be activated', async () => {
    const { api } = packBackend()
    renderPage()
    fireEvent.click(await screen.findByText('TA Premium'))
    await screen.findByRole('heading', { name: /Edit Pack: TA Premium/i })
    fireEvent.click(screen.getByRole('button', { name: /New Version/i }))
    expect(await screen.findByText(/Created Version 3 \(draft\)/)).toBeInTheDocument()
    expect(api.calls.find((c) => c.path === '/packs/versions' && c.method === 'POST').body).toEqual({
      pack_id: 40, version_no: 3, status: 'draft',
    })

    fireEvent.click(await screen.findByRole('button', { name: /Activate Version/i }))
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH' && c.path.startsWith('/packs/versions/'))).toBe(true))
    expect(api.calls.find((c) => c.method === 'PATCH' && c.path.startsWith('/packs/versions/')).body).toEqual({ status: 'active' })
  })

  it('deletes a pack after confirmation', async () => {
    const { api } = packBackend()
    renderPage()
    fireEvent.click(await screen.findByText('TA Premium'))
    await screen.findByRole('heading', { name: /Edit Pack: TA Premium/i })
    fireEvent.click(screen.getByRole('button', { name: /Delete Pack/i }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Confirm Delete/i }))
    expect(await screen.findByText('Pack deleted.')).toBeInTheDocument()
    expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/packs/40')).toBe(true)
  })
})
