import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, AlertCircle, Database, RefreshCw, ShieldAlert } from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { RateCardProductsSidebar } from './RateCardProductsSidebar'
import { RateCardCenterEditor } from './RateCardCenterEditor'
import { RateCardMasterPanels } from './RateCardMasterPanels'

// Modals
import { AddProductModal } from './modals/AddProductModal'
import { AddCountryModal } from './modals/AddCountryModal'
import { AddHourlyRateModal } from './modals/AddHourlyRateModal'
import { AddFxRateModal } from './modals/AddFxRateModal'
import { AddPackRateModal } from './modals/AddPackRateModal'
import { AddFeatureRateModal } from './modals/AddFeatureRateModal'
import { DeleteRateCardConfirmDialog } from './modals/DeleteRateCardConfirmDialog'

// Backend API Clients
import {
  getCountries,
  createCountry,
  updateCountry,
  deleteCountry,
  getCurrencies,
  getCustomerTiers,
  createCustomerTier,
  updateCustomerTier,
  deleteCustomerTier,
  getDeploymentModels,
  createDeploymentModel,
  deleteDeploymentModel,
  getDeploymentPricingOptions,
  getPricingModels,
  createPricingModel,
  deletePricingModel,
  getFxRates,
  createFxRate,
  deleteFxRate,
  getServiceRates,
  createServiceRate,
  updateServiceRate,
  deleteServiceRate,
  getActiveRateCardVersion,
  getRateCardVersions,
  getRateCards,
  upsertRateCard,
  deleteRateCardGroup,
  getUnitsOfMeasure,
  getAllowedUomsForPricingModel,
  saveRateCardTarget,
} from '../../api/ratesApi'

import {
  getCatalogueFamilies,
  getCatalogueProducts,
  getCatalogueFeatures,
} from '../../api/catalogueApi'

import { getPacks } from '../../api/packsApi'

import { getCurrencySymbol, rateLayoutFor, deriveSharedValue } from './rateCardFormatters'

// Writes must reference saved records: an unresolved id stops the save instead of
// silently falling back to an arbitrary record such as id 1.
function requireId(value, label) {
  const n = Number(value)
  if (Number.isInteger(n) && n > 0) return n
  throw new Error(`${label} is not a saved record. Reload the page and select it again.`)
}

// A price typed by the user: blank -> undefined (not sent), otherwise a non-negative number.
function parseAmount(value, label = 'Rate') {
  if (value === undefined || value === null || String(value).trim() === '') return undefined
  const n = Number(value)
  if (Number.isNaN(n) || n < 0) throw new Error(`${label} must be a non-negative number.`)
  return n
}

// The pack version a rate card prices: the active version, otherwise the newest one.
function pricedPackVersion(bp) {
  const versions = [...(bp?.pack_versions || bp?.versions || [])].sort((a, b) => b.version_no - a.version_no)
  return versions.find((v) => v.status === 'active') || versions[0] || null
}

// The customer tier an edited rate cell belongs to. Cells are keyed by the tier's database id
// (tier_<id> / fixed_tier_<id>); legacy positional keys map to the tier list order.
function tierFromField(field, tiers) {
  const f = String(field).replace(/^fixed_/, '')
  const byId = f.match(/^tier_(\d+)$/)
  if (byId) return tiers.find((t) => String(t.id) === byId[1]) || null
  const legacy = f.match(/^tier([123])Rate$/)
  if (legacy) return tiers[Number(legacy[1]) - 1] || null
  return null
}

// Saved amounts arrive as NUMERIC strings ("380000.0000"); show them without trailing zeros.
function displayAmount(value) {
  if (value === undefined || value === null || String(value).trim() === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : String(value)
}

// Platform + Subscription rows: one UOM and one subscription rate shared by every tier row.
// Collapse the tier rows' values into that shared value (and flag tiers that disagree).
function finalizeSharedRateFields(row) {
  const unit = deriveSharedValue(row._unitRates || [])
  const uom = deriveSharedValue(row._uomIds || [])
  // Tiers with different saved rates are edited (and saved) per tier, as in the workbook.
  const out = { ...row, subscriptionRate: unit.value, subscriptionRateMixed: unit.mixed, perTierRates: unit.mixed, uomMixed: uom.mixed }
  delete out._unitRates
  delete out._uomIds
  return out
}

// Apply one edit from the Platform + Subscription grid to a row (keeps the legacy alias keys in step).
function applyPlatformChange(row, change, tiers, uomList) {
  const next = { ...row }
  if (change.tierId !== undefined && change.fixedFee !== undefined) {
    const idx = tiers.findIndex((t) => String(t.id) === String(change.tierId))
    next[`fixed_tier_${change.tierId}`] = change.fixedFee
    next[`fixed_${change.tierId}Rate`] = change.fixedFee
    if (idx >= 0 && idx < 3) next[`fixed_tier${idx + 1}Rate`] = change.fixedFee
  }
  if (change.uomId !== undefined) {
    next.uomId = change.uomId
    next.unitOfMeasure = uomList.find((u) => String(u.id) === String(change.uomId))?.name || ''
    next.uomMixed = false
  }
  const setTierRate = (tierId, value) => {
    const idx = tiers.findIndex((t) => String(t.id) === String(tierId))
    next[`tier_${tierId}`] = value
    next[`${tierId}Rate`] = value
    if (idx >= 0 && idx < 3) next[`tier${idx + 1}Rate`] = value
  }
  if (change.subscriptionRate !== undefined) {
    next.subscriptionRate = change.subscriptionRate
    next.subscriptionRateMixed = false
    tiers.forEach((t) => setTierRate(t.id, change.subscriptionRate))
  }
  if (change.unitRate !== undefined && change.tierId !== undefined) {
    setTierRate(change.tierId, change.unitRate)
  }
  if (change.amcPercentage !== undefined && change.tierId !== undefined) {
    next[`amc_tier_${change.tierId}`] = change.amcPercentage
  }
  if (change.perTierRates !== undefined) {
    next.perTierRates = change.perTierRates
    if (change.perTierRates) {
      // Start every tier from the shared rate.
      tiers.forEach((t) => {
        if (next[`tier_${t.id}`] === undefined || next[`tier_${t.id}`] === '') setTierRate(t.id, next.subscriptionRate ?? '')
      })
    } else {
      // Back to one rate: take the first tier's rate for every tier.
      const first = tiers.map((t) => next[`tier_${t.id}`]).find((v) => v !== undefined && v !== '') ?? next.subscriptionRate ?? ''
      next.subscriptionRate = first
      next.subscriptionRateMixed = false
      tiers.forEach((t) => setTierRate(t.id, first))
    }
  }
  return next
}

// Helper to extract human-readable error from backend responses (including Pydantic 422 lists)
function formatApiError(err, fallback = 'Network connection failed') {
  if (!err) return fallback
  const detail = err.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d.msg ? `${d.loc ? d.loc.slice(-1)[0] + ': ' : ''}${d.msg}` : JSON.stringify(d)))
      .join('; ')
  }
  if (err.response?.data?.message) return err.response.data.message
  return err.message || fallback
}

