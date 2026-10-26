/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useMemo, useCallback } from 'react'
import { INITIAL_CLIENT_INFO } from '../features/calculator/calculatorData'

export const ProposalContext = createContext(null)

export function ProposalProvider({ children, initialProposal = null }) {
  // Phase A: Client Details & Reporting Currency
  const [clientInfo, setClientInfo] = useState(
    initialProposal?.clientInfo || INITIAL_CLIENT_INFO
  )
  const [clientErrors, setClientErrors] = useState({})

  // Phase B: Country Configurations (a new proposal starts with none)
  const [countryConfigs, setCountryConfigs] = useState(
    initialProposal?.countryConfigs !== undefined
      ? initialProposal.countryConfigs
      : []
  )

  // Focused country/section context for Page 5
  const [focusedCountryId, setFocusedCountryId] = useState(
    countryConfigs[0]?.id || null
  )
  const [focusedFamilyId, setFocusedFamilyId] = useState(null)

  // Page 5: Line-item discounts (percentage only), saved on the backend line item.
  // Keyed by line target `pack:<pack_version_id>` / `feature:<feature_id>` -> { value, reason }
  const [lineItemDiscounts, setLineItemDiscounts] = useState(
    initialProposal?.lineItemDiscounts || {}
  )

  // Page 5: Overall subscription discount (percentage), sent to the calculation for every product.
  // Key 'proposal' -> { value, reason }
  const [overallDiscounts, setOverallDiscounts] = useState(
    initialProposal?.overallDiscounts || {}
  )

  // Page 5: Overall services discount (percentage, one per product - never per service line).
  // Key 'proposal' -> { value, reason }
  const [serviceDiscounts, setServiceDiscounts] = useState(
    initialProposal?.serviceDiscounts || {}
  )

  // Page 5/6: Calculation Snapshot state from backend pricing engine
  const [calcApiResult, setCalcApiResult] = useState(
    initialProposal?.calcApiResult || null
  )

  // Page 5: Approval policies (Demo settings - not enforced)
  const [approvalPolicies] = useState({
    grossMarginFloor: '30.0',
    lineItemDiscountCeiling: '15.0',
    overallDiscountCeiling: '20.0',
    isEnforced: false,
    status: 'pending_backend_configuration',
  })

  // Helpers to update state
  const updateClientInfo = (field, value) => {
    setClientInfo((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const addCountry = useCallback((newCountry) => {
    setCountryConfigs((prev) => [...prev, newCountry])
    setFocusedCountryId((prev) => prev || newCountry.id)
  }, [])

  const updateCountry = useCallback((updatedCountry) => {
    setCountryConfigs((prev) =>
      prev.map((c) => (c.id === updatedCountry.id ? updatedCountry : c))
    )
  }, [])

  const removeCountry = useCallback((countryId) => {
    setCountryConfigs((prev) => {
      const remaining = prev.filter((c) => c.id !== countryId)
      setFocusedCountryId((cur) => (cur === countryId ? remaining[0]?.id || null : cur))
      return remaining
    })
  }, [])

  // Discount update helpers
  const updateLineItemDiscount = useCallback((itemKey, discountData) => {
    setLineItemDiscounts((prev) => ({
      ...prev,
      [itemKey]: {
        ...(prev[itemKey] || { type: 'percentage', value: '', reason: '' }),
        ...discountData,
      },
    }))
  }, [])

  const updateOverallDiscount = useCallback((countryId, discountData) => {
    setOverallDiscounts((prev) => ({
      ...prev,
      [countryId]: {
        ...(prev[countryId] || { type: 'percentage', value: '', reason: '' }),
        ...discountData,
      },
    }))
  }, [])

  const updateServiceDiscount = useCallback((serviceId, discountData) => {
    setServiceDiscounts((prev) => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] || { type: 'percentage', value: '', reason: '' }),
        ...discountData,
      },
    }))
  }, [])

  const value = useMemo(
    () => ({
      clientInfo,
      setClientInfo,
      clientErrors,
      setClientErrors,
      updateClientInfo,
      countryConfigs,
      setCountryConfigs,
      addCountry,
      updateCountry,
      removeCountry,
      focusedCountryId: focusedCountryId || countryConfigs[0]?.id || null,
      setFocusedCountryId,
      focusedFamilyId,
      setFocusedFamilyId,
      lineItemDiscounts,
      setLineItemDiscounts,
      updateLineItemDiscount,
      overallDiscounts,
      setOverallDiscounts,
      updateOverallDiscount,
      serviceDiscounts,
      setServiceDiscounts,
      updateServiceDiscount,
      calcApiResult,
      setCalcApiResult,
      approvalPolicies,
    }),
    [
      clientInfo,
      clientErrors,
      countryConfigs,
      focusedCountryId,
      focusedFamilyId,
      lineItemDiscounts,
      overallDiscounts,
      serviceDiscounts,
      calcApiResult,
      approvalPolicies,
      addCountry,
      updateCountry,
      removeCountry,
      updateLineItemDiscount,
      updateOverallDiscount,
      updateServiceDiscount,
    ]
  )

  return (
    <ProposalContext.Provider value={value}>
      {children}
    </ProposalContext.Provider>
  )
}

/**
 * Custom hook to consume ProposalContext with a safe fallback when used outside the Provider.
 */
export function useProposal() {
  const context = useContext(ProposalContext)
  if (!context) {
    // Provide a safe fallback mock so standalone tests don't throw
    return {
      clientInfo: INITIAL_CLIENT_INFO,
      setClientInfo: () => {},
      clientErrors: {},
      setClientErrors: () => {},
      updateClientInfo: () => {},
      countryConfigs: [],
      setCountryConfigs: () => {},
      addCountry: () => {},
      updateCountry: () => {},
      removeCountry: () => {},
      focusedCountryId: null,
      setFocusedCountryId: () => {},
      focusedFamilyId: null,
      setFocusedFamilyId: () => {},
      lineItemDiscounts: {},
      setLineItemDiscounts: () => {},
      updateLineItemDiscount: () => {},
      overallDiscounts: {},
      setOverallDiscounts: () => {},
      updateOverallDiscount: () => {},
      serviceDiscounts: {},
      setServiceDiscounts: () => {},
      updateServiceDiscount: () => {},
      calcApiResult: null,
      setCalcApiResult: () => {},
      approvalPolicies: {
        grossMarginFloor: '30.0',
        lineItemDiscountCeiling: '15.0',
        overallDiscountCeiling: '20.0',
        isEnforced: false,
        status: 'pending_backend_configuration',
      },
    }
  }
  return context
}

export default ProposalContext
