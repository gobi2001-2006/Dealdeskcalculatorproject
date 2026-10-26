import apiClient from './client'
import { getCurrencies, getCountries } from './ratesApi'

/**
 * Proposals & Commercial Calculation API Service
 * 
 * Strictly connects to the authoritative FastAPI backend:
 * - Customers: GET /api/customers, POST /api/customers
 * - Deals: GET /api/deals, POST /api/deals
 * - Proposals: GET /api/proposals, POST /api/proposals, GET /api/proposals/{id}, PATCH /api/proposals/{id}
 * - Proposal Countries: POST /api/proposals/{id}/countries
 * - Proposal Line Items: POST /api/proposals/{id}/line-items, PATCH /api/proposals/{id}/line-items/{line_item_id}, DELETE
 * - Proposal Service Lines: POST /api/proposals/{id}/service-lines
 * - Calculation Engine: POST /api/proposals/{id}/calculate
 * - Latest Calculation Snapshot: GET /api/proposals/{id}/calculations/latest
 */

// ============================================================================
// Customer Management APIs
// ============================================================================

export async function getCustomers(search = '') {
  const params = search ? { search } : {}
  const res = await apiClient.get('/customers/', { params })
  return res.data
}

export async function createCustomer(payload) {
  const res = await apiClient.post('/customers/', payload)
  return res.data
}

export async function updateCustomer(customerId, payload) {
  const res = await apiClient.patch(`/customers/${customerId}`, payload)
  return res.data
}

// ============================================================================
// Deal Management APIs
// ============================================================================

export async function getDeals(search = '', customerId = null) {
  const params = {}
  if (search) params.search = search
  if (customerId) params.customer_id = customerId
  const res = await apiClient.get('/deals/', { params })
  return res.data
}

export async function createDeal(payload) {
  const res = await apiClient.post('/deals/', payload)
  return res.data
}

// ============================================================================
// Proposal Management APIs
// ============================================================================

export async function listProposals(params = {}) {
  const res = await apiClient.get('/proposals/', { params })
  return res.data
}

export async function getProposal(proposalId) {
  const res = await apiClient.get(`/proposals/${proposalId}`)
  return res.data
}

export async function createProposal(payload) {
  const res = await apiClient.post('/proposals/', payload)
  return res.data
}

export async function updateProposal(proposalId, payload) {
  const res = await apiClient.patch(`/proposals/${proposalId}`, payload)
  return res.data
}

export async function addProposalCountry(proposalId, payload) {
  const res = await apiClient.post(`/proposals/${proposalId}/countries`, payload)
  return res.data
}

export async function addProposalLineItem(proposalId, payload) {
  const res = await apiClient.post(`/proposals/${proposalId}/line-items`, payload)
  return res.data
}

export async function updateProposalLineItem(proposalId, lineItemId, payload) {
  const res = await apiClient.patch(`/proposals/${proposalId}/line-items/${lineItemId}`, payload)
  return res.data
}

export async function deleteProposalLineItem(proposalId, lineItemId) {
  const res = await apiClient.delete(`/proposals/${proposalId}/line-items/${lineItemId}`)
  return res.data
}

export async function addProposalServiceLine(proposalId, payload) {
  const res = await apiClient.post(`/proposals/${proposalId}/service-lines`, payload)
  return res.data
}

// ============================================================================
// Commercial Calculation Engine APIs (Phase D)
// ============================================================================

/**
 * Triggers the authoritative backend calculation engine for a persisted proposal.
 * POST /api/proposals/{proposalId}/calculate
 */
export async function calculateProposal(proposalId, payload = {}) {
  const res = await apiClient.post(`/proposals/${proposalId}/calculate`, payload)
  return res.data
}

/**
 * Retrieves the latest calculation snapshot for a persisted proposal.
 * GET /api/proposals/{proposalId}/calculations/latest
 */
export async function getLatestCalculation(proposalId) {
  const res = await apiClient.get(`/proposals/${proposalId}/calculations/latest`)
  return res.data
}

// ============================================================================
// High-Level Workflow: Save and Calculate Integration
// ============================================================================

/**
 * Persists the entire proposal hierarchy through the authoritative multi-step backend workflow:
 * 1. Resolve or create Customer (with customer_tier_id)
 * 2. Resolve or create Deal
 * 3. Create or reuse Proposal Header (linked to deal, customer, currency, user)
 * 4. Persist deployment countries
 * 5. Persist line items (packs and features)
 * 6. Persist service lines
 * 7. Reload and return the full persisted proposal
 */
