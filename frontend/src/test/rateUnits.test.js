import { describe, it, expect } from 'vitest'
import {
  describeCountryVolume,
  describeFixedFee,
  describeUnitRate,
  quantityUnitLabel,
} from '../features/calculator/rateUnits'

describe('rate unit labels (from /rates/resolve)', () => {
  it('uses the rate card UOM and the pricing model billing period', () => {
    const rate = { currency_code: 'INR', uom_name: 'Payslips', unit_rate: '2', unit_rate_basis: 'annual', fixed_fee: '1000', fixed_fee_basis: 'one_time' }
    expect(quantityUnitLabel(rate)).toBe('Payslips / year')
    expect(describeUnitRate(rate)).toBe('INR 2.00 per Payslips / year')
    expect(describeFixedFee(rate)).toBe('platform fee INR 1,000 (one-time)')
  })

  it('describes a one-time licence rate with its AMC %', () => {
    const rate = { currency_code: 'INR', uom_name: 'Active Employees (with ESS)', unit_rate: '200000', unit_rate_basis: 'one_time', amc_percentage: '7.0000' }
    expect(describeUnitRate(rate)).toBe('INR 200000.00 per Active Employees (with ESS) (one-time) + AMC 7% / year')
    expect(quantityUnitLabel(rate)).toBe('Active Employees (with ESS)')
  })

  it('does not invent a period or unit the backend did not send', () => {
    expect(quantityUnitLabel({})).toBe('units')
    expect(describeUnitRate({ currency_code: 'INR', unit_rate: '5' })).toBe('INR 5.00 per unit')
    expect(describeFixedFee({ currency_code: 'INR', fixed_fee: '10' })).toBe('platform fee INR 10')
    expect(describeUnitRate({ currency_code: 'INR', unit_rate: null })).toBe('')
  })

  it('labels the country volume with the single pack unit', () => {
    const label = describeCountryVolume([{ uomName: 'Interviews', period: 'month' }], 'India')
    expect(label).toMatchObject({ heading: 'Interviews — Country Deployment Volume', unit: 'Interviews / month', mixed: false })
  })

  it('warns when packs in one country use different units', () => {
    const label = describeCountryVolume(
      [{ uomName: 'Interviews', period: 'month' }, { uomName: 'Active Employees (with ESS)', period: 'month' }],
      'India',
    )
    expect(label.mixed).toBe(true)
    expect(label.heading).toBe('Pack Quantity — Country Deployment Volume')
    expect(label.help).toMatch(/different units \(Interviews, Active Employees \(with ESS\)\)/)
  })
})
