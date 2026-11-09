import { useState } from 'react'
import { Briefcase, Plus, Trash2, Clock, Check, AlertCircle, Info } from 'lucide-react'

export function ServiceRatesSection({
  serviceRates = [],
  activeCountry,
  activeCurrencySymbol = '$',
  isVersionLocked = false,
  onUpdateServiceRate,
  onDeleteServiceRate,
  onOpenAddServiceRate,
}) {
  // Local state for inline edits
  const [localRates, setLocalRates] = useState({})
  const [saveStatus, setSaveStatus] = useState({}) // { [id]: 'idle' | 'saving' | 'saved' | 'error' }
  const [filterByCountry, setFilterByCountry] = useState(true)

  // Filter rates based on country selection
  const displayedRates = serviceRates.filter((sr) => {
    if (!filterByCountry) return true
    if (!activeCountry?.id) return true
    return (
      String(sr.countryId) === String(activeCountry.id) ||
      (sr.country && activeCountry.name && sr.country.toLowerCase() === activeCountry.name.toLowerCase())
    )
  })

  const handleInputChange = (id, value) => {
    if (isVersionLocked) return
    setLocalRates((prev) => ({ ...prev, [id]: value }))
  }

  const handleBlurOrSave = async (sr) => {
    if (isVersionLocked) return
    const currentVal = localRates[sr.id] !== undefined ? localRates[sr.id] : sr.hourlyRate
    if (currentVal === undefined || currentVal === null || String(currentVal) === String(sr.hourlyRate)) {
      return
    }

    const numVal = parseFloat(currentVal)
    if (isNaN(numVal) || numVal < 0) {
      setSaveStatus((prev) => ({ ...prev, [sr.id]: 'error' }))
      return
    }

    setSaveStatus((prev) => ({ ...prev, [sr.id]: 'saving' }))
    try {
      if (onUpdateServiceRate) {
        await onUpdateServiceRate(sr.id, { hourlyRate: String(numVal) })
      }
      setSaveStatus((prev) => ({ ...prev, [sr.id]: 'saved' }))
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, [sr.id]: 'idle' }))
      }, 2000)
    } catch {
      setSaveStatus((prev) => ({ ...prev, [sr.id]: 'error' }))
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
            <Briefcase className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 tracking-wide uppercase">
                Professional Service & Implementation Rates
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                {displayedRates.length} {displayedRates.length === 1 ? 'Role' : 'Roles'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Standard billable rates by role and country. Day Rate = Hourly Rate × Standard Hours per Day (8.0h).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterByCountry(!filterByCountry)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
              filterByCountry
                ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
            title="Toggle Country Filter"
          >
            {filterByCountry
              ? `Filtered: ${activeCountry?.name || 'Active Country'}`
              : 'Showing All Countries'}
          </button>

          {!isVersionLocked && (
            <button
              type="button"
              onClick={onOpenAddServiceRate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Service Rate</span>
            </button>
          )}
        </div>
      </div>

      {/* Formula & Policy Note */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/70 text-[11px] text-amber-900">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-0.5">
          <span className="font-semibold text-amber-950">Commercial Service Rate Rule:</span>{' '}
          <span>
            Day Rate is derived automatically from <strong>Hourly Rate × 8.0 Working Hours</strong>. Total implementation effort, resource allocations, and gross margin are worked out in <strong>Proposal step 1 — Configure</strong>.
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-lg overflow-x-auto shadow-2xs">
        <table className="min-w-full divide-y divide-slate-200 text-xs text-left">
          <thead className="bg-slate-50 font-semibold text-slate-700 select-none">
            <tr>
              <th scope="col" className="px-3.5 py-2.5">
                Service Role / Line
              </th>
              <th scope="col" className="px-3 py-2.5">
                Country & Currency
              </th>
              <th scope="col" className="px-3 py-2.5 text-center">
                Standard Hours / Day
              </th>
              <th scope="col" className="px-3.5 py-2.5 text-right w-36">
                Hourly Rate ({activeCurrencySymbol})
              </th>
              <th scope="col" className="px-3.5 py-2.5 text-right w-36">
                Calculated Day Rate (8.0h)
              </th>
              <th scope="col" className="px-3 py-2.5 text-center">
                Status
              </th>
              {!isVersionLocked && (
                <th scope="col" className="px-3 py-2.5 text-center w-12">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {displayedRates.length === 0 ? (
              <tr>
                <td
                  colSpan={isVersionLocked ? 6 : 7}
                  className="px-4 py-8 text-center text-slate-400 text-xs"
                >
                  <Clock className="w-6 h-6 mx-auto mb-2 text-slate-300" aria-hidden="true" />
                  <p className="font-medium text-slate-600">No service rates configured for {activeCountry?.name || 'this scope'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Click &ldquo;Add Service Rate&rdquo; above to register consulting and implementation day/hour rates.
                  </p>
                </td>
              </tr>
            ) : (
              displayedRates.map((sr) => {
                const hourlyVal = parseFloat(localRates[sr.id] ?? sr.hourlyRate ?? 0)
                const hoursPerDay = parseFloat(sr.standardHoursPerDay || 8)
                const dayRateVal = !isNaN(hourlyVal) ? (hourlyVal * hoursPerDay).toFixed(2) : '—'
                const status = saveStatus[sr.id] || 'idle'

                return (
                  <tr key={sr.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span>Role: {sr.serviceLine}</span>
                        {status === 'saved' && (
                          <span className="inline-flex items-center text-[10px] text-emerald-600 font-medium animate-fade-in">
                            <Check className="w-3 h-3 mr-0.5" /> Saved
                          </span>
                        )}
                        {status === 'saving' && (
                          <span className="inline-flex items-center text-[10px] text-orange-600 font-medium">
                            Saving...
                          </span>
                        )}
                        {status === 'error' && (
                          <span className="inline-flex items-center text-[10px] text-rose-600 font-medium">
                            <AlertCircle className="w-3 h-3 mr-0.5" /> Error
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-slate-600 font-medium">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-mono">
                        {sr.country || activeCountry?.name} ({sr.currency || activeCountry?.currency || '—'})
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-center text-slate-600 font-mono text-xs">
                      {hoursPerDay.toFixed(1)} hrs
                    </td>

                    <td className="px-3.5 py-2 text-right">
                      <div className="relative inline-flex items-center">
                        <span className="absolute left-2.5 text-slate-400 font-mono text-xs pointer-events-none">
                          {sr.currencySymbol || activeCurrencySymbol}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={isVersionLocked}
                          value={localRates[sr.id] !== undefined ? localRates[sr.id] : (sr.hourlyRate ?? '')}
                          onChange={(e) => handleInputChange(sr.id, e.target.value)}
                          onBlur={() => handleBlurOrSave(sr)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur()
                            }
                          }}
                          aria-label={`Hourly Rate for ${sr.serviceLine}`}
                          className={`w-28 pl-6 pr-2 py-1 text-right text-xs font-mono font-medium rounded border ${
                            isVersionLocked
                              ? 'bg-slate-50 text-slate-500 border-slate-200 cursor-not-allowed'
                              : 'bg-white border-slate-300 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500'
                          }`}
                        />
                      </div>
                    </td>

                    <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-slate-800 text-xs">
                      {sr.currencySymbol || activeCurrencySymbol} {Number(dayRateVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Active
                      </span>
                    </td>

                    {!isVersionLocked && (
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => onDeleteServiceRate && onDeleteServiceRate(sr.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer transition-colors"
                          title={`Delete ${sr.serviceLine}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
