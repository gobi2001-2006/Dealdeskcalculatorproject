import { useState } from 'react'
import {
  X,
  Check,
  Copy,
  Download,
  Database,
  Code2,
  RefreshCw,
} from 'lucide-react'

export function ProposalSaveModal({
  isOpen,
  serializedData,
  onClose,
  onConfirmSave,
  isSaving = false,
}) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const jsonString = JSON.stringify(serializedData, null, 2)

  const handleCopy = () => {
    navigator.clipboard?.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proposal-${serializedData?.proposal?.code || 'draft'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-proposal-title"
    >
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#0B1528] text-white px-5 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-orange-400">
              <Database className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="save-proposal-title" className="text-sm font-bold text-white tracking-wide">
                {serializedData?.proposal?.id ? 'Update proposal' : 'Save proposal'}
              </h2>
              <p className="text-[11px] text-slate-300">
                You can reopen a saved proposal at any time, even after closing the browser.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content Body: plain summary, technical payload tucked away */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">What will be saved</h3>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Client', serializedData?.proposal?.customer_name || '—'],
                ['Countries', serializedData?.proposal_countries?.length || 0],
                ['Packs & features', serializedData?.proposal_line_items?.length || 0],
                ['Service lines', serializedData?.proposal_service_lines?.length || 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 min-w-0">
                  <dt className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</dt>
                  <dd className="text-sm font-semibold text-slate-900 truncate" title={String(value)}>{value}</dd>
                </div>
              ))}
            </dl>
            {(serializedData?.proposal_countries?.length || 0) > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {serializedData.proposal_countries.map((c) => c.country_name).filter(Boolean).join(', ')}
              </p>
            )}
          </div>

          <details className="group rounded-lg border border-slate-200">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600 flex items-center gap-1.5 hover:bg-slate-50">
              <Code2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Technical details (JSON) — {serializedData?.proposal?.code}</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" aria-hidden="true" />
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  <Download className="w-3 h-3" aria-hidden="true" />
                  <span>Export JSON</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto max-h-72 border border-slate-800">
                {jsonString}
              </pre>
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500 font-mono">
            {serializedData?.proposal_countries?.length || 0} Countries •{' '}
            {serializedData?.proposal_line_items?.length || 0} Line Items
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-200/60 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Confirm Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProposalSaveModal
