import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, AlertCircle, Database, RefreshCw, ShieldAlert } from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { SummaryStrip } from '../catalogue/SummaryStrip'
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
} from '../../api/ratesApi'

import {
  getCatalogueFamilies,
  getCatalogueProducts,
  getCatalogueFeatures,
} from '../../api/catalogueApi'

import { getPacks } from '../../api/packsApi'

// Initial Datasets (Used as offline fallback)
import {
  INITIAL_PRODUCT_FAMILIES,
  INITIAL_PRODUCTS,
} from '../../data/catalogueData'
import { INITIAL_PACKS } from '../../data/packsData'
import {
  INITIAL_COUNTRIES,
  INITIAL_PRICING_TIERS,
  DEPLOYMENT_MODELS,
  PRICING_MODELS,
  INITIAL_HOURLY_RATES,
  INITIAL_EXCHANGE_RATES,
  INITIAL_PACK_RATES,
  INITIAL_FEATURE_RATES,
  SPREADSHEET_DEMO_PLATFORM_CONFIG,
} from '../../data/rateCardData'

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
  const [families, setFamilies] = useState(INITIAL_PRODUCT_FAMILIES)
  const [products, setProducts] = useState(INITIAL_PRODUCTS)
  const [features, setFeatures] = useState([])
  const [packs, setPacks] = useState(INITIAL_PACKS)

  // 2. Master Data Catalogs
  const [countries, setCountries] = useState(INITIAL_COUNTRIES)
  const [pricingTiers, setPricingTiers] = useState(INITIAL_PRICING_TIERS)
  const [deploymentModels, setDeploymentModels] = useState(DEPLOYMENT_MODELS)
  const [pricingModels, setPricingModels] = useState(PRICING_MODELS)
  const [hourlyRates, setHourlyRates] = useState(INITIAL_HOURLY_RATES)
  const [exchangeRates, setExchangeRates] = useState(INITIAL_EXCHANGE_RATES)
  const [currenciesList, setCurrenciesList] = useState([])
  const [deploymentPricingOptions, setDeploymentPricingOptions] = useState([])

  // 3. Rate Card Lifecycle & Versions
  const [versionsList, setVersionsList] = useState([])
  const [activeVersion, setActiveVersion] = useState(null)
  const isVersionLocked = activeVersion?.status === 'retired'

  // 4. Selection Contexts
  const [selectedFamilyId, setSelectedFamilyId] = useState('all')
  const [modalFamilyId, setModalFamilyId] = useState(null)
  const [selectedDeployment, setSelectedDeployment] = useState('Shared Cloud')
  const [selectedPricingModel, setSelectedPricingModel] = useState('PEPM')
  const [selectedCountryId, setSelectedCountryId] = useState('c-in')

  // 5. Rate Cards State (Independent state for PEPM & Platform Subscription)
  const [packRates, setPackRates] = useState(INITIAL_PACK_RATES)
  const [featureRates, setFeatureRates] = useState(INITIAL_FEATURE_RATES)
  const [platformConfig, setPlatformConfig] = useState(SPREADSHEET_DEMO_PLATFORM_CONFIG)

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
            name: 'Shared Cloud',
            id: rc.deployment_model_id,
          }
        const pmObj =
          pricingModelsList.find((p) => p.id === rc.pricing_model_id) || {
            code: 'PEPM',
            name: 'PEPM',
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
            'all'
          const groupKey = `${rc.pack_version_id}-${rc.country_id}-${rc.deployment_model_id}-${rc.pricing_model_id}`
          if (!livePackRatesMap.has(groupKey)) {
            livePackRatesMap.set(groupKey, {
              id: `pr-db-${rc.id}`,
              packId: packObj?.id || rc.pack_version?.pack_id || rc.pack_version_id,
              packVersionId: rc.pack_version_id,
              packCode: packObj?.code || rc.pack_version?.pack?.code || `PACK-V${rc.pack_version_id}`,
              packName: packObj?.name || rc.pack_version?.pack?.name || `Pack Version ${rc.pack_version_id}`,
              familyId: familyId,
              items: packObj?.items || [],
              deploymentModel: depObj.name,
              deploymentModelId: rc.deployment_model_id,
              pricingModel: pmObj.code,
              pricingModelId: rc.pricing_model_id,
              countryId: rc.country_id,
              unitOfMeasure: 'Active Employees (with ESS)',
              tier1Rate: '',
              tier2Rate: '',
              tier3Rate: '',
            })
          }
          const row = livePackRatesMap.get(groupKey)
          const tierIdx = tiersList.findIndex((t) => t.id === rc.tier_id)
          const rateVal = String(rc.unit_rate ?? '')
          const fixedVal = String(rc.fixed_fee ?? '')
          if (tierIdx === 0) {
            row.tier1Rate = rateVal
            row.fixed_tier1Rate = fixedVal
          } else if (tierIdx === 1) {
            row.tier2Rate = rateVal
            row.fixed_tier2Rate = fixedVal
          } else if (tierIdx === 2) {
            row.tier3Rate = rateVal
            row.fixed_tier3Rate = fixedVal
          } else if (rc.tier_id === 1) {
            row.tier1Rate = rateVal
            row.fixed_tier1Rate = fixedVal
          } else if (rc.tier_id === 2) {
            row.tier2Rate = rateVal
            row.fixed_tier2Rate = fixedVal
          } else if (rc.tier_id === 3) {
            row.tier3Rate = rateVal
            row.fixed_tier3Rate = fixedVal
          }
          row[`tier_${rc.tier_id}`] = rateVal
          row[`${rc.tier_id}Rate`] = rateVal
          row[rc.tier_id] = rateVal
          row[`fixed_tier_${rc.tier_id}`] = fixedVal
          row[`fixed_${rc.tier_id}Rate`] = fixedVal
        } else if (rc.feature_id) {
          const featObj = (featuresList || []).find((f) => f.id === rc.feature_id)
          const prodObj = (productsList || []).find(
            (p) => p.id === featObj?.product_id || p.id === rc.feature?.product_id,
          )
          const familyId =
            prodObj?.product_family_id ||
            prodObj?.familyId ||
            featObj?.familyId ||
            featObj?.product_family_id ||
            'all'
          const groupKey = `${rc.feature_id}-${rc.country_id}-${rc.deployment_model_id}-${rc.pricing_model_id}`
          if (!liveFeatureRatesMap.has(groupKey)) {
            liveFeatureRatesMap.set(groupKey, {
              id: `fr-db-${rc.id}`,
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
              unitOfMeasure: 'Active Employees (with ESS)',
              tier1Rate: '',
              tier2Rate: '',
              tier3Rate: '',
            })
          }
          const row = liveFeatureRatesMap.get(groupKey)
          const tierIdx = tiersList.findIndex((t) => t.id === rc.tier_id)
          const rateVal = String(rc.unit_rate ?? '')
          const fixedVal = String(rc.fixed_fee ?? '')
          if (tierIdx === 0) {
            row.tier1Rate = rateVal
            row.fixed_tier1Rate = fixedVal
          } else if (tierIdx === 1) {
            row.tier2Rate = rateVal
            row.fixed_tier2Rate = fixedVal
          } else if (tierIdx === 2) {
            row.tier3Rate = rateVal
            row.fixed_tier3Rate = fixedVal
          } else if (rc.tier_id === 1) {
            row.tier1Rate = rateVal
            row.fixed_tier1Rate = fixedVal
          } else if (rc.tier_id === 2) {
            row.tier2Rate = rateVal
            row.fixed_tier2Rate = fixedVal
          } else if (rc.tier_id === 3) {
            row.tier3Rate = rateVal
            row.fixed_tier3Rate = fixedVal
          }
          row[`tier_${rc.tier_id}`] = rateVal
          row[`${rc.tier_id}Rate`] = rateVal
          row[rc.tier_id] = rateVal
          row[`fixed_tier_${rc.tier_id}`] = fixedVal
          row[`fixed_${rc.tier_id}Rate`] = fixedVal
        }
      })

      if (livePackRatesMap.size > 0) {
        setPackRates(Array.from(livePackRatesMap.values()))
      } else {
        setPackRates([])
      }
      if (liveFeatureRatesMap.size > 0) {
        setFeatureRates(Array.from(liveFeatureRatesMap.values()))
      } else {
        setFeatureRates([])
      }

      // Check for Platform + Subscription rate cards to initialize platformConfig
      const platCards = cards.filter((rc) => {
        const pmObj = pricingModelsList.find((p) => p.id === rc.pricing_model_id)
        const isPlat =
          pmObj?.code === 'platform_subscription' ||
          pmObj?.code === 'Platform Subscription' ||
          (pmObj?.name || '').includes('Platform')
        return isPlat || rc.fixed_fee != null
      })

      if (platCards.length > 0) {
        setPlatformConfig((prev) => {
          const next = { ...prev }
          platCards.forEach((rc) => {
            const tierIdx = tiersList.findIndex((t) => t.id === rc.tier_id)
            const tierKey =
              tierIdx === 0
                ? 'tier1'
                : tierIdx === 1
                ? 'tier2'
                : tierIdx === 2
                ? 'tier3'
                : `tier${rc.tier_id}`
            if (next[tierKey]) {
              next[tierKey] = {
                ...next[tierKey],
                annualPlatformFee:
                  rc.fixed_fee != null
                    ? String(rc.fixed_fee)
                    : next[tierKey].annualPlatformFee,
                monthlySubscriptionFee:
                  rc.unit_rate != null
                    ? String(rc.unit_rate)
                    : next[tierKey].monthlySubscriptionFee,
              }
            }
          })
          return next
        })
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
        const mappedCountries = backendCountries.map((c) => ({
          id: c.id,
          code: c.iso_code,
          name: c.name,
          currency: c.currency?.code || 'USD',
          symbol: c.currency?.symbol || '$',
          defaultCurrencyId: c.default_currency_id,
          is_active: c.is_active,
        }))
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
            unitOfMeasure: 'Active Employees (with ESS)',
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
            currency: sr.currency?.code || sr.country?.currency?.code || 'USD',
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
            sourceCurrency: fx.from_currency?.code || 'USD',
            targetCurrency: fx.to_currency?.code || 'INR',
            ratePerUnit: String(fx.rate),
            effectiveDate: String(fx.effective_date),
            source: fx.source || 'Corporate Treasury',
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
            const latestVer = bp.pack_versions?.[0] || bp.versions?.[0]
            const rawItems = latestVer?.pack_items || []
            const mappedItems = rawItems.map((it) => ({
              id: it.id,
              feature_id: it.feature_id,
              is_required: it.is_required !== false,
              feature: it.feature,
              name: it.feature?.name || `Feature ${it.feature_id}`,
              code: it.feature?.code,
            }))
            return {
              id: bp.id,
              packId: bp.id,
              code: bp.code,
              name: bp.name,
              familyId: bp.product_family_id,
              product_family_id: bp.product_family_id,
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
          processRateCards(
            backendRateCards,
            mappedTiers,
            mappedDeployments,
            mappedPricingModels,
            mappedPacks.length > 0 ? mappedPacks : packs,
            backendFeatures,
            backendProducts,
          )
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

    setPackRates((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
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
        let tierId = 1
        const cleanField = String(field).replace(/^fixed_/, '')
        if (cleanField === 'tier1Rate' || cleanField === '1Rate') {
          tierId = pricingTiers[0]?.id || 1
        } else if (cleanField === 'tier2Rate' || cleanField === '2Rate') {
          tierId = pricingTiers[1]?.id || 2
        } else if (cleanField === 'tier3Rate' || cleanField === '3Rate') {
          tierId = pricingTiers[2]?.id || 3
        } else {
          const m1 = cleanField.match(/^tier_(\d+)$/)
          const m2 = cleanField.match(/^(\d+)Rate$/)
          if (m1) tierId = parseInt(m1[1], 10)
          else if (m2) tierId = parseInt(m2[1], 10)
          else if (!isNaN(parseInt(cleanField, 10))) tierId = parseInt(cleanField, 10)
        }

        const activeCountryObj =
          countries.find((c) => c.id === selectedCountryId) || countries[0]
        const activeCountryId =
          typeof activeCountryObj?.id === 'number' ? activeCountryObj.id : 1
        const countryIdToPersist =
          typeof rateRow.countryId === 'number' ? rateRow.countryId : activeCountryId

        const payload = {
          rate_card_version_id: activeVersion?.id || 1,
          country_id: countryIdToPersist,
          deployment_model_id: rateRow.deploymentModelId || 1,
          pricing_model_id: rateRow.pricingModelId || 1,
          tier_id: tierId,
          pack_version_id: rateRow.packVersionId,
        }
        if (isFixedField) {
          payload.fixed_fee = parseFloat(value) || 0
          const existingUnit = rateRow[`tier_${tierId}`] ?? rateRow[`tier${tierId}Rate`]
          if (existingUnit !== undefined && existingUnit !== '') {
            payload.unit_rate = parseFloat(existingUnit) || 0
          }
        } else {
          payload.unit_rate = parseFloat(value) || 0
          const existingFixed = rateRow[`fixed_tier_${tierId}`] ?? rateRow[`fixed_tier${tierId}Rate`]
          if (existingFixed !== undefined && existingFixed !== '') {
            payload.fixed_fee = parseFloat(existingFixed) || 0
          }
        }

        await upsertRateCard(payload)
        showToast('Rate updated in PostgreSQL database.')
      } catch (err) {
        showToast(
          `Failed to persist rate: ${formatApiError(err)}`,
          'error',
        )
      }
    }, 600)
  }

  const handleRemovePackRate = async (id) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }

    const rate = packRates.find((r) => r.id === id)
    try {
      if (isLiveBackendData && rate?.packVersionId) {
        const activeCountryObj =
          countries.find((c) => c.id === selectedCountryId) || countries[0]
        const activeCountryId =
          typeof activeCountryObj?.id === 'number' ? activeCountryObj.id : 1
        const depId = rate.deploymentModelId || 1
        const pmId = rate.pricingModelId || 1
        const versionId = activeVersion?.id || 1

        await deleteRateCardGroup({
          rate_card_version_id: versionId,
          country_id: activeCountryId,
          deployment_model_id: depId,
          pricing_model_id: pmId,
          pack_version_id: rate.packVersionId,
        })
        setPackRates((prev) => prev.filter((r) => r.id !== id))
        showToast('Pack rate removed from database.')
      } else {
        setPackRates((prev) => prev.filter((r) => r.id !== id))
        showToast('Pack rate removed.')
      }
    } catch (err) {
      showToast(
        `Failed to remove pack rate: ${formatApiError(err)}`,
        'error',
      )
    }
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
          countries.find((c) => c.id === selectedCountryId) || countries[0]
        const activeCountryId =
          typeof activeCountryObj?.id === 'number' ? activeCountryObj.id : 1

        const activeDepObj =
          deploymentModels.find(
            (d) => d.name === (newRate.deploymentModel || selectedDeployment),
          ) || deploymentModels[0]
        const depId = typeof activeDepObj?.id === 'number' ? activeDepObj.id : 1

        const activePmObj =
          pricingModels.find(
            (p) => p.code === (newRate.pricingModel || selectedPricingModel),
          ) || pricingModels[0]
        const pmId = typeof activePmObj?.id === 'number' ? activePmObj.id : 1

        const packObj = packs.find(
          (p) => p.id === newRate.packId || p.packId === newRate.packId,
        )
        const packVersionId =
          packObj?.latestVersionId || packObj?.versions?.[0]?.id || 38

        const versionId = activeVersion?.id || 1

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
            const tierId = typeof entry.tier.id === 'number' ? entry.tier.id : 1
            await upsertRateCard({
              rate_card_version_id: versionId,
              country_id: activeCountryId,
              deployment_model_id: depId,
              pricing_model_id: pmId,
              tier_id: tierId,
              pack_version_id: packVersionId,
              unit_rate: parseFloat(entry.rate) || 0,
            })
          }
        }

        const rateWithId = {
          id: `pr-${newRate.packId}-${depId}-${pmId}`,
          packId: newRate.packId,
          packVersionId,
          packCode: newRate.packCode,
          packName: newRate.packName,
          familyId: newRate.familyId,
          items: packObj?.items || [],
          deploymentModel: activeDepObj.name,
          deploymentModelId: depId,
          pricingModel: activePmObj.code,
          pricingModelId: pmId,
          countryId: activeCountryId,
          unitOfMeasure: newRate.uom || newRate.unitOfMeasure || 'Active Employees (with ESS)',
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
        setPackRates((prev) => [...prev, rateWithId])
        showToast(
          `Pack rate for "${newRate.packName}" saved to PostgreSQL database.`,
        )
      } else {
        const rateWithId = {
          ...newRate,
          id: newRate.id || `pr-${Date.now()}`,
        }
        setPackRates((prev) => [...prev, rateWithId])
        showToast(`Pack rate for "${newRate.packName}" configured.`)
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

    setFeatureRates((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    )

    if (!isLiveBackendData) return

    const timerKey = `feat-${id}-${field}`
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey])
    }

    debounceTimers.current[timerKey] = setTimeout(async () => {
      try {
        const rateRow = featureRates.find((r) => r.id === id)
        if (!rateRow || !rateRow.featureId) return

        const isFixedField = String(field).toLowerCase().includes('fixed')
        let tierId = 1
        const cleanField = String(field).replace(/^fixed_/, '')
        if (cleanField === 'tier1Rate' || cleanField === '1Rate') {
          tierId = pricingTiers[0]?.id || 1
        } else if (cleanField === 'tier2Rate' || cleanField === '2Rate') {
          tierId = pricingTiers[1]?.id || 2
        } else if (cleanField === 'tier3Rate' || cleanField === '3Rate') {
          tierId = pricingTiers[2]?.id || 3
        } else {
          const m1 = cleanField.match(/^tier_(\d+)$/)
          const m2 = cleanField.match(/^(\d+)Rate$/)
          if (m1) tierId = parseInt(m1[1], 10)
          else if (m2) tierId = parseInt(m2[1], 10)
          else if (!isNaN(parseInt(cleanField, 10))) tierId = parseInt(cleanField, 10)
        }

        const activeCountryObj =
          countries.find((c) => c.id === selectedCountryId) || countries[0]
        const activeCountryId =
          typeof activeCountryObj?.id === 'number' ? activeCountryObj.id : 1
        const countryIdToPersist =
          typeof rateRow.countryId === 'number' ? rateRow.countryId : activeCountryId

        const payload = {
          rate_card_version_id: activeVersion?.id || 1,
          country_id: countryIdToPersist,
          deployment_model_id: rateRow.deploymentModelId || 1,
          pricing_model_id: rateRow.pricingModelId || 1,
          tier_id: tierId,
          feature_id: rateRow.featureId,
        }
        if (isFixedField) {
          payload.fixed_fee = parseFloat(value) || 0
          const existingUnit = rateRow[`tier_${tierId}`] ?? rateRow[`tier${tierId}Rate`]
          if (existingUnit !== undefined && existingUnit !== '') {
            payload.unit_rate = parseFloat(existingUnit) || 0
          }
        } else {
          payload.unit_rate = parseFloat(value) || 0
          const existingFixed = rateRow[`fixed_tier_${tierId}`] ?? rateRow[`fixed_tier${tierId}Rate`]
          if (existingFixed !== undefined && existingFixed !== '') {
            payload.fixed_fee = parseFloat(existingFixed) || 0
          }
        }

        await upsertRateCard(payload)
        showToast('Feature rate updated in PostgreSQL database.')
      } catch (err) {
        showToast(
          `Failed to persist feature rate: ${formatApiError(err)}`,
          'error',
        )
      }
    }, 600)
  }

  const handleRemoveFeatureRate = async (id) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }

    const rate = featureRates.find((r) => r.id === id)
    try {
      if (isLiveBackendData && rate?.featureId) {
        const activeCountryObj =
          countries.find((c) => c.id === selectedCountryId) || countries[0]
        const activeCountryId =
          typeof activeCountryObj?.id === 'number' ? activeCountryObj.id : 1
        const depId = rate.deploymentModelId || 1
        const pmId = rate.pricingModelId || 1
        const versionId = activeVersion?.id || 1

        await deleteRateCardGroup({
          rate_card_version_id: versionId,
          country_id: activeCountryId,
          deployment_model_id: depId,
          pricing_model_id: pmId,
          feature_id: rate.featureId,
        })
        setFeatureRates((prev) => prev.filter((r) => r.id !== id))
        showToast('Feature rate removed from database.')
      } else {
        setFeatureRates((prev) => prev.filter((r) => r.id !== id))
        showToast('Feature rate removed.')
      }
    } catch (err) {
      showToast(
        `Failed to remove feature rate: ${formatApiError(err)}`,
        'error',
      )
    }
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
          countries.find((c) => c.id === selectedCountryId) || countries[0]
        const activeCountryId =
          typeof activeCountryObj?.id === 'number' ? activeCountryObj.id : 1

        const activeDepObj =
          deploymentModels.find(
            (d) => d.name === (newRate.deploymentModel || selectedDeployment),
          ) || deploymentModels[0]
        const depId = typeof activeDepObj?.id === 'number' ? activeDepObj.id : 1

        const activePmObj =
          pricingModels.find(
            (p) => p.code === (newRate.pricingModel || selectedPricingModel),
          ) || pricingModels[0]
        const pmId = typeof activePmObj?.id === 'number' ? activePmObj.id : 1

        const featureId = typeof newRate.featureId === 'number' ? newRate.featureId : 52
        const versionId = activeVersion?.id || 1

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
            const tierId = typeof entry.tier.id === 'number' ? entry.tier.id : 1
            await upsertRateCard({
              rate_card_version_id: versionId,
              country_id: activeCountryId,
              deployment_model_id: depId,
              pricing_model_id: pmId,
              tier_id: tierId,
              feature_id: featureId,
              unit_rate: parseFloat(entry.rate) || 0,
            })
          }
        }

        const rateWithId = {
          id: `fr-${featureId}-${depId}-${pmId}`,
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
          unitOfMeasure: newRate.uom || newRate.unitOfMeasure || 'Active Employees (with ESS)',
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
        setFeatureRates((prev) => [...prev, rateWithId])
        showToast(
          `Feature rate for "${newRate.featureName}" saved to PostgreSQL database.`,
        )
      } else {
        const rateWithId = {
          ...newRate,
          id: newRate.id || `fr-${Date.now()}`,
        }
        setFeatureRates((prev) => [...prev, rateWithId])
        showToast(`Feature rate for "${newRate.featureName}" configured.`)
      }
    } catch (err) {
      showToast(
        `Failed to save feature rate: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  const handleChangePlatformConfig = (tierKey, fieldKey, value) => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }

    setPlatformConfig((prev) => {
      const updatedTier = {
        ...prev[tierKey],
        [fieldKey]: value,
      }
      const updatedConfig = {
        ...prev,
        [tierKey]: updatedTier,
      }

      if (isLiveBackendData) {
        const timerKey = `plat-${tierKey}-${fieldKey}`
        if (debounceTimers.current[timerKey]) {
          clearTimeout(debounceTimers.current[timerKey])
        }
        debounceTimers.current[timerKey] = setTimeout(async () => {
          try {
            const activeCountryObj =
              countries.find((c) => c.id === selectedCountryId) || countries[0]
            const activeCountryId =
              typeof activeCountryObj?.id === 'number' ? activeCountryObj.id : 1

            const activeDepObj =
              deploymentModels.find(
                (d) => d.name === selectedDeployment || d.code === selectedDeployment,
              ) || deploymentModels[0]
            const depId = typeof activeDepObj?.id === 'number' ? activeDepObj.id : 1

            const platPm =
              pricingModels.find(
                (p) =>
                  p.code === 'platform_subscription' ||
                  p.code === selectedPricingModel ||
                  (p.name || '').toLowerCase().includes('platform'),
              ) || pricingModels[0]
            const pmId = typeof platPm?.id === 'number' ? platPm.id : 2

            let tierId = 1
            if (tierKey === 'tier1') tierId = pricingTiers[0]?.id || 1
            else if (tierKey === 'tier2') tierId = pricingTiers[1]?.id || 2
            else if (tierKey === 'tier3') tierId = pricingTiers[2]?.id || 3

            const packObj = packs[0]
            const packVersionId =
              packObj?.latestVersionId || packObj?.versions?.[0]?.id || 38

            await upsertRateCard({
              rate_card_version_id: activeVersion?.id || 1,
              country_id: activeCountryId,
              deployment_model_id: depId,
              pricing_model_id: pmId,
              tier_id: tierId,
              pack_version_id: packVersionId,
              fixed_fee: parseFloat(updatedTier.annualPlatformFee) || 0,
              unit_rate: parseFloat(updatedTier.monthlySubscriptionFee) || 0,
            })
            showToast('Platform Subscription rate updated in PostgreSQL database.')
          } catch (err) {
            showToast(
              `Failed to persist platform rate: ${formatApiError(err)}`,
              'error',
            )
          }
        }, 600)
      }

      return updatedConfig
    })
  }

  const handleResetPlatformDemo = () => {
    if (isVersionLocked) {
      showToast(
        `Rate card version "${activeVersion?.version_no}" is retired and protected against modifications.`,
        'error',
      )
      return
    }
    setPlatformConfig(SPREADSHEET_DEMO_PLATFORM_CONFIG)
    showToast('Platform Subscription values reset to Excel demonstration preset.')
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
        showToast(`Country "${created.name}" registered in PostgreSQL database.`)
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

  const handleDeleteCountry = async (id) => {
    try {
      if (isLiveBackendData && typeof id === 'number') {
        await deleteCountry(id)
        setCountries((prev) => prev.filter((c) => c.id !== id))
        showToast('Country removed from database.')
      } else {
        setCountries((prev) => prev.filter((c) => c.id !== id))
        showToast('Country removed from master catalog.')
      }
    } catch (err) {
      showToast(
        `Cannot delete country: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
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

  const handleDeleteDeploymentModel = async (id) => {
    const model = deploymentModels.find((m) => m.id === id)
    if (!model) return
    const confirmed =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`Are you sure you want to remove deployment model "${model.name}"?`)
        : true
    if (!confirmed) return

    try {
      if (isLiveBackendData && typeof id === 'number') {
        await deleteDeploymentModel(id)
        setDeploymentModels((prev) => prev.filter((m) => m.id !== id))
        showToast(`Deployment model "${model.name}" removed from database.`)
      } else {
        setDeploymentModels((prev) => prev.filter((m) => m.id !== id))
        showToast(`Deployment model "${model.name}" removed.`)
      }
    } catch (err) {
      showToast(`Cannot delete deployment model: ${formatApiError(err)}`, 'error')
    }
  }

  const handleDeletePricingModel = async (id) => {
    const model = pricingModels.find((pm) => pm.id === id)
    if (!model) return
    const confirmed =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`Are you sure you want to remove pricing model "${model.name}"?`)
        : true
    if (!confirmed) return

    try {
      if (isLiveBackendData && typeof id === 'number') {
        await deletePricingModel(id)
        setPricingModels((prev) => prev.filter((pm) => pm.id !== id))
        showToast(`Pricing model "${model.name}" removed from database.`)
      } else {
        setPricingModels((prev) => prev.filter((pm) => pm.id !== id))
        showToast(`Pricing model "${model.name}" removed.`)
      }
    } catch (err) {
      showToast(`Cannot delete pricing model: ${formatApiError(err)}`, 'error')
    }
  }

  const handleSaveHourlyRate = async (newRate) => {
    try {
      if (isLiveBackendData) {
        const countryMatch =
          countries.find(
            (c) =>
              c.name.toLowerCase() === newRate.country.toLowerCase() ||
              String(c.id) === String(newRate.country),
          ) || countries[0]
        const countryId =
          typeof countryMatch?.id === 'number' ? countryMatch.id : 1

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
          country: created.country?.name || countryMatch?.name || 'India',
          currency:
            created.currency?.code ||
            created.country?.currency?.code ||
            countryMatch?.currency ||
            'INR',
          hourlyRate: String(created.hourly_rate),
          dailyRate: created.daily_rate != null ? String(created.daily_rate) : null,
          standardHoursPerDay: created.hours_per_day,
        }
        setHourlyRates((prev) => [...prev, mapped])
        showToast(
          `Service rate for "${newRate.serviceLine}" saved to database.`,
        )
      } else {
        const hourlyWithId = {
          ...newRate,
          id: newRate.id || `hr-${Date.now()}`,
        }
        setHourlyRates((prev) => [...prev, hourlyWithId])
        showToast(`Service rate for "${newRate.serviceLine}" added.`)
      }
    } catch (err) {
      showToast(
        `Failed to save hourly rate: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  const handleDeleteHourlyRate = async (id) => {
    try {
      if (isLiveBackendData && typeof id === 'number') {
        await deleteServiceRate(id)
        setHourlyRates((prev) => prev.filter((hr) => hr.id !== id))
        showToast('Hourly rate removed from database.')
      } else {
        setHourlyRates((prev) => prev.filter((hr) => hr.id !== id))
        showToast('Hourly rate removed.')
      }
    } catch (err) {
      showToast(
        `Cannot delete hourly rate: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
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

  const handleDeleteFxRate = async (id) => {
    try {
      if (isLiveBackendData && typeof id === 'number') {
        await deleteFxRate(id)
        setExchangeRates((prev) => prev.filter((fx) => fx.id !== id))
        showToast('Exchange rate removed from database.')
      } else {
        setExchangeRates((prev) => prev.filter((fx) => fx.id !== id))
        showToast('Exchange rate removed.')
      }
    } catch (err) {
      showToast(
        `Cannot delete FX rate: ${err.response?.data?.detail || err.message}`,
        'error',
      )
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800">
      {/* 1. Dark Navy Top Navigation */}
      <CatalogueTopNav activeSection="rate-cards" />

      {/* 2. White Commercial Master Summary Strip */}
      <SummaryStrip
        productLinesCount={families.length}
        totalProductsCount={products.length}
      />

      {/* 3. Live Database Status Strip */}
      {isLoading && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 text-xs text-blue-700 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            Connecting to PostgreSQL database & loading live rate cards...
          </span>
        </div>
      )}

      {apiError && !isLoading && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-800 flex items-center justify-between">
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
          className={`border-b px-4 py-1 text-xs flex flex-wrap items-center justify-between gap-2 ${
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
              Connected to PostgreSQL live rate card ({activeVersion?.version_no || 'RC-DEV-1'})
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

      {/* 4. Main Workspace: Three Independently Scrollable Columns */}
      <div className="flex-1 flex overflow-hidden h-[calc(100vh-136px)]">
        {/* Left Column: Products & Families */}
        <RateCardProductsSidebar
          families={families}
          products={products}
          selectedFamilyId={selectedFamilyId}
          onSelectFamily={setSelectedFamilyId}
          onOpenAddProduct={() => setIsAddProductOpen(true)}
        />

        {/* Center Column: Deployment / Pricing Model / Rates Editor */}
        <RateCardCenterEditor
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
          platformConfig={platformConfig}
          onChangePlatformConfig={handleChangePlatformConfig}
          onResetPlatformDemo={handleResetPlatformDemo}
        />

        {/* Right Column: Master Data Panels */}
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
        existingPackRates={packRates}
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
        existingFeatureRates={featureRates}
      />
    </div>
  )
}

export default RateCardPage
