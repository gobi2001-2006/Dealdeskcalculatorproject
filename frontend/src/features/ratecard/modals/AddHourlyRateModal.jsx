import { useState } from 'react'
import { X, Clock, AlertCircle } from 'lucide-react'

export function AddHourlyRateModal({ isOpen, onClose, onSave, countries = [] }) {
  const [serviceLine, setServiceLine] = useState('')
  const [selectedCountryName, setSelectedCountryName] = useState(
    countries[0]?.name || 'North America',
  )
  const [hourlyRate, setHourlyRate] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const selectedCountry = countries.find((c) => c.name === selectedCountryName) || countries[0]
  const currencyCode = selectedCountry?.currency || ''

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    const trimmedService = serviceLine.trim()
    const numRate = parseFloat(hourlyRate)

    if (!trimmedService) {
      setError('Service line name is required.')
      return
    }

    if (isNaN(numRate) || numRate < 0) {
      setError('Hourly rate must be a valid non-negative number.')
      return
    }

    onSave({
      serviceLine: trimmedService,
      country: selectedCountry?.name || selectedCountryName,
      currency: currencyCode,
      hourlyRate: hourlyRate.trim(),
      standardHoursPerDay: 8,
    })

    setServiceLine('')
    setHourlyRate('')
    setError('')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-hourly-rate-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
              <Clock className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="add-hourly-rate-title" className="text-sm font-bold text-slate-900">
                Add Service Line Rate
              </h2>
              <p className="text-xs text-slate-500">
                Hourly professional services rate by country
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
            <label htmlFor="service-line" className="block text-xs font-semibold text-slate-700 mb-1">
              Service Line / Activity <span className="text-rose-500">*</span>
            </label>
            <input
              id="service-line"
              type="text"
              value={serviceLine}
              onChange={(e) => setServiceLine(e.target.value)}
              placeholder="e.g. Solution Architecture, Data Migration"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rate-country" className="block text-xs font-semibold text-slate-700 mb-1">
                Country
              </label>
              <select
                id="rate-country"
                value={selectedCountryName}
                onChange={(e) => setSelectedCountryName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                {countries.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} ({c.currency})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hourly-rate-input" className="block text-xs font-semibold text-slate-700 mb-1">
                Hourly Rate ({currencyCode}) <span className="text-rose-500">*</span>
              </label>
              <input
                id="hourly-rate-input"
                type="number"
                min="0"
                step="any"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="e.g. 175"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-800 space-y-1">
            <div className="font-semibold text-amber-900">Standard Working Hours: 8 hrs/day</div>
            <div>
              Day rates are not calculated in the client. Derived day rates and project margins await backend integration.
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
              className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Save Service Rate
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