export function RateCardPage() {
  // 1. Shared Catalogue & Pack Data
  const [families, setFamilies] = useState([])
  const [products, setProducts] = useState([])
  const [features, setFeatures] = useState([])
  const [packs, setPacks] = useState([])

  // 2. Master Data Catalogs
  const [countries, setCountries] = useState([])
  const [pricingTiers, setPricingTiers] = useState([])
  const [deploymentModels, setDeploymentModels] = useState([])
  const [pricingModels, setPricingModels] = useState([])
  const [hourlyRates, setHourlyRates] = useState([])
  const [exchangeRates, setExchangeRates] = useState([])
  const [currenciesList, setCurrenciesList] = useState([])
  const [deploymentPricingOptions, setDeploymentPricingOptions] = useState([])

  // 3. Rate Card Lifecycle & Versions
  const [versionsList, setVersionsList] = useState([])
  const [activeVersion, setActiveVersion] = useState(null)
  const isVersionLocked = activeVersion?.status === 'retired'

  // 4. Selection Contexts
  const [selectedFamilyId, setSelectedFamilyId] = useState('all')
  const [modalFamilyId, setModalFamilyId] = useState(null)
  const [selectedDeployment, setSelectedDeployment] = useState('')
  const [selectedPricingModel, setSelectedPricingModel] = useState('')
  const [selectedCountryId, setSelectedCountryId] = useState('')
  const [mobileView, setMobileView] = useState('center') // 'products' | 'center' | 'masters'

  const activeCountry =
    countries.find(
      (c) =>
        String(c.id) === String(selectedCountryId) ||
        (c.code && String(c.code).toLowerCase() === String(selectedCountryId).toLowerCase()),
    ) || countries[0]
  const activeCurrencySymbol = getCurrencySymbol(activeCountry, '$')

  // 5. Rate Cards State (Independent state for PEPM & Platform Subscription)
  const [packRates, setPackRates] = useState([])
  const [featureRates, setFeatureRates] = useState([])
  const [uoms, setUoms] = useState([])
  // Allowed UOMs of the selected pricing model, keyed by pricing model id (from the backend).
  const [allowedUomsState, setAllowedUomsState] = useState({ pricingModelId: null, list: [] })
  const [rawRateCards, setRawRateCards] = useState([])

  // 6. Backend Integration State
  const [isLoading, setIsLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [isLiveBackendData, setIsLiveBackendData] = useState(false)

  // 7. Modals State
  const [isAddProductOpen, setIsAddProductOpen] = useState(false)
  const [isAddCountryOpen, setIsAddCountryOpen] = useState(false)
  const [isAddHourlyOpen, setIsAddHourlyOpen] = useState(false)
  const [isAddFxOpen, setIsAddFxOpen] = useState(false)
  const [isAddPackRateOpen, setIsAddPackRateOpen] = useState(false)
  const [isAddFeatureRateOpen, setIsAddFeatureRateOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    title: 'Delete Record',
    recordName: '',
    recordType: 'record',
    isDeleting: false,
    onConfirm: null,
  })

  // 8. Toast notifications
  const [toast, setToast] = useState({ message: '', type: 'info' })
  const debounceTimers = useRef({})

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast({ message: '', type: 'info' })
    }, 3500)
  }, [])

  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  // Helper to map and store backend rate card records into PEPM packRates and featureRates
  const processRateCards = useCallback(
    (
      cards,
      tiersList = pricingTiers,
      deploymentsList = deploymentModels,
      pricingModelsList = pricingModels,
      packsList = packs,
      featuresList = null,
      productsList = products,
    ) => {
      if (!Array.isArray(cards)) return
      const livePackRatesMap = new Map()
      const liveFeatureRatesMap = new Map()

      cards.forEach((rc) => {
        const depObj =
          deploymentsList.find((d) => d.id === rc.deployment_model_id) || {
            name: rc.deployment_model?.name || `Deployment #${rc.deployment_model_id}`,
            id: rc.deployment_model_id,
          }
        const pmObj =
          pricingModelsList.find((p) => p.id === rc.pricing_model_id) || {
            code: rc.pricing_model?.code || `pricing-model-${rc.pricing_model_id}`,
            name: rc.pricing_model?.name || `Pricing model #${rc.pricing_model_id}`,
            id: rc.pricing_model_id,
          }

        if (rc.pack_version_id) {
          const packObj = (packsList || []).find((p) =>
            p.id === rc.pack_version?.pack_id ||
            p.packId === rc.pack_version?.pack_id ||
            (p.versions || p.pack_versions || []).some((v) => v.id === rc.pack_version_id),
          )
          const familyId =
            packObj?.familyId ||
            packObj?.product_family_id ||
            rc.pack_version?.pack?.product_family_id ||
            packObj?.familyIds?.[0] ||
            'all'
          const familyIds =
            packObj?.familyIds ||
            (familyId !== 'all' ? [familyId] : [])
          const groupKey = `${rc.pack_version_id}-${rc.country_id}-${rc.deployment_model_id}-${rc.pricing_model_id}-${rc.uom_id}`
          if (!livePackRatesMap.has(groupKey)) {
            livePackRatesMap.set(groupKey, {
              id: `pr-db-${rc.id}`,
              packId: packObj?.id || rc.pack_version?.pack_id || rc.pack_version_id,
              packVersionId: rc.pack_version_id,
              packCode: packObj?.code || rc.pack_version?.pack?.code || `PACK-V${rc.pack_version_id}`,
              packName: packObj?.name || rc.pack_version?.pack?.name || `Pack Version ${rc.pack_version_id}`,
              familyId: familyId,
              familyIds: familyIds,
              items: packObj?.items || [],
              deploymentModel: depObj.name,
              deploymentModelId: rc.deployment_model_id,
              pricingModel: pmObj.code,
              pricingModelId: rc.pricing_model_id,
              countryId: rc.country_id,
              unitOfMeasure: rc.uom?.name || `UoM #${rc.uom_id}`,
              uomId: rc.uom_id,
              savedUomId: rc.uom_id,
              currencyCode: rc.currency?.code || '',
              tier1Rate: '',
              tier2Rate: '',
              tier3Rate: '',
            })
          }
          const row = livePackRatesMap.get(groupKey)
          row._unitRates = [...(row._unitRates || []), rc.unit_rate]
          row._uomIds = [...(row._uomIds || []), rc.uom_id]
          const tierIdx = tiersList.findIndex((t) => t.id === rc.tier_id)
          const rateVal = displayAmount(rc.unit_rate)
          const fixedVal = displayAmount(rc.fixed_fee)
          if (tierIdx === 0) {
            row.tier1Rate = rateVal
            row.fixed_tier1Rate = fixedVal
          } else if (tierIdx === 1) {
            row.tier2Rate = rateVal
            row.fixed_tier2Rate = fixedVal
          } else if (tierIdx === 2) {
            row.tier3Rate = rateVal
            row.fixed_tier3Rate = fixedVal
          }
          row[`tier_${rc.tier_id}`] = rateVal
          row[`${rc.tier_id}Rate`] = rateVal
          row[rc.tier_id] = rateVal
          row[`fixed_tier_${rc.tier_id}`] = fixedVal
          row[`fixed_${rc.tier_id}Rate`] = fixedVal
          row[`amc_tier_${rc.tier_id}`] = displayAmount(rc.amc_percentage)
        } else if (rc.feature_id) {
          const featObj = (featuresList || []).find(
            (f) => String(f.id) === String(rc.feature_id),
          )
          const prodObj = (productsList || []).find(
            (p) =>
              String(p.id) === String(featObj?.product_id) ||
              String(p.id) === String(rc.feature?.product_id),
          )
          const familyId =
            prodObj?.product_family_id ||
            prodObj?.familyId ||
            featObj?.familyId ||
            featObj?.product_family_id ||
            'all'
          const groupKey = `${rc.feature_id}-${rc.country_id}-${rc.deployment_model_id}-${rc.pricing_model_id}-${rc.uom_id}`
          if (!liveFeatureRatesMap.has(groupKey)) {
            liveFeatureRatesMap.set(groupKey, {
              id: `fr-feat-${rc.feature_id}-${rc.deployment_model_id}-${rc.pricing_model_id}-${rc.uom_id}`,
              featureId: rc.feature_id,
              productId: featObj?.product_id || rc.feature?.product_id,
              productCode: featObj?.code || rc.feature?.code || `FEAT-${rc.feature_id}`,
              featureName: featObj?.name || rc.feature?.name || `Feature ${rc.feature_id}`,
              familyId: familyId,
              deploymentModel: depObj.name,
              deploymentModelId: rc.deployment_model_id,
              pricingModel: pmObj.code,
              pricingModelId: rc.pricing_model_id,
              countryId: rc.country_id,
              productType:
                (featObj?.classification || rc.feature?.classification) === 'ai_enabled'
                  ? 'AI Agent Module'
                  : 'Adrenalin Native',
              unitOfMeasure: rc.uom?.name || `UoM #${rc.uom_id}`,
              uomId: rc.uom_id,
              savedUomId: rc.uom_id,
              currencyCode: rc.currency?.code || '',
              tier1Rate: '',
              tier2Rate: '',
              tier3Rate: '',
            })
          }
          const row = liveFeatureRatesMap.get(groupKey)
          row._unitRates = [...(row._unitRates || []), rc.unit_rate]
          row._uomIds = [...(row._uomIds || []), rc.uom_id]
          const tierIdx = tiersList.findIndex(
            (t) => String(t.id) === String(rc.tier_id),
          )
          const rateVal = displayAmount(rc.unit_rate)
          const fixedVal = displayAmount(rc.fixed_fee)
          if (tierIdx === 0) {
            row.tier1Rate = rateVal
            row.fixed_tier1Rate = fixedVal
          } else if (tierIdx === 1) {
            row.tier2Rate = rateVal
            row.fixed_tier2Rate = fixedVal
          } else if (tierIdx === 2) {
            row.tier3Rate = rateVal
            row.fixed_tier3Rate = fixedVal
          }
          row[`tier_${rc.tier_id}`] = rateVal
          row[`${rc.tier_id}Rate`] = rateVal
          row[rc.tier_id] = rateVal
          row[`fixed_tier_${rc.tier_id}`] = fixedVal
          row[`fixed_${rc.tier_id}Rate`] = fixedVal
          row[`amc_tier_${rc.tier_id}`] = displayAmount(rc.amc_percentage)
        }
      })

      if (livePackRatesMap.size > 0) {
        setPackRates(Array.from(livePackRatesMap.values()).map(finalizeSharedRateFields))
      } else {
        setPackRates([])
      }
      if (liveFeatureRatesMap.size > 0) {
        setFeatureRates(Array.from(liveFeatureRatesMap.values()).map(finalizeSharedRateFields))
      } else {
        setFeatureRates([])
      }

    },
    [deploymentModels, pricingModels, pricingTiers, packs, products],
  )

  // Version-specific rate card switcher
  const handleSelectVersion = async (versionId) => {
    const selected = versionsList.find((v) => v.id === versionId)
    if (!selected) return
    setActiveVersion(selected)
    try {
      const cards = await getRateCards({ rate_card_version_id: versionId })
      setRawRateCards(Array.isArray(cards) ? cards : [])
      processRateCards(cards, pricingTiers, deploymentModels, pricingModels, packs, null, products)
      showToast(`Loaded rate card version "${selected.version_no}".`)
    } catch (err) {
      showToast(`Failed to load version rates: ${formatApiError(err)}`, 'error')
    }
  }

  // --------------------------------------------------------------------------
  // Data Fetching: Load Live Data from FastAPI & PostgreSQL
  // --------------------------------------------------------------------------
  useEffect(() => {
    let isMounted = true

    async function fetchData() {
      setIsLoading(true)
      setApiError(null)
      Promise.resolve(getUnitsOfMeasure?.())
        .then((list) => isMounted && setUoms(Array.isArray(list) ? list : []))
        .catch(() => isMounted && setUoms([]))

      try {
        let fetchErr = null
        const [
          backendCountries,
          backendTiers,
          backendDeployments,
          backendPricingModels,
          backendDeploymentPricingOptions,
          backendCurrencies,
          backendFxRates,
          backendServiceRates,
          backendVersions,
          backendActiveVersion,
          backendFamilies,
          backendProducts,
          backendFeatures,
          backendPacks,
        ] = await Promise.all([
          Promise.resolve(getCountries()).catch((e) => {
            fetchErr = e
            console.warn('Countries API fetch failed:', e.message)
            return null
          }),
          Promise.resolve(getCustomerTiers()).catch((e) => {
            console.warn('Tiers API fetch failed:', e.message)
            return null
          }),
          Promise.resolve(getDeploymentModels()).catch((e) => {
            console.warn('Deployments API fetch failed:', e.message)
            return null
          }),
          Promise.resolve(getPricingModels()).catch((e) => {
            console.warn('Pricing Models API fetch failed:', e.message)
            return null
          }),
          Promise.resolve(getDeploymentPricingOptions?.()).catch((e) => {
            console.warn('Deployment Pricing Options API fetch failed:', e.message)
            return []
          }),
          Promise.resolve(getCurrencies()).catch((e) => {
            console.warn('Currencies API fetch failed:', e.message)
            return null
          }),
          Promise.resolve(getFxRates()).catch((e) => {
            console.warn('FX Rates API fetch failed:', e.message)
            return null
          }),
          Promise.resolve(getServiceRates()).catch((e) => {
            console.warn('Service Rates API fetch failed:', e.message)
            return null
          }),
          Promise.resolve(getRateCardVersions?.()).catch(() => []),
          Promise.resolve(getActiveRateCardVersion?.()).catch(() => null),
          Promise.resolve(getCatalogueFamilies?.()).catch(() => null),
          Promise.resolve(getCatalogueProducts?.()).catch(() => null),
          Promise.resolve(getCatalogueFeatures?.()).catch(() => null),
          Promise.resolve(getPacks?.()).catch(() => null),
        ])

      // If countries was loaded, we consider backend connected
      if (Array.isArray(backendCountries) && backendCountries.length > 0) {
        // 1. Countries
        const mappedCountries = backendCountries.map((c) => {
          const currCode = c.currency?.code || c.currency_code || ''
          const sym =
            c.currency?.symbol && c.currency.symbol !== '$'
              ? c.currency.symbol
              : getCurrencySymbol(currCode)
          return {
            id: c.id,
            code: c.iso_code,
            name: c.name,
            currency: currCode,
            symbol: sym,
            defaultCurrencyId: c.default_currency_id,
            is_active: c.is_active,
          }
        })
        setCountries(mappedCountries)
        if (mappedCountries.length > 0) {
          setSelectedCountryId(mappedCountries[0].id)
        }

        // 2. Currencies
        if (Array.isArray(backendCurrencies)) {
          setCurrenciesList(backendCurrencies)
        }

        // 3. Tiers
        let mappedTiers = []
        if (Array.isArray(backendTiers) && backendTiers.length > 0) {
          mappedTiers = backendTiers.map((t, idx) => ({
            id: t.id,
            code: `Tier ${idx + 1}`,
            name: t.name,
            description: t.employee_min
              ? `${t.employee_min.toLocaleString()} - ${t.employee_max ? t.employee_max.toLocaleString() : '+'} employees`
              : 'Enterprise tier scale.',
            status: t.status,
          }))
          setPricingTiers(mappedTiers)
        }

        // 4. Deployments
        let mappedDeployments = []
        if (Array.isArray(backendDeployments) && backendDeployments.length > 0) {
          mappedDeployments = backendDeployments.map((d) => ({
            id: d.id,
            code: d.code,
            name: d.name,
            description: d.description || '',
          }))
          setDeploymentModels(mappedDeployments)
          setSelectedDeployment(mappedDeployments[0].name)
        }

        // 5. Deployment Pricing Options & Pricing Models
        if (Array.isArray(backendDeploymentPricingOptions)) {
          setDeploymentPricingOptions(backendDeploymentPricingOptions)
        }

        let mappedPricingModels = []
        if (Array.isArray(backendPricingModels) && backendPricingModels.length > 0) {
          mappedPricingModels = backendPricingModels.map((pm) => ({
            id: pm.id,
            code: pm.code,
            name: pm.name,
            description: pm.description || '',
            uomLockedId: pm.uom_locked_id || null,
            unitOfMeasure: pm.uom_locked?.name || '',
            hasFixedComponent: Boolean(pm.has_fixed_component),
            hasUnitComponent: Boolean(pm.has_unit_component),
            fixedFeeBasis: pm.fixed_fee_basis || null,
            unitRateBasis: pm.unit_rate_basis || null,
          }))
          setPricingModels(mappedPricingModels)

          let initialPmCode = mappedPricingModels[0].code
          if (
            Array.isArray(backendDeploymentPricingOptions) &&
            backendDeploymentPricingOptions.length > 0 &&
            mappedDeployments.length > 0
          ) {
            const firstDepId = mappedDeployments[0].id
            const validOpt = backendDeploymentPricingOptions.find(
              (opt) => opt.deployment_model_id === firstDepId,
            )
            if (validOpt) {
              const matchedPm = mappedPricingModels.find((p) => p.id === validOpt.pricing_model_id)
              if (matchedPm) initialPmCode = matchedPm.code
            }
          }
          setSelectedPricingModel(initialPmCode)
        }

        // 6. Service Rates
        if (Array.isArray(backendServiceRates)) {
          const mappedHourly = backendServiceRates.map((sr) => ({
            id: sr.id,
            countryId: sr.country_id,
            serviceLine: sr.role_name,
            country: sr.country?.name || '',
            currency: sr.currency?.code || sr.country?.currency?.code || '',
            hourlyRate: String(sr.hourly_rate),
            dailyRate: sr.daily_rate != null ? String(sr.daily_rate) : null,
            standardHoursPerDay: sr.hours_per_day,
            is_active: sr.is_active,
          }))
          setHourlyRates(mappedHourly)
        }

        // 7. FX Rates
        if (Array.isArray(backendFxRates)) {
          const mappedFx = backendFxRates.map((fx) => ({
            id: fx.id,
            sourceCurrency: fx.from_currency?.code || `currency #${fx.from_currency_id}`,
            targetCurrency: fx.to_currency?.code || `currency #${fx.to_currency_id}`,
            ratePerUnit: String(fx.rate),
            effectiveDate: String(fx.effective_date),
            source: fx.rate_source || '—',
          }))
          setExchangeRates(mappedFx)
        }

        // 8. Active Rate Card Version & Version Listing
        const allVersions = Array.isArray(backendVersions) ? backendVersions : []
        const currentVersion =
          backendActiveVersion ||
          allVersions.find((v) => v.status === 'active') ||
          allVersions[0] ||
          null
        if (allVersions.length > 0) {
          setVersionsList(allVersions)
        }
        if (currentVersion) {
          setActiveVersion(currentVersion)
        }

        // 9. Catalogue & Packs
        let mappedPacks = []
        if (Array.isArray(backendFamilies) && backendFamilies.length > 0) {
          setFamilies(
            backendFamilies.map((bf) => ({
              id: bf.id,
              code: bf.code,
              name: bf.name,
              iconName: 'Layers',
              description: `Product Family [ID: ${bf.id}, Code: ${bf.code}]`,
            })),
          )
        }
        let mappedProducts = []
        if (Array.isArray(backendProducts) && backendProducts.length > 0) {
          mappedProducts = backendProducts.map((bp) => ({
            id: bp.id,
            familyId: bp.product_family_id,
            product_family_id: bp.product_family_id,
            solution: bp.name,
            name: bp.name,
            code: bp.code,
            type: 'Adrenalin Native',
          }))
          setProducts(mappedProducts)
        }

        let mappedFeatures = []
        if (Array.isArray(backendFeatures) && backendFeatures.length > 0) {
          mappedFeatures = backendFeatures.map((bf) => {
            const parentProd = (mappedProducts.length > 0 ? mappedProducts : backendProducts || []).find(
              (p) => p.id === bf.product_id,
            )
            return {
              id: bf.id,
              featureId: bf.id,
              productId: bf.product_id,
              code: bf.code,
              name: bf.name,
              classification: bf.classification,
              partnerName: bf.partner_name,
              status: bf.status,
              familyId: parentProd?.familyId || parentProd?.product_family_id,
              product_family_id: parentProd?.product_family_id || parentProd?.familyId,
              productName: parentProd?.name || parentProd?.solution,
              productType:
                bf.classification === 'ai_enabled'
                  ? 'AI Agent Module'
                  : 'Adrenalin Native',
            }
          })
          setFeatures(mappedFeatures)
        }

        if (Array.isArray(backendPacks) && backendPacks.length > 0) {
          mappedPacks = backendPacks.map((bp) => {
            const latestVer = pricedPackVersion(bp)
            const rawItems = latestVer?.pack_items || []
            const mappedItems = rawItems.map((it) => ({
              id: it.id,
              feature_id: it.feature_id,
              is_required: it.is_required !== false,
              feature: it.feature,
              name: it.feature?.name || `Feature ${it.feature_id}`,
              code: it.feature?.code,
            }))

            const familyIdSet = new Set()
            if (bp.product_family_id) {
              familyIdSet.add(bp.product_family_id)
            }
            rawItems.forEach((it) => {
              const feat =
                (mappedFeatures || []).find((f) => f.id === it.feature_id) ||
                (backendFeatures || []).find((f) => f.id === it.feature_id) ||
                it.feature
              if (feat?.familyId) familyIdSet.add(feat.familyId)
              if (feat?.product_family_id) familyIdSet.add(feat.product_family_id)
              const prod =
                (mappedProducts || []).find((p) => p.id === feat?.product_id) ||
                (backendProducts || []).find((p) => p.id === feat?.product_id)
              if (prod?.familyId) familyIdSet.add(prod.familyId)
              if (prod?.product_family_id) familyIdSet.add(prod.product_family_id)
            })
            const resolvedFamilyIds = Array.from(familyIdSet)
            const resolvedFamilyId =
              bp.product_family_id ||
              (resolvedFamilyIds.length > 0 ? resolvedFamilyIds[0] : null)

            return {
              id: bp.id,
              packId: bp.id,
              code: bp.code,
              name: bp.name,
              familyId: resolvedFamilyId,
              product_family_id: bp.product_family_id || resolvedFamilyId,
              familyIds: resolvedFamilyIds,
              latestVersionId: latestVer?.id,
              versions: bp.pack_versions || bp.versions || [],
              pack_versions: bp.pack_versions || bp.versions || [],
              items: mappedItems,
              productIds: mappedItems.map((it) => it.feature_id),
            }
          })
          setPacks(mappedPacks)
        }

        // 10. Rate Cards (Version-specific PEPM Pack Rates and Feature Rates)
        const rateCardsParams = currentVersion?.id ? { rate_card_version_id: currentVersion.id } : {}
        const backendRateCards = await Promise.resolve(getRateCards(rateCardsParams)).catch((e) => {
          console.warn('Rate Cards API fetch failed:', e.message)
          return null
        })

        if (Array.isArray(backendRateCards) && backendRateCards.length > 0) {
          setRawRateCards(backendRateCards)
          processRateCards(
            backendRateCards,
            mappedTiers,
            mappedDeployments,
            mappedPricingModels,
            mappedPacks.length > 0 ? mappedPacks : packs,
            backendFeatures,
            backendProducts,
          )
        } else {
          // No saved rates for this version: show none (never keep earlier or demo rows).
          setRawRateCards([])
          setPackRates([])
          setFeatureRates([])
        }

        setIsLiveBackendData(true)
      } else {
        setIsLiveBackendData(false)
        if (fetchErr) {
          setApiError(formatApiError(fetchErr, 'Network connection failed'))
        }
      }
    } catch (err) {
      console.warn('Live backend data fetch encountered an error:', err)
      setApiError(formatApiError(err, 'Network connection failed'))
      setIsLiveBackendData(false)
    } finally {
      if (isMounted) {
        setIsLoading(false)
      }
    }
  }

  fetchData()

  return () => {
    isMounted = false
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger])

  // --- Platform + Subscription: allowed UOMs and row saves ---
  const activePricingModelObj =
    pricingModels.find(
      (pm) =>
        pm.code === selectedPricingModel ||
        pm.name === selectedPricingModel ||
        String(pm.id) === String(selectedPricingModel),
    ) || null
  const activePricingModelId = activePricingModelObj?.id ?? null
  const rateLayout = rateLayoutFor(activePricingModelObj)
  const allowedUoms = allowedUomsState.pricingModelId === activePricingModelId ? allowedUomsState.list : []

  useEffect(() => {
    if (!activePricingModelId) return undefined
    let cancelled = false
    Promise.resolve(getAllowedUomsForPricingModel(activePricingModelId))
      .then((list) => {
        if (!cancelled) setAllowedUomsState({ pricingModelId: activePricingModelId, list: Array.isArray(list) ? list : [] })
      })
      .catch((err) => {
        if (cancelled) return
        setAllowedUomsState({ pricingModelId: activePricingModelId, list: [] })
        showToast(`Could not load units of measure for this pricing model: ${formatApiError(err)}`, 'error')
      })
    return () => {
      cancelled = true
    }
  }, [activePricingModelId, refreshTrigger, showToast])

  const platformSaveTimers = useRef({})

  // Request body for PUT /rates/rate-cards/target from a grid row (one UOM schedule of a pack/feature).
  const buildTargetPayload = (row, kind, layout = rateLayout) => {
    const uomId = activePricingModelObj?.uomLockedId || row.uomId
    if (!uomId) throw new Error('Select the unit of measure for this rate.')
    const tierLabel = (t) => t.code || t.name
    const perTier = layout === 'license' || Boolean(row.perTierRates)
    const tierEntries = pricingTiers.map((t) => {
      const entry = { tier_id: requireId(t.id, 'Customer tier') }
      if (layout !== 'license') {
        entry.fixed_fee = parseAmount(row[`fixed_tier_${t.id}`], `${tierLabel(t)} platform fee`) ?? null
      }
      if (perTier) {
        entry.unit_rate =
          parseAmount(row[`tier_${t.id}`], `${tierLabel(t)} ${layout === 'license' ? 'licence fee' : 'subscription rate'}`) ?? null
      }
      if (layout === 'license') {
        const amc = parseAmount(row[`amc_tier_${t.id}`], `${tierLabel(t)} AMC %`)
        if (amc !== undefined && amc > 100) throw new Error(`${tierLabel(t)} AMC % must be between 0 and 100.`)
        entry.amc_percentage = amc ?? null
      }
      return entry
    })
    const savedUom = row.savedUomId ?? null
    return {
      ...(savedUom && Number(savedUom) !== Number(uomId) ? { current_uom_id: Number(savedUom) } : {}),
      rate_card_version_id: requireId(activeVersion?.id, 'Rate card version'),
      country_id: typeof row.countryId === 'number' ? row.countryId : requireId(activeCountry?.id, 'Country'),
      deployment_model_id: requireId(row.deploymentModelId, 'Deployment model'),
      pricing_model_id: requireId(row.pricingModelId, 'Pricing model'),
      ...(kind === 'pack'
        ? { pack_version_id: requireId(row.packVersionId, 'Pack version') }
        : { feature_id: requireId(row.featureId, 'Feature') }),
      uom_id: requireId(uomId, 'Unit of measure'),
      unit_rate: perTier ? null : parseAmount(row.subscriptionRate, 'Subscription rate') ?? null,
      tier_fees: tierEntries,
    }
  }

  const isSameTarget = (rc, payload) =>
    rc.rate_card_version_id === payload.rate_card_version_id &&
    rc.country_id === payload.country_id &&
    rc.deployment_model_id === payload.deployment_model_id &&
    rc.pricing_model_id === payload.pricing_model_id &&
    [payload.uom_id, payload.current_uom_id].includes(rc.uom_id) &&
    (payload.pack_version_id ? rc.pack_version_id === payload.pack_version_id : rc.feature_id === payload.feature_id)

  const reloadRateCards = async () => {
    const cards = await getRateCards(activeVersion?.id ? { rate_card_version_id: activeVersion.id } : {})
    if (Array.isArray(cards)) {
      setRawRateCards(cards)
      processRateCards(cards, pricingTiers, deploymentModels, pricingModels, packs, features, products)
    }
  }

  const handleUpdatePlatformRate = (kind, rowId, change) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }
    const list = kind === 'pack' ? packRates : featureRates
    const setList = kind === 'pack' ? setPackRates : setFeatureRates
    const current = list.find((r) => r.id === rowId)
    if (!current) return
    const next = applyPlatformChange(current, change, pricingTiers, allowedUoms)
    setList((prev) => prev.map((r) => (r.id === current.id ? applyPlatformChange(r, change, pricingTiers, allowedUoms) : r)))

    if (!isLiveBackendData) return
    const timerKey = `${kind}-${current.id}`
    clearTimeout(platformSaveTimers.current[timerKey])
    platformSaveTimers.current[timerKey] = setTimeout(async () => {
      try {
        const payload = buildTargetPayload(next, kind)
        const saved = await saveRateCardTarget(payload)
        if (Array.isArray(saved)) {
          setRawRateCards((prev) => [...prev.filter((rc) => !isSameTarget(rc, payload)), ...saved])
        }
        // The schedule now lives under the saved UOM; later edits must target it there.
        setList((prev) => prev.map((r) => (r.id === current.id ? { ...r, savedUomId: payload.uom_id } : r)))
        showToast('Rate saved.')
      } catch (err) {
        showToast(`Failed to save rate: ${formatApiError(err)}`, 'error')
      }
    }, 600)
  }

  // --- Handlers: Left Sidebar (Products & Families) ---
  const handleSaveNewProduct = (newProduct) => {
    const productWithId = {
      ...newProduct,
      id: newProduct.id || `prod-${Date.now()}`,
    }
    setProducts((prev) => [productWithId, ...prev])
    showToast(`Product "${newProduct.solution}" added to catalogue.`)
  }

  // --- Handlers: Center Editor (Rates) ---
  const handleUpdatePackRate = (id, field, value) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }

    // Determine the edited tier exactly (never from digits that happen to be in the key)
    const clean = String(field).toLowerCase()
    const tierObj = tierFromField(field, pricingTiers)
    const tierIdVal = tierObj?.id ?? null
    const tierNum = tierObj ? pricingTiers.indexOf(tierObj) + 1 : null
    const isFixed = clean.includes('fixed')

    const fieldAliases = { [field]: value }
    if (tierIdVal !== null) {
      if (isFixed) {
        fieldAliases[`fixed_tier_${tierIdVal}`] = value
        fieldAliases[`fixed_${tierIdVal}Rate`] = value
        if (tierNum <= 3) fieldAliases[`fixed_tier${tierNum}Rate`] = value
      } else {
        fieldAliases[`tier_${tierIdVal}`] = value
        fieldAliases[`${tierIdVal}Rate`] = value
        if (tierNum <= 3) fieldAliases[`tier${tierNum}Rate`] = value
      }
    }

    setPackRates((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...fieldAliases } : r)),
    )

    if (!isLiveBackendData) return

    const timerKey = `pack-${id}-${field}`
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey])
    }

    debounceTimers.current[timerKey] = setTimeout(async () => {
      try {
        const rateRow = packRates.find((r) => r.id === id)
        if (!rateRow || !rateRow.packVersionId) return

        const isFixedField = String(field).toLowerCase().includes('fixed')
        let tierId = null
        const cleanField = String(field).replace(/^fixed_/, '')
        if (cleanField === 'tier1Rate' || cleanField === '1Rate') {
          tierId = requireId(pricingTiers[0]?.id, 'Customer tier')
        } else if (cleanField === 'tier2Rate' || cleanField === '2Rate') {
          tierId = requireId(pricingTiers[1]?.id, 'Customer tier')
        } else if (cleanField === 'tier3Rate' || cleanField === '3Rate') {
          tierId = requireId(pricingTiers[2]?.id, 'Customer tier')
        } else {
          const m1 = cleanField.match(/^tier_(\d+)$/)
          const m2 = cleanField.match(/^(\d+)Rate$/)
          if (m1) tierId = parseInt(m1[1], 10)
          else if (m2) tierId = parseInt(m2[1], 10)
          else if (!isNaN(parseInt(cleanField, 10))) tierId = parseInt(cleanField, 10)
        }

        const activeCountryObj =
          countries.find(
            (c) =>
              String(c.id) === String(selectedCountryId) ||
              (c.code && String(c.code).toLowerCase() === String(selectedCountryId).toLowerCase()),
          ) || countries[0]
        const activeCountryId =
          requireId(activeCountryObj?.id, 'Country')
        const countryIdToPersist =
          typeof rateRow.countryId === 'number' ? rateRow.countryId : activeCountryId

        const payload = {
          rate_card_version_id: requireId(activeVersion?.id, 'Rate card version'),
          country_id: countryIdToPersist,
          deployment_model_id: requireId(rateRow.deploymentModelId, 'Deployment model'),
          pricing_model_id: requireId(rateRow.pricingModelId, 'Pricing model'),
          tier_id: requireId(tierId, 'Customer tier'),
          pack_version_id: rateRow.packVersionId,
          ...(rateRow.uomId ? { uom_id: rateRow.uomId } : {}),
        }
        if (isFixedField) {
          payload.fixed_fee = parseAmount(value)
          const existingUnit = rateRow[`tier_${tierId}`] ?? rateRow[`tier${tierId}Rate`]
          if (existingUnit !== undefined && existingUnit !== '') {
            payload.unit_rate = parseAmount(existingUnit)
          }
        } else {
          payload.unit_rate = parseAmount(value)
          const existingFixed = rateRow[`fixed_tier_${tierId}`] ?? rateRow[`fixed_tier${tierId}Rate`]
          if (existingFixed !== undefined && existingFixed !== '') {
            payload.fixed_fee = parseAmount(existingFixed)
          }
        }

        await upsertRateCard(payload)
        showToast('Rate updated.')
      } catch (err) {
        showToast(
          `Failed to persist rate: ${formatApiError(err)}`,
          'error',
        )
      }
    }, 600)
  }

  const handleRemovePackRate = (id) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }

    const rate = packRates.find((r) => r.id === id)
    const name = rate?.packName || 'Pack Rate'

    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Pack Rate',
      recordName: name,
      recordType: 'pack rate',
      isDeleting: false,
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, isDeleting: true }))
        try {
          if (isLiveBackendData && rate?.packVersionId) {
            const activeCountryObj =
              countries.find(
                (c) =>
                  String(c.id) === String(selectedCountryId) ||
                  (c.code && String(c.code).toLowerCase() === String(selectedCountryId).toLowerCase()),
              ) || countries[0]
            const activeCountryId =
              requireId(activeCountryObj?.id, 'Country')
            const depId = requireId(rate.deploymentModelId, 'Deployment model')
            const pmId = requireId(rate.pricingModelId, 'Pricing model')
            const versionId = requireId(activeVersion?.id, 'Rate card version')

            await deleteRateCardGroup({
              rate_card_version_id: versionId,
              country_id: activeCountryId,
              deployment_model_id: depId,
              pricing_model_id: pmId,
              pack_version_id: rate.packVersionId,
              ...(rate.savedUomId ? { uom_id: Number(rate.savedUomId) } : {}),
            })
            setPackRates((prev) => prev.filter((r) => r.id !== id))
            showToast('Pack rate removed from database.')
          } else {
            setPackRates((prev) => prev.filter((r) => r.id !== id))
            showToast('Pack rate removed.')
          }
          setDeleteConfirm({ isOpen: false, title: '', recordName: '', recordType: '', isDeleting: false, onConfirm: null })
        } catch (err) {
          showToast(
            `Failed to remove pack rate: ${formatApiError(err)}`,
            'error',
          )
          setDeleteConfirm((prev) => ({ ...prev, isDeleting: false }))
        }
      },
    })
  }

  const handleSavePackRate = async (newRate) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }

    try {
      if (isLiveBackendData) {
        const activeCountryObj =
          countries.find(
            (c) =>
              String(c.id) === String(selectedCountryId) ||
              (c.code && String(c.code).toLowerCase() === String(selectedCountryId).toLowerCase()),
          ) || countries[0]
        const activeCountryId =
          requireId(activeCountryObj?.id, 'Country')

        const activeDepObj =
          deploymentModels.find(
            (d) => d.name === (newRate.deploymentModel || selectedDeployment),
          ) || deploymentModels[0]
        const depId = requireId(activeDepObj?.id, 'Deployment model')

        const activePmObj =
          pricingModels.find(
            (p) => p.code === (newRate.pricingModel || selectedPricingModel),
          ) || pricingModels[0]
        const pmId = requireId(activePmObj?.id, 'Pricing model')

        const packObj = packs.find(
          (p) => p.id === newRate.packId || p.packId === newRate.packId,
        )
        const packVersionId =
          requireId(packObj?.latestVersionId, 'Pack version')

        const versionId = requireId(activeVersion?.id, 'Rate card version')

        const modalLayout = rateLayoutFor(activePmObj)
        if (modalLayout === 'platform' || modalLayout === 'license') {
          const existingRows = packRates.filter(
            (r) =>
              Number(r.packVersionId) === Number(packVersionId) &&
              Number(r.deploymentModelId) === Number(depId) &&
              Number(r.pricingModelId) === Number(pmId) &&
              Number(r.uomId) === Number(activePmObj?.uomLockedId || newRate.uomId),
          )
          if (existingRows.length > 0) {
            throw new Error('a rate for this unit of measure already exists; edit it in the grid instead')
          }
          const row = {
            packVersionId,
            deploymentModelId: depId,
            pricingModelId: pmId,
            countryId: activeCountryId,
            uomId: newRate.uomId,
            subscriptionRate: newRate.subscriptionRate,
          }
          pricingTiers.forEach((t) => {
            row[`fixed_tier_${t.id}`] = newRate.fixedTierRates?.[t.id] ?? ''
            row[`tier_${t.id}`] = newRate.tierRates?.[t.id] ?? ''
            row[`amc_tier_${t.id}`] = newRate.amcTierRates?.[t.id] ?? ''
          })
          await saveRateCardTarget(buildTargetPayload(row, 'pack', modalLayout))
          await reloadRateCards()
          showToast(`Pack rate for "${newRate.packName}" saved.`)
          return
        }

        // Upsert across all dynamic tiers
        const tierEntries = pricingTiers.map((tier, idx) => {
          const rateVal =
            newRate.tierRates?.[tier.id] ??
            newRate[`tier${idx + 1}Rate`] ??
            newRate[`${tier.id}Rate`] ??
            newRate[tier.id]
          const fixedVal =
            newRate.fixedTierRates?.[tier.id] ??
            newRate[`fixed_tier${idx + 1}Rate`] ??
            newRate[`fixed_tier_${tier.id}`] ??
            newRate[`fixed_${tier.id}Rate`]
          return { tier, rate: rateVal, fixed: fixedVal }
        })

        for (const entry of tierEntries) {
          const hasRate =
            entry.tier &&
            entry.rate !== undefined &&
            entry.rate !== null &&
            entry.rate !== ''
          const hasFixed =
            entry.tier &&
            entry.fixed !== undefined &&
            entry.fixed !== null &&
            entry.fixed !== ''

          if (hasRate || hasFixed) {
            const tierId = requireId(entry.tier.id, 'Customer tier')
            const payload = {
              rate_card_version_id: versionId,
              country_id: activeCountryId,
              deployment_model_id: depId,
              pricing_model_id: pmId,
              tier_id: tierId,
              pack_version_id: packVersionId,
              ...(newRate.uomId ? { uom_id: Number(newRate.uomId) } : {}),
            }
            if (hasRate) {
              payload.unit_rate = parseAmount(entry.rate)
            }
            if (hasFixed) {
              payload.fixed_fee = parseAmount(entry.fixed)
            }
            await upsertRateCard(payload)
          }
        }

        const packFamilyId =
          packObj?.familyId ||
          packObj?.product_family_id ||
          packObj?.familyIds?.[0] ||
          (newRate.familyId && newRate.familyId !== 'fam-ta' ? newRate.familyId : null) ||
          'all'
        const packFamilyIds =
          packObj?.familyIds ||
          (packFamilyId !== 'all' ? [packFamilyId] : [])

        const rateWithId = {
          id: `pr-${newRate.packId}-${depId}-${pmId}`,
          packId: newRate.packId,
          packVersionId,
          packCode: newRate.packCode,
          packName: newRate.packName,
          familyId: packFamilyId,
          familyIds: packFamilyIds,
          items: packObj?.items || [],
          deploymentModel: activeDepObj.name,
          deploymentModelId: depId,
          pricingModel: activePmObj.code,
          pricingModelId: pmId,
          countryId: activeCountryId,
          unitOfMeasure: newRate.unitOfMeasure || '',
          tier1Rate: newRate.tier1Rate || newRate.tierRates?.[pricingTiers[0]?.id] || '',
          tier2Rate: newRate.tier2Rate || newRate.tierRates?.[pricingTiers[1]?.id] || '',
          tier3Rate: newRate.tier3Rate || newRate.tierRates?.[pricingTiers[2]?.id] || '',
          fixed_tier1Rate: newRate.fixed_tier1Rate || newRate.fixedTierRates?.[pricingTiers[0]?.id] || '',
          fixed_tier2Rate: newRate.fixed_tier2Rate || newRate.fixedTierRates?.[pricingTiers[1]?.id] || '',
          fixed_tier3Rate: newRate.fixed_tier3Rate || newRate.fixedTierRates?.[pricingTiers[2]?.id] || '',
        }
        pricingTiers.forEach((tier, idx) => {
          const val =
            newRate.tierRates?.[tier.id] ??
            newRate[`tier${idx + 1}Rate`] ??
            newRate[`${tier.id}Rate`] ??
            newRate[tier.id] ?? ''
          const fixedVal =
            newRate.fixedTierRates?.[tier.id] ??
            newRate[`fixed_tier${idx + 1}Rate`] ??
            newRate[`fixed_tier_${tier.id}`] ??
            newRate[`fixed_${tier.id}Rate`] ?? ''
          rateWithId[`tier_${tier.id}`] = String(val)
          rateWithId[`${tier.id}Rate`] = String(val)
          rateWithId[tier.id] = String(val)
          rateWithId[`fixed_tier_${tier.id}`] = String(fixedVal)
          rateWithId[`fixed_${tier.id}Rate`] = String(fixedVal)
        })
        setPackRates((prev) => [...prev.filter((r) => r.id !== rateWithId.id), rateWithId])
        showToast(
          `Pack rate for "${newRate.packName}" saved.`,
        )

        // Resync backend rate cards so rawRateCards and UI matrix are in lockstep
        const currentVersionId = activeVersion?.id
        const refreshedCards = await getRateCards(
          currentVersionId ? { rate_card_version_id: currentVersionId } : {}
        ).catch(() => null)
        if (Array.isArray(refreshedCards) && refreshedCards.length > 0) {
          setRawRateCards(refreshedCards)
          processRateCards(
            refreshedCards,
            pricingTiers,
            deploymentModels,
            pricingModels,
            packs,
            features,
            products,
          )
        }
      } else {
        showToast('Cannot save pack rate: the backend is not available.', 'error')
      }
    } catch (err) {
      showToast(
        `Failed to save pack rate: ${formatApiError(err)}`,
        'error',
      )
    }
  }

  const handleUpdateFeatureRate = (id, field, value) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }

    // 1. Resolve matching catalogue feature and target feature ID
    const existingRateRow = featureRates.find(
      (r) =>
        r.id === id ||
        String(r.id) === String(id) ||
        (r.featureId != null && (String(r.featureId) === String(id) || String(r.id) === `fr-feat-${id}`)),
    )

    let targetFeatureId = null
    if (existingRateRow?.featureId != null && !isNaN(parseInt(existingRateRow.featureId, 10))) {
      targetFeatureId = parseInt(existingRateRow.featureId, 10)
    } else if (typeof id === 'number' && !isNaN(id)) {
      targetFeatureId = id
    } else if (typeof id === 'string') {
      const matchedNum = id.replace(/^(feat-row-|fr-feat-|fr-db-|fr-|feat-)/, '').split('-')[0]
      const parsed = parseInt(matchedNum, 10)
      if (!isNaN(parsed)) targetFeatureId = parsed
    }

    const featObj = features.find(
      (f) =>
        (targetFeatureId != null && Number(f.id) === Number(targetFeatureId)) ||
        Number(f.id) === Number(id),
    )

    const resolvedNumericFeatureId =
      targetFeatureId != null && !isNaN(targetFeatureId)
        ? targetFeatureId
        : featObj?.id != null
        ? Number(featObj.id)
        : null

    // Determine the edited tier exactly (never from digits that happen to be in the key)
    const clean = String(field).toLowerCase()
    const tierObj = tierFromField(field, pricingTiers)
    const tierIdVal = tierObj?.id ?? null
    const tierNum = tierObj ? pricingTiers.indexOf(tierObj) + 1 : null
    const isFixed = clean.includes('fixed')

    const fieldAliases = { [field]: value }
    if (tierIdVal !== null) {
      if (isFixed) {
        fieldAliases[`fixed_tier_${tierIdVal}`] = value
        fieldAliases[`fixed_${tierIdVal}Rate`] = value
        if (tierNum <= 3) fieldAliases[`fixed_tier${tierNum}Rate`] = value
      } else {
        fieldAliases[`tier_${tierIdVal}`] = value
        fieldAliases[`${tierIdVal}Rate`] = value
        if (tierNum <= 3) fieldAliases[`tier${tierNum}Rate`] = value
      }
    }

    setFeatureRates((prev) => {
      const matchIndex = prev.findIndex((r) => {
        if (r.id === id || String(r.id) === String(id)) return true
        if (r.id && (String(r.id) === `fr-${id}` || String(r.id) === `fr-feat-${id}` || String(r.id).startsWith(`fr-feat-${id}-`))) return true
        if (resolvedNumericFeatureId != null) {
          if (r.featureId != null && Number(r.featureId) === Number(resolvedNumericFeatureId)) return true
          const rClean = String(r.id).replace(/^(feat-row-|fr-feat-|fr-db-|fr-|feat-)/, '').split('-')[0]
          if (rClean === String(resolvedNumericFeatureId)) return true
        }
        return false
      })

      if (matchIndex >= 0) {
        const next = [...prev]
        next[matchIndex] = {
          ...next[matchIndex],
          ...fieldAliases,
        }
        return next
      } else {
        const activeCountryObj =
          countries.find(
            (c) =>
              c.id === selectedCountryId ||
              String(c.id) === String(selectedCountryId) ||
              (c.code && String(c.code).toLowerCase() === String(selectedCountryId).toLowerCase()),
          ) || countries[0]
        const activeDepObj =
          deploymentModels.find(
            (d) =>
              d.name === selectedDeployment ||
              d.code === selectedDeployment ||
              String(d.id) === String(selectedDeployment),
          ) || deploymentModels[0]
        const activePmObj =
          pricingModels.find(
            (p) =>
              String(p.code).toLowerCase() === String(selectedPricingModel).toLowerCase() ||
              String(p.name).toLowerCase() === String(selectedPricingModel).toLowerCase() ||
              String(p.id) === String(selectedPricingModel),
          ) || pricingModels[0]

        const newRow = {
          id: `fr-feat-${resolvedNumericFeatureId || id}`,
          featureId: resolvedNumericFeatureId || featObj?.id || id,
          productId: featObj?.productId,
          productCode: featObj?.code || `FEAT-${resolvedNumericFeatureId || id}`,
          featureName: featObj?.name || `Feature ${resolvedNumericFeatureId || id}`,
          familyId:
            featObj?.familyId ||
            featObj?.product_family_id ||
            (selectedFamilyId !== 'all' ? selectedFamilyId : 'all'),
          deploymentModel: activeDepObj.name,
          deploymentModelId: activeDepObj.id,
          pricingModel: activePmObj.code,
          pricingModelId: activePmObj.id,
          countryId: activeCountryObj?.id ?? null,
          productType: featObj?.productType || 'Adrenalin Native',
          unitOfMeasure: '',
          ...fieldAliases,
        }
        return [...prev, newRow]
      }
    })

    if (!isLiveBackendData) return

    const timerKey = `feat-${id}-${field}`
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey])
    }

    debounceTimers.current[timerKey] = setTimeout(async () => {
      try {
        const activeCountryObj =
          countries.find(
            (c) =>
              c.id === selectedCountryId ||
              String(c.id) === String(selectedCountryId) ||
              (c.code && String(c.code).toLowerCase() === String(selectedCountryId).toLowerCase()),
          ) || countries[0]
        const activeCountryId =
          requireId(activeCountryObj?.id, 'Country')

        const activeDepObj =
          deploymentModels.find(
            (d) =>
              d.name === selectedDeployment ||
              d.code === selectedDeployment ||
              String(d.id) === String(selectedDeployment),
          ) || deploymentModels[0]

        const activePmObj =
          pricingModels.find(
            (p) =>
              String(p.code).toLowerCase() === String(selectedPricingModel).toLowerCase() ||
              String(p.name).toLowerCase() === String(selectedPricingModel).toLowerCase() ||
              String(p.id) === String(selectedPricingModel),
          ) || pricingModels[0]

        const rateRow = featureRates.find(
          (r) =>
            r.id === id ||
            String(r.id) === String(id) ||
            (resolvedNumericFeatureId != null &&
              r.featureId != null &&
              Number(r.featureId) === Number(resolvedNumericFeatureId)),
        )

        let targetFeatureId = resolvedNumericFeatureId
        if (targetFeatureId == null && rateRow?.featureId != null) {
          const parsed = parseInt(rateRow.featureId, 10)
          if (!isNaN(parsed)) targetFeatureId = parsed
        }
        if (targetFeatureId == null && typeof id === 'string') {
          const matchedNum = id.replace(/^(feat-row-|fr-feat-|fr-db-|fr-|feat-)/, '').split('-')[0]
          const parsed = parseInt(matchedNum, 10)
          if (!isNaN(parsed)) targetFeatureId = parsed
        }
        if (targetFeatureId == null) {
          const matchedFeat = features.find((f) => f.id === id || String(f.id) === String(id))
          if (matchedFeat?.id && !isNaN(parseInt(matchedFeat.id, 10))) {
            targetFeatureId = parseInt(matchedFeat.id, 10)
          }
        }
        if (targetFeatureId == null) {
          console.warn('Cannot persist feature rate: feature_id is not a valid integer:', id)
          return
        }

        const tierId = typeof tierIdVal === 'number' ? tierIdVal : null

        const payload = {
          rate_card_version_id: requireId(activeVersion?.id, 'Rate card version'),
          country_id: typeof rateRow?.countryId === 'number' ? rateRow.countryId : activeCountryId,
          deployment_model_id: requireId(rateRow?.deploymentModelId || activeDepObj?.id, 'Deployment model'),
          pricing_model_id: requireId(rateRow?.pricingModelId || activePmObj?.id, 'Pricing model'),
          tier_id: requireId(tierId, 'Customer tier'),
          feature_id: targetFeatureId,
          ...(rateRow?.uomId ? { uom_id: rateRow.uomId } : {}),
        }

        if (isFixed) {
          payload.fixed_fee = parseAmount(value)
          const existingUnit =
            rateRow?.[`tier_${tierId}`] ??
            rateRow?.[`tier${tierNum}Rate`]
          if (existingUnit !== undefined && existingUnit !== '') {
            payload.unit_rate = parseAmount(existingUnit)
          }
        } else {
          payload.unit_rate = parseAmount(value)
          const existingFixed =
            rateRow?.[`fixed_tier_${tierId}`] ??
            rateRow?.[`fixed_tier${tierNum}Rate`]
          if (existingFixed !== undefined && existingFixed !== '') {
            payload.fixed_fee = parseAmount(existingFixed)
          }
        }

        const savedResult = await upsertRateCard(payload)

        // Keep local state in sync without mutating the stable feature row identity
        if (savedResult?.id) {
          setFeatureRates((prev) =>
            prev.map((r) =>
              r.id === id ||
              (resolvedNumericFeatureId != null &&
                r.featureId != null &&
                Number(r.featureId) === Number(resolvedNumericFeatureId))
                ? {
                    ...r,
                    id: r.id || `fr-feat-${targetFeatureId}`,
                    lastSavedDbId: savedResult.id,
                  }
                : r,
            ),
          )
        }
        showToast('Feature rate updated.')
      } catch (err) {
        showToast(
          `Failed to persist feature rate: ${formatApiError(err)}`,
          'error',
        )
      }
    }, 600)
  }

  const handleRemoveFeatureRate = (id) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }

    const rate = featureRates.find((r) => r.id === id)
    const name = rate?.featureName || 'Feature Rate'

    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Feature Rate',
      recordName: name,
      recordType: 'feature rate',
      isDeleting: false,
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, isDeleting: true }))
        try {
          if (isLiveBackendData && rate?.featureId) {
            const activeCountryObj =
              countries.find(
                (c) =>
                  String(c.id) === String(selectedCountryId) ||
                  (c.code && String(c.code).toLowerCase() === String(selectedCountryId).toLowerCase()),
              ) || countries[0]
            const activeCountryId =
              requireId(activeCountryObj?.id, 'Country')
            const depId = requireId(rate.deploymentModelId, 'Deployment model')
            const pmId = requireId(rate.pricingModelId, 'Pricing model')
            const versionId = requireId(activeVersion?.id, 'Rate card version')

            await deleteRateCardGroup({
              rate_card_version_id: versionId,
              country_id: activeCountryId,
              deployment_model_id: depId,
              pricing_model_id: pmId,
              feature_id: rate.featureId,
              ...(rate.savedUomId ? { uom_id: Number(rate.savedUomId) } : {}),
            })
            setFeatureRates((prev) => prev.filter((r) => r.id !== id))
            showToast('Feature rate removed from database.')
          } else {
            setFeatureRates((prev) => prev.filter((r) => r.id !== id))
            showToast('Feature rate removed.')
          }
          setDeleteConfirm({ isOpen: false, title: '', recordName: '', recordType: '', isDeleting: false, onConfirm: null })
        } catch (err) {
          showToast(
            `Failed to remove feature rate: ${formatApiError(err)}`,
            'error',
          )
          setDeleteConfirm((prev) => ({ ...prev, isDeleting: false }))
        }
      },
    })
  }

  const handleSaveFeatureRate = async (newRate) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }

    try {
      if (isLiveBackendData) {
        const activeCountryObj =
          countries.find(
            (c) =>
              String(c.id) === String(selectedCountryId) ||
              (c.code && String(c.code).toLowerCase() === String(selectedCountryId).toLowerCase()),
          ) || countries[0]
        const activeCountryId =
          requireId(activeCountryObj?.id, 'Country')

        const activeDepObj =
          deploymentModels.find(
            (d) => d.name === (newRate.deploymentModel || selectedDeployment),
          ) || deploymentModels[0]
        const depId = requireId(activeDepObj?.id, 'Deployment model')

        const activePmObj =
          pricingModels.find(
            (p) =>
              p.code === (newRate.pricingModel || selectedPricingModel) ||
              p.name === (newRate.pricingModel || selectedPricingModel) ||
              p.id === newRate.pricingModelId,
          ) || pricingModels[0]
        const pmId =
          typeof newRate.pricingModelId === 'number' && !isNaN(newRate.pricingModelId)
            ? newRate.pricingModelId
            : requireId(activePmObj?.id, 'Pricing model')
        let featureId = null
        if (typeof newRate.featureId === 'number' && !isNaN(newRate.featureId)) {
          featureId = newRate.featureId
        } else if (newRate.featureId) {
          const parsed = parseInt(newRate.featureId, 10)
          if (!isNaN(parsed)) featureId = parsed
        }
        if (!featureId && newRate.id) {
          const matchedNum = String(newRate.id).replace(/^(feat-row-|fr-feat-|fr-db-|fr-|feat-)/, '').split('-')[0]
          const parsed = parseInt(matchedNum, 10)
          if (!isNaN(parsed)) featureId = parsed
        }
        if (!featureId) {
          const matchedFeat = features.find(
            (f) =>
              (newRate.productCode && f.code === newRate.productCode) ||
              (newRate.featureName && f.name === newRate.featureName),
          )
          if (matchedFeat?.id && !isNaN(parseInt(matchedFeat.id, 10))) {
            featureId = parseInt(matchedFeat.id, 10)
          }
        }

        if (!featureId) {
          throw new Error('the feature is not a saved catalogue record')
        }

        const versionId = requireId(activeVersion?.id, 'Rate card version')

        const modalLayout = rateLayoutFor(activePmObj)
        if (modalLayout === 'platform' || modalLayout === 'license') {
          const existingRows = featureRates.filter(
            (r) =>
              Number(r.featureId) === Number(featureId) &&
              Number(r.deploymentModelId) === Number(depId) &&
              Number(r.pricingModelId) === Number(pmId) &&
              Number(r.uomId) === Number(activePmObj?.uomLockedId || newRate.uomId),
          )
          if (existingRows.length > 0) {
            throw new Error('a rate for this unit of measure already exists; edit it in the grid instead')
          }
          const row = {
            featureId,
            deploymentModelId: depId,
            pricingModelId: pmId,
            countryId: activeCountryId,
            uomId: newRate.uomId,
            subscriptionRate: newRate.subscriptionRate,
          }
          pricingTiers.forEach((t) => {
            row[`fixed_tier_${t.id}`] = newRate.fixedTierRates?.[t.id] ?? ''
            row[`tier_${t.id}`] = newRate.tierRates?.[t.id] ?? ''
            row[`amc_tier_${t.id}`] = newRate.amcTierRates?.[t.id] ?? ''
          })
          await saveRateCardTarget(buildTargetPayload(row, 'feature', modalLayout))
          await reloadRateCards()
          showToast(`Feature rate for "${newRate.featureName}" saved.`)
          return
        }

        // Upsert across all dynamic tiers
        const tierEntries = pricingTiers.map((tier, idx) => {
          const rateVal =
            newRate.tierRates?.[tier.id] ??
            newRate[`tier${idx + 1}Rate`] ??
            newRate[`${tier.id}Rate`] ??
            newRate[tier.id]
          return { tier, rate: rateVal }
        })

        for (const entry of tierEntries) {
          if (
            entry.tier &&
            entry.rate !== undefined &&
            entry.rate !== null &&
            entry.rate !== ''
          ) {
            const tierId = requireId(entry.tier.id, 'Customer tier')
            await upsertRateCard({
              rate_card_version_id: versionId,
              country_id: activeCountryId,
              deployment_model_id: depId,
              pricing_model_id: pmId,
              tier_id: tierId,
              feature_id: featureId,
              unit_rate: parseAmount(entry.rate),
              ...(newRate.uomId ? { uom_id: Number(newRate.uomId) } : {}),
            })
          }
        }

        const rateWithId = {
          id: `fr-feat-${featureId}-${depId}-${pmId}`,
          featureId,
          productId: newRate.productId,
          productCode: newRate.productCode || newRate.featureCode,
          featureName: newRate.featureName,
          familyId: newRate.familyId,
          deploymentModel: activeDepObj.name,
          deploymentModelId: depId,
          pricingModel: activePmObj.code,
          pricingModelId: pmId,
          countryId: activeCountryId,
          productType: newRate.productType || 'Adrenalin Native',
          unitOfMeasure: newRate.unitOfMeasure || '',
          tier1Rate: newRate.tier1Rate || newRate.tierRates?.[pricingTiers[0]?.id] || '',
          tier2Rate: newRate.tier2Rate || newRate.tierRates?.[pricingTiers[1]?.id] || '',
          tier3Rate: newRate.tier3Rate || newRate.tierRates?.[pricingTiers[2]?.id] || '',
        }
        pricingTiers.forEach((tier, idx) => {
          const val =
            newRate.tierRates?.[tier.id] ??
            newRate[`tier${idx + 1}Rate`] ??
            newRate[`${tier.id}Rate`] ??
            newRate[tier.id] ?? ''
          rateWithId[`tier_${tier.id}`] = String(val)
          rateWithId[`${tier.id}Rate`] = String(val)
          rateWithId[tier.id] = String(val)
        })

        // Upsert into state without creating duplicate keys
        setFeatureRates((prev) => {
          const matchIdx = prev.findIndex(
            (r) =>
              r.id === rateWithId.id ||
              (featureId != null && r.featureId != null && Number(r.featureId) === Number(featureId)),
          )
          if (matchIdx >= 0) {
            const next = [...prev]
            next[matchIdx] = { ...next[matchIdx], ...rateWithId }
            return next
          }
          return [...prev, rateWithId]
        })

        showToast(
          `Feature rate for "${newRate.featureName}" saved.`,
        )
      } else {
        showToast('Cannot save feature rate: the backend is not available.', 'error')
      }
    } catch (err) {
      showToast(
        `Failed to save feature rate: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  // --- Handlers: Right Master Data Panels ---
  const handleSaveCountry = async (newCountry) => {
    try {
      if (isLiveBackendData) {
        const created = await createCountry({
          name: newCountry.name,
          currency_code: newCountry.currency,
          currency_symbol: newCountry.symbol,
        })
        const mappedCountry = {
          id: created.id,
          code: created.iso_code,
          name: created.name,
          currency: created.currency?.code || newCountry.currency,
          symbol: created.currency?.symbol || newCountry.symbol,
          defaultCurrencyId: created.default_currency_id,
        }
        setCountries((prev) => [...prev, mappedCountry])
        showToast(`Country "${created.name}" added.`)
      } else {
        const countryWithId = {
          ...newCountry,
          id: newCountry.id || `c-${Date.now()}`,
        }
        setCountries((prev) => [...prev, countryWithId])
        showToast(`Country "${newCountry.name}" registered.`)
      }
    } catch (err) {
      showToast(
        `Failed to register country: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  const handleDeleteCountry = (id) => {
    const c = countries.find((country) => country.id === id)
    const name = c?.name || 'Country'

    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Country',
      recordName: name,
      recordType: 'country',
      isDeleting: false,
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, isDeleting: true }))
        try {
          if (isLiveBackendData && typeof id === 'number') {
            await deleteCountry(id)
            setCountries((prev) => prev.filter((country) => country.id !== id))
            showToast('Country removed from database.')
          } else {
            setCountries((prev) => prev.filter((country) => country.id !== id))
            showToast('Country removed from master catalog.')
          }
          setDeleteConfirm({ isOpen: false, title: '', recordName: '', recordType: '', isDeleting: false, onConfirm: null })
        } catch (err) {
          showToast(
            `Cannot delete country: ${err.response?.data?.detail || err.message}`,
            'error',
          )
          setDeleteConfirm((prev) => ({ ...prev, isDeleting: false }))
        }
      },
    })
  }

  const handleUpdateCountry = async (id, updatedFields) => {
    try {
      if (isLiveBackendData && typeof id === 'number') {
        const updated = await updateCountry(id, {
          name: updatedFields.name,
          currency_code: updatedFields.currency,
        })
        setCountries((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  name: updated.name,
                  currency: updated.currency?.code || updatedFields.currency,
                  symbol: updated.currency?.symbol || c.symbol,
                }
              : c,
          ),
        )
        showToast('Country details updated in database.')
      } else {
        setCountries((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...updatedFields } : c)),
        )
        showToast('Country details updated.')
      }
    } catch (err) {
      showToast(
        `Failed to update country: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  const handleUpdateTier = async (id, updatedFields) => {
    try {
      if (isLiveBackendData && typeof id === 'number') {
        const updated = await updateCustomerTier(id, {
          name: updatedFields.name,
        })
        setPricingTiers((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  name: updated.name,
                  description: updatedFields.description ?? t.description,
                }
              : t,
          ),
        )
        showToast('Pricing tier updated in database.')
      } else {
        setPricingTiers((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...updatedFields } : t)),
        )
        showToast('Pricing tier details updated.')
      }
    } catch (err) {
      showToast(
        `Failed to update tier: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  const handleAddTier = async (newTierData) => {
    try {
      if (isLiveBackendData) {
        const created = await createCustomerTier({
          name: newTierData.name,
          employee_min: 0,
          employee_max: 0,
        })
        const nextTierNum = pricingTiers.length + 1
        const mapped = {
          id: created.id,
          code: `Tier ${nextTierNum}`,
          name: created.name,
          description:
            newTierData.description || 'Enterprise customer tier scale.',
          status: created.status,
        }
        setPricingTiers((prev) => [...prev, mapped])
        showToast(
          `Pricing Tier "${mapped.code} — ${mapped.name}" saved to database.`,
        )
      } else {
        let maxTierNum = 0
        pricingTiers.forEach((t) => {
          const match = t.code.match(/Tier\s*(\d+)/i)
          if (match) {
            const num = parseInt(match[1], 10)
            if (num > maxTierNum) maxTierNum = num
          }
        })
        const nextTierNum =
          maxTierNum > 0 ? maxTierNum + 1 : pricingTiers.length + 1

        const newTier = {
          id: `tier-${Date.now()}`,
          code: `Tier ${nextTierNum}`,
          name: newTierData.name,
          description: newTierData.description || '',
        }
        setPricingTiers((prev) => [...prev, newTier])
        showToast(`Pricing Tier "${newTier.code} — ${newTier.name}" added.`)
      }
    } catch (err) {
      showToast(
        `Failed to add pricing tier: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  const handleDeleteTier = async (tierId) => {
    const tier = pricingTiers.find((t) => t.id === tierId)
    if (!tier) return

    const fieldKey =
      tier.id === 'tier-1'
        ? 'tier1Rate'
        : tier.id === 'tier-2'
        ? 'tier2Rate'
        : tier.id === 'tier-3'
        ? 'tier3Rate'
        : `${tier.id}Rate`

    const hasPackRates = packRates.some(
      (r) =>
        r[fieldKey] !== undefined &&
        r[fieldKey] !== '' &&
        !isNaN(Number(r[fieldKey])) &&
        Number(r[fieldKey]) > 0,
    )
    const hasFeatureRates = featureRates.some(
      (r) =>
        r[fieldKey] !== undefined &&
        r[fieldKey] !== '' &&
        !isNaN(Number(r[fieldKey])) &&
        Number(r[fieldKey]) > 0,
    )

    if (hasPackRates || hasFeatureRates) {
      const confirmed =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(
              `Pricing tier "${tier.code} — ${tier.name}" has configured rate values in the rate card. Deleting it will permanently discard those rates. Do you want to proceed?`,
            )
          : true
      if (!confirmed) return
    } else {
      const confirmed =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(
              `Are you sure you want to delete pricing tier "${tier.code} — ${tier.name}"?`,
            )
          : true
      if (!confirmed) return
    }

    try {
      if (isLiveBackendData && typeof tierId === 'number') {
        await deleteCustomerTier(tierId)
        setPricingTiers((prev) => prev.filter((t) => t.id !== tierId))
        showToast(`Pricing tier "${tier.name}" removed from database.`)
      } else {
        setPricingTiers((prev) => prev.filter((t) => t.id !== tierId))
        showToast(`Pricing tier "${tier.name}" removed.`)
      }
    } catch (err) {
      showToast(
        `Cannot delete tier: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  const handleAddDeploymentModel = async (newModelData) => {
    try {
      if (isLiveBackendData) {
        const code = newModelData.name.toUpperCase().replace(/\s+/g, '_')
        const created = await createDeploymentModel({
          name: newModelData.name,
          code,
          description:
            newModelData.description ||
            'Custom deployment infrastructure architecture.',
        })
        const mapped = {
          id: created.id,
          code: created.code,
          name: created.name,
          description: created.description || '',
        }
        setDeploymentModels((prev) => [...prev, mapped])
        showToast(`Deployment model "${created.name}" saved to database.`)
      } else {
        const newModel = {
          id: `dep-${Date.now()}`,
          code: newModelData.name,
          name: newModelData.name,
          description:
            newModelData.description ||
            'Custom deployment infrastructure architecture.',
        }
        setDeploymentModels((prev) => [...prev, newModel])
        showToast(`Deployment model "${newModel.name}" added.`)
      }
    } catch (err) {
      showToast(
        `Failed to add deployment model: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  const handleAddPricingModel = async (newModelData) => {
    try {
      if (isLiveBackendData) {
        const code = (newModelData.code || newModelData.name)
          .toUpperCase()
          .replace(/\s+/g, '_')
        const created = await createPricingModel({
          name: newModelData.name,
          code,
          description:
            newModelData.description ||
            'Custom commercial pricing structure.',
        })
        const mapped = {
          id: created.id,
          code: created.code,
          name: created.name,
          description: created.description || '',
          unitOfMeasure: 'Configurable',
        }
        setPricingModels((prev) => [...prev, mapped])
        showToast(`Pricing model "${created.name}" saved to database.`)
      } else {
        const code = newModelData.code || newModelData.name
        const newModel = {
          id: `pm-${Date.now()}`,
          code: code,
          name: newModelData.name,
          description:
            newModelData.description ||
            'Custom commercial pricing structure.',
          unitOfMeasure: 'Configurable',
        }
        setPricingModels((prev) => [...prev, newModel])
        showToast(`Pricing model "${newModel.name}" added.`)
      }
    } catch (err) {
      showToast(
        `Failed to add pricing model: ${formatApiError(err)}`,
        'error',
      )
    }
  }

  const handleDeleteDeploymentModel = (id) => {
    const model = deploymentModels.find((m) => m.id === id)
    if (!model) return

    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Deployment Model',
      recordName: model.name,
      recordType: 'deployment model',
      isDeleting: false,
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, isDeleting: true }))
        try {
          if (isLiveBackendData && typeof id === 'number') {
            await deleteDeploymentModel(id)
            setDeploymentModels((prev) => prev.filter((m) => m.id !== id))
            showToast(`Deployment model "${model.name}" removed from database.`)
          } else {
            setDeploymentModels((prev) => prev.filter((m) => m.id !== id))
            showToast(`Deployment model "${model.name}" removed.`)
          }
          setDeleteConfirm({ isOpen: false, title: '', recordName: '', recordType: '', isDeleting: false, onConfirm: null })
        } catch (err) {
          showToast(`Cannot delete deployment model: ${formatApiError(err)}`, 'error')
          setDeleteConfirm((prev) => ({ ...prev, isDeleting: false }))
        }
      },
    })
  }

  const handleDeletePricingModel = (id) => {
    const model = pricingModels.find((pm) => pm.id === id)
    if (!model) return

    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Pricing Model',
      recordName: model.name,
      recordType: 'pricing model',
      isDeleting: false,
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, isDeleting: true }))
        try {
          if (isLiveBackendData && typeof id === 'number') {
            await deletePricingModel(id)
            setPricingModels((prev) => prev.filter((pm) => pm.id !== id))
            showToast(`Pricing model "${model.name}" removed from database.`)
          } else {
            setPricingModels((prev) => prev.filter((pm) => pm.id !== id))
            showToast(`Pricing model "${model.name}" removed.`)
          }
          setDeleteConfirm({ isOpen: false, title: '', recordName: '', recordType: '', isDeleting: false, onConfirm: null })
        } catch (err) {
          showToast(`Cannot delete pricing model: ${formatApiError(err)}`, 'error')
          setDeleteConfirm((prev) => ({ ...prev, isDeleting: false }))
        }
      },
    })
  }

  const handleSaveHourlyRate = async (newRate) => {
    try {
      if (isLiveBackendData) {
        const countryMatch =
          countries.find(
            (c) =>
              c.name.toLowerCase() === newRate.country.toLowerCase() ||
              String(c.id) === String(newRate.country),
          )
        const countryId = requireId(countryMatch?.id, 'Country')

        const created = await createServiceRate({
          country_id: countryId,
          role_name: newRate.serviceLine,
          hourly_rate: parseFloat(newRate.hourlyRate),
          hours_per_day: newRate.standardHoursPerDay || 8,
        })
        const mapped = {
          id: created.id,
          countryId: created.country_id,
          serviceLine: created.role_name,
          country: created.country?.name || countryMatch?.name || '',
          currency:
            created.currency?.code ||
            created.country?.currency?.code ||
            countryMatch?.currency?.code ||
            '',
          hourlyRate: String(created.hourly_rate),
          dailyRate: created.daily_rate != null ? String(created.daily_rate) : null,
          standardHoursPerDay: created.hours_per_day,
        }
        setHourlyRates((prev) => [...prev, mapped])
        showToast(
          `Service rate for "${newRate.serviceLine}" saved to database.`,
        )
      } else {
        showToast('Cannot save service rate: the backend is not available.', 'error')
      }
    } catch (err) {
      showToast(
        `Failed to save hourly rate: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  const handleDeleteHourlyRate = (id) => {
    const hr = hourlyRates.find((h) => h.id === id)
    const name = hr?.serviceLine ? `${hr.serviceLine} (${hr.country || ''})` : 'Service Role'

    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Service Rate',
      recordName: name,
      recordType: 'service rate',
      isDeleting: false,
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, isDeleting: true }))
        try {
          if (isLiveBackendData && typeof id === 'number') {
            await deleteServiceRate(id)
            setHourlyRates((prev) => prev.filter((item) => item.id !== id))
            showToast('Hourly rate removed from database.')
          } else {
            setHourlyRates((prev) => prev.filter((item) => item.id !== id))
            showToast('Hourly rate removed.')
          }
          setDeleteConfirm({ isOpen: false, title: '', recordName: '', recordType: '', isDeleting: false, onConfirm: null })
        } catch (err) {
          showToast(
            `Cannot delete hourly rate: ${err.response?.data?.detail || err.message}`,
            'error',
          )
          setDeleteConfirm((prev) => ({ ...prev, isDeleting: false }))
        }
      },
    })
  }

  const handleUpdateHourlyRate = async (id, updatedFields) => {
    try {
      if (isLiveBackendData && typeof id === 'number') {
        const num = parseFloat(updatedFields.hourlyRate)
        const updated = await updateServiceRate(id, { hourly_rate: num })
        setHourlyRates((prev) =>
          prev.map((hr) =>
            hr.id === id
              ? {
                  ...hr,
                  hourlyRate: String(updated.hourly_rate),
                  dailyRate:
                    updated.daily_rate != null
                      ? String(updated.daily_rate)
                      : hr.dailyRate,
                  standardHoursPerDay: updated.hours_per_day,
                  currency: updated.currency?.code || hr.currency,
                }
              : hr,
          ),
        )
        showToast('Hourly rate updated in database.')
      } else {
        setHourlyRates((prev) =>
          prev.map((hr) => (hr.id === id ? { ...hr, ...updatedFields } : hr)),
        )
        showToast('Hourly rate updated.')
      }
    } catch (err) {
      showToast(
        `Failed to update hourly rate: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  const handleSaveFxRate = async (newFx) => {
    try {
      if (isLiveBackendData) {
        const fromCurr = currenciesList.find(
          (c) => c.code === newFx.sourceCurrency,
        )
        const toCurr = currenciesList.find(
          (c) => c.code === newFx.targetCurrency,
        )
        if (!fromCurr || !toCurr) {
          throw new Error(
            `Currency ${newFx.sourceCurrency} or ${newFx.targetCurrency} not found in database.`,
          )
        }
        const created = await createFxRate({
          from_currency_id: fromCurr.id,
          to_currency_id: toCurr.id,
          rate: parseFloat(newFx.ratePerUnit),
          effective_date: newFx.effectiveDate,
          rate_source: newFx.source,
        })
        const mapped = {
          id: created.id,
          sourceCurrency: created.from_currency?.code || newFx.sourceCurrency,
          targetCurrency: created.to_currency?.code || newFx.targetCurrency,
          ratePerUnit: String(created.rate),
          effectiveDate: String(created.effective_date),
          source: created.rate_source || created.source || newFx.source,
        }
        setExchangeRates((prev) => [...prev, mapped])
        showToast(
          `Exchange rate ${newFx.sourceCurrency}/${newFx.targetCurrency} saved to database.`,
        )
      } else {
        const fxWithId = {
          ...newFx,
          id: newFx.id || `fx-${Date.now()}`,
        }
        setExchangeRates((prev) => [...prev, fxWithId])
        showToast(
          `Exchange rate ${newFx.sourceCurrency}/${newFx.targetCurrency} registered.`,
        )
      }
    } catch (err) {
      showToast(
        `Failed to save FX rate: ${formatApiError(err)}`,
        'error',
      )
    }
  }

  const handleDeleteFxRate = (id) => {
    const fx = exchangeRates.find((f) => f.id === id)
    const name = fx ? `${fx.sourceCurrency}/${fx.targetCurrency}` : 'Exchange Rate'

    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Exchange Rate',
      recordName: name,
      recordType: 'exchange rate',
      isDeleting: false,
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, isDeleting: true }))
        try {
          if (isLiveBackendData && typeof id === 'number') {
            await deleteFxRate(id)
            setExchangeRates((prev) => prev.filter((item) => item.id !== id))
            showToast('Exchange rate removed from database.')
          } else {
            setExchangeRates((prev) => prev.filter((item) => item.id !== id))
            showToast('Exchange rate removed.')
          }
          setDeleteConfirm({ isOpen: false, title: '', recordName: '', recordType: '', isDeleting: false, onConfirm: null })
        } catch (err) {
          showToast(
            `Cannot delete FX rate: ${err.response?.data?.detail || err.message}`,
            'error',
          )
          setDeleteConfirm((prev) => ({ ...prev, isDeleting: false }))
        }
      },
    })
  }

  const handleUpdateRegistryRate = async ({ raw, fixed_fee, unit_rate }) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }

    try {
      const payload = {
        rate_card_version_id: raw.rate_card_version_id,
        country_id: raw.country_id,
        deployment_model_id: raw.deployment_model_id,
        pricing_model_id: raw.pricing_model_id,
        tier_id: raw.tier_id,
        uom_id: raw.uom_id,
        currency_id: raw.currency_id,
        pack_version_id: raw.pack_version_id || null,
        feature_id: raw.feature_id || null,
        fixed_fee: fixed_fee != null ? fixed_fee : raw.fixed_fee,
        unit_rate: unit_rate != null ? unit_rate : raw.unit_rate,
      }

      await upsertRateCard(payload)

      // Refresh list to sync live state
      const refreshed = await getRateCards({ rate_card_version_id: activeVersion?.id })
      setRawRateCards(Array.isArray(refreshed) ? refreshed : [])
      processRateCards(refreshed, pricingTiers, deploymentModels, pricingModels, packs, features, products)
      showToast('Rate card record updated.')
    } catch (err) {
      showToast(`Failed to update rate card: ${formatApiError(err)}`, 'error')
    }
  }

  return (
    <div className="h-screen h-[100dvh] max-h-screen flex flex-col bg-slate-100 text-slate-800 overflow-hidden">
      {/* 1. Dark Navy Top Navigation */}
      <div className="shrink-0">
        <CatalogueTopNav activeSection="rate-cards" />
      </div>

      {/* 2. White Commercial Master Summary Strip */}

      {/* 3. Live Database Status Strip */}
      {isLoading && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-1 text-xs text-blue-700 flex items-center justify-between shrink-0">
          <span className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            Loading rate cards…
          </span>
        </div>
      )}

      {apiError && !isLoading && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1 text-xs text-amber-800 flex items-center justify-between shrink-0">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            Backend offline: {apiError}. Changes will apply to current local state.
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            className="font-semibold text-amber-900 underline hover:text-amber-950 cursor-pointer text-[11px]"
          >
            Reconnect
          </button>
        </div>
      )}

      {isLiveBackendData && !isLoading && (
        <div
          className={`border-b px-4 py-1 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0 ${
            isVersionLocked
              ? 'bg-amber-50/90 border-amber-300 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span className="flex items-center gap-2">
            {isVersionLocked ? (
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            ) : (
              <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
            <span>
              Connected · Rate card ({activeVersion?.version_no || 'RC-DEV-1'})
              {isVersionLocked ? (
                <span className="ml-1.5 font-semibold text-amber-800">
                  [RETIRED / LOCKED] — Historical pricing snapshot is protected against modifications.
                </span>
              ) : (
                '. All modifications persist directly to the database.'
              )}
            </span>
          </span>

          <div className="flex items-center gap-2.5">
            {versionsList.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="rate-card-version-select"
                  className="text-[11px] font-semibold text-slate-700"
                >
                  Version:
                </label>
                <select
                  id="rate-card-version-select"
                  aria-label="Rate Card Version"
                  value={activeVersion?.id || ''}
                  onChange={(e) => handleSelectVersion(Number(e.target.value))}
                  className="text-xs font-semibold py-0.5 px-2 bg-white border border-slate-300 rounded shadow-2xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500 text-slate-800"
                >
                  {versionsList.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.version_no} ({v.status})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={handleRefresh}
              title="Refresh database records"
              className={`flex items-center gap-1 font-semibold cursor-pointer text-[11px] ${
                isVersionLocked
                  ? 'text-amber-900 hover:text-amber-950'
                  : 'text-emerald-800 hover:text-emerald-950'
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile/Tablet Column Selector (< lg) */}
      <div className="lg:hidden flex items-center justify-between px-3 py-1.5 bg-white border-b border-slate-200 shrink-0 text-xs">
        <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Workspace:</span>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 font-semibold">
          <button
            type="button"
            onClick={() => setMobileView('products')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              mobileView === 'products' ? 'bg-white text-orange-600 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Families
          </button>
          <button
            type="button"
            onClick={() => setMobileView('center')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              mobileView === 'center' ? 'bg-white text-orange-600 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rate Matrix
          </button>
          <button
            type="button"
            onClick={() => setMobileView('masters')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              mobileView === 'masters' ? 'bg-white text-orange-600 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Master Data
          </button>
        </div>
      </div>

      {/* 4. Main Workspace: Three-Column Professional Workspace */}
      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden w-full relative">
        {/* Left Column: Products & Families (Fixed Left in Workspace, Internal Scroll) */}
        <RateCardProductsSidebar
          families={families}
          products={products}
          selectedFamilyId={selectedFamilyId}
          onSelectFamily={(famId) => {
            setSelectedFamilyId(famId)
            if (window.innerWidth < 1024) {
              setMobileView('center')
            }
          }}
          onOpenAddProduct={() => setIsAddProductOpen(true)}
          className={`${mobileView === 'products' ? 'flex' : 'hidden'} lg:flex`}
        />

        {/* Center Column: Deployment / Pricing Model / Rates Editor (Independently Scrolls) */}
        <RateCardCenterEditor
          apiError={apiError}
          selectedDeployment={selectedDeployment}
          onChangeDeployment={setSelectedDeployment}
          deploymentModels={deploymentModels}
          selectedPricingModel={selectedPricingModel}
          onChangePricingModel={setSelectedPricingModel}
          pricingModels={pricingModels}
          deploymentPricingOptions={deploymentPricingOptions}
          pricingTiers={pricingTiers}
          selectedCountryId={selectedCountryId}
          onChangeCountry={setSelectedCountryId}
          countries={countries}
          selectedFamilyId={selectedFamilyId}
          families={families}
          onClearFamilyFilter={() => setSelectedFamilyId('all')}
          isVersionLocked={isVersionLocked}
          // Versions
          versionsList={versionsList}
          activeVersion={activeVersion}
          onSelectVersion={handleSelectVersion}
          // Service Rates
          serviceRates={hourlyRates}
          onUpdateServiceRate={handleUpdateHourlyRate}
          onDeleteServiceRate={handleDeleteHourlyRate}
          onOpenAddServiceRate={() => setIsAddHourlyOpen(true)}
          // PEPM Rates
          packRates={packRates}
          packs={packs}
          features={features}
          onUpdatePackRate={handleUpdatePackRate}
          onRemovePackRate={handleRemovePackRate}
          onOpenAddPackRate={(famId) => {
            setModalFamilyId(famId || null)
            setIsAddPackRateOpen(true)
          }}
          featureRates={featureRates}
          onUpdateFeatureRate={handleUpdateFeatureRate}
          onRemoveFeatureRate={handleRemoveFeatureRate}
          onOpenAddFeatureRate={(famId) => {
            setModalFamilyId(famId || null)
            setIsAddFeatureRateOpen(true)
          }}
          // Platform + Subscription
          allowedUoms={allowedUoms}
          onUpdatePackPlatformRate={(id, change) => handleUpdatePlatformRate('pack', id, change)}
          onUpdateFeaturePlatformRate={(id, change) => handleUpdatePlatformRate('feature', id, change)}
          // Full Registry Table Data & Handlers
          rawRateCards={rawRateCards}
          onUpdateRegistryRate={handleUpdateRegistryRate}
          onRefreshRegistry={handleRefresh}
          className={`${mobileView === 'center' ? 'flex' : 'hidden'} lg:flex`}
        />

        {/* Right Column: Master Data Panels (Fixed Right in Workspace, Internal Scroll) */}
        <RateCardMasterPanels
          countries={countries}
          onOpenAddCountry={() => setIsAddCountryOpen(true)}
          onDeleteCountry={handleDeleteCountry}
          onUpdateCountry={handleUpdateCountry}
          pricingTiers={pricingTiers}
          onUpdateTier={handleUpdateTier}
          onAddTier={handleAddTier}
          onDeleteTier={handleDeleteTier}
          deploymentModels={deploymentModels}
          onAddDeploymentModel={handleAddDeploymentModel}
          onDeleteDeploymentModel={handleDeleteDeploymentModel}
          pricingModels={pricingModels}
          onAddPricingModel={handleAddPricingModel}
          onDeletePricingModel={handleDeletePricingModel}
          hourlyRates={hourlyRates}
          onOpenAddHourlyRate={() => setIsAddHourlyOpen(true)}
          onDeleteHourlyRate={handleDeleteHourlyRate}
          onUpdateHourlyRate={handleUpdateHourlyRate}
          exchangeRates={exchangeRates}
          onOpenAddFxRate={() => setIsAddFxOpen(true)}
          onDeleteFxRate={handleDeleteFxRate}
          // Coverage inputs
          families={families}
          packRates={packRates}
          featureRates={featureRates}
          className={`${mobileView === 'masters' ? 'flex' : 'hidden'} lg:flex`}
        />
      </div>

      {/* Toast Notification */}
      {toast.message && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium border animate-fade-in flex items-center gap-2 ${
            toast.type === 'error'
              ? 'bg-rose-900 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              toast.type === 'error' ? 'bg-rose-400' : 'bg-emerald-400'
            }`}
          />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Modals */}
      <AddProductModal
        isOpen={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
        onSave={handleSaveNewProduct}
        families={families}
        selectedFamilyId={selectedFamilyId}
      />

      <AddCountryModal
        isOpen={isAddCountryOpen}
        onClose={() => setIsAddCountryOpen(false)}
        onSave={handleSaveCountry}
        existingCountries={countries}
      />

      <AddHourlyRateModal
        isOpen={isAddHourlyOpen}
        onClose={() => setIsAddHourlyOpen(false)}
        onSave={handleSaveHourlyRate}
        countries={countries}
      />

      <AddFxRateModal
        isOpen={isAddFxOpen}
        onClose={() => setIsAddFxOpen(false)}
        onSave={handleSaveFxRate}
        currencies={
          currenciesList.length > 0
            ? currenciesList.map((c) => c.code)
            : countries.map((c) => c.currency)
        }
      />

      <AddPackRateModal
        isOpen={isAddPackRateOpen}
        onClose={() => {
          setIsAddPackRateOpen(false)
          setModalFamilyId(null)
        }}
        onSave={handleSavePackRate}
        packs={packs}
        pricingTiers={pricingTiers}
        targetFamilyId={modalFamilyId}
        families={families}
        activeDeployment={selectedDeployment}
        activePricing={selectedPricingModel}
        layout={rateLayout}
        uoms={allowedUoms.length > 0 ? allowedUoms : uoms}
        lockedUomId={activePricingModelObj?.uomLockedId || null}
        activeCurrencySymbol={activeCurrencySymbol}
      />

      <AddFeatureRateModal
        isOpen={isAddFeatureRateOpen}
        onClose={() => {
          setIsAddFeatureRateOpen(false)
          setModalFamilyId(null)
        }}
        onSave={handleSaveFeatureRate}
        features={features}
        products={products}
        pricingTiers={pricingTiers}
        targetFamilyId={modalFamilyId}
        families={families}
        activeDeployment={selectedDeployment}
        activePricing={selectedPricingModel}
        layout={rateLayout}
        uoms={allowedUoms.length > 0 ? allowedUoms : uoms}
        lockedUomId={activePricingModelObj?.uomLockedId || null}
        activeCurrencySymbol={activeCurrencySymbol}
      />

      <DeleteRateCardConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title={deleteConfirm.title}
        recordName={deleteConfirm.recordName}
        recordType={deleteConfirm.recordType}
        isDeleting={deleteConfirm.isDeleting}
        onClose={() => {
          if (!deleteConfirm.isDeleting) {
            setDeleteConfirm((prev) => ({ ...prev, isOpen: false, onConfirm: null }))
          }
        }}
        onConfirm={deleteConfirm.onConfirm}
      />
    </div>
  )
}

export default RateCardPage
