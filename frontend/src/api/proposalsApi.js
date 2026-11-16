import apiClient from './client'
import { validateContractYears, yearsToMonths } from '../utils/contractDuration'
import { resolveRateCard } from './ratesApi'
import { actingUserId } from '../auth/session'

/**
 * Proposals & commercial calculation API service (FastAPI backend).
 *
 * - Customers: GET/POST /api/customers/, PATCH /api/customers/{id}
 * - Deals: GET/POST /api/deals/
 * - Proposals: GET/POST /api/proposals/, GET/PATCH /api/proposals/{id}
 * - Country blocks: POST /api/proposals/{id}/countries, PATCH/DELETE .../countries/{block_id}
 * - Line items: POST /api/proposals/{id}/line-items, PATCH/DELETE .../line-items/{line_item_id}
 * - Service lines: POST /api/proposals/{id}/service-lines, PATCH/DELETE .../service-lines/{line_id}
 * - Calculation: POST /api/proposals/{id}/calculate, GET /api/proposals/{id}/calculations/latest
 *
 * Prices are never sent from the browser: the backend resolves every rate from the
 * saved rate card and service-rate masters.
 */

// ============================================================================
// Low-level endpoints
// ============================================================================

export async function getCustomers(search = '') {
  const params = search ? { search } : {}
  const res = await apiClient.get('/customers/', { params })
  return res.data
}

export async function getCustomer(customerId) {
  const res = await apiClient.get(`/customers/${customerId}`)
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

export async function updateProposalCountry(proposalId, proposalCountryId, payload) {
  const res = await apiClient.patch(`/proposals/${proposalId}/countries/${proposalCountryId}`, payload)
  return res.data
}

export async function deleteProposalCountry(proposalId, proposalCountryId) {
  await apiClient.delete(`/proposals/${proposalId}/countries/${proposalCountryId}`)
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

export async function updateProposalServiceLine(proposalId, serviceLineId, payload) {
  const res = await apiClient.patch(`/proposals/${proposalId}/service-lines/${serviceLineId}`, payload)
  return res.data
}

export async function deleteProposalServiceLine(proposalId, serviceLineId) {
  await apiClient.delete(`/proposals/${proposalId}/service-lines/${serviceLineId}`)
}

/** POST /api/proposals/{proposalId}/calculate — authoritative calculation with every saved discount (Page 5). */
export async function calculateProposal(proposalId, payload = {}) {
  const res = await apiClient.post(`/proposals/${proposalId}/calculate`, payload)
  return res.data
}

/**
 * POST /api/proposals/{proposalId}/calculate/base — base (undiscounted) pricing for the Proposal
 * Configurator. No discount is applied and nothing is saved (no snapshot).
 */
export async function calculateBasePricing(proposalId, payload = {}) {
  const res = await apiClient.post(`/proposals/${proposalId}/calculate/base`, payload)
  return res.data
}

/**
 * Contract term (months) to price a proposal with: the term saved on the proposal, else (older
 * proposals) the term of its latest calculation. null when neither exists.
 */
export function proposalTermMonths(detail, latestCalc) {
  const saved = Number(detail?.contract_term_months)
  if (Number.isInteger(saved) && saved > 0) return saved
  const fromSnapshot = Number(latestCalc?.contract_term_months ?? latestCalc?.snapshot_payload?.contract_term_months)
  return Number.isInteger(fromSnapshot) && fromSnapshot > 0 ? fromSnapshot : null
}

/** GET /api/proposals/{proposalId}/calculations/latest — latest saved snapshot (404 if none). */
export async function getLatestCalculation(proposalId) {
  const res = await apiClient.get(`/proposals/${proposalId}/calculations/latest`)
  return res.data
}

/** GET /api/proposals/{proposalId}/export?format=docx|pdf — download proposal document blob. */
export async function exportProposal(proposalId, format = 'docx') {
  const res = await apiClient.get(`/proposals/${proposalId}/export`, {
    params: { format },
    responseType: 'blob',
  })
  return res
}

/** GET /api/proposals/{proposalId}/export/commercials — preview extracted commercial figures. */
export async function getProposalExportCommercials(proposalId) {
  const res = await apiClient.get(`/proposals/${proposalId}/export/commercials`)
  return res.data
}

// ============================================================================
// Helpers
// ============================================================================

/** Validation problems found before anything is written; `messages` lists every problem. */
export class ProposalInputError extends Error {
  constructor(messages) {
    super(messages.join(' '))
    this.name = 'ProposalInputError'
    this.messages = messages
  }
}

/** Readable message for an API or validation error (never a raw object). */
export function describeApiError(error, fallback = 'Request failed') {
  if (error instanceof ProposalInputError) return error.message
  const detail = error?.response?.data?.detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d?.loc ? `${d.loc.slice(1).join('.')}: ${d.msg}` : d?.msg || String(d)))
      .join('; ')
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail)
  return detail || error?.message || fallback
}

