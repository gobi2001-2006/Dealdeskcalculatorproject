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
import { INITIAL_HOURLY_RATES } from '../../../data/rateCardData'
import { validateServiceLine } from '../calculatorData'

export function ServiceLinesSection({
  countryName,
  currency,
  currencySymbol = '$',
  serviceLines = [],
  onUpdateServiceLines,
  serviceRates = [],
}) {
  const [isAddingLine, setIsAddingLine] = useState(false)
  const [editingLineId, setEditingLineId] = useState(null)

  // Map live service rates or fallback to presets
  const allPresets =
    serviceRates.length > 0
      ? serviceRates.map((sr) => ({
          id: sr.id,
          serviceLine: sr.role_name,
          hourlyRate:
            Number(sr.hourly_rate) ||
            (sr.daily_rate ? Number(sr.daily_rate) / 8 : 150),
          currency: sr.currency?.code || currency,
        }))
      : INITIAL_HOURLY_RATES.filter(
          (hr) =>
            hr.country?.toLowerCase() === countryName?.toLowerCase() ||
            hr.currency === currency
        ).length > 0
      ? INITIAL_HOURLY_RATES.filter(
          (hr) =>
            hr.country?.toLowerCase() === countryName?.toLowerCase() ||
            hr.currency === currency
        )
      : INITIAL_HOURLY_RATES

  // New service line form draft
  const [newDraft, setNewDraft] = useState({
    roleName: allPresets[0]?.serviceLine || 'Implementation Consultant',
    hourlyRateId: allPresets[0]?.id || '',
    rateApplied: allPresets[0]?.hourlyRate || '150',
    hoursOrDays: '40',
    unit: 'Hours',
    discountPct: '0',
  })
  const [errors, setErrors] = useState({})

  // Handle Preset selection change
  const handlePresetSelect = (presetId) => {
    const found = allPresets.find((hr) => String(hr.id) === String(presetId))
    if (found) {
      setNewDraft((prev) => ({
        ...prev,
        hourlyRateId: found.id,
        roleName: found.serviceLine,
        rateApplied: found.hourlyRate,
      }))
    }
  }

  // Handle Add Service Line
  const handleSaveNewLine = () => {
    const errs = validateServiceLine(newDraft)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    const newLine = {
      id: `srv-${Date.now()}`,
      roleName: newDraft.roleName.trim(),
      serviceRateId: newDraft.hourlyRateId ? Number(newDraft.hourlyRateId) : null,
      rateApplied: Number(newDraft.rateApplied),
      hoursOrDays: Number(newDraft.hoursOrDays),
      unit: newDraft.unit,
      discountPct: 0, // Backend enforces no individual service line discounts
      currency,
    }

    onUpdateServiceLines([...serviceLines, newLine])
    setIsAddingLine(false)
    setErrors({})
    setNewDraft({
      roleName: allPresets[0]?.serviceLine || 'Implementation Consultant',
      hourlyRateId: allPresets[0]?.id || '',
      rateApplied: allPresets[0]?.hourlyRate || '150',
      hoursOrDays: '40',
      unit: 'Hours',
      discountPct: '0',
    })
  }

  // Handle Delete Service Line
  const handleDeleteLine = (lineId) => {
    onUpdateServiceLines(serviceLines.filter((l) => l.id !== lineId))
  }

  // Handle Edit Service Line
  const handleUpdateLineField = (lineId, field, value) => {
    onUpdateServiceLines(
      serviceLines.map((l) => (l.id === lineId ? { ...l, [field]: value } : l))
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-orange-600" aria-hidden="true" />
          <h4 className="text-xs font-bold text-slate-900 tracking-tight">
            Professional Service Lines ({countryName})
          </h4>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            PostgreSQL Rate Master
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsAddingLine(true)
            setErrors({})
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-200"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Service Line</span>
        </button>
      </div>

      {/* Add Line Inline Form */}
      {isAddingLine && (
        <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-200/80 mb-4 space-y-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-orange-200/60">
            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
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
            {/* Preset Selector */}
            <div className="sm:col-span-5">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="service-preset-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Service Rate Preset
                </label>
              </div>
              <select
                id="service-preset-select"
                value={newDraft.hourlyRateId}
                onChange={(e) => handlePresetSelect(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium transition-colors"
              >
                <option value="">-- Custom Role Description --</option>
                {allPresets.map((hr) => {
                  const currStr = typeof hr.currency === 'object' ? hr.currency?.code : hr.currency
                  return (
                    <option key={hr.id} value={hr.id}>
                      {hr.serviceLine} ({currStr} {hr.hourlyRate}/hr)
                    </option>
                  )
                })}
              </select>
            </div>

            {/* Custom Role Name */}
            <div className="sm:col-span-7">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="service-role-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Service Description / Role Title <span className="text-rose-500">*</span>
                </label>
              </div>
              <input
                id="service-role-input"
                type="text"
                value={newDraft.roleName}
                onChange={(e) =>
                  setNewDraft((prev) => ({ ...prev, roleName: e.target.value }))
                }
                placeholder="e.g. Solution Architecture & Scoping"
                className={`w-full h-10 px-3 text-xs rounded-lg border bg-white text-slate-900 focus:outline-none transition-colors ${
                  errors.roleName
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100'
                }`}
              />
              {errors.roleName && (
                <span className="text-[11px] text-rose-600 mt-1 block font-medium">
                  {errors.roleName}
                </span>
              )}
            </div>

            {/* Billable Hours */}
            <div className="sm:col-span-6">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="service-hours-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Billable Effort (Hours) <span className="text-rose-500">*</span>
                </label>
              </div>
              <input
                id="service-hours-input"
                type="number"
                min="0"
                value={newDraft.hoursOrDays}
                onChange={(e) =>
                  setNewDraft((prev) => ({ ...prev, hoursOrDays: e.target.value }))
                }
                placeholder="40"
                className={`w-full h-10 px-3 text-xs rounded-lg border bg-white text-slate-900 font-mono focus:outline-none transition-colors ${
                  errors.hoursOrDays
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100'
                }`}
              />
              {errors.hoursOrDays && (
                <span className="text-[11px] text-rose-600 mt-1 block font-medium">
                  {errors.hoursOrDays}
                </span>
              )}
            </div>

            {/* Hourly Rate */}
            <div className="sm:col-span-6">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="service-rate-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Hourly Rate ({currency}) <span className="text-rose-500">*</span>
                </label>
              </div>
              <input
                id="service-rate-input"
                type="number"
                min="0"
                value={newDraft.rateApplied}
                onChange={(e) =>
                  setNewDraft((prev) => ({ ...prev, rateApplied: e.target.value }))
                }
                placeholder="150"
                className={`w-full h-10 px-3 text-xs rounded-lg border bg-white text-slate-900 font-mono focus:outline-none transition-colors ${
                  errors.rateApplied
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100'
                }`}
              />
              {errors.rateApplied && (
                <span className="text-[11px] text-rose-600 mt-1 block font-medium">
                  {errors.rateApplied}
                </span>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span>Service discounts are applied at the product / proposal level during pricing engine calculation.</span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingLine(false)}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveNewLine}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors"
            >
              Add Line
            </button>
          </div>
        </div>
      )}

      {/* Service Lines Table */}
      {serviceLines.length === 0 ? (
        <div className="p-4 rounded-lg bg-white border border-dashed border-slate-200 text-center text-xs text-slate-400">
          No service lines configured for {countryName}. Click "+ Add Service Line" to include implementation or consulting effort.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Country service lines">
              <thead className="bg-slate-50 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th scope="col" className="py-2.5 px-3.5 min-w-[200px]">
                    Role / Description
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 w-28 text-center">
                    Effort (Hours)
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 w-32 text-right">
                    Rate ({currency})
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 w-36 text-right">
                    Extended Value
                  </th>
                  <th scope="col" className="py-2.5 px-3.5 w-20 text-center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {serviceLines.map((srv) => {
                  const isEditing = editingLineId === srv.id

                  return (
                    <tr key={srv.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Role Name */}
                      <td className="py-2.5 px-3.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={srv.roleName}
                            onChange={(e) =>
                              handleUpdateLineField(srv.id, 'roleName', e.target.value)
                            }
                            className="w-full h-8 px-2.5 text-xs rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:border-orange-500"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900">{srv.roleName}</span>
                            {srv.serviceRateId && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-100 text-slate-600 font-mono font-medium">
                                Master #{srv.serviceRateId}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Effort (Hours) */}
                      <td className="py-2.5 px-3.5 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={srv.hoursOrDays}
                            onChange={(e) =>
                              handleUpdateLineField(srv.id, 'hoursOrDays', e.target.value)
                            }
                            className="w-20 h-8 px-2 text-xs text-center rounded border border-slate-300 bg-white text-slate-900 font-mono mx-auto focus:outline-none focus:border-orange-500"
                          />
                        ) : (
                          <span className="font-mono text-slate-800 font-medium">{srv.hoursOrDays} hrs</span>
                        )}
                      </td>

                      {/* Rate */}
                      <td className="py-2.5 px-3.5 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={srv.rateApplied}
                            onChange={(e) =>
                              handleUpdateLineField(srv.id, 'rateApplied', e.target.value)
                            }
                            className="w-24 h-8 px-2 text-xs text-right rounded border border-slate-300 bg-white text-slate-900 font-mono ml-auto focus:outline-none focus:border-orange-500"
                          />
                        ) : (
                          <span className="font-mono text-slate-800 font-medium">
                            {currencySymbol} {Number(srv.rateApplied).toLocaleString()}/hr
                          </span>
                        )}
                      </td>

                      {/* Extended Value (Hours * Rate) */}
                      <td className="py-2.5 px-3.5 text-right">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {currencySymbol}{' '}
                          {(
                            (Number(srv.hoursOrDays) || 0) * (Number(srv.rateApplied) || 0)
                          ).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>

                      {/* Actions */}
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
              {serviceLines.length > 0 && (
                <tfoot className="bg-slate-100 border-t-2 border-slate-200 text-xs font-semibold text-slate-800">
                  <tr className="bg-slate-100">
                    <td colSpan={3} className="py-3 px-3.5 text-right font-bold text-slate-700 bg-slate-100">
                      Total Professional Services ({countryName}):
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono font-bold text-orange-700 text-sm bg-slate-100">
                      {currencySymbol}{' '}
                      {serviceLines
                        .reduce(
                          (acc, srv) =>
                            acc + (Number(srv.hoursOrDays) || 0) * (Number(srv.rateApplied) || 0),
                          0
                        )
                        .toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                    <td className="bg-slate-100"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServiceLinesSection
