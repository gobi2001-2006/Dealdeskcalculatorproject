import { useState } from 'react'
import { X, ArrowRightLeft, AlertCircle } from 'lucide-react'

// Currencies come from the currency master (passed in by the page); there is no built-in list.
export function AddFxRateModal({ isOpen, onClose, onSave, currencies = [] }) {
  const [sourceCurrency, setSourceCurrency] = useState('')
  const [targetCurrency, setTargetCurrency] = useState('')
  const [ratePerUnit, setRatePerUnit] = useState('')
  const [source, setSource] = useState('Corporate Treasury')
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().split('T')[0],
  )
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    if (!sourceCurrency || !targetCurrency) {
      setError('Select both currencies.')
      return
    }
    if (sourceCurrency === targetCurrency) {
      setError('Source currency and target currency must be distinct.')
      return
    }

    const numRate = parseFloat(ratePerUnit)
    if (isNaN(numRate) || numRate <= 0) {
      setError('Exchange rate must be a valid positive number.')
      return
    }

    onSave({
      sourceCurrency,
      targetCurrency,
      ratePerUnit: ratePerUnit.trim(),
      source: source.trim() || 'Manual Input',
      effectiveDate: effectiveDate || new Date().toISOString().split('T')[0],
    })

    setRatePerUnit('')
    setError('')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-fx-rate-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="add-fx-rate-title" className="text-[16px] font-bold text-slate-900">
                Add FX Exchange Rate
              </h2>
              <p className="text-[11px] text-slate-500">
                Consolidation and reporting conversion benchmark
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
            <div className="flex items-start gap-2 p-3 text-[11px] rounded-lg bg-rose-50 text-rose-800 border border-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="source-currency" className="block text-[13px] font-semibold text-slate-700 mb-1">
                From Currency <span className="text-rose-500">*</span>
              </label>
              <select
                id="source-currency"
                value={sourceCurrency}
                onChange={(e) => setSourceCurrency(e.target.value)}
                className="w-full px-3.5 py-2 text-[14px] border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                <option value="">Select currency</option>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="target-currency" className="block text-[13px] font-semibold text-slate-700 mb-1">
                To Currency <span className="text-rose-500">*</span>
              </label>
              <select
                id="target-currency"
                value={targetCurrency}
                onChange={(e) => setTargetCurrency(e.target.value)}
                className="w-full px-3.5 py-2 text-[14px] border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                <option value="">Select currency</option>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="rate-per-unit" className="block text-[13px] font-semibold text-slate-700 mb-1">
              Rate per Unit (1 {sourceCurrency} = ? {targetCurrency}) <span className="text-rose-500">*</span>
            </label>
            <input
              id="rate-per-unit"
              type="number"
              step="any"
              min="0.000001"
              value={ratePerUnit}
              onChange={(e) => setRatePerUnit(e.target.value)}
              placeholder="e.g. 83.25"
              className="w-full px-3.5 py-2 text-[14px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rate-source" className="block text-[13px] font-semibold text-slate-700 mb-1">
                Rate Source
              </label>
              <input
                id="rate-source"
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. OANDA, Central Bank"
                className="w-full px-3.5 py-2 text-[14px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <div>
              <label htmlFor="effective-date" className="block text-[13px] font-semibold text-slate-700 mb-1">
                Effective Date
              </label>
              <input
                id="effective-date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-3.5 py-2 text-[14px] border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-[13px] font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Save Exchange Rate
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