function resolveNumericId(val, fallback = 1) {
  if (typeof val === 'number' && !isNaN(val) && val > 0) return val
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10)
    if (!isNaN(parsed) && parsed > 0) return parsed
    const lower = val.toLowerCase()
    if (lower.includes('in')) return 1
    if (lower.includes('us')) return 2
    if (lower.includes('uk') || lower.includes('gb')) return 3
    if (lower.includes('growth')) return 1
    if (lower.includes('ent') || lower.includes('enterprise')) return 2
    if (lower.includes('cloud') || lower.includes('shared')) return 1
    if (lower.includes('dedicated') || lower.includes('private')) return 2
    if (lower.includes('prem')) return 3
    if (lower.includes('pepm')) return 1
    if (lower.includes('sub') || lower.includes('platform')) return 2
  }
  return fallback
}

export async function saveFullProposal({
  clientInfo,
  countryConfigs,
  existingProposalId = null,
  userId = 1,
  defaultCurrencyId = null,
  masters = null,
}) {
  let customerId = clientInfo.customerId ? resolveNumericId(clientInfo.customerId, null) : null
  let dealId = clientInfo.dealId ? resolveNumericId(clientInfo.dealId, null) : null

  // Resolve live master records
  const liveCurrencies =
    masters?.currencies?.length > 0
      ? masters.currencies
      : await getCurrencies().catch(() => [])

  const liveCountries =
    masters?.countries?.length > 0
      ? masters.countries
      : await getCountries().catch(() => [])

  function resolveCountryId(val) {
    if (typeof val === 'number' && !isNaN(val) && val > 0) {
      if (liveCountries.length === 0 || liveCountries.some((c) => Number(c.id) === val)) {
        return val
      }
    }
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10)
      if (!isNaN(parsed) && (liveCountries.length === 0 || liveCountries.some((c) => Number(c.id) === parsed))) {
        return parsed
      }
      const lower = val.toLowerCase()
      if (liveCountries.length > 0) {
        const match = liveCountries.find(
          (c) =>
            c.iso_code?.toLowerCase() === lower ||
            c.name?.toLowerCase() === lower ||
            (lower.includes('in') && (c.iso_code === 'IN' || c.name === 'India')) ||
            ((lower.includes('us') || lower.includes('na')) && (c.iso_code === 'US' || c.name.includes('United States')))
        )
        if (match) return Number(match.id)
      }
      if (lower.includes('in')) return 2
      if (lower.includes('us')) return 3
    }
    return liveCountries[0]?.id || 2
  }

  // 1. Resolve or create customer
  if (!customerId) {
    const existingCustomers = await getCustomers(clientInfo.clientName)
    const match = existingCustomers.find(
      (c) => c.name.toLowerCase() === clientInfo.clientName.trim().toLowerCase()
    )
    const primaryTierId = resolveNumericId(countryConfigs[0]?.pricingTierId, 1)
    if (match) {
      customerId = match.id
      if (primaryTierId && match.customer_tier_id !== primaryTierId) {
        await updateCustomer(customerId, { customer_tier_id: primaryTierId }).catch(() => {})
      }
    } else {
      // Pick primary country ID for customer
      const primaryCountryId = resolveCountryId(countryConfigs[0]?.countryId)
      const createdCust = await createCustomer({
        code: `CUST-${Date.now().toString().slice(-6)}`,
        name: clientInfo.clientName.trim(),
        country_id: primaryCountryId,
        customer_tier_id: primaryTierId,
        industry: clientInfo.industry || 'Enterprise Technology',
        status: 'active',
      })
      customerId = createdCust.id
    }
  }

  // 2. Resolve or create deal
  if (!dealId) {
    const existingDeals = await getDeals(clientInfo.dealCode || clientInfo.clientName, customerId)
    const dealMatch = existingDeals.find(
      (d) =>
        (clientInfo.dealCode && d.code === clientInfo.dealCode) ||
        d.name.toLowerCase() === (clientInfo.clientName + ' Opportunity').toLowerCase()
    )
    if (dealMatch) {
      dealId = dealMatch.id
    } else {
      const createdDeal = await createDeal({
        code: clientInfo.dealCode || `DEAL-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
        name: `${clientInfo.clientName} Opportunity`,
        customer_id: customerId,
        owner_user_id: userId,
        status: 'open',
        target_close_date: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
      })
      dealId = createdDeal.id
    }
  }

  // 3. Create or update proposal header with authoritative currency resolution
  let proposalRecord
  let currencyId = Number(clientInfo.reportingCurrencyId)

  // Validate or resolve currency against live database
  if (currencyId && liveCurrencies.some((c) => Number(c.id) === currencyId)) {
    // Provided currencyId is valid in PostgreSQL
  } else {
    // Resolve by reportingCurrency code
    const targetCode = clientInfo.reportingCurrency?.trim().toUpperCase()
    const matchByCode = targetCode
      ? liveCurrencies.find((c) => c.code?.trim().toUpperCase() === targetCode)
      : null

    if (matchByCode) {
      currencyId = Number(matchByCode.id)
    } else if (defaultCurrencyId && liveCurrencies.some((c) => Number(c.id) === Number(defaultCurrencyId))) {
      currencyId = Number(defaultCurrencyId)
    } else if (currencyId && liveCurrencies.length === 0) {
      // Mock test environment without live currencies API
    } else if (liveCurrencies.length > 0) {
      currencyId = Number(liveCurrencies[0].id)
    } else {
      currencyId = Number(defaultCurrencyId) || 2
    }
  }

  if (existingProposalId) {
    // Update existing proposal header
    proposalRecord = await updateProposal(existingProposalId, {
      deal_id: dealId,
      customer_id: customerId,
      currency_id: currencyId,
      code: clientInfo.proposalCode || undefined,
    })
  } else {
    // Determine proposal code
    let proposalCode = clientInfo.proposalCode?.trim()
    if (!proposalCode) {
      const baseCode = clientInfo.dealCode
        ? clientInfo.dealCode.replace('DEAL', 'PROP')
        : 'PROP'
      proposalCode = `${baseCode}-${Date.now().toString().slice(-4)}`
    }

    try {
      proposalRecord = await createProposal({
        code: proposalCode,
        deal_id: dealId,
        customer_id: customerId,
        currency_id: currencyId,
        created_by_user_id: userId,
        status: 'draft',
      })
    } catch (createErr) {
      if (createErr.response?.status === 409) {
        // If code conflict occurs, try finding the existing proposal with that code or append unique suffix
        const existingList = await listProposals({ search: proposalCode }).catch(() => [])
        const exactMatch = existingList.find((p) => p.code === proposalCode)
        if (exactMatch) {
          proposalRecord = exactMatch
          await updateProposal(exactMatch.id, {
            deal_id: dealId,
            customer_id: customerId,
            currency_id: currencyId,
          }).catch(() => {})
        } else {
          // Retry with guaranteed unique timestamp code
          const uniqueCode = `PROP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`
          proposalRecord = await createProposal({
            code: uniqueCode,
            deal_id: dealId,
            customer_id: customerId,
            currency_id: currencyId,
            created_by_user_id: userId,
            status: 'draft',
          })
        }
      } else {
        throw createErr
      }
    }
  }

  const proposalId = proposalRecord.id
  // Fetch existing state of proposal to avoid duplicate countries/lines
  const currentDetail = await getProposal(proposalId)
  const existingCountryIds = new Set((currentDetail.countries || []).map((c) => c.country_id))

  // 4. Persist Proposal Countries
  for (let i = 0; i < countryConfigs.length; i++) {
    const cfg = countryConfigs[i]
    const numericCountryId = resolveCountryId(cfg.countryId)
    if (!existingCountryIds.has(numericCountryId)) {
      try {
        await addProposalCountry(proposalId, {
          country_id: numericCountryId,
          deployment_model_id: resolveNumericId(cfg.deploymentModelId, 1),
          pricing_model_id: resolveNumericId(cfg.pricingModelId, 1),
          user_headcount: Number(cfg.headcount) || 0,
          is_primary_deployment: i === 0,
        })
        existingCountryIds.add(numericCountryId)
      } catch (countryErr) {
        if (countryErr.response?.status !== 409) {
          throw countryErr
        }
      }
    }
  }

  // Active draft version
  const draftVersion = (currentDetail.versions || []).find((v) => v.status === 'draft')
  const existingPackVersionIds = new Set(
    (draftVersion?.line_items || [])
      .map((li) => li.pack_version_id)
      .filter(Boolean)
  )
  const existingFeatureIds = new Set(
    (draftVersion?.line_items || [])
      .map((li) => li.feature_id)
      .filter(Boolean)
  )

  // 5. Persist Line Items
  for (const country of countryConfigs) {
    for (const fam of country.families || []) {
      // Pack Line
      if (fam.selectedPackId) {
        const packVerId = resolveNumericId(fam.selectedPackId, 1)
        if (!existingPackVersionIds.has(packVerId)) {
          try {
            await addProposalLineItem(proposalId, {
              pack_version_id: packVerId,
              feature_id: null,
              uom_id: 1, // Default Employee UOM
              quantity: Number(country.headcount) || 1,
              discount_pct: null,
            })
            existingPackVersionIds.add(packVerId)
          } catch (packErr) {
            if (packErr.response?.status !== 409) {
              throw packErr
            }
          }
        }
      }

      // Standalone Features
      if (fam.selectedFeatureIds && fam.selectedFeatureIds.length > 0) {
        for (const featId of fam.selectedFeatureIds) {
          const numFeatId = resolveNumericId(featId, null)
          if (numFeatId && !existingFeatureIds.has(numFeatId)) {
            try {
              const featureEmp =
                Number(fam.featureHeadcounts?.[featId] ?? fam.headcount ?? country.headcount) || 1
              await addProposalLineItem(proposalId, {
                pack_version_id: null,
                feature_id: numFeatId,
                uom_id: 1,
                quantity: featureEmp,
                discount_pct: null,
              })
              existingFeatureIds.add(numFeatId)
            } catch (featErr) {
              if (featErr.response?.status !== 409) {
                throw featErr
              }
            }
          }
        }
      }
    }
  }

  // 6. Persist Service Lines
  const existingServiceRoleNames = new Set(
    (draftVersion?.service_lines || []).map((sl) => sl.role_name.trim().toLowerCase())
  )

  for (const country of countryConfigs) {
    for (const srv of country.serviceLines || []) {
      const roleKey = srv.roleName.trim().toLowerCase()
      if (!existingServiceRoleNames.has(roleKey)) {
        try {
          await addProposalServiceLine(proposalId, {
            service_rate_id: srv.serviceRateId ? Number(srv.serviceRateId) : null,
            role_name: srv.roleName.trim(),
            days_or_hours: Number(srv.hoursOrDays) || 1,
            rate_applied: 0, // Server resolves rate from master
            discount_pct: null, // Individual service line discount not allowed
          })
          existingServiceRoleNames.add(roleKey)
        } catch (srvErr) {
          if (srvErr.response?.status !== 409) {
            throw srvErr
          }
        }
      }
    }
  }

  // 7. Reload and return complete proposal with all children
  const finalProposal = await getProposal(proposalId)
  return {
    status: 'persisted',
    isPersisted: true,
    proposalId,
    customerId,
    dealId,
    data: finalProposal,
    message: 'Proposal successfully saved to PostgreSQL database.',
  }
}

/**
 * Request pricing calculation:
 * Ensures proposal is persisted first, then invokes POST /api/proposals/{proposalId}/calculate.
 */
export async function requestProposalCalculation({
  proposalId,
  clientInfo,
  countryConfigs,
  discounts = {},
  masters = null,
}) {
  try {
    let activeProposalId = proposalId

    // If proposal is not yet persisted, save it first
    if (!activeProposalId) {
      const saveRes = await saveFullProposal({ clientInfo, countryConfigs, masters })
      activeProposalId = saveRes.proposalId
    }

    const primaryTerm = Number(countryConfigs?.[0]?.contractTerm) || 12

    // Call the authoritative backend calculation engine
    const calculationResult = await calculateProposal(activeProposalId, {
      product_subscription_discounts: discounts.product_subscription_discounts || {},
      product_service_discounts: discounts.product_service_discounts || {},
      contract_term_months: primaryTerm,
    })

    return {
      status: 'success',
      proposalId: activeProposalId,
      data: calculationResult,
      isBackendCalculation: true,
    }
  } catch (error) {
    const detailMsg =
      error.response?.data?.detail || error.message || 'Pricing calculation failed'
    return {
      status: 'error',
      statusCode: error.response?.status,
      message: typeof detailMsg === 'object' ? JSON.stringify(detailMsg) : detailMsg,
      data: null,
      isBackendCalculation: false,
    }
  }
}

/**
 * Backward-compatible draft save alias
 */
export async function saveProposalDraft(payload) {
  try {
    if (payload.clientInfo && payload.countryConfigs) {
      return await saveFullProposal(payload)
    }
    // Direct proposal creation if payload matches ProposalCreate schema
    const response = await createProposal(payload)
    return {
      status: 'persisted',
      isPersisted: true,
      proposalId: response.id,
      data: response,
      message: 'Proposal successfully saved to PostgreSQL database.',
    }
  } catch (error) {
    return {
      status: 'error',
      isPersisted: false,
      statusCode: error.response?.status,
      message: error.response?.data?.detail || error.message || 'Failed to save proposal.',
    }
  }
}
