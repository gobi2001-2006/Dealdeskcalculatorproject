import { Building, Globe2, AlertCircle, CheckCircle2 } from 'lucide-react'

export function ClientConfigCard({
  clientInfo,
  onChangeClientInfo,
  errors = {},
  customers = [],
  currencies = [],
  onSelectCustomerTier = null,
}) {
  // Only saved currency records; nothing is pre-selected on the user's behalf.
  const currencyList = currencies
  const selectedCurrencyObj =
    currencyList.find(
      (c) => clientInfo.reportingCurrencyId && Number(c.id) === Number(clientInfo.reportingCurrencyId)
    ) || null

  const handleCurrencySelect = (currencyVal) => {
    const found = currencyList.find(
      (c) => String(c.id) === String(currencyVal) || c.code === currencyVal
    )
    onChangeClientInfo('reportingCurrencyId', found ? Number(found.id) : null)
    onChangeClientInfo('reportingCurrency', found ? found.code : '')
  }

  const handleCustomerSelect = (selectedCustomerId) => {
    if (!selectedCustomerId) {
      onChangeClientInfo('customerId', null)
      return
    }
    const found = customers.find((c) => String(c.id) === String(selectedCustomerId))
    if (found) {
      onChangeClientInfo('customerId', found.id)
      onChangeClientInfo('dealId', null)
      onChangeClientInfo('clientName', found.name)
      if (found.customer_tier_id && onSelectCustomerTier) {
        onSelectCustomerTier(found.customer_tier_id)
      }
    }
  }

  return (
    <section
      aria-label="Client and Reporting Currency Configuration"
      className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0">
            <Building className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Client & Commercial Specifications
              </h2>
              {clientInfo.proposalId && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  <CheckCircle2 className="w-3 h-3 text-blue-600" aria-hidden="true" />
                  <span>ID: {clientInfo.proposalId} ({clientInfo.proposalCode || 'DRAFT'})</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Who this proposal is for, the deal reference, and the currency all totals are shown in.
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
            Part A · Client
          </span>
        </div>
      </div>

      {/* Form Fields */}
      <div className="p-5 space-y-4">
        {customers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-start">
            {/* Existing Customer Dropdown */}
            <div className="lg:col-span-4">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="client-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Customer Record
                </label>
                <span className="text-[10px] text-slate-400">
                  {customers.length} records
                </span>
              </div>
              <select
                id="client-select"
                aria-label="Select Existing Customer"
                value={clientInfo.customerId || ''}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 bg-slate-50 text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium transition-colors"
              >
                <option value="">-- Choose Existing or Enter Name --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Client / Customer Name Input */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="client-name-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Client / Customer Name <span className="text-rose-500">*</span>
                </label>
              </div>
              <input
                id="client-name-input"
                type="text"
                value={clientInfo.clientName}
                onChange={(e) => {
                  onChangeClientInfo('clientName', e.target.value)
                  onChangeClientInfo('customerId', null)
                  onChangeClientInfo('dealId', null)
                }}
                placeholder="e.g. Demo Technologies"
                className={`w-full h-10 px-3 text-xs rounded-lg border transition-colors bg-white text-slate-900 focus:outline-none focus:ring-2 ${
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
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="deal-code-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Deal Reference Code
                </label>
              </div>
              <input
                id="deal-code-input"
                type="text"
                value={clientInfo.dealCode}
                onChange={(e) => onChangeClientInfo('dealCode', e.target.value)}
                placeholder="e.g. DEV-DEAL-001"
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 font-mono focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            {/* Reporting (Consolidation) Currency */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="reporting-currency-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Reporting Currency <span className="text-rose-500">*</span>
                </label>
              </div>
              <select
                id="reporting-currency-select"
                value={selectedCurrencyObj?.id || ''}
                onChange={(e) => handleCurrencySelect(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
              >
                <option value="">
                  {currencyList.length === 0 ? '-- No currencies loaded --' : '-- Select currency --'}
                </option>
                {currencyList.map((currency) => (
                  <option key={currency.id} value={currency.id}>
                    {currency.code} — {currency.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-start">
            {/* Client / Customer Name Input */}
            <div className="lg:col-span-5">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="client-name-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Client / Customer Name <span className="text-rose-500">*</span>
                </label>
              </div>
              <input
                id="client-name-input"
                type="text"
                value={clientInfo.clientName}
                onChange={(e) => onChangeClientInfo('clientName', e.target.value)}
                placeholder="e.g. Demo Technologies"
                className={`w-full h-10 px-3 text-xs rounded-lg border transition-colors bg-white text-slate-900 focus:outline-none focus:ring-2 ${
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
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="deal-code-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Deal Reference Code
                </label>
              </div>
              <input
                id="deal-code-input"
                type="text"
                value={clientInfo.dealCode}
                onChange={(e) => onChangeClientInfo('dealCode', e.target.value)}
                placeholder="e.g. DEV-DEAL-001"
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 font-mono focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            {/* Reporting (Consolidation) Currency */}
            <div className="lg:col-span-4">
              <div className="flex items-center justify-between mb-1.5 h-4">
                <label
                  htmlFor="reporting-currency-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Reporting Currency <span className="text-rose-500">*</span>
                </label>
              </div>
              <select
                id="reporting-currency-select"
                value={selectedCurrencyObj?.id || ''}
                onChange={(e) => handleCurrencySelect(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-medium"
              >
                <option value="">
                  {currencyList.length === 0 ? '-- No currencies loaded --' : '-- Select currency --'}
                </option>
                {currencyList.map((currency) => (
                  <option key={currency.id} value={currency.id}>
                    {currency.code} — {currency.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Clear indicator showing selected consolidation currency */}
        <div
          className="p-3.5 rounded-lg bg-orange-50/60 border border-orange-200/70 flex items-start gap-3"
          role="status"
          aria-live="polite"
        >
          <Globe2 className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-slate-700 space-y-1">
            {selectedCurrencyObj ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900">
                    Consolidation Currency:
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-600 text-white font-mono shadow-2xs">
                    {selectedCurrencyObj.code}{selectedCurrencyObj.symbol ? ` (${selectedCurrencyObj.symbol})` : ''}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    ({selectedCurrencyObj.name})
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Rate cards stay in their native currencies. Consolidated totals are converted to{' '}
                  <strong className="text-slate-900">{selectedCurrencyObj.code}</strong> by the backend calculation engine
                  using the FX rates saved on the Rate Card &amp; Masters page.
                </p>
              </>
            ) : (
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {currencyList.length === 0
                  ? 'No currencies could be loaded from the backend. Add currencies on the Rate Card & Masters page.'
                  : 'Select the reporting currency the proposal totals will be converted to.'}
              </p>
            )}
          </div>
        </div>

        {/* Internal Deal Notes */}
        <div>
          <label
            htmlFor="client-notes-input"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            Internal Deal Notes & Commercial Terms
            <span className="ml-1 font-normal text-slate-400">(kept on this screen only - the backend has no notes field yet)</span>
          </label>
          <textarea
            id="client-notes-input"
            rows={2}
            value={clientInfo.notes || ''}
            onChange={(e) => onChangeClientInfo('notes', e.target.value)}
            placeholder="Add internal deal desk notes, scope restrictions, or contract requirements..."
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 transition-colors bg-white text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 resize-none leading-relaxed"
          />
        </div>
      </div>
    </section>
  )
}

export default ClientConfigCard
