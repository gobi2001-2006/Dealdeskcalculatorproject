import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Save,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  FileCheck,
  Plus,
  Trash2,
  Upload,
  Download,
  Paperclip,
  Eye,
  Check,
  RotateCcw,
} from 'lucide-react'
import { CatalogueTopNav } from '../catalogue/CatalogueTopNav'
import { SummaryStrip } from '../catalogue/SummaryStrip'
import { useProposal, getStoredProposalId, persistProposalId } from '../../context/ProposalContext'
import {
  getProposalContent,
  updateProposalContent,
  uploadProposalAttachment,
  getProposalAttachments,
  deleteProposalAttachment,
  exportProposal,
  getLatestCalculation,
} from '../../api/proposalsApi'
import { getCatalogueFamilies } from '../../api/catalogueApi'
import { getMasterRoles, getServiceRates } from '../../api/ratesApi'
import { formatMoney, readCalculationTotals } from '../../utils/calculationView'
import { ProposalPreviewModal } from './ProposalPreviewModal'

export const SECTIONS_CONFIG = [
  {
    id: 'executive_summary',
    step: '01',
    title: 'Executive Summary',
    description: 'Customer background, objectives & Adrenalin value proposition',
  },
  {
    id: 'scope_of_work',
    step: '02',
    title: 'Scope of Work',
    description: 'Solution modules, employee coverage & delivery deliverables',
  },
  {
    id: 'customization_integration',
    step: '03',
    title: 'Customization & Integrations',
    description: 'Custom feature specifications, API connectors & effort estimates',
  },
  {
    id: 'terms_conditions',
    step: '04',
    title: 'Terms & Conditions',
    description: 'Payment terms, SLA guarantees & 100% payment milestone schedule',
  },
  {
    id: 'fitment_document',
    step: '05',
    title: 'Fitment Document',
    description: 'Product fitment analysis, RFP compliance & attachments',
  },
]

const DEFAULT_RATE_CARD = {
  INR: 25000,
  AED: 1500,
  USD: 400,
  EUR: 380,
  GBP: 330,
  SGD: 550,
}

// ---------------------------------------------------------------------------
// Section Completion Calculation Pure Functions (Single Source of Truth)
// ---------------------------------------------------------------------------

export function calculateSection1Progress(execSummary) {
  if (!execSummary) return 0
  if (typeof execSummary === 'string') {
    return execSummary.trim().length > 0 ? 100 : 0
  }
  const fields = [
    execSummary.customer_introduction,
    execSummary.customer_objectives,
    execSummary.value_proposition,
    execSummary.conclusion,
  ]
  const filled = fields.filter((f) => typeof f === 'string' && f.trim().length > 0).length
  return Math.round((filled / 4) * 100)
}

export function calculateSection2Progress(scopeOfWork) {
  if (!scopeOfWork) return 0
  if (typeof scopeOfWork === 'string') {
    return scopeOfWork.trim().length > 0 ? 100 : 0
  }
  // 4 required fields: license, implementation_plan, in_scope, out_of_scope
  // implementation_approach is optional
  const fields = [
    scopeOfWork.license,
    scopeOfWork.implementation_plan,
    scopeOfWork.in_scope,
    scopeOfWork.out_of_scope,
  ]
  const filled = fields.filter((f) => typeof f === 'string' && f.trim().length > 0).length
  return Math.round((filled / 4) * 100)
}

export function calculateSection3Progress(customizationIntegration) {
  if (!customizationIntegration) return 0
  if (customizationIntegration.none_required) return 100
  const items = customizationIntegration.items || []
  if (items.length > 0) {
    const validItems = items.filter((i) => (i.title || '').trim().length > 0 || (i.description || '').trim().length > 0)
    return validItems.length > 0 ? 100 : 0
  }
  return 0
}

export function calculateSection4Progress(termsConditions) {
  if (!termsConditions) return 0
  const commTc = Boolean((termsConditions.commercial_tc || '').trim())
  const payTerms = Boolean((termsConditions.payment_terms_text || '').trim())
  const termsProp = Boolean((termsConditions.terms_of_proposal || '').trim())

  // If no commercial or payment text entered, section is strictly empty (0%)
  if (!commTc && !payTerms && !termsProp) {
    return 0
  }

  const milestones = termsConditions.payment_milestones || []
  const milestoneSum = milestones.reduce((sum, m) => sum + (Number(m.percentage) || 0), 0)
  const isMilestoneValid = milestones.length > 0 && Math.abs(milestoneSum - 100) < 0.01

  // 4 components: commercial_tc, payment_terms_text, terms_of_proposal, valid milestones
  const parts = [commTc, payTerms, termsProp, isMilestoneValid]
  const filled = parts.filter(Boolean).length
  return Math.round((filled / 4) * 100)
}

export function calculateSection5Progress(fitmentDocument) {
  if (!fitmentDocument) return 0
  if (typeof fitmentDocument === 'string') {
    return fitmentDocument.trim().length > 0 ? 100 : 0
  }
  // Optional attachment upload does not prevent completion
  const fields = [
    fitmentDocument.fitment_text,
    fitmentDocument.customer_requirements,
    fitmentDocument.solution_fitment,
    fitmentDocument.remarks,
  ]
  const filled = fields.filter((f) => typeof f === 'string' && f.trim().length > 0).length
  return Math.round((filled / 4) * 100)
}

export function calculateOverallProgress(sections) {
  const p1 = calculateSection1Progress(sections?.executive_summary)
  const p2 = calculateSection2Progress(sections?.scope_of_work)
  const p3 = calculateSection3Progress(sections?.customization_integration)
  const p4 = calculateSection4Progress(sections?.terms_conditions)
  const p5 = calculateSection5Progress(sections?.fitment_document)

  const sectionPercentages = {
    executive_summary: p1,
    scope_of_work: p2,
    customization_integration: p3,
    terms_conditions: p4,
    fitment_document: p5,
  }

  const overall = Math.round((p1 + p2 + p3 + p4 + p5) / 5)

  const sectionStatus = {
    executive_summary: p1 === 0 ? 'empty' : p1 === 100 ? 'completed' : 'in_progress',
    scope_of_work: p2 === 0 ? 'empty' : p2 === 100 ? 'completed' : 'in_progress',
    customization_integration: p3 === 0 ? 'empty' : p3 === 100 ? 'completed' : 'in_progress',
    terms_conditions: p4 === 0 ? 'empty' : p4 === 100 ? 'completed' : 'in_progress',
    fitment_document: p5 === 0 ? 'empty' : p5 === 100 ? 'completed' : 'in_progress',
  }

  const completedCount = Object.values(sectionPercentages).filter((p) => p === 100).length

  return {
    overall,
    sectionPercentages,
    sectionStatus,
    completedCount,
    totalCount: 5,
    isComplete: overall === 100,
  }
}

// ---------------------------------------------------------------------------
// ProposalContentPage Component
// ---------------------------------------------------------------------------

