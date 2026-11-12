import { useState } from 'react'
import {
  Briefcase,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Info,
} from 'lucide-react'
import { validateServiceLine, describeServiceRate } from '../calculatorData'

/**
 * Professional service lines of one country.
 *
 * Effort is entered in MAN-DAYS (pricing guide section 2: "Line Item Total = Man-Days x Day Rate").
 * The rate always comes from a saved service rate of this country; the backend calculates the
 * day rate and the line total.
 */
export function ServiceLinesSection({
  countryName,
  serviceLines = [],
  onUpdateServiceLines,
  serviceRates = [],
}) {
  const [isAddingLine, setIsAddingLine] = useState(false)
  const [editingLineId, setEditingLineId] = useState(null)
  const emptyDraft = { serviceRateId: '', roleName: '', hoursOrDays: '' }
  const [newDraft, setNewDraft] = useState(emptyDraft)
  const [errors, setErrors] = useState({})

  const rateById = new Map(serviceRates.map((sr) => [String(sr.id), sr]))

  const handleRateSelect = (rateId) => {
    const found = rateById.get(String(rateId))
    setNewDraft((prev) => ({
      ...prev,
      serviceRateId: found ? Number(found.id) : '',
      roleName: found ? found.role_name : prev.roleName,
    }))
  }

  const handleSaveNewLine = () => {
    const errs = validateServiceLine(newDraft)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    onUpdateServiceLines([
      ...serviceLines,
      {
        id: `srv-${Date.now()}`,
        roleName: newDraft.roleName.trim(),
        serviceRateId: Number(newDraft.serviceRateId),
        hoursOrDays: Number(newDraft.hoursOrDays),
        unit: 'Man-days',
      },
    ])
    setIsAddingLine(false)
    setErrors({})
    setNewDraft(emptyDraft)
  }

  const handleDeleteLine = (lineId) => {
    onUpdateServiceLines(serviceLines.filter((l) => l.id !== lineId))
  }

  const handleUpdateLineField = (lineId, field, value) => {
    onUpdateServiceLines(serviceLines.map((l) => (l.id === lineId ? { ...l, [field]: value } : l)))
  }

  const inputClass = (hasError) =>
    `w-full h-10 px-3.5 text-[14px] rounded-lg border bg-white text-slate-900 focus:outline-none transition-colors ${
      hasError
        ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
        : 'border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100'
    }`

  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-orange-600" aria-hidden="true" />
          <h4 className="text-[14px] sm:text-[15px] font-bold text-slate-900 tracking-tight">
            Professional Service Lines ({countryName || 'no country selected'})
          </h4>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsAddingLine(true)
            setErrors({})
          }}
          disabled={serviceRates.length === 0}
          title={serviceRates.length === 0 ? 'No saved service rates for this country' : undefined}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] sm:text-[13px] font-semibold rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Service Line</span>
        </button>
      </div>

      {serviceRates.length === 0 && (
        <p className="mb-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          No active service rates are saved for {countryName || 'this country'}. Add them on the Rate Card &amp; Masters page.
        </p>
      )}

      {isAddingLine && (
        <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-200/80 mb-4 space-y-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-orange-200/60">
            <span className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-orange-600" aria-hidden="true" />
              <span>Configure New Service Line</span>
            </span>
            <button
              type="button"
              onClick={() => setIsAddingLine(false)}
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-orange-100/60 transition-colors"
              aria-label="Cancel adding service line"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-start">
            <div className="sm:col-span-5">
              <label htmlFor="service-preset-select" className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                Service Rate <span className="text-rose-500">*</span>
              </label>
              <select
                id="service-preset-select"
                value={newDraft.serviceRateId}
                onChange={(e) => handleRateSelect(e.target.value)}
                className={inputClass(errors.serviceRateId)}
              >
                <option value="">-- Select a saved service rate --</option>
                {serviceRates.map((sr) => (
                  <option key={sr.id} value={sr.id}>
                    {sr.role_name} ({describeServiceRate(sr)})
                  </option>
                ))}
              </select>
              {errors.serviceRateId && (
                <span className="text-[11px] text-rose-600 mt-1 block font-medium">{errors.serviceRateId}</span>
              )}
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="service-role-input" className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                Service Description / Role Title <span className="text-rose-500">*</span>
              </label>
              <input
                id="service-role-input"
                type="text"
                value={newDraft.roleName}
                onChange={(e) => setNewDraft((prev) => ({ ...prev, roleName: e.target.value }))}
                placeholder="e.g. Data Migration"
                className={inputClass(errors.roleName)}
              />
              {errors.roleName && (
                <span className="text-[11px] text-rose-600 mt-1 block font-medium">{errors.roleName}</span>
              )}
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="service-hours-input" className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                Effort (Man-days) <span className="text-rose-500">*</span>
              </label>
              <input
                id="service-hours-input"
                type="number"
                min="0"
                step="0.5"
                value={newDraft.hoursOrDays}
                onChange={(e) => setNewDraft((prev) => ({ ...prev, hoursOrDays: e.target.value }))}
                className={`${inputClass(errors.hoursOrDays)} font-mono`}
              />
              {errors.hoursOrDays && (
                <span className="text-[11px] text-rose-600 mt-1 block font-medium">{errors.hoursOrDays}</span>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
            <Info className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <span>
              Priced as man-days × day rate; one overall service discount applies per product in Pricing &amp; Discounts.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingLine(false)}
              className="px-4 py-2 text-[13px] font-medium rounded-lg text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveNewLine}
              className="px-4 py-2 text-[13px] font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors"
            >
              Add Line
            </button>
          </div>
        </div>
      )}

      {serviceLines.length === 0 ? (
        <div className="p-4 rounded-lg bg-white border border-dashed border-slate-200 text-center text-[12px] text-slate-400">
          No service lines configured for {countryName || 'this country'}.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px] sm:text-[13px]" aria-label="Country service lines">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th scope="col" className="py-2.5 px-3.5 min-w-[200px]">Role / Description</th>
                  <th scope="col" className="py-2.5 px-3.5 w-32 text-center">Effort (Man-days)</th>
                  <th scope="col" className="py-2.5 px-3.5 text-right">Saved Service Rate</th>
                  <th scope="col" className="py-2.5 px-3.5 w-20 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {serviceLines.map((srv) => {
                  const isEditing = editingLineId === srv.id
                  const rate = rateById.get(String(srv.serviceRateId))
                  return (
                    <tr key={srv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3.5">
                        {isEditing ? (
                          <input
                            type="text"
                            aria-label="Service role"
                            value={srv.roleName}
                            onChange={(e) => handleUpdateLineField(srv.id, 'roleName', e.target.value)}
                            className="w-full h-9 px-3 text-[13px] sm:text-[14px] rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900 text-[13px]">{srv.roleName}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            aria-label="Effort in man-days"
                            value={srv.hoursOrDays}
                            onChange={(e) => handleUpdateLineField(srv.id, 'hoursOrDays', e.target.value)}
                            className="w-24 h-9 px-2.5 text-[13px] sm:text-[14px] text-center rounded border border-slate-300 bg-white text-slate-900 font-mono mx-auto focus:outline-none focus:border-orange-500"
                          />
                        ) : (
                          <span className="font-mono text-slate-800 font-medium text-[12px]">{srv.hoursOrDays} days</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-[11px] text-slate-700">
                        {rate ? (
                          describeServiceRate(rate)
                        ) : (
                          <span className="text-amber-700">
                            {srv.serviceRateId ? `Rate #${srv.serviceRateId} not available for this country` : 'No service rate selected'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {isEditing ? (
                            <button
                              type="button"
                              onClick={() => setEditingLineId(null)}
                              className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Done editing"
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingLineId(srv.id)}
                              className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                              title="Edit service line"
                            >
                              <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteLine(srv.id)}
                            className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete service line"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="px-3.5 py-2 text-[10px] text-slate-500 bg-slate-50 border-t border-slate-200">
            Totals calculate when you click Calculate Pricing.
          </p>
        </div>
      )}
    </div>
  )
}

export default ServiceLinesSection
