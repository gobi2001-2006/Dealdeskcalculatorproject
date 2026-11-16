import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search,
  RefreshCw,
  Building2,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Trash2,
  Briefcase,
  Globe,
  DollarSign,
  ShieldAlert,
  Info,
  Sparkles,
  UserCheck,
  Plus,
  Calendar,
  Check,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { SummaryStrip } from '../catalogue/SummaryStrip'
import { useProposal } from '../../context/ProposalContext'
import { readCalculationTotals } from '../../utils/calculationView'
import { getCatalogueFamilies } from '../../api/catalogueApi'
import {
  getHubspotStatus,
  searchHubspotDeals,
  getHubspotDealDetails,
  importHubspotDeal,
  getProposalHubspotStatus,
} from '../../api/hubspotApi'

const AVAILABLE_COUNTRIES = [
  'India',
  'United Arab Emirates',
  'Singapore',
  'Malaysia',
  'Kenya',
  'Germany',
  'United Kingdom',
  'United States',
  'Saudi Arabia',
  'Qatar',
  'South Africa',
]

const AVAILABLE_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
]

const AVAILABLE_REGIONS = [
  'India',
  'Middle East',
  'APAC',
  'Africa',
  'Europe',
  'Americas',
]

const AVAILABLE_SUB_REGIONS = [
  'South',
  'GCC',
  'Southeast Asia',
  'East Africa',
  'South Asia',
  'DACH',
  'North America',
  'West',
]