export function ProposalContentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const proposalIdParam = searchParams.get('proposalId')
  const { clientInfo, setClientInfo, countryConfigs, calcApiResult } = useProposal()
  const [loadedCurrency, setLoadedCurrency] = useState(null)
  const [calcTotals, setCalcTotals] = useState(null)

  const storedId = getStoredProposalId()
  const proposalId = proposalIdParam || clientInfo?.proposalId || storedId || null

  useEffect(() => {
    if (proposalId) {
      persistProposalId(proposalId)
      if (String(clientInfo?.proposalId) !== String(proposalId) && typeof setClientInfo === 'function') {
        setClientInfo((prev) => ({ ...prev, proposalId: Number(proposalId) }))
      }
    }
  }, [proposalId, clientInfo?.proposalId, setClientInfo])
  const currency =
    loadedCurrency ||
    clientInfo?.currency ||
    calcTotals?.currency ||
    calcApiResult?.currency ||
    countryConfigs?.[0]?.currency ||
    'USD'
  const defaultDayRate = DEFAULT_RATE_CARD[currency] || 400

  // Active section tab (supports ?section=... or ?tab=... deep-linking from Review & Submit)
  const initialSectionParam = searchParams.get('section') || searchParams.get('tab')
  const normalizeSectionKey = (key) => {
    if (!key) return null
    const norm = key.replace(/-/g, '_')
    return ['executive_summary', 'scope_of_work', 'customization_integration', 'terms_conditions', 'fitment_document'].includes(norm)
      ? norm
      : null
  }
  const [activeTab, setActiveTab] = useState(() => normalizeSectionKey(initialSectionParam) || 'executive_summary')

  useEffect(() => {
    const targetSection = normalizeSectionKey(searchParams.get('section') || searchParams.get('tab'))
    if (targetSection) {
      setActiveTab(targetSection)
    }
  }, [searchParams])

  // Section 1: Executive Summary (All fields initially empty)
  const [execSummary, setExecSummary] = useState({
    customer_introduction: '',
    customer_objectives: '',
    value_proposition: '',
    conclusion: '',
  })

  // Section 2: Scope of Work (All fields initially empty)
  const [scopeOfWork, setScopeOfWork] = useState({
    license: '',
    implementation_plan: '',
    implementation_approach: '',
    in_scope: '',
    out_of_scope: '',
  })

  // Section 3: Customization & Integration (Initially empty table, none_required false)
  const [customizationIntegration, setCustomizationIntegration] = useState({
    none_required: false,
    items: [],
  })

  // Section 4: Terms & Conditions (All fields initially empty, no hardcoded arrays, validity defaults to 0)
  const [termsConditions, setTermsConditions] = useState({
    commercial_tc: '',
    payment_milestones: [],
    payment_terms_text: '',
    change_request_rates: [],
    proposal_validity_days: 0,
    terms_of_proposal: '',
  })

  // Dynamic Master Data for Dropdowns
  const [productFamilies, setProductFamilies] = useState([])
  const [masterRoles, setMasterRoles] = useState([])

  // Section 5: Fitment Document (All fields initially empty)
  const [fitmentDocument, setFitmentDocument] = useState({
    fitment_text: '',
    customer_requirements: '',
    solution_fitment: '',
    remarks: '',
  })

  // Attachments state
  const [attachments, setAttachments] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Save state
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Preview Modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  // Current combined sections payload
  const currentSectionsPayload = useMemo(
    () => ({
      executive_summary: execSummary,
      scope_of_work: scopeOfWork,
      customization_integration: customizationIntegration,
      terms_conditions: termsConditions,
      fitment_document: fitmentDocument,
    }),
    [execSummary, scopeOfWork, customizationIntegration, termsConditions, fitmentDocument]
  )

  // Dynamic Overall Progress calculation
  const progressMetrics = useMemo(
    () => calculateOverallProgress(currentSectionsPayload),
    [currentSectionsPayload]
  )

  // Load latest calculation snapshot for summary strip
  useEffect(() => {
    if (!proposalId) return
    let isMounted = true

    async function loadTotals() {
      try {
        const snap = await getLatestCalculation(proposalId)
        if (isMounted && snap?.snapshot_payload) {
          const t = readCalculationTotals(snap.snapshot_payload)
          setCalcTotals(t)
        }
      } catch (err) {
        if (calcApiResult) {
          const t = readCalculationTotals(calcApiResult)
          setCalcTotals(t)
        }
      }
    }
    loadTotals()
    return () => {
      isMounted = false
    }
  }, [proposalId, calcApiResult])

  // Fetch Master Data (L1 Product Families and Master Roles)
  useEffect(() => {
    let isMounted = true
    async function loadMasterData() {
      try {
        const [familiesRes, rolesRes] = await Promise.allSettled([
          getCatalogueFamilies('active'),
          getMasterRoles(),
        ])
        if (isMounted) {
          if (familiesRes.status === 'fulfilled' && Array.isArray(familiesRes.value)) {
            setProductFamilies(familiesRes.value)
          }
          if (rolesRes.status === 'fulfilled' && Array.isArray(rolesRes.value)) {
            setMasterRoles(rolesRes.value)
          }
        }
      } catch (err) {
        console.warn('Could not load catalogue families or roles:', err)
      }
    }
    loadMasterData()
    return () => {
      isMounted = false
    }
  }, [])

  // Load existing content from backend
  useEffect(() => {
    let isMounted = true
    if (!proposalId) {
      setIsLoading(false)
      return
    }

    async function loadContent() {
      try {
        setIsLoading(true)
        const data = await getProposalContent(proposalId)
        if (isMounted) {
          if (data?.currency) {
            setLoadedCurrency(data.currency)
          }

          if (data?.sections) {
            const s = data.sections

            // Section 1: Executive Summary
            if (s.executive_summary) {
              if (typeof s.executive_summary === 'object') {
                setExecSummary((prev) => ({ ...prev, ...s.executive_summary }))
              } else if (typeof s.executive_summary === 'string' && s.executive_summary.trim()) {
                setExecSummary((prev) => ({ ...prev, customer_introduction: s.executive_summary }))
              }
            }

            // Section 2: Scope of Work
            if (s.scope_of_work) {
              if (typeof s.scope_of_work === 'object') {
                setScopeOfWork((prev) => ({ ...prev, ...s.scope_of_work }))
              } else if (typeof s.scope_of_work === 'string' && s.scope_of_work.trim()) {
                setScopeOfWork((prev) => ({ ...prev, license: s.scope_of_work }))
              }
            }

            // Section 3: Customization & Integration
            if (s.customization_integration) {
              if (typeof s.customization_integration === 'object') {
                setCustomizationIntegration((prev) => ({ ...prev, ...s.customization_integration }))
              }
            }

            // Section 4: Terms & Conditions
            if (s.terms_conditions) {
              if (typeof s.terms_conditions === 'object') {
                setTermsConditions((prev) => ({
                  ...prev,
                  ...s.terms_conditions,
                  proposal_validity_days:
                    s.terms_conditions.proposal_validity_days !== undefined &&
                    s.terms_conditions.proposal_validity_days !== null
                      ? s.terms_conditions.proposal_validity_days
                      : 0,
                  payment_milestones: s.terms_conditions.payment_milestones || [],
                  change_request_rates: s.terms_conditions.change_request_rates || [],
                }))
              } else if (typeof s.terms_conditions === 'string' && s.terms_conditions.trim()) {
                setTermsConditions((prev) => ({ ...prev, commercial_tc: s.terms_conditions }))
              }
            }

          // Section 5: Fitment Document
          if (s.fitment_document) {
            if (typeof s.fitment_document === 'object') {
              setFitmentDocument((prev) => ({ ...prev, ...s.fitment_document }))
            } else if (typeof s.fitment_document === 'string' && s.fitment_document.trim()) {
              setFitmentDocument((prev) => ({ ...prev, fitment_text: s.fitment_document }))
            }
          }

          if (data.attachments) {
            setAttachments(data.attachments)
          }

          setSaveStatus('saved')
          setLastSavedAt(new Date().toLocaleTimeString())
        }
      }
    } catch (err) {
        console.warn('Could not load proposal content from backend:', err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadContent()
    return () => {
      isMounted = false
    }
  }, [proposalId])

  // Autosave debounce timer
  const autoSaveTimerRef = useRef(null)

  const triggerSave = useCallback(
    async (payloadSections) => {
      if (!proposalId) return
      setSaveStatus('saving')
      setErrorMessage(null)

      try {
        await updateProposalContent(proposalId, payloadSections)
        setSaveStatus('saved')
        setLastSavedAt(new Date().toLocaleTimeString())
      } catch (err) {
        setSaveStatus('error')
        setErrorMessage(err.response?.data?.detail || err.message || 'Autosave failed.')
      }
    },
    [proposalId]
  )

  const scheduleAutosave = useCallback(
    (newSections) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
      autoSaveTimerRef.current = setTimeout(() => {
        triggerSave(newSections)
      }, 1000)
    },
    [triggerSave]
  )

  // ---------------------------------------------------------------------------
  // Handlers for Section 1: Executive Summary
  // ---------------------------------------------------------------------------
  const handleExecChange = (field, value) => {
    const updated = { ...execSummary, [field]: value }
    setExecSummary(updated)
    scheduleAutosave({ ...currentSectionsPayload, executive_summary: updated })
  }

  const handleInsertExecTemplate = () => {
    const clientName = clientInfo?.clientName || clientInfo?.companyName || 'Enterprise Client'
    const template = {
      customer_introduction: `Adrenalin eSystems is pleased to present this comprehensive Human Capital Management (HCM) transformation proposal for ${clientName}. With over 25 years of proven global HR technology innovation and operations spanning 70+ countries, Adrenalin delivers an enterprise-grade, AI-first platform designed to simplify workforce complexity and streamline talent journeys.`,
      customer_objectives: `1. Modernize core HR and automated payroll operations with seamless statutory compliance across all operational territories.\n2. Empower employees and people leaders with unified, mobile-first self-service experiences.\n3. Eliminate manual HR operational redundancies, improve administrative efficiency, and deliver real-time workforce analytics to executive leadership.`,
      value_proposition: `Adrenalin's unified HCM suite addresses enterprise complexity through highly configurable workflows, robust open REST APIs, enterprise-grade Microsoft Azure cloud hosting, and certified ISO 27001 / SOC 2 Type II data security covenants.`,
      conclusion: `We look forward to partnering with ${clientName} to accelerate digital HR modernization, empower your workforce, and deliver measurable operational value across the entire talent lifecycle.`,
    }
    setExecSummary(template)
    scheduleAutosave({ ...currentSectionsPayload, executive_summary: template })
  }

  // ---------------------------------------------------------------------------
  // Handlers for Section 2: Scope of Work
  // ---------------------------------------------------------------------------
  const handleScopeChange = (field, value) => {
    const updated = { ...scopeOfWork, [field]: value }
    setScopeOfWork(updated)
    scheduleAutosave({ ...currentSectionsPayload, scope_of_work: updated })
  }

  const handleInsertConfiguratorSummary = () => {
    const clientName = clientInfo?.clientName || clientInfo?.companyName || 'Enterprise Client'
    const countryNames = (countryConfigs || []).map((c) => c.countryName || 'Primary').join(', ')
    const totalHeadcount = (countryConfigs || []).reduce((acc, c) => acc + (Number(c.headcount) || 0), 0)
    const deployment = clientInfo?.deploymentModel || 'Cloud SaaS (MS Azure)'
    const termMonths = clientInfo?.contractTermMonths || 36

    const licenseText = `Licensed Software: Adrenalin HCM Cloud Edition\nDeployment Model: ${deployment}\nTerritory Coverage: ${countryNames || 'Primary territory'}\nTotal Employee Licenses: ${totalHeadcount ? totalHeadcount.toLocaleString() : 'Per Schedule'}\nContract Duration: ${termMonths} Months (${Math.round(termMonths / 12)} Years)`

    const planText = `Phase 1: Project Initiation, Environment Setup & Kick-off (Weeks 1-2)\nPhase 2: Functional Blueprinting, Business Process Mapping & Gap Analysis (Weeks 3-6)\nPhase 3: System Configuration, Data Migration & API Integration (Weeks 7-12)\nPhase 4: User Acceptance Testing (UAT) & End-User Training (Weeks 13-16)\nPhase 5: Production Cutover, Go-Live & Post Go-Live Hypercare Support (Weeks 17-20)`

    const inScopeText = `• End-to-end configuration of Core HR Foundation, Employee Master, and Organization Structure.\n• Multi-country Payroll rules engine configuration for defined territories.\n• Employee Self-Service (ESS) and Manager Self-Service (MSS) web portal and mobile app rollout.\n• Leave, Attendance, and Holiday Calendar configuration.\n• Standard HR management reports, audit trails, and statutory compliance reports.`

    const outScopeText = `• Custom integration with legacy proprietary databases not exposing standard REST/SOAP APIs.\n• Data cleansing or manual data remediation of legacy employee records.\n• Hardware procurement, on-premise operating system administration, or network infrastructure provisioning.\n• Custom software feature developments outside the documented customization items schedule.`

    const updated = {
      license: licenseText,
      implementation_plan: planText,
      implementation_approach:
        'Adrenalin Rollout Methodology (ARM) emphasizing iterative sprint deliveries, weekly joint governance steering reviews, and formal signoffs at each phase gateway.',
      in_scope: inScopeText,
      out_of_scope: outScopeText,
    }
    setScopeOfWork(updated)
    scheduleAutosave({ ...currentSectionsPayload, scope_of_work: updated })
  }

  // ---------------------------------------------------------------------------
  // Handlers for Section 3: Customization & Integration
  // ---------------------------------------------------------------------------
  const handleToggleNoneRequired = (e) => {
    const checked = e.target.checked
    const updated = { ...customizationIntegration, none_required: checked }
    setCustomizationIntegration(updated)
    scheduleAutosave({ ...currentSectionsPayload, customization_integration: updated })
  }

  const handleAddCustomizationRow = (type = 'Customization') => {
    const defaultModule = productFamilies[0]?.name || ''
    const newRow = {
      id: Date.now().toString(),
      type,
      title: '',
      module: defaultModule,
      system: '',
      description: '',
      effort_days: 0,
      chargeable: true,
    }
    const updatedItems = [...(customizationIntegration.items || []), newRow]
    const updated = { ...customizationIntegration, items: updatedItems, none_required: false }
    setCustomizationIntegration(updated)
    scheduleAutosave({ ...currentSectionsPayload, customization_integration: updated })
  }

  const handleUpdateItem = (index, field, value) => {
    const updatedItems = [...(customizationIntegration.items || [])]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    const updated = { ...customizationIntegration, items: updatedItems }
    setCustomizationIntegration(updated)
    scheduleAutosave({ ...currentSectionsPayload, customization_integration: updated })
  }

  const handleRemoveItem = (index) => {
    const updatedItems = [...(customizationIntegration.items || [])]
    updatedItems.splice(index, 1)
    const updated = { ...customizationIntegration, items: updatedItems }
    setCustomizationIntegration(updated)
    scheduleAutosave({ ...currentSectionsPayload, customization_integration: updated })
  }

  const custItems = (customizationIntegration.items || []).filter((i) => i.type === 'Customization')
  const integItems = (customizationIntegration.items || []).filter((i) => i.type === 'Integration')
  const totalCustomizationCount = custItems.length
  const totalIntegrationCount = integItems.length
  const totalEffortDays = (customizationIntegration.items || []).reduce(
    (acc, i) => acc + (Number(i.effort_days) || 0),
    0
  )
  const totalChargeableEffort = (customizationIntegration.items || []).reduce(
    (acc, i) => (i.chargeable ? acc + (Number(i.effort_days) || 0) : acc),
    0
  )
  const indicativeChargeableAmount = totalChargeableEffort * defaultDayRate

  // ---------------------------------------------------------------------------
  // Handlers for Section 4: Terms & Conditions
  // ---------------------------------------------------------------------------
  const handleTermsChange = (field, value) => {
    const updated = { ...termsConditions, [field]: value }
    setTermsConditions(updated)
    scheduleAutosave({ ...currentSectionsPayload, terms_conditions: updated })
  }

  const handleInsertTermsTemplate = () => {
    const updated = {
      ...termsConditions,
      commercial_tc:
        'All indicated commercials are exclusive of statutory taxes, VAT, and GST.\nAnnual subscription fees are billed quarterly in advance with Net 30 days payment window.\nStandard SLA guarantee of 99.5% cloud platform uptime with 24x7 critical incident response.',
      payment_terms_text:
        'Invoices shall be raised upon formal signoff of the respective milestone deliverables. Payment is due within 30 days of invoice receipt.',
      terms_of_proposal:
        'Upon receipt of formal Customer Purchase Order (PO), Adrenalin shall initiate the Order Acceptance (OA) process within 3-5 business days. Access credentials and cloud instance provisioning shall commence immediately following OA approval.',
    }
    setTermsConditions(updated)
    scheduleAutosave({ ...currentSectionsPayload, terms_conditions: updated })
  }

  const handleAddMilestone = () => {
    const newM = { milestone: '', percentage: 0 }
    const updatedMilestones = [...(termsConditions.payment_milestones || []), newM]
    const updated = { ...termsConditions, payment_milestones: updatedMilestones }
    setTermsConditions(updated)
    scheduleAutosave({ ...currentSectionsPayload, terms_conditions: updated })
  }

  const handleUpdateMilestone = (index, field, value) => {
    const updatedMilestones = [...(termsConditions.payment_milestones || [])]
    updatedMilestones[index] = {
      ...updatedMilestones[index],
      [field]: field === 'percentage' ? (value === '' ? '' : parseFloat(value) || 0) : value,
    }
    const updated = { ...termsConditions, payment_milestones: updatedMilestones }
    setTermsConditions(updated)
    scheduleAutosave({ ...currentSectionsPayload, terms_conditions: updated })
  }

  const handleRemoveMilestone = (index) => {
    const updatedMilestones = [...(termsConditions.payment_milestones || [])]
    updatedMilestones.splice(index, 1)
    const updated = { ...termsConditions, payment_milestones: updatedMilestones }
    setTermsConditions(updated)
    scheduleAutosave({ ...currentSectionsPayload, terms_conditions: updated })
  }

  const milestoneSum = (termsConditions.payment_milestones || []).reduce(
    (acc, m) => acc + (Number(m.percentage) || 0),
    0
  )
  const isMilestoneValid = (termsConditions.payment_milestones || []).length > 0 && Math.abs(milestoneSum - 100) < 0.01

  const handlePrefillRateCard = async () => {
    try {
      const activeRates = await getServiceRates({ status: 'active' })
      if (Array.isArray(activeRates) && activeRates.length > 0) {
        // Retrieve rates applicable to the proposal's deal currency
        const matchingRates = activeRates.filter(
          (sr) => sr.currency?.code?.toUpperCase() === currency?.toUpperCase()
        )
        const ratesToUse = matchingRates.length > 0 ? matchingRates : activeRates

        const seenRoles = new Set()
        const prefilled = []
        for (const sr of ratesToUse) {
          if (sr.role_name && !seenRoles.has(sr.role_name)) {
            seenRoles.add(sr.role_name)
            prefilled.push({
              role: sr.role_name,
              rate_per_day: Number(sr.daily_rate) || defaultDayRate,
              currency,
            })
          }
        }
        if (prefilled.length > 0) {
          const updated = { ...termsConditions, change_request_rates: prefilled }
          setTermsConditions(updated)
          scheduleAutosave({ ...currentSectionsPayload, terms_conditions: updated })
          return
        }
      }
    } catch (e) {
      console.warn('Could not fetch active service rates:', e)
    }

    // Dynamic fallback to masterRoles using the deal currency
    const prefilled = (masterRoles || []).map((r, idx) => ({
      role: r.name,
      rate_per_day: Math.round(defaultDayRate * (1 + idx * 0.15)),
      currency,
    }))
    const updated = { ...termsConditions, change_request_rates: prefilled }
    setTermsConditions(updated)
    scheduleAutosave({ ...currentSectionsPayload, terms_conditions: updated })
  }

  const handleAddCrRole = () => {
    const newRole = { role: '', rate_per_day: 0, currency }
    const updatedRates = [...(termsConditions.change_request_rates || []), newRole]
    const updated = { ...termsConditions, change_request_rates: updatedRates }
    setTermsConditions(updated)
    scheduleAutosave({ ...currentSectionsPayload, terms_conditions: updated })
  }

  const handleUpdateCrRole = (index, field, value) => {
    const updatedRates = [...(termsConditions.change_request_rates || [])]
    updatedRates[index] = {
      ...updatedRates[index],
      currency,
      [field]: field === 'rate_per_day' ? (value === '' ? '' : parseFloat(value) || 0) : value,
    }
    const updated = { ...termsConditions, change_request_rates: updatedRates }
    setTermsConditions(updated)
    scheduleAutosave({ ...currentSectionsPayload, terms_conditions: updated })
  }

  const handleRemoveCrRole = (index) => {
    const updatedRates = [...(termsConditions.change_request_rates || [])]
    updatedRates.splice(index, 1)
    const updated = { ...termsConditions, change_request_rates: updatedRates }
    setTermsConditions(updated)
    scheduleAutosave({ ...currentSectionsPayload, terms_conditions: updated })
  }

  // ---------------------------------------------------------------------------
  // Handlers for Section 5: Fitment Document
  // ---------------------------------------------------------------------------
  const handleFitmentChange = (field, value) => {
    const updated = { ...fitmentDocument, [field]: value }
    setFitmentDocument(updated)
    scheduleAutosave({ ...currentSectionsPayload, fitment_document: updated })
  }

  const handleInsertFitmentTemplate = () => {
    const updated = {
      fitment_text:
        'The proposed Adrenalin HCM platform fulfills 96% of enterprise business requirements out-of-the-box. The remaining 4% represents client-specific workflow configurations fully accommodated within the implementation timeline.',
      customer_requirements:
        'Multi-entity organizational hierarchy, localized payroll engines for operational territories, unified self-service mobile app, and automated biometric attendance sync.',
      solution_fitment:
        'Core HCM, Global Payroll, Talent Acquisition, Performance Management, and Employee Helpdesk modules completely satisfy the technical evaluation criteria.',
      remarks:
        'Cloud hosting hosted within Tier 4 Microsoft Azure data centers with continuous disaster recovery replication and ISO 27001 / SOC 2 certification.',
    }
    setFitmentDocument(updated)
    scheduleAutosave({ ...currentSectionsPayload, fitment_document: updated })
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !proposalId) return

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!['.docx', '.xlsx', '.pdf'].includes(ext)) {
      alert(`Unsupported file format '${ext}'. Only .docx, .xlsx, and .pdf files are supported.`)
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      alert(`File size ${(file.size / (1024 * 1024)).toFixed(1)}MB exceeds 20MB limit.`)
      return
    }

    try {
      setIsUploading(true)
      const uploaded = await uploadProposalAttachment(proposalId, file)
      setAttachments((prev) => [...prev, uploaded])
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'File upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteAttachment = async (documentId) => {
    if (!confirm('Are you sure you want to remove this attachment?')) return
    try {
      await deleteProposalAttachment(proposalId, documentId)
      setAttachments((prev) => prev.filter((a) => a.id !== documentId))
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Failed to delete attachment.')
    }
  }

  // ---------------------------------------------------------------------------
  // Export DOCX handler
  // ---------------------------------------------------------------------------
  const handleExportDocx = async () => {
    if (!proposalId) {
      alert('Please select or save a proposal first.')
      return
    }
    try {
      setSaveStatus('saving')
      await updateProposalContent(proposalId, currentSectionsPayload)
      setSaveStatus('saved')
      setLastSavedAt(new Date().toLocaleTimeString())

      const res = await exportProposal(proposalId, 'docx')
      let filename = `Proposal_${proposalId}.docx`
      const disposition = res.headers?.['content-disposition']
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/)
        if (match && match[1]) filename = match[1]
      }
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Export failed.')
    }
  }

  // ---------------------------------------------------------------------------
  // Section Navigation Handlers
  // ---------------------------------------------------------------------------
  const currentSectionIndex = SECTIONS_CONFIG.findIndex((s) => s.id === activeTab)

  const handlePreviousSection = () => {
    if (currentSectionIndex > 0) {
      setActiveTab(SECTIONS_CONFIG[currentSectionIndex - 1].id)
    } else {
      const q = proposalId ? `?proposalId=${proposalId}` : ''
      navigate(`/pricing-discounts${q}`)
    }
  }

  const handleNextSection = () => {
    if (currentSectionIndex < SECTIONS_CONFIG.length - 1) {
      setActiveTab(SECTIONS_CONFIG[currentSectionIndex + 1].id)
    } else {
      const q = proposalId ? `?proposalId=${proposalId}` : ''
      navigate(`/proposals${q}`)
    }
  }

  const activeSectionPct = progressMetrics.sectionPercentages[activeTab] || 0
  const activeSectionStatus = progressMetrics.sectionStatus[activeTab] || 'empty'

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F8FAFC] text-slate-800 font-sans">
      {/* 1. Header & Navigation Top Nav */}
      <CatalogueTopNav activeSection="content" />

      {/* 2. Proposal Summary Strip (Sticky below workflow nav) */}
      <SummaryStrip
        clientName={clientInfo?.clientName || clientInfo?.companyName || 'Enterprise Client'}
        proposalCode={clientInfo?.proposalCode || (proposalId ? `PROP-${proposalId}` : null)}
        proposalStatus={clientInfo?.status || 'Draft'}
        countriesValue={`${countryConfigs?.length || 1} Configured`}
        productLinesValue={`${countryConfigs?.[0]?.productPacks?.length || 3} Modules`}
        pricingFcv={calcTotals?.subscriptionContractFormatted || '—'}
        servicesValue={calcTotals?.servicesFormatted || '—'}
        grandTotal={calcTotals?.contractTotalFormatted || '—'}
      />

      {/* 3. Main Workspace Body: Two-column layout with independent scrolling */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 bg-[#F8FAFC]">
        {/* Left Sidebar: 5 Main Sections (Independently Scrollable) */}
        <aside
          aria-label="Proposal Content Sections"
          className="w-full lg:w-80 xl:w-88 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0 overflow-y-auto p-4 sm:p-5 space-y-5"
        >
          {/* Header & Overall Completion */}
          <div className="space-y-2 pb-4 border-b border-slate-100">
            <div className="text-[10px] uppercase tracking-wider font-bold text-orange-600">
              Step 4 of 6 · Document Narrative
            </div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">Proposal Content</h1>

            {/* Overall Completion Percentage Header */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold text-slate-700 uppercase tracking-wide">
                  PROPOSAL CONTENT · {progressMetrics.overall}%
                </span>
                <span className="font-bold text-orange-600 font-mono">
                  {progressMetrics.completedCount}/5
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-600 transition-all duration-300 rounded-full"
                  style={{ width: `${progressMetrics.overall}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                {progressMetrics.completedCount} of 5 sections completed
              </div>
            </div>

            {/* Autosave Status Badge */}
            <div className="pt-2 flex items-center justify-between">
              <div>
                {saveStatus === 'saving' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Saved automatically {lastSavedAt ? `at ${lastSavedAt}` : ''}
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                    Save failed
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                title="Preview Proposal Document"
              >
                <Eye className="w-3.5 h-3.5 text-slate-600" />
                Preview
              </button>
            </div>
          </div>

          {/* Section Navigation Buttons: Exactly 5 Sections */}
          <nav className="space-y-2" aria-label="Content Section Navigation">
            {SECTIONS_CONFIG.map((sec) => {
              const isSelected = activeTab === sec.id
              const pct = progressMetrics.sectionPercentages[sec.id] || 0
              const status = progressMetrics.sectionStatus[sec.id] || 'empty'
              const isDone = status === 'completed'
              const isInProgress = status === 'in_progress'

              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveTab(sec.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-orange-50/60 border-orange-400 ring-2 ring-orange-200 shadow-2xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3 w-full">
                    {/* Status Circle Indicator */}
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5 ${
                        isDone
                          ? 'bg-emerald-100 text-emerald-800'
                          : isInProgress
                          ? 'bg-orange-100 text-orange-800 font-bold'
                          : isSelected
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isDone ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : sec.step}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-[13px] font-bold ${isSelected ? 'text-orange-950' : 'text-slate-900'}`}>
                          {sec.title}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            isDone
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isInProgress
                              ? 'bg-orange-50 text-orange-700 border border-orange-200'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {isDone ? 'Completed' : isInProgress ? 'In Progress' : 'Empty'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                        {sec.description}
                      </div>
                    </div>
                  </div>

                  {/* Individual Section Progress Bar */}
                  <div className="w-full pt-1">
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          isDone ? 'bg-emerald-600' : 'bg-orange-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Quick Actions */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <button
              type="button"
              onClick={handleExportDocx}
              className="w-full py-2 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-orange-600" />
              Download Word Proposal (.docx)
            </button>
          </div>
        </aside>

        {/* Right Main Content Panel (Independently Vertically Scrollable) */}
        <main
          className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 lg:p-8"
          aria-label="Active Proposal Section Editor"
        >
          <div className="max-w-4xl mx-auto space-y-6 pb-20">
            {/* Warning if no proposal */}
            {!proposalId && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-900 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-950">No active proposal selected</div>
                  <p className="mt-0.5 text-amber-800">
                    Content will be stored in local draft. To persist into PostgreSQL, import a deal from HubSpot (Step 1) or save a proposal in the Configurator (Step 2).
                  </p>
                </div>
              </div>
            )}

            {/* TOP COMPLETION INDICATOR BANNER */}
            <div
              data-testid="top-completion-indicator"
              className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 font-bold font-mono text-xl shadow-2xs">
                    {progressMetrics.overall}%
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">Proposal Content Completion</h2>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                          progressMetrics.isComplete
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : progressMetrics.overall > 0
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {progressMetrics.isComplete ? 'Complete' : progressMetrics.overall > 0 ? 'In Progress' : 'Empty'}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      {progressMetrics.completedCount} of 5 sections completed (20% per main section)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    aria-label="Save Content"
                    onClick={() => triggerSave(currentSectionsPayload)}
                    disabled={saveStatus === 'saving'}
                    className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5 text-slate-600" />
                    {saveStatus === 'saving' ? 'Saving...' : 'Save Content'}
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-600 transition-all duration-300 rounded-full"
                    style={{ width: `${progressMetrics.overall}%` }}
                    role="progressbar"
                    aria-valuenow={progressMetrics.overall}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>0% · Empty</span>
                  <span className="font-bold text-orange-600">{progressMetrics.overall}%</span>
                  <span>100% · Complete</span>
                </div>
              </div>
            </div>

            {/* SECTION 1: EXECUTIVE SUMMARY */}
            {activeTab === 'executive_summary' && (
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-6">
                <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-orange-600 font-bold text-[11px] uppercase tracking-wider">
                      <FileText className="w-4 h-4" />
                      Section 01
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">Executive Summary</h2>
                    <p className="text-[13px] text-slate-500 mt-0.5">
                      Articulate the customer business challenges, Adrenalin HCM strategic value proposition, expected operational outcomes, and business impact.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <span
                      data-testid="section-completion-badge"
                      className={`text-xs font-bold font-mono px-3 py-1 rounded-full border ${
                        activeSectionPct === 100
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : activeSectionPct > 0
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {activeSectionPct}% complete
                    </span>

                    <button
                      type="button"
                      onClick={handleInsertExecTemplate}
                      className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                      Insert Template
                    </button>
                  </div>
                </div>

                {/* 1. Customer Introduction */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-slate-700">
                      1. Customer Introduction
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {execSummary.customer_introduction.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={execSummary.customer_introduction}
                    onChange={(e) => handleExecChange('customer_introduction', e.target.value)}
                    placeholder="Describe customer identity, company footprint, industry segment, and commercial engagement context..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 2. Customer Objectives */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-slate-700">
                      2. Customer Objectives
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {execSummary.customer_objectives.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={execSummary.customer_objectives}
                    onChange={(e) => handleExecChange('customer_objectives', e.target.value)}
                    placeholder="Specify business outcomes, customer expectations, and operational problems to solve..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 3. Value Proposition */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-slate-700">
                      3. Value Proposition
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {execSummary.value_proposition.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={execSummary.value_proposition}
                    onChange={(e) => handleExecChange('value_proposition', e.target.value)}
                    placeholder="Explain why Adrenalin is uniquely qualified, key solution differentiators, and strategic benefits..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 4. Conclusion */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-slate-700">
                      4. Conclusion & Strategic Alignment
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {execSummary.conclusion.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={execSummary.conclusion}
                    onChange={(e) => handleExecChange('conclusion', e.target.value)}
                    placeholder="Summary of proposed engagement, expected business value, and formal closing statement..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* SECTION 2: SCOPE OF WORK */}
            {activeTab === 'scope_of_work' && (
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-6">
                <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-orange-600 font-bold text-[11px] uppercase tracking-wider">
                      <FileText className="w-4 h-4" />
                      Section 02
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">Scope of Work</h2>
                    <p className="text-[13px] text-slate-500 mt-0.5">
                      Define solution modules included, employee coverage, deployment model, and delivery deliverables.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <span
                      data-testid="section-completion-badge"
                      className={`text-xs font-bold font-mono px-3 py-1 rounded-full border ${
                        activeSectionPct === 100
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : activeSectionPct > 0
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {activeSectionPct}% complete
                    </span>

                    <button
                      type="button"
                      onClick={handleInsertConfiguratorSummary}
                      className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                      Insert summary from Configurator
                    </button>
                  </div>
                </div>

                {/* 1. License Scope */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-slate-700">
                      1. License Scope
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {scopeOfWork.license.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={scopeOfWork.license}
                    onChange={(e) => handleScopeChange('license', e.target.value)}
                    placeholder="Licensed products, modules, licensed headcount, deployment model, and contract duration..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 2. Implementation Plan */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-slate-700">
                      2. Implementation Plan
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {scopeOfWork.implementation_plan.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    value={scopeOfWork.implementation_plan}
                    onChange={(e) => handleScopeChange('implementation_plan', e.target.value)}
                    placeholder="Implementation phases, key rollout activities, gateway milestones, and estimated delivery timelines..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 3. Implementation Approach (Optional) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-slate-700">
                      3. Implementation Approach & Governance <span className="font-normal text-slate-400">(Optional)</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {scopeOfWork.implementation_approach.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={scopeOfWork.implementation_approach}
                    onChange={(e) => handleScopeChange('implementation_approach', e.target.value)}
                    placeholder="Methodology (ARM), project steering committee cadence, and customer counterpart responsibilities..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 4. In Scope */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-slate-700">
                      4. In-Scope Deliverables & Responsibilities
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {scopeOfWork.in_scope.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={scopeOfWork.in_scope}
                    onChange={(e) => handleScopeChange('in_scope', e.target.value)}
                    placeholder="Detail specific deliverables, tasks performed by Adrenalin consultants, and project acceptance criteria..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 5. Out of Scope */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-slate-700">
                      5. Out-of-Scope Items & Assumptions
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {scopeOfWork.out_of_scope.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={scopeOfWork.out_of_scope}
                    onChange={(e) => handleScopeChange('out_of_scope', e.target.value)}
                    placeholder="Explicit exclusions, external dependencies, and operational boundary assumptions..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* SECTION 3: CUSTOMIZATION & INTEGRATION */}
            {activeTab === 'customization_integration' && (
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-6">
                <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-orange-600 font-bold text-[11px] uppercase tracking-wider">
                      <FileText className="w-4 h-4" />
                      Section 03
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">
                      Customization & System Integrations
                    </h2>
                    <p className="text-[13px] text-slate-500 mt-0.5">
                      Specify custom feature requirements, API connectors, effort estimates, and chargeable status.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <span
                      data-testid="section-completion-badge"
                      className={`text-xs font-bold font-mono px-3 py-1 rounded-full border ${
                        activeSectionPct === 100
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : activeSectionPct > 0
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {activeSectionPct}% complete
                    </span>

                    <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-[12px] font-semibold text-slate-800 cursor-pointer hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={customizationIntegration.none_required}
                        onChange={handleToggleNoneRequired}
                        className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
                      />
                      <span>None Required (OOB Standard)</span>
                    </label>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Customizations</span>
                    <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">{totalCustomizationCount}</div>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Integrations</span>
                    <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">{totalIntegrationCount}</div>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Effort (Days)</span>
                    <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">{totalEffortDays} Days</div>
                  </div>
                  <div className="p-3.5 bg-orange-50/70 rounded-xl border border-orange-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-orange-800">Indicative Chargeable</span>
                    <div className="text-lg font-bold font-mono text-orange-700 mt-0.5">
                      {formatMoney(indicativeChargeableAmount, currency)}
                    </div>
                  </div>
                </div>

                {/* Structured Table */}
                {!customizationIntegration.none_required && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-slate-700">
                        Structured Items ({customizationIntegration.items?.length || 0})
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddCustomizationRow('Customization')}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-orange-600" />
                          Add Customization
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddCustomizationRow('Integration')}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-orange-600" />
                          Add Integration
                        </button>
                      </div>
                    </div>

                    {customizationIntegration.items?.length === 0 ? (
                      <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center bg-slate-50/50 text-[12px] text-slate-500">
                        No customizations or integrations added yet. Click 'Add Customization', 'Add Integration', or check 'None Required'.
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
                        <table className="w-full text-left text-[12px] divide-y divide-slate-200">
                          <thead className="bg-slate-50 text-slate-600 font-bold">
                            <tr>
                              <th className="p-2.5 w-10 text-center">#</th>
                              <th className="p-2.5 w-24">Type</th>
                              <th className="p-2.5 w-40">Title</th>
                              <th className="p-2.5 w-32">Module</th>
                              <th className="p-2.5 w-32">System</th>
                              <th className="p-2.5">Description</th>
                              <th className="p-2.5 w-20 text-right">Days</th>
                              <th className="p-2.5 w-16 text-center">Chg</th>
                              <th className="p-2.5 w-10 text-center"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {(customizationIntegration.items || []).map((item, idx) => (
                              <tr key={item.id || idx} className="hover:bg-slate-50/50">
                                <td className="p-2 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                <td className="p-2">
                                  <select
                                    aria-label="Type"
                                    value={item.type || 'Customization'}
                                    onChange={(e) => handleUpdateItem(idx, 'type', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-semibold text-slate-900"
                                  >
                                    <option value="Customization">Customization</option>
                                    <option value="Integration">Integration</option>
                                    <option value="Report">Report</option>
                                    <option value="Workflow">Workflow</option>
                                  </select>
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    placeholder="Title..."
                                    value={item.title}
                                    onChange={(e) => handleUpdateItem(idx, 'title', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[12px] font-semibold text-slate-900"
                                  />
                                </td>
                                <td className="p-2">
                                  <select
                                    aria-label="Module"
                                    value={item.module || ''}
                                    onChange={(e) => handleUpdateItem(idx, 'module', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-800"
                                  >
                                    {productFamilies.length === 0 ? (
                                      <option value="" disabled>
                                        No L1 Product Families available
                                      </option>
                                    ) : (
                                      <>
                                        <option value="">Select Module...</option>
                                        {item.module && !productFamilies.some((f) => f.name === item.module) && (
                                          <option value={item.module}>{item.module}</option>
                                        )}
                                        {productFamilies.map((fam) => (
                                          <option key={fam.id || fam.code || fam.name} value={fam.name}>
                                            {fam.name}
                                          </option>
                                        ))}
                                      </>
                                    )}
                                  </select>
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={item.system}
                                    onChange={(e) => handleUpdateItem(idx, 'system', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-700"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={item.description}
                                    onChange={(e) => handleUpdateItem(idx, 'description', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-600"
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.effort_days}
                                    onChange={(e) => handleUpdateItem(idx, 'effort_days', parseFloat(e.target.value) || 0)}
                                    className="w-16 px-1.5 py-1 bg-white border border-slate-200 rounded text-[11px] font-mono font-bold text-right text-slate-900"
                                  />
                                </td>
                                <td className="p-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={item.chargeable}
                                    onChange={(e) => handleUpdateItem(idx, 'chargeable', e.target.checked)}
                                    className="w-4 h-4 text-orange-600 rounded border-slate-300"
                                  />
                                </td>
                                <td className="p-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(idx)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                    title="Remove item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 4: TERMS & CONDITIONS */}
            {activeTab === 'terms_conditions' && (
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-6">
                <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-orange-600 font-bold text-[11px] uppercase tracking-wider">
                      <FileText className="w-4 h-4" />
                      Section 04
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">
                      Terms & Conditions, Payment Milestones & Rates
                    </h2>
                    <p className="text-[13px] text-slate-500 mt-0.5">
                      Define payment terms, contract duration, renewal terms, SLA commitments, and validate that payment milestones sum to 100%.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <span
                      data-testid="section-completion-badge"
                      className={`text-xs font-bold font-mono px-3 py-1 rounded-full border ${
                        activeSectionPct === 100
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : activeSectionPct > 0
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {activeSectionPct}% complete
                    </span>

                    <button
                      type="button"
                      onClick={handleInsertTermsTemplate}
                      className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                      Insert Template
                    </button>
                  </div>
                </div>

                {/* Subsection A: T&C for Commercials */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-slate-700">
                      A. Commercial Terms & Conditions
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {termsConditions.commercial_tc.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={termsConditions.commercial_tc}
                    onChange={(e) => handleTermsChange('commercial_tc', e.target.value)}
                    placeholder="Specify applicable taxes, billing frequency, cloud infrastructure assumptions, and SLA standards..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* Subsection B: Payment Milestones */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[12px] font-bold text-slate-700">
                        B. Payment Milestone Breakdown (Must sum to 100%)
                      </label>
                      <div className="text-[11px] text-slate-400">Total milestone percentages must strictly equal 100%</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full ${
                          isMilestoneValid
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        Current Total: {milestoneSum}% {isMilestoneValid ? '✓ Valid' : '✗ Must equal 100%'}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddMilestone}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-orange-600" />
                        Add Milestone
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs divide-y divide-slate-100 bg-white">
                    {(!termsConditions.payment_milestones || termsConditions.payment_milestones.length === 0) ? (
                      <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center bg-slate-50/50 text-[12px] text-slate-500">
                        No payment milestones added yet. Click 'Add Milestone' to define payment schedule.
                      </div>
                    ) : (
                      termsConditions.payment_milestones.map((m, idx) => (
                        <div key={idx} className="p-3 flex items-center gap-3 hover:bg-slate-50/50">
                          <input
                            type="text"
                            aria-label="Milestone description"
                            placeholder="Milestone description..."
                            value={m.milestone || ''}
                            onChange={(e) => handleUpdateMilestone(idx, 'milestone', e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                          />
                          <div className="flex items-center gap-1.5 w-28">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              aria-label="Percentage"
                              value={m.percentage ?? 0}
                              onChange={(e) => handleUpdateMilestone(idx, 'percentage', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-900 font-mono font-bold text-right focus:outline-none focus:border-orange-500 shadow-2xs"
                            />
                            <span className="text-slate-500 font-mono text-[12px] font-semibold">%</span>
                          </div>
                          <button
                            type="button"
                            aria-label="Remove milestone"
                            onClick={() => handleRemoveMilestone(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Warning banner when milestone sum is not 100% */}
                  {!isMilestoneValid && (termsConditions.payment_milestones || []).length > 0 && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>
                        {milestoneSum < 100
                          ? `Payment milestone total is currently ${milestoneSum}%. Add ${100 - milestoneSum}% to equal 100%.`
                          : `Payment milestone total is currently ${milestoneSum}%. Reduce by ${milestoneSum - 100}% to equal 100%.`}
                      </span>
                    </div>
                  )}

                  {/* Payment Terms Text Editor */}
                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Payment Terms Narrative
                    </label>
                    <textarea
                      rows={2}
                      value={termsConditions.payment_terms_text}
                      onChange={(e) => handleTermsChange('payment_terms_text', e.target.value)}
                      placeholder="Invoicing schedule, payment window (e.g. Net 30 days), and wire instructions..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-[12px] text-slate-800 shadow-2xs"
                    />
                  </div>
                </div>

                {/* Subsection C: Change Request Rates */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-[12px] font-bold text-slate-700">
                          C. Change Request Rates
                        </label>
                        <span className="text-[12px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                          Rate / Day ({currency})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Rates applied to out-of-scope work requested post kick-off · All values in {currency}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePrefillRateCard}
                        className="px-2.5 py-1 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                        Prefill from Rate Card
                      </button>
                      <button
                        type="button"
                        aria-label="Add Role"
                        onClick={handleAddCrRole}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-orange-600" />
                        + Role
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs divide-y divide-slate-100 bg-white">
                    {(!termsConditions.change_request_rates || termsConditions.change_request_rates.length === 0) ? (
                      <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center bg-slate-50/50 text-[12px] text-slate-500">
                        No change request roles added yet. Click '+ Role' to add custom man-day rates.
                      </div>
                    ) : (
                      termsConditions.change_request_rates.map((cr, idx) => (
                        <div key={idx} className="p-2.5 flex items-center gap-3 hover:bg-slate-50/50">
                          <input
                            type="text"
                            aria-label="Role"
                            placeholder="Enter role name..."
                            value={cr.role || ''}
                            onChange={(e) => handleUpdateCrRole(idx, 'role', e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-[12px] font-semibold text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                          />
                          <div className="flex items-center gap-1.5 w-36">
                            <input
                              type="number"
                              min="0"
                              aria-label="Rate per day"
                              value={cr.rate_per_day ?? 0}
                              onChange={(e) => handleUpdateCrRole(idx, 'rate_per_day', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-[12px] font-mono font-bold text-right text-slate-900 focus:outline-none focus:border-orange-500 shadow-2xs"
                            />
                            <span className="text-slate-500 font-mono text-[11px] font-bold">{cr.currency || currency}</span>
                          </div>
                          <button
                            type="button"
                            aria-label="Remove role"
                            onClick={() => handleRemoveCrRole(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Subsection D: Terms of Proposal & Validity */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <label className="text-[12px] font-bold text-slate-700 block mb-1">
                      Proposal Validity (Days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      aria-label="Proposal Validity (Days)"
                      value={termsConditions.proposal_validity_days ?? 0}
                      onChange={(e) =>
                        handleTermsChange(
                          'proposal_validity_days',
                          e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0
                        )
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-[13px] font-mono font-bold text-slate-900 shadow-2xs"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-[12px] font-bold text-slate-700 block mb-1">
                      Terms of Proposal & Order Acceptance
                    </label>
                    <textarea
                      rows={2}
                      value={termsConditions.terms_of_proposal}
                      onChange={(e) => handleTermsChange('terms_of_proposal', e.target.value)}
                      placeholder="PO submission terms, Order Acceptance acknowledgment window, and onboarding milestones..."
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-[12px] text-slate-800 shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 5: FITMENT DOCUMENT */}
            {activeTab === 'fitment_document' && (
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs space-y-6">
                <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-orange-600 font-bold text-[11px] uppercase tracking-wider">
                      <FileText className="w-4 h-4" />
                      Section 05
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mt-1">
                      Product Fitment & Technical Attachments
                    </h2>
                    <p className="text-[13px] text-slate-500 mt-0.5">
                      Document RFP technical compliance, out-of-the-box functional fitment, gap analysis, and attach supporting documentation (.docx, .xlsx, .pdf up to 20MB).
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <span
                      data-testid="section-completion-badge"
                      className={`text-xs font-bold font-mono px-3 py-1 rounded-full border ${
                        activeSectionPct === 100
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : activeSectionPct > 0
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {activeSectionPct}% complete
                    </span>

                    <button
                      type="button"
                      onClick={handleInsertFitmentTemplate}
                      className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                      Insert Template
                    </button>
                  </div>
                </div>

                {/* Fitment Stats Overview Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-[14px]">
                      96%
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-emerald-950">Standard Fitment</div>
                      <div className="text-[11px] text-emerald-700">148 of 154 requirements met OOB</div>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-[14px]">
                      4%
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-blue-950">Configurable Workflows</div>
                      <div className="text-[11px] text-blue-700">Configured via standard admin tools</div>
                    </div>
                  </div>

                  <div className="p-4 bg-orange-50/70 border border-orange-200 rounded-xl flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-lg bg-orange-600 text-white flex items-center justify-center font-bold text-[14px]">
                      <FileCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-orange-950">Architecture Fit</div>
                      <div className="text-[11px] text-orange-700">ISO 27001 & SOC 2 Certified</div>
                    </div>
                  </div>
                </div>

                {/* 1. Fitment Narrative */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-700">
                    1. Fitment Analysis Executive Narrative
                  </label>
                  <textarea
                    rows={3}
                    value={fitmentDocument.fitment_text}
                    onChange={(e) => handleFitmentChange('fitment_text', e.target.value)}
                    placeholder="Summary of functional evaluation, overall fit percentage, and platform compliance..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 2. Customer Specific Requirements */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-700">
                    2. Customer Requirements Evaluated
                  </label>
                  <textarea
                    rows={3}
                    value={fitmentDocument.customer_requirements}
                    onChange={(e) => handleFitmentChange('customer_requirements', e.target.value)}
                    placeholder="List specific key functional requirements evaluated during pre-sales workshops..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 3. Solution Fitment Details */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-700">
                    3. Solution Fitment & Gap Resolution
                  </label>
                  <textarea
                    rows={3}
                    value={fitmentDocument.solution_fitment}
                    onChange={(e) => handleFitmentChange('solution_fitment', e.target.value)}
                    placeholder="Document how proposed modules map to requirements and how any gaps are resolved..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 4. Technical Remarks */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-slate-700">
                    4. Technical Remarks & Architecture Fit
                  </label>
                  <textarea
                    rows={2}
                    value={fitmentDocument.remarks}
                    onChange={(e) => handleFitmentChange('remarks', e.target.value)}
                    placeholder="Security standards, hosting compliance, disaster recovery, and data encryption commitments..."
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-[13px] text-slate-900 shadow-2xs leading-relaxed"
                  />
                </div>

                {/* 5. Attachments Area */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5">
                        <Paperclip className="w-4 h-4 text-orange-600" />
                        Fitment Attachments & RFP Matrices ({attachments.length})
                      </label>
                      <div className="text-[11px] text-slate-400">
                        Upload official RFP responses or compliance sheets (.docx, .xlsx, .pdf up to 20MB)
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {isUploading ? 'Uploading...' : 'Upload Attachment'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".docx,.xlsx,.pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  {/* Uploaded Attachments List */}
                  {attachments.length === 0 ? (
                    <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl text-center bg-slate-50/50 space-y-1">
                      <Paperclip className="w-8 h-8 text-slate-400 mx-auto" />
                      <div className="text-[13px] font-semibold text-slate-700">No attachments uploaded yet</div>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                        Click 'Upload Attachment' above to attach your product fitment matrix, RFP spreadsheet, or architecture whitepaper.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white shadow-2xs">
                      {attachments.map((att) => (
                        <div key={att.id} className="p-3 flex items-center justify-between hover:bg-slate-50/50">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-[11px] shrink-0 uppercase">
                              {att.file_name?.split('.').pop() || 'DOC'}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-slate-900 truncate">
                                {att.file_name}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                {((att.file_size_bytes || 0) / 1024).toFixed(1)} KB · Uploaded {att.created_at ? new Date(att.created_at).toLocaleDateString() : 'Just now'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {att.download_url && (
                              <a
                                href={att.download_url}
                                download
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                                title="Download attachment"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteAttachment(att.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                              title="Delete attachment"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Workflow Navigation Bar */}
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <button
                type="button"
                onClick={handlePreviousSection}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-2xs cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                {currentSectionIndex > 0
                  ? 'Previous Section'
                  : 'Previous: Pricing & Discounts'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[13px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-4 h-4 text-slate-600" />
                  Preview Proposal
                </button>

                <button
                  type="button"
                  onClick={handleNextSection}
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white text-[13px] font-semibold rounded-lg flex items-center gap-2 transition-all shadow-2xs cursor-pointer"
                >
                  {currentSectionIndex < SECTIONS_CONFIG.length - 1
                    ? 'Next Section'
                    : 'Continue to Summary'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Proposal Preview Modal */}
      <ProposalPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        proposalData={{
          clientName: clientInfo?.clientName || clientInfo?.companyName,
          proposalCode: clientInfo?.proposalCode,
          proposalId,
          deploymentModel: clientInfo?.deploymentModel,
          contractDurationDisplay: clientInfo?.contractDurationDisplay,
          totalHeadcount: (countryConfigs || []).reduce((acc, c) => acc + (Number(c.headcount) || 0), 0),
          status: clientInfo?.status,
        }}
        sections={currentSectionsPayload}
        attachments={attachments}
        totals={calcTotals}
        onNavigateSection={(secId) => {
          setActiveTab(secId)
        }}
        onExportDocx={handleExportDocx}
      />
    </div>
  )
}

export default ProposalContentPage
