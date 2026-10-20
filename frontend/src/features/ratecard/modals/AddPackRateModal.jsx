import { useState } from 'react'
import { X, Package, AlertCircle } from 'lucide-react'

export function AddPackRateModal({
  isOpen,
  onClose,
  onSave,
  packs = [],
  activeDeployment = 'Shared Cloud',
  activePricing = 'PEPM',
  existingPackRates = [],
}) {
  const availablePacks = packs.filter(
    (p) => !existingPackRates.some((r) => r.packId === p.id && r.deploymentModel === activeDeployment && r.pricingModel === activePricing),
  )

  const [selectedPackId, setSelectedPackId] = useState(availablePacks[0]?.id || '')
  const [tier1Rate, setTier1Rate] = useState('')
  const [tier2Rate, setTier2Rate] = useState('')
  const [tier3Rate, setTier3Rate] = useState('')
  const [uom, setUom] = useState('Active Employees (with ESS)')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const activePack = packs.find((p) => p.id === (selectedPackId || availablePacks[0]?.id))

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    const targetPackId = selectedPackId || availablePacks[0]?.id
    if (!targetPackId) {
      setError('Please select a pack from Pack Builder.')
      return
    }

    const t1 = parseFloat(tier1Rate)
    const t2 = parseFloat(tier2Rate)
    const t3 = parseFloat(tier3Rate)

    if (tier1Rate !== '' && (isNaN(t1) || t1 < 0)) {
      setError('Tier 1 rate must be a valid non-negative number.')
      return
    }
    if (tier2Rate !== '' && (isNaN(t2) || t2 < 0)) {
      setError('Tier 2 rate must be a valid non-negative number.')
      return
    }
    if (tier3Rate !== '' && (isNaN(t3) || t3 < 0)) {
      setError('Tier 3 rate must be a valid non-negative number.')
      return
    }

    onSave({
      packId: targetPackId,
      packCode: activePack?.code || 'PACK-SKU',
      packName: activePack?.name || 'Commercial Pack',
      familyId: activePack?.familyId || 'fam-ta',
      deploymentModel: activeDeployment,
      pricingModel: activePricing,
      unitOfMeasure: uom,
      tier1Rate: tier1Rate.trim() || '0',
      tier2Rate: tier2Rate.trim() || '0',
      tier3Rate: tier3Rate.trim() || '0',
    })

    setTier1Rate('')
    setTier2Rate('')
    setTier3Rate('')
    setError('')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-pack-rate-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
              <Package className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="add-pack-rate-title" className="text-sm font-bold text-slate-900">
                Add Pack Rate ({activeDeployment})
              </h2>
              <p className="text-xs text-slate-500">
                Configure tier pricing for a Pack Builder solution suite
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 text-xs rounded-lg bg-rose-50 text-rose-800 border border-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="pack-select" className="block text-xs font-semibold text-slate-700 mb-1">
              Select Pack (from Pack Builder) <span className="text-rose-500">*</span>
            </label>
            {availablePacks.length > 0 ? (
              <select
                id="pack-select"
                value={selectedPackId || availablePacks[0]?.id}
                onChange={(e) => setSelectedPackId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                {availablePacks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code}) — {p.productIds?.length || 0} products
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 text-xs rounded-lg bg-slate-50 text-slate-600 border border-slate-200">
                All existing packs already have rates configured for {activeDeployment} / {activePricing}.
              </div>
            )}
          </div>

          <div>
            <label htmlFor="uom-input" className="block text-xs font-semibold text-slate-700 mb-1">
              Unit of Measure
            </label>
            <input
              id="uom-input"
              type="text"
              value={uom}
              onChange={(e) => setUom(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="tier1-rate-input" className="block text-xs font-semibold text-slate-700 mb-1">
                Tier 1 (Enterprise)
              </label>
              <input
                id="tier1-rate-input"
                type="number"
                min="0"
                step="any"
                value={tier1Rate}
                onChange={(e) => setTier1Rate(e.target.value)}
                placeholder="Rate"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <div>
              <label htmlFor="tier2-rate-input" className="block text-xs font-semibold text-slate-700 mb-1">
                Tier 2 (Mid-Market)
              </label>
              <input
                id="tier2-rate-input"
                type="number"
                min="0"
                step="any"
                value={tier2Rate}
                onChange={(e) => setTier2Rate(e.target.value)}
                placeholder="Rate"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <div>
              <label htmlFor="tier3-rate-input" className="block text-xs font-semibold text-slate-700 mb-1">
                Tier 3 (Growth)
              </label>
              <input
                id="tier3-rate-input"
                type="number"
                min="0"
                step="any"
                value={tier3Rate}
                onChange={(e) => setTier3Rate(e.target.value)}
                placeholder="Rate"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={availablePacks.length === 0}
              className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Add Pack Rate
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