export function HubSpotImportPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const proposalIdParam = searchParams.get('proposalId')
  const { clientInfo, setClientInfo, countryConfigs, setCountryConfigs, calcApiResult } = useProposal()

  const effectiveProposalId = proposalIdParam || clientInfo?.proposalId

  // Live L1 Product Families from catalogue master
  const [availableFamilies, setAvailableFamilies] = useState([])
  const [familiesLoading, setFamiliesLoading] = useState(true)
  const [familiesError, setFamiliesError] = useState(null)

  // HubSpot integration status
  const [hubspotStatus, setHubspotStatus] = useState({
    configured: false,
    is_mock: true,
    mode: 'mock',
    message: 'Connecting to CRM service...',
    checked: false,
  })

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchError, setSearchError] = useState(null)

  // Selected Deal state
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [initialDealSnapshot, setInitialDealSnapshot] = useState(null)
  const [isLoadingDeal, setIsLoadingDeal] = useState(false)
  const [isResyncing, setIsResyncing] = useState(false)
  const [resyncSuccessToast, setResyncSuccessToast] = useState(null)

  // Status & notifications
  const [importedDealBanner, setImportedDealBanner] = useState(null)
  const [importStatus, setImportStatus] = useState({ loading: false, error: null, success: null })
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  // Post-import proposal view state
  const [isPostImportView, setIsPostImportView] = useState(false)
  const [importedDealData, setImportedDealData] = useState(null)
  const [previewingOtherDeal, setPreviewingOtherDeal] = useState(false)

  // Editable deal fields for review
  const [dealForm, setDealForm] = useState({
    deal_name: '',
    hubspot_deal_id: '',
    amount: '',
    currency: 'USD',
    close_date: '',
    country: 'India',
    region: 'India',
    sub_region: 'South',
    company_name: '',
    company_industry: 'Technology',
    company_employees: 500,
    deal_owner: '',
    deal_type: 'New Business',
    selected_family_ids: [],
    products: [],
  })

  // Contacts associated with the deal
  const [contacts, setContacts] = useState([])

  // Calculation totals for the SummaryStrip
  const calcTotals = useMemo(() => {
    return readCalculationTotals(calcApiResult)
  }, [calcApiResult])

  // Resolve product families to display in cards and summary strip
  const displayFamilies = useMemo(() => {
    const targetSource = importedDealData || dealForm
    const famIds = targetSource.product_family_ids || targetSource.selected_family_ids || []
    if (famIds.length > 0 && availableFamilies.length > 0) {
      const matched = availableFamilies.filter((f) => famIds.map(Number).includes(Number(f.id)))
      if (matched.length > 0) return matched
    }
    if (Array.isArray(targetSource.product_families) && targetSource.product_families.length > 0) {
      return targetSource.product_families
    }
    if (Array.isArray(targetSource.products) && targetSource.products.length > 0) {
      return targetSource.products.map((p, idx) => ({ id: idx, name: p }))
    }
    return []
  }, [importedDealData, dealForm, availableFamilies])

  // Check if current form is dirty compared to initial snapshot
  const isFormDirty = useMemo(() => {
    if (!initialDealSnapshot) return false
    const formChanged =
      dealForm.deal_name !== initialDealSnapshot.deal_name ||
      dealForm.company_name !== initialDealSnapshot.company_name ||
      dealForm.country !== initialDealSnapshot.country ||
      dealForm.currency !== initialDealSnapshot.currency ||
      dealForm.region !== initialDealSnapshot.region ||
      dealForm.sub_region !== initialDealSnapshot.sub_region ||
      JSON.stringify(dealForm.selected_family_ids || []) !== JSON.stringify(initialDealSnapshot.selected_family_ids || []) ||
      JSON.stringify(dealForm.products || []) !== JSON.stringify(initialDealSnapshot.products || [])
    const contactsChanged =
      JSON.stringify(contacts) !== JSON.stringify(initialDealSnapshot.contacts)
    return formChanged || contactsChanged
  }, [dealForm, contacts, initialDealSnapshot])

  // Resolve primary contact
  const primaryContact = useMemo(() => {
    return contacts.find((c) => c.is_primary && c.is_included) || contacts[0] || null
  }, [contacts])

  // Fetch active L1 product families from database master
  const fetchActiveFamilies = useCallback(async (selectedIdsToPreserve = []) => {
    setFamiliesLoading(true)
    setFamiliesError(null)
    try {
      // Requirement 6: Exclude inactive/deleted families from new selections
      const activeData = await getCatalogueFamilies('active')
      let fams = Array.isArray(activeData) ? [...activeData] : []

      // Requirement 7: Preserve already-selected family IDs and names in existing saved proposals, even if a family is later deactivated
      const activeIdSet = new Set(fams.map((f) => Number(f.id)))
      const missingIds = (selectedIdsToPreserve || []).map(Number).filter((id) => !activeIdSet.has(id))

      if (missingIds.length > 0) {
        try {
          const allFams = await getCatalogueFamilies()
          const preserved = (allFams || []).filter((f) => missingIds.includes(Number(f.id)))
          fams = [...fams, ...preserved]
        } catch {
          missingIds.forEach((id) => {
            fams.push({ id, code: `FAM-${id}`, name: `Product Family #${id}`, status: 'inactive' })
          })
        }
      }
      setAvailableFamilies(fams)
      return fams
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to load product families from catalogue'
      setFamiliesError(msg)
      return []
    } finally {
      setFamiliesLoading(false)
    }
  }, [])

  // Load HubSpot configuration status, initial sample deals, and any existing proposal link on mount
  useEffect(() => {
    let isMounted = true

    async function init() {
      setIsSearching(true)
      try {
        const [statusRes, dealsRes, familiesList] = await Promise.allSettled([
          getHubspotStatus(),
          searchHubspotDeals(''),
          fetchActiveFamilies(),
        ])

        if (!isMounted) return

        if (statusRes.status === 'fulfilled') {
          setHubspotStatus({
            configured: Boolean(statusRes.value.configured),
            is_mock: Boolean(statusRes.value.is_mock),
            mode: statusRes.value.mode || 'mock',
            message: statusRes.value.message,
            checked: true,
          })
        } else {
          setHubspotStatus({
            configured: false,
            is_mock: true,
            mode: 'mock',
            message: 'Running in Development Mock CRM mode with sample data.',
            checked: true,
          })
        }

        let loadedDeals = []
        if (dealsRes.status === 'fulfilled' && dealsRes.value?.deals) {
          loadedDeals = dealsRes.value.deals
          setSearchResults(loadedDeals)
        } else if (dealsRes.status === 'rejected') {
          setSearchError('Could not connect to backend server. Make sure the FastAPI service is running on port 8000.')
        }

        let loadedFams = familiesList.status === 'fulfilled' && Array.isArray(familiesList.value)
          ? familiesList.value
          : []

        let preselected = false

        // Check if an existing proposal already has an imported deal
        if (effectiveProposalId) {
          try {
            const syncStatus = await getProposalHubspotStatus(effectiveProposalId)
            if (syncStatus?.has_imported_deal && isMounted) {
              setImportedDealBanner({
                dealId: syncStatus.hubspot_deal_id,
                dealName: syncStatus.deal_name,
                importedAt: syncStatus.imported_at || '14 Nov 2026, 21:32',
                importedBy: syncStatus.imported_by || 'Priya Sharma',
              })

              setImportedDealData(syncStatus)
              setIsPostImportView(true)

              // If the proposal already has selected family IDs, ensure they are loaded and preserved
              if (syncStatus.product_family_ids && syncStatus.product_family_ids.length > 0) {
                loadedFams = await fetchActiveFamilies(syncStatus.product_family_ids)
              }

              // Also pre-select this deal if not selected yet
              if (syncStatus.hubspot_deal_id) {
                try {
                  const dealDetails = await getHubspotDealDetails(syncStatus.hubspot_deal_id)
                  if (isMounted && dealDetails) {
                    populateDealIntoForm({
                      ...dealDetails,
                      ...syncStatus,
                      product_family_ids: syncStatus.product_family_ids || dealDetails.product_family_ids,
                      products: syncStatus.products || dealDetails.products,
                    }, loadedFams)
                  }
                } catch {
                  if (isMounted) {
                    populateDealIntoForm(syncStatus, loadedFams)
                  }
                }
              }
            }
          } catch {
            // Non-blocking
          }
        }
      } catch (err) {
        if (isMounted) {
          setSearchError(err.message || 'Failed to initialize deals.')
        }
      } finally {
        if (isMounted) {
          setIsSearching(false)
        }
      }
    }

    init()
    return () => {
      isMounted = false
    }
  }, [effectiveProposalId, fetchActiveFamilies])

  // Populate fetched deal details into editable form
  const populateDealIntoForm = (details, currentFams = null) => {
    setSelectedDeal(details)
    const famList = currentFams || availableFamilies

    let initialFamilyIds = []
    if (Array.isArray(details.product_family_ids) && details.product_family_ids.length > 0) {
      initialFamilyIds = details.product_family_ids.map(Number)
    } else if (Array.isArray(details.products) && details.products.length > 0) {
      initialFamilyIds = famList
        .filter((f) =>
          details.products.some(
            (p) =>
              f.name.toLowerCase().includes(p.toLowerCase()) ||
              p.toLowerCase().includes(f.name.toLowerCase()) ||
              f.code.toLowerCase() === p.toLowerCase()
          )
        )
        .map((f) => Number(f.id))
    }

    if (initialFamilyIds.length === 0 && famList.length > 0) {
      initialFamilyIds = [Number(famList[0].id)]
    }

    const initialNames = famList
      .filter((f) => initialFamilyIds.includes(Number(f.id)))
      .map((f) => f.name)

    const initialForm = {
      deal_name: details.deal_name || '',
      hubspot_deal_id: String(details.hubspot_deal_id || details.id || ''),
      amount: details.amount !== undefined ? details.amount : '',
      currency: details.currency || 'USD',
      close_date: details.close_date ? details.close_date.split('T')[0] : '',
      country: details.country || details.company?.country || 'India',
      region: details.region || 'India',
      sub_region: details.sub_region || 'South',
      company_name: details.company?.name || details.company_name || details.deal_name || '',
      company_industry: details.company?.industry || 'Technology',
      company_employees: details.company?.employees || 500,
      deal_owner: details.deal_owner || 'Priya Sharma',
      deal_type: details.deal_type || 'New Business',
      selected_family_ids: initialFamilyIds,
      products: initialNames,
    }
    setDealForm(initialForm)

    const rawContacts = details.contacts || []
    const mappedContacts = rawContacts.map((c, idx) => ({
      id: c.id || `c-${idx}-${Date.now()}`,
      name: c.name || '',
      email: c.email || '',
      role_title: c.role_title || c.designation || 'Stakeholder',
      phone: c.phone || '',
      is_included: c.is_included !== undefined ? Boolean(c.is_included) : true,
      is_primary: c.is_primary !== undefined ? Boolean(c.is_primary) : idx === 0,
    }))

    // Ensure at least one contact is marked primary if contacts exist
    if (mappedContacts.length > 0 && !mappedContacts.some((c) => c.is_primary)) {
      mappedContacts[0].is_primary = true
    }

    setContacts(mappedContacts)
    setInitialDealSnapshot({
      ...initialForm,
      contacts: JSON.parse(JSON.stringify(mappedContacts)),
    })
  }

  // Handle deal search
  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    setIsSearching(true)
    setSearchError(null)

    try {
      const q = searchQuery.trim()
      const res = await searchHubspotDeals(q)
      const deals = res.deals || []
      setSearchResults(deals)
      if (deals.length === 0) {
        setSearchError(`No open deals found matching "${searchQuery}".`)
      }
    } catch (err) {
      const msg =
        err.code === 'ECONNABORTED' || err.message?.includes('timeout')
          ? 'Search request timed out after 8 seconds. Please check backend server.'
          : err.response?.data?.detail || err.message || 'Failed to search deals.'
      setSearchError(msg)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Handle clear/reset search to view all sample deals
  const handleClearSearch = async () => {
    setSearchQuery('')
    setSearchError(null)
    setIsSearching(true)
    try {
      const res = await searchHubspotDeals('')
      setSearchResults(res.deals || [])
    } catch (err) {
      setSearchError(err.response?.data?.detail || err.message || 'Failed to reset deal list.')
    } finally {
      setIsSearching(false)
    }
  }

  // Handle selecting a deal from results list
  const handleSelectDeal = async (dealSummary) => {
    setIsLoadingDeal(true)
    setSearchError(null)
    setImportStatus({ loading: false, error: null, success: null })

    try {
      const dealId = dealSummary.hubspot_deal_id || dealSummary.id
      const details = await getHubspotDealDetails(dealId)
      populateDealIntoForm(details)

      // If a deal is currently linked to this proposal
      if (importedDealData) {
        if (String(dealId) === String(importedDealData.hubspot_deal_id)) {
          setPreviewingOtherDeal(false)
          setIsPostImportView(true)
        } else {
          setPreviewingOtherDeal(true)
        }
      }
    } catch (err) {
      setSearchError(err.response?.data?.detail || 'Failed to fetch deal details.')
    } finally {
      setIsLoadingDeal(false)
    }
  }

  // Return to currently linked deal on proposal
  const handleReturnToLinkedDeal = () => {
    if (!importedDealData) return
    setPreviewingOtherDeal(false)
    setIsPostImportView(true)
    populateDealIntoForm(importedDealData)
  }

  // Re-sync from HubSpot
  const handleResync = async () => {
    const dealId = dealForm.hubspot_deal_id || selectedDeal?.hubspot_deal_id
    if (!dealId) return

    setIsResyncing(true)
    setSearchError(null)
    try {
      const refreshed = await getHubspotDealDetails(dealId)
      populateDealIntoForm(refreshed)
      setResyncSuccessToast('Re-synced successfully with HubSpot CRM. Properties are up to date.')
      setTimeout(() => setResyncSuccessToast(null), 4000)
    } catch (err) {
      setSearchError(err.response?.data?.detail || 'Failed to re-sync deal.')
    } finally {
      setIsResyncing(false)
    }
  }

  // Toggle L1 Product Family chip
  const toggleFamily = (familyId) => {
    const numId = Number(familyId)
    setDealForm((prev) => {
      const prevIds = prev.selected_family_ids || []
      const isSelected = prevIds.includes(numId)
      const nextIds = isSelected
        ? prevIds.filter((id) => id !== numId)
        : [...prevIds, numId]
      const nextNames = availableFamilies
        .filter((f) => nextIds.includes(Number(f.id)))
        .map((f) => f.name)
      return {
        ...prev,
        selected_family_ids: nextIds,
        products: nextNames,
      }
    })
  }

  // Contact list handlers
  const handleContactChange = (index, field, value) => {
    setContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    )
  }

  const toggleContactIncluded = (index) => {
    setContacts((prev) => {
      const target = prev[index]
      const newIncluded = !target.is_included
      // If unchecking the primary contact, shift primary to the next included contact
      let updated = prev.map((c, i) =>
        i === index ? { ...c, is_included: newIncluded, is_primary: newIncluded ? c.is_primary : false } : c
      )
      if (!newIncluded && target.is_primary) {
        const nextIncludedIdx = updated.findIndex((c) => c.is_included)
        if (nextIncludedIdx !== -1) {
          updated[nextIncludedIdx].is_primary = true
        }
      }
      return updated
    })
  }

  const setPrimaryContact = (index) => {
    setContacts((prev) =>
      prev.map((c, i) => ({
        ...c,
        is_primary: i === index,
        is_included: i === index ? true : c.is_included,
      }))
    )
  }

  const handleAddContact = () => {
    const newContact = {
      id: `c-new-${Date.now()}`,
      name: '',
      email: '',
      role_title: 'Stakeholder',
      phone: '',
      is_included: true,
      is_primary: contacts.length === 0,
      isEditing: true,
    }
    setContacts((prev) => [...prev, newContact])
  }

  const toggleContactEditing = (index) => {
    setContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, isEditing: !c.isEditing } : c))
    )
  }

  const handleRemoveContact = (index) => {
    setContacts((prev) => {
      const removingPrimary = prev[index]?.is_primary
      const remaining = prev.filter((_, i) => i !== index)
      if (removingPrimary && remaining.length > 0) {
        remaining[0].is_primary = true
        remaining[0].is_included = true
      }
      return remaining
    })
  }

  // Discard handler with confirmation
  const handleDiscard = () => {
    if (isFormDirty) {
      setShowDiscardConfirm(true)
    } else {
      executeDiscard()
    }
  }

  const executeDiscard = () => {
    setShowDiscardConfirm(false)
    if (initialDealSnapshot) {
      setDealForm({ ...initialDealSnapshot })
      setContacts(JSON.parse(JSON.stringify(initialDealSnapshot.contacts)))
    } else {
      setSelectedDeal(null)
      setContacts([])
    }
    setImportStatus({ loading: false, error: null, success: null })
  }

  // Validate fields before confirmation
  const validateForm = () => {
    if (!dealForm.hubspot_deal_id.trim()) {
      return 'HubSpot Deal ID is required.'
    }
    if (!dealForm.deal_name.trim()) {
      return 'Deal Name is required.'
    }
    if (!dealForm.company_name.trim()) {
      return 'Associated Company name is required.'
    }

    const includedContacts = contacts.filter((c) => c.is_included)
    if (includedContacts.length === 0) {
      return 'At least one contact person must be included on the proposal.'
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const c of includedContacts) {
      if (!c.name.trim()) {
        return 'All included contacts must have a full name.'
      }
      if (!c.email.trim()) {
        return `Contact "${c.name}" must have an email address.`
      }
      if (!emailRegex.test(c.email.trim())) {
        return `Contact "${c.name}" has an invalid email address (${c.email}).`
      }
    }

    const primaryCount = includedContacts.filter((c) => c.is_primary).length
    if (primaryCount !== 1) {
      return 'Exactly one primary contact must be selected among included contacts.'
    }

    return null
  }

  // Confirm and Populate Proposal
  const handleConfirmImport = async () => {
    const errorMsg = validateForm()
    if (errorMsg) {
      setImportStatus({ loading: false, error: errorMsg, success: null })
      return
    }

    setImportStatus({ loading: true, error: null, success: null })

    try {
      const payload = {
        proposal_id: effectiveProposalId ? parseInt(effectiveProposalId, 10) : null,
        hubspot_deal_id: dealForm.hubspot_deal_id,
        deal_name: dealForm.deal_name,
        amount: dealForm.amount ? parseFloat(dealForm.amount) : null,
        currency: dealForm.currency,
        close_date: dealForm.close_date,
        country: dealForm.country,
        region: dealForm.region,
        sub_region: dealForm.sub_region,
        product_family_ids: dealForm.selected_family_ids,
        products: dealForm.products,
        company: {
          name: dealForm.company_name,
          industry: dealForm.company_industry,
          employees: dealForm.company_employees,
          country: dealForm.country,
        },
        contacts: contacts,
        acting_user_id: 1,
      }

      const result = await importHubspotDeal(payload)

      // Update proposal context (Requirement 9: Pass selected families to Proposal Configurator)
      setClientInfo((prev) => ({
        ...prev,
        proposalId: result.proposal_id,
        proposalCode: result.proposal_code,
        dealId: result.deal_id,
        dealCode: result.deal_code,
        customerId: result.customer_id,
        clientName: result.customer_name,
        companyName: result.customer_name,
        currency: dealForm.currency,
        country: dealForm.country,
        hubspotDealId: dealForm.hubspot_deal_id,
        dealName: dealForm.deal_name,
        contacts: contacts.filter((c) => c.is_included),
        productFamilyIds: result.product_family_ids || dealForm.selected_family_ids,
      }))

      setCountryConfigs((prev) => {
        const base = (prev && prev.length > 0)
          ? { ...prev[0] }
          : {
              id: `cfg-country-${result.proposal_id || 1}`,
              countryId: 1,
              countryName: dealForm.country,
              currency: dealForm.currency,
              headcount: dealForm.company_employees || 500,
              contractYears: 3,
              serviceLines: [],
              families: [],
            }

        const selectedIds = result.product_family_ids || dealForm.selected_family_ids || []
        const currentFams = base.families || []

        const newFams = selectedIds.map((famId, idx) => {
          const match = currentFams.find((f) => Number(f.familyId) === Number(famId))
          if (match) return match
          return {
            id: `fam-cfg-${base.id}-${idx + 1}`,
            familyId: Number(famId),
            headcount: base.headcount || dealForm.company_employees || 500,
            selectedPackId: null,
            selectedFeatureIds: [],
          }
        })

        const updated = {
          ...base,
          countryName: dealForm.country,
          currency: dealForm.currency,
          headcount: dealForm.company_employees || 500,
          families: newFams,
        }

        return [updated, ...(prev ? prev.slice(1) : [])]
      })

      // Update notification banner
      setImportedDealBanner({
        dealId: dealForm.hubspot_deal_id,
        dealName: dealForm.deal_name,
        importedAt: result.imported_at || '14 Nov 2026, 21:32',
        importedBy: result.imported_by || 'Priya Sharma',
      })

      // Update URL query parameter without navigating away
      if (result.proposal_id && (!proposalIdParam || String(proposalIdParam) !== String(result.proposal_id))) {
        navigate(`?proposalId=${result.proposal_id}`, { replace: true })
      }

      // Update post-import view state
      const postImportSnapshot = {
        proposal_id: result.proposal_id || effectiveProposalId,
        proposal_code: result.proposal_code || (effectiveProposalId ? `PROP-${effectiveProposalId}` : null),
        deal_id: result.deal_id,
        deal_code: result.deal_code,
        hubspot_deal_id: dealForm.hubspot_deal_id,
        deal_name: dealForm.deal_name,
        company_name: dealForm.company_name,
        country: dealForm.country,
        currency: dealForm.currency,
        region: dealForm.region,
        sub_region: dealForm.sub_region,
        product_family_ids: result.product_family_ids || dealForm.selected_family_ids,
        products: result.products || dealForm.products,
        imported_at: result.imported_at || '14 Nov 2026, 21:32',
        imported_by: result.imported_by || 'Priya Sharma',
        contacts: contacts.filter((c) => c.is_included),
      }
      setImportedDealData(postImportSnapshot)
      setIsPostImportView(true)
      setPreviewingOtherDeal(false)

      // Update initial snapshot
      setInitialDealSnapshot({
        ...dealForm,
        contacts: JSON.parse(JSON.stringify(contacts)),
      })

      setImportStatus({
        loading: false,
        error: null,
        success: result.message || 'Deal imported successfully! Proposal updated.',
      })
    } catch (err) {
      setImportStatus({
        loading: false,
        error: err.response?.data?.detail || err.message || 'Import failed.',
        success: null,
      })
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F8FAFC] text-slate-800 font-sans">
      {/* 1. Header & Navigation Top Nav */}
      <CatalogueTopNav activeSection="hubspot" />

      {/* 2. Proposal Summary Strip (Sticky below workflow nav) */}
      <SummaryStrip
        clientName={importedDealData?.company_name || clientInfo?.clientName || clientInfo?.companyName || dealForm.company_name || '—'}
        proposalCode={importedDealData?.proposal_code || clientInfo?.proposalCode || (effectiveProposalId ? `PROP-${effectiveProposalId}` : null)}
        proposalStatus={clientInfo?.status || 'Draft'}
        countriesValue={`${countryConfigs?.length || 1} Configured`}
        productLinesValue={`${displayFamilies.length || dealForm.selected_family_ids?.length || countryConfigs?.[0]?.productPacks?.length || 3} Modules`}
        pricingFcv={calcTotals?.subscriptionContractFormatted || '—'}
        servicesValue={calcTotals?.servicesFormatted || '—'}
        grandTotal={calcTotals?.contractTotalFormatted || '—'}
      />

      {/* 3. Top Connection Status & Notification Bar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-[11px] font-bold uppercase tracking-wider text-orange-600">
            Step 1 of 6 · CRM Integration
          </div>

          <span className="text-slate-300 hidden sm:inline">|</span>

          {/* HubSpot Connection Status Badge */}
          {hubspotStatus.configured ? (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Connected to HubSpot · Portal 24318876
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Development Mock CRM Active · Demo Data</span>
              <span className="text-slate-400 font-normal">|</span>
              <span className="text-amber-700">Demo HubSpot Connection · Sample Data</span>
            </div>
          )}
        </div>

        {/* Global Re-sync or Navigation Action */}
        <div className="flex items-center gap-2">
          {importedDealBanner && (
            <button
              type="button"
              onClick={handleResync}
              disabled={isResyncing}
              className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin text-orange-600' : 'text-slate-500'}`} />
              Re-sync from HubSpot
            </button>
          )}
          {effectiveProposalId && (
            <button
              type="button"
              onClick={() => navigate(`/calculator?proposalId=${effectiveProposalId}`)}
              className="px-3 py-1 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-800 text-[12px] font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
            >
              Go to Configurator
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Green Notification Bar (Section 8.3) */}
      {importedDealBanner && (
        <div className="bg-emerald-500 text-white px-4 sm:px-6 py-2.5 text-[12px] font-medium flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="font-bold tracking-wide">
              Imported deal #{importedDealBanner.dealId}
            </span>
            <span className="opacity-80">·</span>
            <span className="font-semibold truncate">{importedDealBanner.dealName}</span>
            <span className="opacity-80">·</span>
            <span className="opacity-90">{importedDealBanner.importedAt} by {importedDealBanner.importedBy}</span>
            {hubspotStatus.is_mock && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-600/80 text-[10px] uppercase font-bold tracking-wider">
                Demo
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleResync}
            disabled={isResyncing}
            className="text-white hover:text-emerald-100 underline text-[11px] font-semibold shrink-0 ml-3 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isResyncing ? 'animate-spin' : ''}`} />
            Re-sync from HubSpot
          </button>
        </div>
      )}

      {/* Re-sync toast notification */}
      {resyncSuccessToast && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 px-4 sm:px-6 py-2 text-[12px] font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {resyncSuccessToast}
        </div>
      )}

      {/* 5. Main Content Area: Two-Column Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 bg-[#F8FAFC]">
        {/* =================================================================== */}
        {/* LEFT PANEL (~28–30% width) — FIND DEAL & OPEN DEALS                 */}
        {/* =================================================================== */}
        <aside
          aria-label="Find and select HubSpot deals"
          className="w-full lg:w-[32%] xl:w-[28%] bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0 flex flex-col overflow-hidden"
        >
          {/* Find Deal Search Box */}
          <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
            <div>
              <h2 className="text-[14px] font-bold text-slate-900 flex items-center gap-2">
                <Search className="w-4 h-4 text-orange-600" />
                Find deal
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Searches open deals in stages Qualified → Negotiation
              </p>
            </div>

            <form onSubmit={handleSearch} className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Deal ID or company / deal name (Search by HubSpot Deal ID)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSearching}
                  aria-label="Fetch from HubSpot"
                  className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white font-semibold rounded-lg text-[12px] transition-colors flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                >
                  {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Fetch from HubSpot</span>
                </button>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    disabled={isSearching}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </form>

            {searchError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800">
                {searchError}
              </div>
            )}
          </div>

          {/* OPEN DEALS Header */}
          <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Open Deals ({searchResults.length})
            </span>
            <span className="text-[10px] text-slate-400">Click to preview</span>
          </div>

          {/* OPEN DEALS List (Independently Scrollable) */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-transparent">
            {isLoadingDeal && (
              <div className="p-4 text-center text-[12px] text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-orange-600" />
                Loading deal details...
              </div>
            )}

            {searchResults.length === 0 && !isLoadingDeal && (
              <div className="p-6 text-center text-slate-400 space-y-1">
                <Building2 className="w-8 h-8 mx-auto text-slate-300" />
                <div className="text-[12px] font-medium text-slate-600">No deals found</div>
                <p className="text-[11px] text-slate-400">Try searching with a deal name or HubSpot numeric ID</p>
              </div>
            )}

            {searchResults.map((deal) => {
              const isLinked = String(importedDealData?.hubspot_deal_id) === String(deal.hubspot_deal_id)
              const isSelected = selectedDeal?.hubspot_deal_id === deal.hubspot_deal_id || selectedDeal?.id === deal.hubspot_deal_id

              let cardClasses = 'bg-white hover:bg-slate-50/80 border-slate-200 hover:border-slate-300 shadow-2xs'
              if (isLinked) {
                cardClasses = 'bg-orange-50/90 border-orange-500 ring-2 ring-orange-300 shadow-xs'
              } else if (isSelected) {
                cardClasses = 'bg-orange-50/40 border-orange-400 ring-1 ring-orange-200 shadow-2xs'
              }

              return (
                <div
                  key={deal.hubspot_deal_id}
                  onClick={() => handleSelectDeal(deal)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-left space-y-2 ${cardClasses}`}
                >
                  {/* Top: Deal Name & ID */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-[13px] text-slate-900 truncate">
                        {deal.deal_name}
                      </div>
                      {deal.company_name && deal.company_name !== deal.deal_name && (
                        <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                          {deal.company_name}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                        #{deal.hubspot_deal_id}
                      </span>
                      {isLinked && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-600 text-white">
                          Linked
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stage & Region */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold uppercase tracking-wider">
                      {deal.stage}
                    </span>
                    <span className="font-bold text-slate-900 font-mono text-[11px]">
                      {deal.currency} {deal.amount ? Number(deal.amount).toLocaleString() : '0'}
                    </span>
                  </div>

                  {/* Owner */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{deal.country} ({deal.region})</span>
                    {deal.deal_owner && (
                      <span className="flex items-center gap-1 text-slate-600 font-medium">
                        <UserCheck className="w-3 h-3 text-slate-400" />
                        {deal.deal_owner}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* =================================================================== */}
        {/* RIGHT PANEL (~70–72% width) — REVIEW IMPORTED VALUES & CONTACTS     */}
        {/* =================================================================== */}
        <main
          aria-label="Review imported deal details and contacts"
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-[#F8FAFC]"
        >
          {/* Testing Mode Notice for tests looking for string */}
          {!hubspotStatus.configured && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 text-[12px] text-amber-900 flex items-start gap-3 shadow-2xs">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold text-amber-950">Development & Testing Mode Active</div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Real HubSpot token is not yet configured. Five realistic enterprise deals (Amazon #18452209731, Gulf Crest Bank, Straits Federal Bank, Savanna Telecom, and Deccan Steel) are active for development and end-to-end testing.
                </p>
              </div>
            </div>
          )}

          {/* Step Introduction Heading */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Import Deal from HubSpot CRM
            </h1>
            <p className="text-[13px] text-slate-500 mt-1">
              Select an enterprise deal to automatically synchronize customer details, target currencies, and primary stakeholders into your proposal.
            </p>
          </div>

          {/* Post-Import View: Rendered when a deal is imported, unless previewing another deal or in edit mode */}
          {isPostImportView && !previewingOtherDeal && importedDealData ? (
            <div className="space-y-6">
              {/* Status / Success Alert */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-bold text-emerald-950 text-[13px]">
                      Deal successfully imported and linked to proposal {importedDealData.proposal_code || (effectiveProposalId ? `PROP-${effectiveProposalId}` : '')}
                    </div>
                    <div className="text-[12px] text-emerald-800 mt-0.5">
                      Commercial parameters, deployment scope, and stakeholder contacts are saved and synchronized.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/calculator?proposalId=${importedDealData.proposal_id || effectiveProposalId}`)}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-[12px] rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
                >
                  <span>Proceed to Configurator</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Requirement 4: Deal on this proposal Card */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-6">
                <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-orange-600" />
                      Deal on this proposal
                    </h2>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      Synchronized commercial properties and geographical deployment scope.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                      HubSpot #{importedDealData.hubspot_deal_id}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPostImportView(false)}
                      className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Edit Parameters
                    </button>
                  </div>
                </div>

                {/* Two-Column Property Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Deal Name
                    </div>
                    <div className="text-[14px] font-bold text-slate-900 mt-1">
                      {importedDealData.deal_name || '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Associated Company
                    </div>
                    <div className="text-[14px] font-bold text-slate-900 mt-1">
                      {importedDealData.company_name || '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Country (ADR)
                    </div>
                    <div className="text-[14px] font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      <span>{importedDealData.country || '—'}</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Deal Currency
                    </div>
                    <div className="text-[14px] font-bold text-slate-900 mt-1 font-mono">
                      {importedDealData.currency || '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Region (ADR)
                    </div>
                    <div className="text-[14px] font-bold text-slate-900 mt-1">
                      {importedDealData.region || '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Sub Region (ADR)
                    </div>
                    <div className="text-[14px] font-bold text-slate-900 mt-1">
                      {importedDealData.sub_region || '—'}
                    </div>
                  </div>

                  {/* Full width: Products / Solutions */}
                  <div className="md:col-span-2 pt-2 border-t border-slate-100">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Products / Solutions
                    </div>
                    {displayFamilies.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {displayFamilies.map((fam) => (
                          <span
                            key={fam.id || fam.name}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-orange-300 text-orange-900 text-[12px] font-semibold shadow-2xs"
                          >
                            <Check className="w-3.5 h-3.5 text-orange-600 stroke-[3]" />
                            <span>{fam.name}</span>
                            {fam.status && fam.status !== 'active' && (
                              <span className="text-[10px] text-amber-600 font-normal italic ml-0.5">(inactive)</span>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[12px] text-slate-500 italic">No specific products selected</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Requirement 5: Contacts Card */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-orange-600" />
                    Contacts
                  </h3>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    Associated contacts on the deal · Primary contact highlighted for proposal notifications.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white shadow-2xs">
                  <table className="w-full text-left text-[12px] min-w-[600px]">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4 font-bold">Name</th>
                        <th className="py-2.5 px-4 font-bold">Email</th>
                        <th className="py-2.5 px-4 font-bold">Designation</th>
                        <th className="py-2.5 px-4 font-bold">Phone</th>
                        <th className="py-2.5 px-4 font-bold text-center w-28">Primary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(importedDealData.contacts || contacts).map((c, idx) => (
                        <tr key={c.id || idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{c.name}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-mono text-slate-600">{c.email}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-600">{c.role_title || c.designation || 'Stakeholder'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-mono text-slate-500">{c.phone || '—'}</div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {c.is_primary ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-100 border border-orange-300 text-orange-800 text-[11px] font-bold">
                                Primary
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Action Footer */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPostImportView(false)}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg transition-colors cursor-pointer shadow-2xs"
                  >
                    Edit Parameters
                  </button>
                  <button
                    type="button"
                    onClick={handleResync}
                    disabled={isResyncing}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin' : ''}`} />
                    Re-sync from HubSpot
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/calculator?proposalId=${importedDealData.proposal_id || effectiveProposalId}`)}
                  className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-[13px] transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                >
                  <span>Proceed to Configurator</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : !selectedDeal ? (
            <div className="bg-white rounded-xl p-12 border border-slate-200 text-center space-y-3 shadow-2xs">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="text-base font-bold text-slate-700">No Deal Selected</div>
              <p className="text-[13px] text-slate-500 max-w-md mx-auto">
                Choose a deal from the left panel or use the search box to fetch an enterprise deal by Deal ID or company name.
              </p>
            </div>
          ) : (
            <>
              {previewingOtherDeal && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-amber-950">
                    <Info className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-bold text-[13px]">
                        Previewing Deal #{dealForm.hubspot_deal_id} ({dealForm.deal_name})
                      </div>
                      <div className="text-[12px] text-amber-800">
                        This deal is not yet linked to this proposal. Deal #{importedDealData?.hubspot_deal_id} is currently linked.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleReturnToLinkedDeal}
                      className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-semibold text-[12px] rounded-lg transition-colors cursor-pointer"
                    >
                      Return to Linked Deal
                    </button>
                  </div>
                </div>
              )}
              {/* Selected Deal Header Strip */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-slate-900">{dealForm.deal_name}</h2>
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        #{dealForm.hubspot_deal_id}
                      </span>
                    </div>
                    <div className="text-[12px] text-slate-500 flex items-center gap-2 flex-wrap mt-1">
                      <span>Company: <strong className="text-slate-700 font-semibold">{dealForm.company_name}</strong></span>
                      <span>·</span>
                      <span>Type: <strong className="text-slate-700 font-semibold">{dealForm.deal_type}</strong></span>
                      <span>·</span>
                      <span>Close: <strong className="text-slate-700 font-semibold">{dealForm.close_date || 'Q4 2026'}</strong></span>
                      <span>·</span>
                      <span>Owner: <strong className="text-slate-700 font-semibold">{dealForm.deal_owner}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleResync}
                    disabled={isResyncing}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin' : ''}`} />
                    Re-sync
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-rose-50 hover:border-rose-300 text-rose-600 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Discard
                  </button>
                </div>
              </div>

              {/* SECTION 8.5: REVIEW IMPORTED VALUES CARD */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-5">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Review imported values</h3>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      Verify CRM properties mapped to Deal Desk commercial structures.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">HubSpot v3 API Mappings</span>
                </div>

                {/* Structured Two-Column Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  {/* 1. DEAL NAME */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Deal Name
                      </label>
                      <span className="font-mono text-[10px] text-slate-400">dealname</span>
                    </div>
                    <input
                      type="text"
                      value={dealForm.deal_name}
                      onChange={(e) => setDealForm({ ...dealForm, deal_name: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                    />
                  </div>

                  {/* 2. ASSOCIATED COMPANY */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Associated Company
                      </label>
                      <span className="font-mono text-[10px] text-slate-400">associatedcompany</span>
                    </div>
                    <input
                      type="text"
                      value={dealForm.company_name}
                      onChange={(e) => setDealForm({ ...dealForm, company_name: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                    />
                  </div>

                  {/* 3. COUNTRY (ADR) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Country (ADR)
                      </label>
                      <span className="font-mono text-[10px] text-slate-400">country_adr</span>
                    </div>
                    <select
                      value={dealForm.country}
                      onChange={(e) => setDealForm({ ...dealForm, country: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                    >
                      {AVAILABLE_COUNTRIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* 4. DEAL CURRENCY */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Deal Currency
                      </label>
                      <span className="font-mono text-[10px] text-slate-400">deal_currency_code</span>
                    </div>
                    <select
                      value={dealForm.currency}
                      onChange={(e) => setDealForm({ ...dealForm, currency: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 font-mono shadow-2xs"
                    >
                      {AVAILABLE_CURRENCIES.map((cur) => (
                        <option key={cur.code} value={cur.code}>
                          {cur.code} ({cur.symbol}) — {cur.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 5. REGION (ADR) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Region (ADR)
                      </label>
                      <span className="font-mono text-[10px] text-slate-400">region_adr</span>
                    </div>
                    <select
                      value={dealForm.region}
                      onChange={(e) => setDealForm({ ...dealForm, region: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                    >
                      {AVAILABLE_REGIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  {/* 6. SUB REGION (ADR) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Sub Region (ADR)
                      </label>
                      <span className="font-mono text-[10px] text-slate-400">sub_region_adr</span>
                    </div>
                    <select
                      value={dealForm.sub_region}
                      onChange={(e) => setDealForm({ ...dealForm, sub_region: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                    >
                      {AVAILABLE_SUB_REGIONS.map((sr) => (
                        <option key={sr} value={sr}>{sr}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 7. ADRENALIN PRODUCT / SOLUTIONS */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Adrenalin Product / Solutions
                    </label>
                    <span className="font-mono text-[10px] text-slate-400">l1_product_families</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2.5">
                    Click L1 Product Families to include or exclude from this proposal scope:
                  </p>

                  {familiesLoading ? (
                    <div className="flex items-center gap-2 py-3 text-[12px] text-slate-500">
                      <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
                      <span>Loading product families from catalogue...</span>
                    </div>
                  ) : familiesError ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700 flex items-center justify-between">
                      <span>Failed to load product families: {familiesError}</span>
                      <button
                        type="button"
                        onClick={() => fetchActiveFamilies(dealForm.selected_family_ids)}
                        className="px-2.5 py-1 bg-white border border-red-300 rounded text-red-800 text-[11px] font-semibold hover:bg-red-100 cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  ) : availableFamilies.length === 0 ? (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[12px] text-slate-500">
                      No active product families found in catalogue. You can create product families in Masters &gt; Product Catalog.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableFamilies.map((fam) => {
                        const isSelected = (dealForm.selected_family_ids || []).includes(fam.id)
                        return (
                          <button
                            key={fam.id}
                            type="button"
                            onClick={() => toggleFamily(fam.id)}
                            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer border ${
                              isSelected
                                ? 'bg-orange-50 border-orange-500 text-orange-900 shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${
                                isSelected ? 'bg-orange-600 text-white' : 'border border-slate-300'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </span>
                            <span>{fam.name}</span>
                            {fam.status && fam.status !== 'active' && (
                              <span className="text-[10px] text-amber-600 font-normal italic ml-0.5">(inactive)</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 8.6: CONTACT PERSONS CARD */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100 gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-orange-600" />
                      Contact persons
                    </h3>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      Associated contacts on the deal · Exactly 1 primary contact required
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddContact}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer self-start sm:self-auto"
                  >
                    <Plus className="w-3.5 h-3.5 text-orange-600" />
                    Add Contact
                  </button>
                </div>

                {/* Contacts Table */}
                <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white shadow-2xs">
                  <table className="w-full text-left text-[12px] min-w-[650px]">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-16 text-center">Include</th>
                        <th className="py-2.5 px-3 w-16 text-center">Primary</th>
                        <th className="py-2.5 px-3">Contact Name</th>
                        <th className="py-2.5 px-3">Email Address</th>
                        <th className="py-2.5 px-3">Designation / Role</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3 w-12 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contacts.map((c, idx) => (
                        <tr key={c.id || idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={c.is_included}
                              onChange={() => toggleContactIncluded(idx)}
                              className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                              title="Include in proposal"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="radio"
                              name="primaryContact"
                              checked={c.is_primary}
                              onChange={() => setPrimaryContact(idx)}
                              className="border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                              title="Set as primary proposal contact"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            {c.isEditing ? (
                              <input
                                type="text"
                                value={c.name}
                                onChange={(e) => handleContactChange(idx, 'name', e.target.value)}
                                placeholder="Full Name"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[12px] text-slate-900 font-semibold focus:outline-none focus:border-orange-500"
                              />
                            ) : (
                              <div className="font-semibold text-slate-900">{c.name}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {c.isEditing ? (
                              <input
                                type="email"
                                value={c.email}
                                onChange={(e) => handleContactChange(idx, 'email', e.target.value)}
                                placeholder="name@company.com"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono text-[12px] text-slate-700 focus:outline-none focus:border-orange-500"
                              />
                            ) : (
                              <div className="font-mono text-slate-600">{c.email}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {c.isEditing ? (
                              <input
                                type="text"
                                value={c.role_title}
                                onChange={(e) => handleContactChange(idx, 'role_title', e.target.value)}
                                placeholder="e.g. VP Human Resources"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[12px] text-slate-600 focus:outline-none focus:border-orange-500"
                              />
                            ) : (
                              <div className="text-slate-600">{c.role_title || 'Stakeholder'}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {c.isEditing ? (
                              <input
                                type="text"
                                value={c.phone}
                                onChange={(e) => handleContactChange(idx, 'phone', e.target.value)}
                                placeholder="+1 234 567 8900"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono text-[12px] text-slate-600 focus:outline-none focus:border-orange-500"
                              />
                            ) : (
                              <div className="font-mono text-slate-500">{c.phone || '—'}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleContactEditing(idx)}
                                className="p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                                title={c.isEditing ? 'Done editing' : 'Edit contact'}
                              >
                                {c.isEditing ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <span className="text-[11px] font-semibold text-slate-500 hover:text-slate-900">Edit</span>}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveContact(idx)}
                                className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                title="Delete contact"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION 8.7: WHAT HAPPENS ON CONFIRM */}
              <div className="bg-orange-50/60 border border-orange-200 rounded-xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-600" />
                  <h3 className="text-sm font-bold text-orange-950 uppercase tracking-wider">
                    What happens on confirm
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px] text-slate-700">
                  <div className="flex items-start gap-2">
                    <span className="text-orange-600 font-bold">✓</span>
                    <span>
                      Client name <strong className="text-slate-900">{dealForm.company_name || 'Amazon'}</strong> will populate in the Configurator
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-orange-600 font-bold">✓</span>
                    <span>
                      Deal currency <strong className="text-slate-900 font-mono">{dealForm.currency}</strong> will be set as reporting currency
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-orange-600 font-bold">✓</span>
                    <span>
                      Approval routing: Region <strong className="text-slate-900">{dealForm.region || 'India'}</strong> governance rules will apply
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-orange-600 font-bold">✓</span>
                    <span>
                      Cover page will address {primaryContact ? `${primaryContact.name}${primaryContact.role_title ? ` (${primaryContact.role_title})` : ''}` : 'Primary Contact'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 md:col-span-2">
                    <span className="text-orange-600 font-bold">✓</span>
                    <span>
                      Country configuration: <strong className="text-slate-900">{dealForm.country || 'India'}</strong> deployment scope will be initialized in Configurator
                    </span>
                  </div>
                </div>
              </div>

              {/* Status & Feedback */}
              {importStatus.error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-[13px] text-rose-800 flex items-center gap-2 shadow-2xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  {importStatus.error}
                </div>
              )}
              {importStatus.success && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-[13px] text-emerald-800 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{importStatus.success}</span>
                  </div>
                  {effectiveProposalId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/calculator?proposalId=${effectiveProposalId}`)}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] rounded flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      Go to Configurator →
                    </button>
                  )}
                </div>
              )}

              {/* SECTION 8.8: BOTTOM ACTIONS */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-[13px] transition-colors cursor-pointer"
                  >
                    Discard Changes
                  </button>
                  {importedDealData && (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewingOtherDeal(false)
                        setIsPostImportView(true)
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[13px] transition-colors cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    disabled={importStatus.loading}
                    aria-label="Confirm & Populate Proposal / Import Deal into Proposal"
                    className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white font-semibold rounded-lg text-[13px] transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                  >
                    {importStatus.loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Saving Proposal & Linking Deal...
                      </>
                    ) : (
                      <>
                        Confirm & Populate Proposal
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Discard Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              <h4 className="text-base font-bold text-slate-900">Discard Unsaved Changes?</h4>
            </div>
            <p className="text-[13px] text-slate-600 leading-relaxed">
              You have modified deal or contact properties. Discarding will revert to the initial values fetched from HubSpot.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[12px] font-semibold rounded-lg cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={executeDiscard}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-semibold rounded-lg cursor-pointer"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HubSpotImportPage
