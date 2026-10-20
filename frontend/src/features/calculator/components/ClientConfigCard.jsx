import { Building, Globe2, AlertCircle, FileText } from 'lucide-react'
import { MASTER_CURRENCIES } from '../calculatorData'

export function ClientConfigCard({
  clientInfo,
  onChangeClientInfo,
  errors = {},
}) {
  const selectedCurrencyObj =
    MASTER_CURRENCIES.find((c) => c.code === clientInfo.reportingCurrency) ||
    MASTER_CURRENCIES[0]

  return (
    <section
      aria-label="Client and Reporting Currency Configuration"
      className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200/80 flex items-center justify-center text-orange-600">
            <Building className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Client & Commercial Specifications
            </h2>
            <p className="text-[11px] text-slate-500">
              Customer entity, commercial deal code, and global financial consolidation currency.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Step 1 of 4
          </span>
        </div>
      </div>

      {/* Form Fields */}
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Client Name Field */}
          <div className="md:col-span-5">
            <label
              htmlFor="client-name-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Client / Deal Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="client-name-input"
              type="text"
              value={clientInfo.clientName}
              onChange={(e) => onChangeClientInfo('clientName', e.target.value)}
              placeholder="e.g. Acme Global Enterprise"
              className={`w-full px-3 py-2 text-xs rounded-lg border transition-colors bg-white text-slate-900 focus:outline-none focus:ring-2 ${
                errors.clientName
                  ? 'border-rose-400 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-orange-500 focus:ring-orange-100'
              }`}
              aria-invalid={Boolean(errors.clientName)}
              aria-describedby={errors.clientName ? 'client-name-error' : undefined}
            />
            {errors.clientName && (
              <p
                id="client-name-error"
                className="mt-1 text-[11px] text-rose-600 flex items-center gap-1 font-medium"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{errors.clientName}</span>
              </p>
            )}
          </div>

          {/* Deal Reference / Code */}
          <div className="md:col-span-3">
            <label
              htmlFor="deal-code-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Deal Reference Code
            </label>
            <input
              id="deal-code-input"
              type="text"
              value={clientInfo.dealCode}
              onChange={(e) => onChangeClientInfo('dealCode', e.target.value)}
              placeholder="e.g. DEAL-2026-0042"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 font-mono focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          {/* Reporting (Consolidation) Currency */}
          <div className="md:col-span-4">
            <label
              htmlFor="reporting-currency-select"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Reporting Currency <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                id="reporting-currency-select"
                value={clientInfo.reportingCurrency}
                onChange={(e) => onChangeClientInfo('reportingCurrency', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
              >
                {MASTER_CURRENCIES.map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.code} ({curr.symbol}) — {curr.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Changing reporting currency does not overwrite native country currencies.
            </p>
          </div>
        </div>

        {/* Clear indicator showing selected consolidation currency */}
        <div
          className="p-3 rounded-lg bg-orange-50/60 border border-orange-200/70 flex items-start gap-2.5"
          role="status"
          aria-live="polite"
        >
          <Globe2 className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-slate-700 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">
                Consolidation Currency:
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-600 text-white font-mono shadow-2xs">
                {selectedCurrencyObj.code} ({selectedCurrencyObj.symbol})
              </span>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                ({selectedCurrencyObj.name})
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              All regional country rate cards and inputs remain preserved in their native currencies (e.g. INR, AED, SAR).
              Consolidated totals across jurisdictions will be converted to{' '}
              <strong className="text-slate-900">{selectedCurrencyObj.code}</strong> by the backend calculation engine using official treasury FX peg rates.
            </p>
          </div>
        </div>

        {/* Internal Deal Notes */}
        <div>
          <label
            htmlFor="client-notes-input"
            className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            <span>Proposal Scope & Deal Notes (Optional)</span>
          </label>
          <input
            id="client-notes-input"
            type="text"
            value={clientInfo.notes}
            onChange={(e) => onChangeClientInfo('notes', e.target.value)}
            placeholder="e.g. Multi-country rollout with 3-year term commitment..."
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
          />
        </div>
      </div>
    </section>
  )
}

export default ClientConfigCard
