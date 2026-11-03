// Shared helpers for the browser E2E specs. All API calls go through the Vite proxy (/api) of the
// local dev server, so they hit the same local backend and database as the pages under test.

export async function api(request, method, path, body) {
  const res = await request.fetch(`/api${path}`, { method, data: body })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  if (!res.ok()) throw new Error(`${method} ${path} -> ${res.status()}: ${text.slice(0, 300)}`)
  return json
}

export const byCode = (rows, code) => rows.find((r) => String(r.code).toLowerCase() === code.toLowerCase())

/** Masters the specs need, looked up by business code (never by hard-coded id). */
export async function loadMasters(request) {
  const [countries, deployments, pricingModels, uoms, tiers, packs, version] = await Promise.all([
    api(request, 'GET', '/masters/countries'),
    api(request, 'GET', '/masters/deployment-models'),
    api(request, 'GET', '/masters/pricing-models'),
    api(request, 'GET', '/masters/units-of-measure'),
    api(request, 'GET', '/masters/customer-tiers'),
    api(request, 'GET', '/packs/'),
    api(request, 'GET', '/rates/versions/active'),
  ])
  return {
    countries,
    deployments,
    pricingModels,
    uoms,
    tiers: [...tiers].sort((a, b) => a.employee_min - b.employee_min),
    packs,
    version,
  }
}

/** Create customer + deal + proposal + primary country block + one pack line; returns the proposal id. */
export async function createProposal(request, { suffix, country, tier, deployment, pricingModel, packVersionId, uomId, quantity, currencyId }) {
  const code = `PW-${suffix}-${Date.now().toString(36).toUpperCase()}`
  const cust = await api(request, 'POST', '/customers/', { code, name: `Playwright ${suffix}`, country_id: country.id, customer_tier_id: tier.id })
  const deal = await api(request, 'POST', '/deals/', { code, name: `Playwright ${suffix}`, customer_id: cust.id, owner_user_id: Number(process.env.E2E_USER_ID || 1) })
  const prop = await api(request, 'POST', '/proposals/', {
    code, deal_id: deal.id, customer_id: cust.id, currency_id: currencyId, created_by_user_id: Number(process.env.E2E_USER_ID || 1),
  })
  await api(request, 'POST', `/proposals/${prop.id}/countries`, {
    country_id: country.id, deployment_model_id: deployment.id, pricing_model_id: pricingModel.id,
    is_primary_deployment: true, user_headcount: quantity,
  })
  await api(request, 'POST', `/proposals/${prop.id}/line-items`, { pack_version_id: packVersionId, uom_id: uomId, quantity: String(quantity) })
  return prop.id
}

export const inr = (n) => `₹${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