function positiveId(value) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * The user recorded as proposal creator / deal owner. There is no login yet, so it comes
 * from configuration (VITE_DEALDESK_USER_ID) instead of a hardcoded database ID.
 */
export function getConfiguredUserId() {
  // The signed-in user; without a sign-in, the development id (VITE_DEALDESK_USER_ID).
  const id = positiveId(actingUserId())
  if (!id) {
    throw new ProposalInputError([
      'No acting user: sign in, or (development) set VITE_DEALDESK_USER_ID in frontend/.env.local to the id of an existing user and restart the dev server.',
    ])
  }
  return id
}

/**
 * Stable key for a subscription line: one pack version or one feature per country of a proposal
 * version. With a countryId the key is "<countryId>|pack:<id>"; without it, the legacy target key.
 */
export function lineTargetKey({ packVersionId = null, featureId = null, countryId = null }) {
  const target = packVersionId ? `pack:${packVersionId}` : `feature:${featureId}`
  return countryId ? `${countryId}|${target}` : target
}

/** The primary country block of a saved proposal (primary flag, otherwise the first one added). */
export function primaryCountryBlock(countries) {
  const blocks = countries || []
  return blocks.find((b) => b.is_primary_deployment) || [...blocks].sort((a, b) => a.id - b.id)[0] || null
}

/**
 * Country (countries.id) a saved line or service line is priced in: its own block, or the primary
 * block when the line has none (lines saved before multi-region support). Calculation results carry
 * `country_id` directly.
 */
export function lineCountryIdOf(line, countries) {
  if (line?.country_id) return Number(line.country_id)
  const block = line?.proposal_country_id ? (countries || []).find((b) => Number(b.id) === Number(line.proposal_country_id)) : null
  const owner = block || primaryCountryBlock(countries)
  return owner ? Number(owner.country_id) : null
}

/** Collect every subscription line the configuration asks for, keyed by target. */
export function buildDesiredLines(countryConfigs) {
  const lines = new Map()
  const duplicates = []
  ;(countryConfigs || []).forEach((country) => {
    ;(country.families || []).forEach((fam) => {
      const familyQty = Number(fam.headcount ?? country.headcount)
      if (fam.selectedPackId) {
        const key = lineTargetKey({ packVersionId: Number(fam.selectedPackId), countryId: Number(country.countryId) })
        if (lines.has(key)) duplicates.push(key)
        lines.set(key, {
          key,
          packVersionId: Number(fam.selectedPackId),
          featureId: null,
          countryId: Number(country.countryId),
          quantity: Number(country.headcount),
          uomId: fam.packUomId ? Number(fam.packUomId) : null,
        })
      }
      ;(fam.selectedFeatureIds || []).forEach((featId) => {
        const key = lineTargetKey({ featureId: Number(featId), countryId: Number(country.countryId) })
        if (lines.has(key)) duplicates.push(key)
        const qty = Number(fam.featureHeadcounts?.[featId] ?? familyQty)
        const featureUom = fam.featureUomIds?.[featId]
        lines.set(key, {
          key,
          packVersionId: null,
          featureId: Number(featId),
          countryId: Number(country.countryId),
          quantity: qty,
          uomId: featureUom ? Number(featureUom) : null,
        })
      })
    })
  })
  return { lines, duplicates }
}

