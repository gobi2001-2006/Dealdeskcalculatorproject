import { useState } from 'react'
import {
  Globe,
  Tag,
  Server,
  CreditCard,
  Clock,
  ArrowRightLeft,
  PieChart,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

export function RateCardMasterPanels({
  countries = [],
  onOpenAddCountry,
  onDeleteCountry,
  onUpdateCountry,
  pricingTiers = [],
  onUpdateTier,
  onAddTier,
  onDeleteTier,
  deploymentModels = [],
  onAddDeploymentModel,
  onDeleteDeploymentModel,
  pricingModels = [],
  onAddPricingModel,
  onDeletePricingModel,
  hourlyRates = [],
  onOpenAddHourlyRate,
  onDeleteHourlyRate,
  onUpdateHourlyRate,
  exchangeRates = [],
  onOpenAddFxRate,
  onDeleteFxRate,
  // Coverage metrics
  families = [],
  packRates = [],
  featureRates = [],
  className = '',
}) {
  // Accordion state
  const [openSections, setOpenSections] = useState({
    countries: true,
    tiers: false,
    deployment: false,
    pricing: false,
    hourly: true,
    exchange: true,
    coverage: true,
  })

  // Editing state
  const [editingCountryId, setEditingCountryId] = useState(null)
  const [editCountryName, setEditCountryName] = useState('')
  const [editCountryCurrency, setEditCountryCurrency] = useState('')

  const [editingTierId, setEditingTierId] = useState(null)
  const [editTierName, setEditTierName] = useState('')
  const [editTierDesc, setEditTierDesc] = useState('')

  // Add tier state
  const [isAddingTier, setIsAddingTier] = useState(false)
  const [newTierName, setNewTierName] = useState('')
  const [newTierDesc, setNewTierDesc] = useState('')
  const [addTierError, setAddTierError] = useState('')

  // Add deployment model state
  const [isAddingDeployment, setIsAddingDeployment] = useState(false)
  const [newDeploymentName, setNewDeploymentName] = useState('')
  const [newDeploymentDesc, setNewDeploymentDesc] = useState('')
  const [addDeploymentError, setAddDeploymentError] = useState('')

  // Add pricing model state
  const [isAddingPricingModel, setIsAddingPricingModel] = useState(false)
  const [newPricingModelName, setNewPricingModelName] = useState('')
  const [newPricingModelCode, setNewPricingModelCode] = useState('')
  const [newPricingModelDesc, setNewPricingModelDesc] = useState('')
  const [addPricingModelError, setAddPricingModelError] = useState('')

  const [editingHourlyId, setEditingHourlyId] = useState(null)
  const [editHourlyRate, setEditHourlyRate] = useState('')

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Handle Edit Country
  const startEditCountry = (c) => {
    setEditingCountryId(c.id)
    setEditCountryName(c.name)
    setEditCountryCurrency(c.currency)
  }

  const saveEditCountry = (id) => {
    if (editCountryName.trim() && editCountryCurrency.trim()) {
      onUpdateCountry(id, {
        name: editCountryName.trim(),
        currency: editCountryCurrency.trim().toUpperCase(),
      })
    }
    setEditingCountryId(null)
  }

  // Handle Edit Tier
  const startEditTier = (t) => {
    setEditingTierId(t.id)
    setEditTierName(t.name)
    setEditTierDesc(t.description)
  }

  const saveEditTier = (id) => {
    if (editTierName.trim()) {
      onUpdateTier(id, {
        name: editTierName.trim(),
        description: editTierDesc.trim(),
      })
    }
    setEditingTierId(null)
  }

  // Handle Add Tier
  const handleAddTierSubmit = (e) => {
    if (e) e.preventDefault()
    const trimmedName = newTierName.trim()
    if (!trimmedName) {
      setAddTierError('Tier name is required.')
      return
    }

    const isDuplicate = pricingTiers.some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (isDuplicate) {
      setAddTierError(`A pricing tier named "${trimmedName}" already exists.`)
      return
    }

    setAddTierError('')
    if (onAddTier) {
      onAddTier({
        name: trimmedName,
        description: newTierDesc.trim(),
      })
    }
    setNewTierName('')
    setNewTierDesc('')
    setIsAddingTier(false)
  }

  // Handle Add Deployment Model
  const handleAddDeploymentSubmit = (e) => {
    if (e) e.preventDefault()
    const trimmedName = newDeploymentName.trim()
    if (!trimmedName) {
      setAddDeploymentError('Model name is required.')
      return
    }

    const isDuplicate = deploymentModels.some(
      (m) => m.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    )
    if (isDuplicate) {
      setAddDeploymentError(`A deployment model named "${trimmedName}" already exists.`)
      return
    }

    setAddDeploymentError('')
    if (onAddDeploymentModel) {
      onAddDeploymentModel({
        name: trimmedName,
        description: newDeploymentDesc.trim(),
      })
    }
    setNewDeploymentName('')
    setNewDeploymentDesc('')
    setIsAddingDeployment(false)
  }

  // Handle Add Pricing Model
  const handleAddPricingModelSubmit = (e) => {
    if (e) e.preventDefault()
    const trimmedName = newPricingModelName.trim()
    if (!trimmedName) {
      setAddPricingModelError('Pricing model name is required.')
      return
    }

    const isDuplicate = pricingModels.some(
      (pm) => pm.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    )
    if (isDuplicate) {
      setAddPricingModelError(`A pricing model named "${trimmedName}" already exists.`)
      return
    }

    setAddPricingModelError('')
    if (onAddPricingModel) {
      onAddPricingModel({
        name: trimmedName,
        code: newPricingModelCode.trim() || trimmedName,
        description: newPricingModelDesc.trim(),
      })
    }
    setNewPricingModelName('')
    setNewPricingModelCode('')
    setNewPricingModelDesc('')
    setIsAddingPricingModel(false)
  }

  // Handle Edit Hourly Rate
  const startEditHourly = (hr) => {
    setEditingHourlyId(hr.id)
    setEditHourlyRate(hr.hourlyRate)
  }

  const saveEditHourly = (id) => {
    const num = parseFloat(editHourlyRate)
    if (!isNaN(num) && num >= 0) {
      onUpdateHourlyRate(id, { hourlyRate: editHourlyRate.trim() })
    }
    setEditingHourlyId(null)
  }

  // Coverage calculations derived strictly from actual available configuration records
  const totalFamiliesCount = families.length
  const coveredFamiliesSet = new Set()
  packRates.concat(featureRates).forEach((r) => {
    if (r.familyId === 'all') {
      families.forEach((f) => coveredFamiliesSet.add(f.id))
    } else if (families.some((f) => f.id === r.familyId)) {
      coveredFamiliesSet.add(r.familyId)
    }
  })
  const coveredFamilies = Math.min(coveredFamiliesSet.size, totalFamiliesCount)

  const totalDeployments = deploymentModels.length
  const coveredDeployments = deploymentModels.filter((m) =>
    packRates.some((r) => r.deploymentModel === m.name || r.deploymentModelId === m.id) ||
    featureRates.some((r) => r.deploymentModel === m.name || r.deploymentModelId === m.id),
  ).length

  const totalPricingModels = pricingModels.length
  const coveredPricingModels = pricingModels.filter((pm) =>
    packRates.some((r) => r.pricingModel === pm.code || r.pricingModel === pm.name || r.pricingModelId === pm.id) ||
    featureRates.some((r) => r.pricingModel === pm.code || r.pricingModel === pm.name || r.pricingModelId === pm.id),
  ).length

  const totalPossiblePoints = totalFamiliesCount + totalDeployments + totalPricingModels
  const currentCoveredPoints = coveredFamilies + coveredDeployments + coveredPricingModels
  const coveragePercent =
    totalPossiblePoints > 0
      ? Math.round((currentCoveredPoints / totalPossiblePoints) * 100)
      : null

  return (
    <aside
      aria-label="Master Data Management"
      className={`w-88 xl:w-96 bg-white border-l border-slate-200/90 flex flex-col justify-between shrink-0 select-none overflow-hidden h-full z-10 ${className}`}
    >
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-orange-600" aria-hidden="true" />
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
            MASTER DATA PANELS
          </h2>
        </div>
        <span className="text-[10px] font-mono text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full font-semibold">
          7 Catalogs
        </span>
      </div>

      {/* Accordion Panels Container - Smooth independent vertical scrolling with safe bottom padding */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 pb-8">
        {/* A. Countries */}
        <section aria-labelledby="heading-countries">
          <button
            type="button"
            id="heading-countries"
            onClick={() => toggleSection('countries')}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="text-xs font-bold text-slate-800">A. Countries & Currencies</span>
              <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-full">
                {countries.length}
              </span>
            </div>
            {openSections.countries ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {openSections.countries && (
            <div className="px-4 pb-3 space-y-2">
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {countries.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 text-xs border border-slate-100"
                  >
                    {editingCountryId === c.id ? (
                      <div className="flex-1 flex items-center gap-1.5 pr-2">
                        <input
                          type="text"
                          value={editCountryName}
                          onChange={(e) => setEditCountryName(e.target.value)}
                          className="w-1/2 px-1.5 py-0.5 text-xs border border-slate-300 rounded"
                          placeholder="Name"
                        />
                        <input
                          type="text"
                          value={editCountryCurrency}
                          onChange={(e) => setEditCountryCurrency(e.target.value.toUpperCase())}
                          className="w-1/3 px-1.5 py-0.5 text-xs font-mono uppercase border border-slate-300 rounded"
                          placeholder="ISO"
                          maxLength={3}
                        />
                        <button
                          type="button"
                          onClick={() => saveEditCountry(c.id)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                          aria-label="Save country changes"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCountryId(null)}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded cursor-pointer"
                          aria-label="Cancel editing country"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{c.name}</span>
                          <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                            {c.currency}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditCountry(c)}
                            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-white rounded cursor-pointer"
                            aria-label={`Edit ${c.name}`}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteCountry && onDeleteCountry(c.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            aria-label={`Delete ${c.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={onOpenAddCountry}
                className="w-full py-1.5 text-xs font-semibold rounded border border-dashed border-slate-300 hover:border-orange-500 hover:text-orange-600 text-slate-600 flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Country</span>
              </button>
            </div>
          )}
        </section>

        {/* B. Pricing Tiers */}
        <section aria-labelledby="heading-tiers">
          <button
            type="button"
            id="heading-tiers"
            onClick={() => toggleSection('tiers')}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="text-xs font-bold text-slate-800">B. Pricing Tiers</span>
              <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-full">
                {pricingTiers.length}
              </span>
            </div>
            {openSections.tiers ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {openSections.tiers && (
            <div className="px-4 pb-3 space-y-2">
              {pricingTiers.map((t) => (
                <div key={t.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1">
                  {editingTierId === t.id ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px] text-slate-400 font-semibold">{t.code}</span>
                        <input
                          type="text"
                          value={editTierName}
                          onChange={(e) => setEditTierName(e.target.value)}
                          className="flex-1 px-1.5 py-0.5 text-xs border border-slate-300 rounded"
                        />
                      </div>
                      <input
                        type="text"
                        value={editTierDesc}
                        onChange={(e) => setEditTierDesc(e.target.value)}
                        className="w-full px-1.5 py-0.5 text-[11px] border border-slate-300 rounded"
                        placeholder="Description"
                      />
                      <div className="flex items-center justify-end gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingTierId(null)}
                          className="px-2 py-0.5 text-[10px] rounded hover:bg-slate-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEditTier(t.id)}
                          className="px-2 py-0.5 text-[10px] rounded bg-orange-600 text-white font-semibold cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-slate-700 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                            {t.code}
                          </span>
                          <span className="font-semibold text-slate-900">{t.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditTier(t)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                            aria-label={`Edit ${t.name}`}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTier && onDeleteTier(t.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            aria-label={`Delete ${t.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        {t.description}
                      </p>
                    </>
                  )}
                </div>
              ))}

              {isAddingTier ? (
                <form
                  onSubmit={handleAddTierSubmit}
                  className="p-2.5 rounded-lg bg-orange-50/50 border border-orange-200 text-xs space-y-2"
                >
                  <div className="font-semibold text-slate-800 text-[11px] flex items-center justify-between">
                    <span>Add New Pricing Tier</span>
                    <span className="font-mono text-[10px] text-orange-600 bg-orange-100/60 px-1.5 py-0.2 rounded font-bold">
                      Tier {pricingTiers.length + 1}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="new-tier-name"
                      className="block text-[10px] font-semibold text-slate-600"
                    >
                      Tier Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="new-tier-name"
                      type="text"
                      placeholder="e.g. Strategic or Emerging"
                      value={newTierName}
                      onChange={(e) => {
                        setNewTierName(e.target.value)
                        if (addTierError) setAddTierError('')
                      }}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="new-tier-desc"
                      className="block text-[10px] font-semibold text-slate-600"
                    >
                      Description (Optional)
                    </label>
                    <textarea
                      id="new-tier-desc"
                      rows={2}
                      placeholder="e.g. For global multi-region deployments"
                      value={newTierDesc}
                      onChange={(e) => setNewTierDesc(e.target.value)}
                      className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white resize-none"
                    />
                  </div>

                  {addTierError && (
                    <p
                      role="alert"
                      className="text-[11px] text-rose-600 font-medium"
                    >
                      {addTierError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingTier(false)
                        setNewTierName('')
                        setNewTierDesc('')
                        setAddTierError('')
                      }}
                      className="px-2.5 py-1 text-[11px] rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-1 text-[11px] rounded bg-orange-600 hover:bg-orange-700 text-white font-semibold cursor-pointer shadow-2xs"
                    >
                      Save Tier
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingTier(true)
                    setAddTierError('')
                  }}
                  className="w-full py-1.5 text-xs font-semibold rounded border border-dashed border-slate-300 hover:border-orange-500 hover:text-orange-600 text-slate-600 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Tier</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* C. Deployment Models */}
        <section aria-labelledby="heading-deployments">
          <button
            type="button"
            id="heading-deployments"
            onClick={() => toggleSection('deployment')}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="text-xs font-bold text-slate-800">C. Deployment Models</span>
              <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-full">
                {deploymentModels.length}
              </span>
            </div>
            {openSections.deployment ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {openSections.deployment && (
            <div className="px-4 pb-3 space-y-2">
              {deploymentModels.map((m) => (
                <div key={m.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-900">{m.name}</div>
                    {onDeleteDeploymentModel && (
                      <button
                        type="button"
                        onClick={() => onDeleteDeploymentModel(m.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        aria-label={`Delete ${m.name}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {m.description}
                  </p>
                </div>
              ))}

              {isAddingDeployment ? (
                <form
                  onSubmit={handleAddDeploymentSubmit}
                  className="p-2.5 rounded-lg bg-orange-50/50 border border-orange-200 text-xs space-y-2 animate-fade-in"
                >
                  <div className="font-semibold text-slate-800 text-[11px] flex items-center justify-between">
                    <span>Add Deployment Model</span>
                    <span className="font-mono text-[10px] text-orange-600 bg-orange-100/60 px-1.5 py-0.2 rounded font-bold">
                      Model {deploymentModels.length + 1}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="new-deployment-name"
                      className="block text-[10px] font-semibold text-slate-600"
                    >
                      Model Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="new-deployment-name"
                      type="text"
                      placeholder="e.g. Hybrid Cloud or GovCloud"
                      value={newDeploymentName}
                      onChange={(e) => {
                        setNewDeploymentName(e.target.value)
                        if (addDeploymentError) setAddDeploymentError('')
                      }}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="new-deployment-desc"
                      className="block text-[10px] font-semibold text-slate-600"
                    >
                      Description (Optional)
                    </label>
                    <textarea
                      id="new-deployment-desc"
                      rows={2}
                      placeholder="e.g. Customer-isolated hybrid architecture with local gateway"
                      value={newDeploymentDesc}
                      onChange={(e) => setNewDeploymentDesc(e.target.value)}
                      className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white resize-none"
                    />
                  </div>

                  {addDeploymentError && (
                    <p
                      role="alert"
                      className="text-[11px] text-rose-600 font-medium"
                    >
                      {addDeploymentError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingDeployment(false)
                        setNewDeploymentName('')
                        setNewDeploymentDesc('')
                        setAddDeploymentError('')
                      }}
                      className="px-2.5 py-1 text-[11px] rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-1 text-[11px] rounded bg-orange-600 hover:bg-orange-700 text-white font-semibold cursor-pointer shadow-2xs"
                    >
                      Save Model
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingDeployment(true)
                    setAddDeploymentError('')
                  }}
                  className="w-full py-2 text-xs font-semibold rounded-lg border border-dashed border-orange-300 bg-orange-50/40 hover:bg-orange-50/80 hover:border-orange-500 text-orange-700 hover:text-orange-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
                  <span>Add Model</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* D. Pricing Models */}
        <section aria-labelledby="heading-pricing-models">
          <button
            type="button"
            id="heading-pricing-models"
            onClick={() => toggleSection('pricing')}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="text-xs font-bold text-slate-800">D. Pricing Models</span>
              <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-full">
                {pricingModels.length}
              </span>
            </div>
            {openSections.pricing ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {openSections.pricing && (
            <div className="px-4 pb-3 space-y-2">
              {pricingModels.map((pm) => (
                <div key={pm.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900">{pm.name}</span>
                      <span className="text-[10px] font-mono bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-600">
                        {pm.code}
                      </span>
                    </div>
                    {onDeletePricingModel && (
                      <button
                        type="button"
                        onClick={() => onDeletePricingModel(pm.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        aria-label={`Delete ${pm.name}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {pm.description}
                  </p>
                </div>
              ))}

              {isAddingPricingModel ? (
                <form
                  onSubmit={handleAddPricingModelSubmit}
                  className="p-2.5 rounded-lg bg-orange-50/50 border border-orange-200 text-xs space-y-2 animate-fade-in"
                >
                  <div className="font-semibold text-slate-800 text-[11px] flex items-center justify-between">
                    <span>Add Pricing Model</span>
                    <span className="font-mono text-[10px] text-orange-600 bg-orange-100/60 px-1.5 py-0.2 rounded font-bold">
                      Model {pricingModels.length + 1}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="new-pricing-name"
                      className="block text-[10px] font-semibold text-slate-600"
                    >
                      Pricing Model Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="new-pricing-name"
                      type="text"
                      placeholder="e.g. Usage-Based or Tiered Consumption"
                      value={newPricingModelName}
                      onChange={(e) => {
                        setNewPricingModelName(e.target.value)
                        if (addPricingModelError) setAddPricingModelError('')
                      }}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="new-pricing-code"
                      className="block text-[10px] font-semibold text-slate-600"
                    >
                      Model Code / Identifier (Optional)
                    </label>
                    <input
                      id="new-pricing-code"
                      type="text"
                      placeholder="e.g. USAGE or TIERED"
                      value={newPricingModelCode}
                      onChange={(e) => setNewPricingModelCode(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white uppercase font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="new-pricing-desc"
                      className="block text-[10px] font-semibold text-slate-600"
                    >
                      Description (Optional)
                    </label>
                    <textarea
                      id="new-pricing-desc"
                      rows={2}
                      placeholder="e.g. Metered pricing model based on monthly API event volume"
                      value={newPricingModelDesc}
                      onChange={(e) => setNewPricingModelDesc(e.target.value)}
                      className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white resize-none"
                    />
                  </div>

                  {addPricingModelError && (
                    <p
                      role="alert"
                      className="text-[11px] text-rose-600 font-medium"
                    >
                      {addPricingModelError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingPricingModel(false)
                        setNewPricingModelName('')
                        setNewPricingModelCode('')
                        setNewPricingModelDesc('')
                        setAddPricingModelError('')
                      }}
                      className="px-2.5 py-1 text-[11px] rounded hover:bg-slate-200 text-slate-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-1 text-[11px] rounded bg-orange-600 hover:bg-orange-700 text-white font-semibold cursor-pointer shadow-2xs"
                    >
                      Save Model
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingPricingModel(true)
                    setAddPricingModelError('')
                  }}
                  className="w-full py-2 text-xs font-semibold rounded-lg border border-dashed border-orange-300 bg-orange-50/40 hover:bg-orange-50/80 hover:border-orange-500 text-orange-700 hover:text-orange-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
                  <span>Add Model</span>
                </button>
              )}

              <div className="p-2 rounded bg-amber-50/70 border border-amber-200 text-[10px] text-amber-800">
                Totals and discounts are calculated on the server.
              </div>
            </div>
          )}
        </section>

        {/* E. Hourly Rate Card */}
        <section aria-labelledby="heading-hourly">
          <button
            type="button"
            id="heading-hourly"
            onClick={() => toggleSection('hourly')}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="text-xs font-bold text-slate-800">E. Hourly Rate Card</span>
              <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-full">
                {hourlyRates.length}
              </span>
            </div>
            {openSections.hourly ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {openSections.hourly && (
            <div className="px-4 pb-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                <span>Standard Working Day:</span>
                <span className="font-semibold text-slate-700">8.0 Hours</span>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {hourlyRates.map((hr) => (
                  <div
                    key={hr.id}
                    className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1"
                  >
                    <div className="flex items-start justify-between">
                      <div className="font-semibold text-slate-800 text-[11px]">
                        {hr.serviceLine}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditHourly(hr)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                          aria-label={`Edit ${hr.serviceLine}`}
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteHourlyRate(hr.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          aria-label={`Delete ${hr.serviceLine}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600 pt-0.5">
                      <span className="text-[10px] text-slate-400">
                        {hr.country} ({hr.currency})
                      </span>
                      {editingHourlyId === hr.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={editHourlyRate}
                            onChange={(e) => setEditHourlyRate(e.target.value)}
                            className="w-16 px-1.5 py-0.5 text-xs text-right border border-slate-300 rounded"
                          />
                          <button
                            type="button"
                            onClick={() => saveEditHourly(hr.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono font-semibold text-slate-900">
                          {hr.currency} {hr.hourlyRate}/hr
                        </span>
                      )}
                    </div>

                    {/* Day rate output (from backend daily_rate) */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10px]">
                      <span className="text-slate-400">Derived Day Rate:</span>
                      {hr.dailyRate ? (
                        <span className="font-mono font-semibold text-slate-800">
                          {hr.currency} {Number(hr.dailyRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/day
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                          <Clock className="w-3 h-3" /> Not calculated yet
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={onOpenAddHourlyRate}
                className="w-full py-1.5 text-xs font-semibold rounded border border-dashed border-slate-300 hover:border-orange-500 hover:text-orange-600 text-slate-600 flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Service Rate</span>
              </button>
            </div>
          )}
        </section>

        {/* F. Currency Exchange Rates */}
        <section aria-labelledby="heading-fx">
          <button
            type="button"
            id="heading-fx"
            onClick={() => toggleSection('exchange')}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="text-xs font-bold text-slate-800">F. Currency Exchange Rates</span>
              <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-full">
                {exchangeRates.length}
              </span>
            </div>
            {openSections.exchange ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {openSections.exchange && (
            <div className="px-4 pb-3 space-y-2">
              <p className="text-[11px] text-slate-500">
                Reporting & consolidation exchange rates. Conversion arithmetic is evaluated by backend.
              </p>

              <div className="space-y-1 max-h-44 overflow-y-auto">
                {exchangeRates.map((fx) => (
                  <div
                    key={fx.id}
                    className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-mono font-semibold text-slate-800">
                        1 {fx.sourceCurrency} = {fx.ratePerUnit} {fx.targetCurrency}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {fx.source} • {fx.effectiveDate}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteFxRate(fx.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                      aria-label={`Remove exchange rate ${fx.sourceCurrency} to ${fx.targetCurrency}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={onOpenAddFxRate}
                className="w-full py-1.5 text-xs font-semibold rounded border border-dashed border-slate-300 hover:border-orange-500 hover:text-orange-600 text-slate-600 flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add FX Rate</span>
              </button>
            </div>
          )}
        </section>

        {/* G. Rate Card Coverage */}
        <section aria-labelledby="heading-coverage">
          <button
            type="button"
            id="heading-coverage"
            onClick={() => toggleSection('coverage')}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <PieChart className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="text-xs font-bold text-slate-800">G. Rate Card Coverage</span>
              {coveragePercent !== null && (
                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.2 rounded-full">
                  {coveragePercent}%
                </span>
              )}
            </div>
            {openSections.coverage ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {openSections.coverage && (
            <div className="px-4 pb-3 space-y-3">
              {coveragePercent !== null ? (
                <>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span>Overall Matrix Completeness</span>
                      <span className="font-mono text-emerald-700">{coveragePercent}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                        style={{ width: `${coveragePercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs divide-y divide-slate-100">
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-600">Product Families:</span>
                      <span className="font-mono font-medium text-slate-900">
                        {coveredFamilies} / {totalFamiliesCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-600">Deployment Models:</span>
                      <span className="font-mono font-medium text-slate-900">
                        {coveredDeployments} / {totalDeployments}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-600">Pricing Models:</span>
                      <span className="font-mono font-medium text-slate-900">
                        {coveredPricingModels} / {totalPricingModels}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-600">Countries Available:</span>
                      <span className="font-mono font-medium text-slate-900">
                        {countries.length} active
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                  No configuration data available to calculate coverage.
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/70 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
        <span className="font-medium text-slate-600">Master Data Status</span>
        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold font-mono text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          ACTIVE
        </span>
      </div>
    </aside>
  )
}
