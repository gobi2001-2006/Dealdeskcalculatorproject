import { useState } from 'react'
import { X, Globe, AlertCircle } from 'lucide-react'

export function AddCountryModal({ isOpen, onClose, onSave, existingCountries = [] }) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('')
  const [symbol, setSymbol] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    const trimmedName = name.trim()
    const trimmedCurrency = currency.trim().toUpperCase()
    const trimmedSymbol = symbol.trim()

    if (!trimmedName) {
      setError('Country name is required.')
      return
    }

    if (!trimmedCurrency) {
      setError('Currency code is required.')
      return
    }

    if (trimmedCurrency.length !== 3) {
      setError('Currency code must be exactly 3 uppercase letters (ISO 4217, e.g. USD, EUR, INR).')
      return
    }

    // Check duplicate country name (case-insensitive)
    const isDuplicateName = existingCountries.some(
      (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    )
    if (isDuplicateName) {
      setError(`A country named "${trimmedName}" already exists.`)
      return
    }

    onSave({
      name: trimmedName,
      currency: trimmedCurrency,
      symbol: trimmedSymbol || trimmedCurrency,
    })

    setName('')
    setCurrency('')
    setSymbol('')
    setError('')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-country-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
              <Globe className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="add-country-title" className="text-sm font-bold text-slate-900">
                Add Regional Country
              </h2>
              <p className="text-xs text-slate-500">
                Register a country and local trading currency
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
            <label htmlFor="country-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Country Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="country-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Singapore, Japan, Australia"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="currency-code" className="block text-xs font-semibold text-slate-700 mb-1">
                Currency Code (ISO) <span className="text-rose-500">*</span>
              </label>
              <input
                id="currency-code"
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="e.g. SGD, JPY"
                maxLength={3}
                className="w-full px-3 py-2 text-xs uppercase font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <div>
              <label htmlFor="currency-symbol" className="block text-xs font-semibold text-slate-700 mb-1">
                Currency Symbol
              </label>
              <input
                id="currency-symbol"
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g. S$, ¥, A$"
                maxLength={5}
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
              className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Add Country
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