/** Every problem that must be fixed before the proposal can be saved. */
export function collectProposalErrors(clientInfo, countryConfigs) {
  const errors = []
  if (!clientInfo?.clientName?.trim()) errors.push('Client name is required.')
  if (!positiveId(clientInfo?.reportingCurrencyId)) errors.push('Select a reporting currency.')
  if (!countryConfigs || countryConfigs.length === 0) errors.push('Add at least one country.')

  ;(countryConfigs || []).forEach((c, idx) => {
    const label = c.countryName || `Country ${idx + 1}`
    if (!positiveId(c.countryId)) errors.push(`${label}: select a country.`)
    if (!positiveId(c.pricingTierId)) errors.push(`${label}: select a customer tier.`)
    if (!positiveId(c.deploymentModelId)) errors.push(`${label}: select a deployment model.`)
    if (!positiveId(c.pricingModelId)) errors.push(`${label}: select a pricing model.`)
    const headcount = Number(c.headcount)
    if (!Number.isInteger(headcount) || headcount <= 0) errors.push(`${label}: headcount must be a positive whole number.`)
    const durationError = validateContractYears(c.contractYears)
    if (durationError) errors.push(`${label}: ${durationError}`)
    ;(c.families || []).forEach((f) => {
      if (f.selectedPackId && !positiveId(f.selectedPackId)) errors.push(`${label}: the selected pack is not a saved pack version.`)
      ;(f.selectedFeatureIds || []).forEach((fid) => {
        if (!positiveId(fid)) errors.push(`${label}: feature "${fid}" is not a saved feature.`)
      })
    })
    ;(c.serviceLines || []).forEach((s) => {
      if (!s.roleName?.trim()) errors.push(`${label}: every service line needs a role.`)
      if (!positiveId(s.serviceRateId)) errors.push(`${label}: service line "${s.roleName || '?'}" must use a saved service rate.`)
      const days = Number(s.hoursOrDays)
      if (!(days > 0)) errors.push(`${label}: service line "${s.roleName || '?'}" needs effort greater than 0 man-days.`)
    })
  })

  // The backend prices with ONE tier: the customer's. Different tiers per country cannot be honoured.
  const tiers = new Set((countryConfigs || []).map((c) => String(c.pricingTierId)).filter((t) => t && t !== 'null'))
  if (tiers.size > 1) {
    errors.push('All countries must use the same customer tier: the backend prices every line with the customer\'s single tier.')
  }

  const { duplicates } = buildDesiredLines(countryConfigs)
  if (duplicates.length > 0) {
    errors.push(
      `The same pack/feature is selected more than once in one country (${[...new Set(duplicates)].join(', ')}). ` +
        'Each pack or feature can appear once per country.',
    )
  }
  return errors
}

/**
 * Ask the backend which rate-card row (and therefore which unit of measure) prices a line,
 * using the line's own country block (country, deployment model, pricing model) and the tier.
 */
async function resolveLineUom(countryCfg, line) {
  try {
    const rate = await resolveRateCard({
      country_id: Number(countryCfg.countryId),
      deployment_model_id: Number(countryCfg.deploymentModelId),
      pricing_model_id: Number(countryCfg.pricingModelId),
      tier_id: Number(countryCfg.pricingTierId),
      ...(line.packVersionId ? { pack_version_id: line.packVersionId } : { feature_id: line.featureId }),
      ...(line.uomId ? { uom_id: line.uomId } : {}),
    })
    return { uomId: rate.uom_id, error: null }
  } catch (err) {
    const what = `${countryCfg.countryName || `country ${countryCfg.countryId}`}: ${line.packVersionId ? `pack version ${line.packVersionId}` : `feature ${line.featureId}`}`
    return { uomId: null, error: `${what}: ${describeApiError(err, 'rate card could not be resolved')}` }
  }
}

function sameNumber(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a === null || a === undefined) && (b === null || b === undefined)
  }
  return Number(a) === Number(b)
}

// ============================================================================
// High-level workflow: save (create or synchronise) a proposal
// ============================================================================

/**
 * Persist the configurator state. All checks (including rate-card resolution for every line)
 * run before the first write. On an existing proposal this is a synchronisation: country blocks,
 * line items and service lines are added, updated or removed so the database matches the screen.
 * Line discounts are left untouched (they are managed on Pricing & Discounts).
 */
