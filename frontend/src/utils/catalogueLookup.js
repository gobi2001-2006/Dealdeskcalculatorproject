import { getCatalogueFamilies, getCatalogueFeatures, getCatalogueProducts } from '../api/catalogueApi'
import { getPacks } from '../api/packsApi'
import { getCountries, getCustomerTiers, getDeploymentModels, getPricingModels } from '../api/ratesApi'
import { describeApiError } from '../api/proposalsApi'

/**
 * Load the saved catalogue lists needed to label proposal lines.
 * Failures are returned as messages; nothing is replaced with demo data.
 */
export async function loadCatalogueMasters() {
  const sources = [
    ['families', getCatalogueFamilies, 'product families'],
    ['products', getCatalogueProducts, 'products'],
    ['features', getCatalogueFeatures, 'features'],
    ['packs', getPacks, 'packs'],
    ['countries', getCountries, 'countries'],
    ['tiers', getCustomerTiers, 'customer tiers'],
    ['deployments', getDeploymentModels, 'deployment models'],
    ['pricingModels', getPricingModels, 'pricing models'],
  ]
  const results = await Promise.allSettled(sources.map(([, fn]) => fn()))
  const masters = { loadErrors: [] }
  results.forEach((res, i) => {
    const [key, , label] = sources[i]
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      masters[key] = res.value
    } else {
      masters[key] = []
      masters.loadErrors.push(`${label}: ${describeApiError(res.reason, 'could not be loaded')}`)
    }
  })
  return masters
}

/** Name lookups over saved catalogue records (unknown ids are labelled, never invented). */
export function buildCatalogueLookup({
  families = [], packs = [], features = [], products = [], tiers = [], deployments = [], pricingModels = [],
} = {}) {
  const nameOf = (list, id, label) =>
    id === null || id === undefined || id === '' ? `${label} not set` : list.find((r) => String(r.id) === String(id))?.name || `${label} #${id}`
  const familyById = new Map(families.map((f) => [String(f.id), f]))
  const featureById = new Map(features.map((f) => [String(f.id), f]))
  const productById = new Map(products.map((p) => [String(p.id), p]))
  const packByVersionId = new Map()
  packs.forEach((p) =>
    (p.pack_versions || []).forEach((v) => packByVersionId.set(String(v.id), { pack: p, version: v })),
  )

  return {
    tierName: (id) => nameOf(tiers, id, 'Tier'),
    deploymentName: (id) => nameOf(deployments, id, 'Deployment'),
    pricingModelName: (id) => nameOf(pricingModels, id, 'Pricing model'),
    family(id) {
      const f = familyById.get(String(id))
      return f
        ? { name: f.name, code: f.code }
        : { name: id ? `Product family #${id}` : 'Unassigned product family', code: '—' }
    },
    packVersion(id) {
      const hit = packByVersionId.get(String(id))
      if (!hit) return { name: `Pack version #${id}`, code: '—', versionNo: null, featureIds: [] }
      return {
        name: hit.pack.name,
        code: hit.pack.code,
        versionNo: hit.version.version_no,
        featureIds: (hit.version.pack_items || []).map((pi) => pi.feature_id),
      }
    },
    feature(id) {
      const f = featureById.get(String(id))
      if (!f) return { name: `Feature #${id}`, code: '—', productName: '' }
      return { name: f.name, code: f.code, productName: productById.get(String(f.product_id))?.name || '' }
    },
  }
}
