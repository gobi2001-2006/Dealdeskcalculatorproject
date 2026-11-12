import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { discountsFromSnapshot } from '../api/proposalsApi'
import { ProposalFinancialTable } from '../features/proposals/components/ProposalFinancialTable'
import * as fx from './fixtures/backendRecords'

// Overall discounts are set per country (business decision 2026-11-06) and stored on the country block.

function snapshotWith(productOverrides) {
  const data = fx.calculationResult()
  const product = { ...data.snapshot_payload.products[0], ...productOverrides }
  return { ...data, snapshot_payload: { ...data.snapshot_payload, products: [product] } }
}

describe('country-level overall discounts', () => {
  it('does not resend a discount the backend took from the country block', () => {
    const fromCountry = snapshotWith({
      product_key: 'TA_MAX', subscription_discount_source: 'country', service_discount_source: 'country',
    })
    expect(discountsFromSnapshot(fromCountry)).toEqual({ product_subscription_discounts: {}, product_service_discounts: {} })
  })

  it('still repeats discounts that were sent with an older calculation request', () => {
    const fromRequest = snapshotWith({ product_key: 'TA_MAX', subscription_discount_source: 'request' })
    expect(discountsFromSnapshot(fromRequest)).toEqual({
      product_subscription_discounts: { TA_MAX: 5 },
      product_service_discounts: { TA_MAX: 10 }, // no source recorded: snapshot older than country discounts
    })
  })

  it('shows each country’s overall discount and justification on the Proposal Summary', () => {
    const data = snapshotWith({
      country_name: 'India', subscription_discount_reason: 'Volume commitment', service_discount_reason: 'Bundled rollout',
    })
    render(<ProposalFinancialTable snapshotPayload={data.snapshot_payload} showDiscounts />)
    expect(screen.getByText(/India overall subscription discount 5%/)).toBeInTheDocument()
    expect(screen.getByText(/Volume commitment/)).toBeInTheDocument()
    expect(screen.getByText(/Bundled rollout/)).toBeInTheDocument()
  })
})