export async function saveFullProposal({ clientInfo, countryConfigs, existingProposalId = null }) {
  const problems = collectProposalErrors(clientInfo, countryConfigs)
  if (problems.length > 0) throw new ProposalInputError(problems)
  const userId = getConfiguredUserId()

  const primary = countryConfigs[0]
  const tierId = Number(primary.pricingTierId)
  const currencyId = Number(clientInfo.reportingCurrencyId)

  // Resolve the unit of measure of every line from its own country's rate card before writing anything.
  const { lines: desiredLines } = buildDesiredLines(countryConfigs)
  const configByCountry = new Map(countryConfigs.map((c) => [Number(c.countryId), c]))
  const uomErrors = []
  for (const line of desiredLines.values()) {
    const { uomId, error } = await resolveLineUom(configByCountry.get(line.countryId), line)
    if (error) uomErrors.push(error)
    line.uomId = uomId
  }
  if (uomErrors.length > 0) {
    throw new ProposalInputError([
      'Some selected packs/features have no usable rate card for their country, deployment model, pricing model and tier:',
      ...uomErrors,
    ])
  }

  // 1. Customer (existing selection, exact name match, or new record).
  let customerId = positiveId(clientInfo.customerId)
  let customerTierId
  if (!customerId) {
    const name = clientInfo.clientName.trim()
    const match = (await getCustomers(name)).find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    if (match) {
      customerId = match.id
      customerTierId = match.customer_tier_id
    } else {
      const created = await createCustomer({
        code: `CUST-${Date.now().toString().slice(-8)}`,
        name,
        country_id: Number(primary.countryId),
        customer_tier_id: tierId,
        industry: clientInfo.industry?.trim() || null,
        status: 'active',
      })
      customerId = created.id
      customerTierId = created.customer_tier_id
    }
  } else {
    customerTierId = (await getCustomer(customerId)).customer_tier_id
  }
  // The engine prices with the customer's tier, so the selected tier must be stored there.
  if (!sameNumber(customerTierId, tierId)) {
    await updateCustomer(customerId, { customer_tier_id: tierId })
  }

  // 2. Deal (existing selection, same code for this customer, or new record).
  let dealId = positiveId(clientInfo.dealId)
  if (!dealId) {
    const dealCode = clientInfo.dealCode?.trim()
    const existing = dealCode ? await getDeals(dealCode, customerId) : []
    const match = existing.find((d) => d.code === dealCode)
    if (match) {
      dealId = match.id
    } else {
      const created = await createDeal({
        code: dealCode || `DEAL-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
        name: `${clientInfo.clientName.trim()} Opportunity`,
        customer_id: customerId,
        owner_user_id: userId,
        status: 'open',
      })
      dealId = created.id
    }
  }

  // Contract duration: entered in years, stored on the proposal in months.
  const termMonths = yearsToMonths(countryConfigs[0]?.contractYears)

  // 3. Proposal header.
  let proposalId = positiveId(existingProposalId) || positiveId(clientInfo.proposalId)
  if (proposalId) {
    await updateProposal(proposalId, {
      deal_id: dealId,
      customer_id: customerId,
      currency_id: currencyId,
      contract_term_months: termMonths,
      ...(clientInfo.proposalCode?.trim() ? { code: clientInfo.proposalCode.trim() } : {}),
    })
  } else {
    const typedCode = clientInfo.proposalCode?.trim()
    const generate = () => `PROP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`
    const payload = {
      code: typedCode || generate(),
      deal_id: dealId,
      customer_id: customerId,
      currency_id: currencyId,
      created_by_user_id: userId,
      status: 'draft',
      contract_term_months: termMonths,
    }
    let created
    try {
      created = await createProposal(payload)
    } catch (err) {
      // A code the user typed must stay theirs; only a generated code is regenerated once.
      if (err.response?.status === 409 && !typedCode) {
        created = await createProposal({ ...payload, code: `${generate()}-${Math.floor(Math.random() * 90 + 10)}` })
      } else {
        throw err
      }
    }
    proposalId = created.id
  }

  let detail = await getProposal(proposalId)

  // 4. Existing lines, keyed by country + target (a line without a block belongs to the primary block).
  const draftOf = (d) => (d.versions || []).filter((v) => v.status === 'draft').sort((a, b) => b.version_no - a.version_no)[0]
  const draft = draftOf(detail)
  const lineKey = (li) =>
    lineTargetKey({ packVersionId: li.pack_version_id, featureId: li.feature_id, countryId: lineCountryIdOf(li, detail.countries) })
  const existingLines = new Map((draft?.line_items || []).map((li) => [lineKey(li), li]))

  // Lines and service lines that are no longer wanted go first, so their country blocks can be removed.
  for (const [key, li] of existingLines) {
    if (!desiredLines.has(key)) {
      await deleteProposalLineItem(proposalId, li.id)
      existingLines.delete(key)
    }
  }
  const wantedServiceIds = new Set(
    countryConfigs.flatMap((c) => (c.serviceLines || []).map((srv) => Number(srv.backendId)).filter((id) => positiveId(id))),
  )
  for (const sl of draft?.service_lines || []) {
    if (!wantedServiceIds.has(Number(sl.id))) await deleteProposalServiceLine(proposalId, sl.id)
  }

  // 5. Country blocks: delete removed, then clear stale primary flags, then update/create.
  const blocksByCountry = new Map((detail.countries || []).map((b) => [Number(b.country_id), b]))
  const wantedCountryIds = new Set(countryConfigs.map((c) => Number(c.countryId)))
  for (const block of detail.countries || []) {
    if (!wantedCountryIds.has(Number(block.country_id))) {
      await deleteProposalCountry(proposalId, block.id)
      blocksByCountry.delete(Number(block.country_id))
    }
  }
  const primaryCountryId = Number(primary.countryId)
  for (const block of blocksByCountry.values()) {
    if (block.is_primary_deployment && Number(block.country_id) !== primaryCountryId) {
      await updateProposalCountry(proposalId, block.id, { is_primary_deployment: false })
    }
  }
  for (let i = 0; i < countryConfigs.length; i++) {
    const cfg = countryConfigs[i]
    const wanted = {
      deployment_model_id: Number(cfg.deploymentModelId),
      pricing_model_id: Number(cfg.pricingModelId),
      user_headcount: Number(cfg.headcount),
      is_primary_deployment: i === 0,
    }
    if (cfg.subscription_discount_pct !== undefined) wanted.subscription_discount_pct = cfg.subscription_discount_pct
    if (cfg.subscription_discount_reason !== undefined) wanted.subscription_discount_reason = cfg.subscription_discount_reason
    if (cfg.service_discount_pct !== undefined) wanted.service_discount_pct = cfg.service_discount_pct
    if (cfg.service_discount_reason !== undefined) wanted.service_discount_reason = cfg.service_discount_reason
    const block = blocksByCountry.get(Number(cfg.countryId))
    if (!block) {
      const created = await addProposalCountry(proposalId, { country_id: Number(cfg.countryId), ...wanted })
      blocksByCountry.set(Number(cfg.countryId), created)
    } else {
      const changed = Object.keys(wanted).filter((k) => !sameNumber(block[k], wanted[k]))
      if (changed.length > 0) {
        await updateProposalCountry(
          proposalId,
          block.id,
          Object.fromEntries(changed.map((k) => [k, wanted[k]])),
        )
      }
    }
  }
  const blockIdOf = (countryId) => {
    const block = blocksByCountry.get(Number(countryId))
    if (!block?.id) throw new Error(`Country ${countryId} has no saved country block`)
    return Number(block.id)
  }

  // 6. Subscription line items on the draft version, each tied to its country block.
  for (const [key, line] of desiredLines) {
    const current = existingLines.get(key)
    const blockId = blockIdOf(line.countryId)
    if (current) {
      const patch = {}
      if (!sameNumber(current.quantity, line.quantity)) patch.quantity = line.quantity
      if (!sameNumber(current.uom_id, line.uomId)) patch.uom_id = line.uomId
      if (!sameNumber(current.proposal_country_id, blockId)) patch.proposal_country_id = blockId
      if (Object.keys(patch).length > 0) await updateProposalLineItem(proposalId, current.id, patch)
    } else {
      await addProposalLineItem(proposalId, {
        proposal_country_id: blockId,
        pack_version_id: line.packVersionId,
        feature_id: line.featureId,
        uom_id: line.uomId,
        quantity: line.quantity,
      })
    }
  }

  // 7. Service lines (effort in man-days; the backend resolves the day rate of the line's country).
  const existingServices = new Map((draft?.service_lines || []).map((sl) => [Number(sl.id), sl]))
  for (const country of countryConfigs) {
    const blockId = blockIdOf(country.countryId)
    for (const srv of country.serviceLines || []) {
      const wanted = {
        role_name: srv.roleName.trim(),
        service_rate_id: Number(srv.serviceRateId),
        days_or_hours: Number(srv.hoursOrDays),
        proposal_country_id: blockId,
      }
      const current = positiveId(srv.backendId) ? existingServices.get(Number(srv.backendId)) : null
      if (current) {
        const patch = {}
        if (current.role_name !== wanted.role_name) patch.role_name = wanted.role_name
        if (!sameNumber(current.service_rate_id, wanted.service_rate_id)) patch.service_rate_id = wanted.service_rate_id
        if (!sameNumber(current.days_or_hours, wanted.days_or_hours)) patch.days_or_hours = wanted.days_or_hours
        if (!sameNumber(current.proposal_country_id, blockId)) patch.proposal_country_id = blockId
        if (Object.keys(patch).length > 0) await updateProposalServiceLine(proposalId, current.id, patch)
      } else {
        await addProposalServiceLine(proposalId, wanted)
      }
    }
  }

  // 8. Reload the persisted state.
  detail = await getProposal(proposalId)
  return {
    status: 'persisted',
    isPersisted: true,
    proposalId,
    customerId,
    dealId,
    data: detail,
    message: 'Proposal saved.',
  }
}

/**
 * Proposal Configurator (Page 4): save (synchronise) the proposal first, then price it at BASE
 * level: no line, country or overall discount is applied and no snapshot is written. Discounts are
 * configured and applied on Pricing & Discounts only.
 */
export async function requestBasePricing({ proposalId, clientInfo, countryConfigs }) {
  try {
    const saved = await saveFullProposal({ clientInfo, countryConfigs, existingProposalId: proposalId })
    const data = await calculateBasePricing(saved.proposalId, {})
    return {
      status: 'success',
      proposalId: saved.proposalId,
      customerId: saved.customerId,
      dealId: saved.dealId,
      savedProposal: saved.data,
      data,
      isBackendCalculation: true,
    }
  } catch (error) {
    return {
      status: 'error',
      statusCode: error.response?.status,
      message: describeApiError(error, 'Pricing calculation failed'),
      data: null,
      isBackendCalculation: false,
    }
  }
}

/** Per-product discounts recorded in a calculation result (to repeat them on recalculation). */
export function discountsFromSnapshot(calcData) {
  const product_subscription_discounts = {}
  const product_service_discounts = {}
  ;(calcData?.snapshot_payload?.products || []).forEach((p) => {
    // Product-level discounts are keyed by product_key ("<code>@<country>" when a product is sold in
    // more than one country); snapshots written before multi-region support only have product_code.
    const key = p.product_key || p.product_code
    if (!key) return
    // Discounts stored on the country block (source "country") are applied by the backend from the
    // saved proposal; repeating them in the request would be rejected as a second discount.
    if (Number(p.subscription_discount_pct) > 0 && p.subscription_discount_source !== 'country') {
      product_subscription_discounts[key] = Number(p.subscription_discount_pct)
    }
    if (Number(p.service_discount_pct) > 0 && p.service_discount_source !== 'country') {
      product_service_discounts[key] = Number(p.service_discount_pct)
    }
  })
  return { product_subscription_discounts, product_service_discounts }
}

/**
 * Proposal Narrative Content (Step 4)
 */
export async function getProposalContent(proposalId) {
  const response = await apiClient.get(`/proposals/${proposalId}/content`)
  return response.data
}

export async function updateProposalContent(proposalId, sections) {
  const response = await apiClient.put(`/proposals/${proposalId}/content`, { sections })
  return response.data
}

/**
 * Proposal Fitment Attachments (Step 4)
 */
export async function uploadProposalAttachment(proposalId, file) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await apiClient.post(`/proposals/${proposalId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export async function getProposalAttachments(proposalId) {
  const response = await apiClient.get(`/proposals/${proposalId}/attachments`)
  return response.data
}

export async function deleteProposalAttachment(proposalId, documentId) {
  const response = await apiClient.delete(`/proposals/${proposalId}/attachments/${documentId}`)
  return response.data
}

export function getAttachmentDownloadUrl(proposalId, documentId) {
  return `/api/proposals/${proposalId}/attachments/${documentId}`
}

/**
 * Proposal Governance Readiness & Approval Route (Step 6)
 */
export async function getProposalReadiness(proposalId) {
  const response = await apiClient.get(`/proposals/${proposalId}/readiness`)
  return response.data
}

export async function getProposalApprovalRoute(proposalId) {
  const response = await apiClient.get(`/proposals/${proposalId}/approval-route`)
  return response.data
}

export async function submitProposalForApproval(proposalId, { actingUserId = 1, notes = '' } = {}) {
  const response = await apiClient.post(`/proposals/${proposalId}/submit`, {
    acting_user_id: actingUserId,
    notes,
  })
  return response.data
}

export async function getProposalActivity(proposalId) {
  const response = await apiClient.get(`/proposals/${proposalId}/activity`)
  return response.data
}

export async function decideProposalApproval(proposalId, approvalId, { decision = 'approved', notes = '', actingUserId = 1 } = {}) {
  const response = await apiClient.post(`/proposals/${proposalId}/approvals/${approvalId}/decision`, {
    decision,
    notes,
    acting_user_id: actingUserId,
  })
  return response.data
}

export async function recallProposalSubmission(proposalId, { reason = '', actingUserId = 1 } = {}) {
  const response = await apiClient.post(`/proposals/${proposalId}/recall`, {
    reason,
    acting_user_id: actingUserId,
  })
  return response.data
}


