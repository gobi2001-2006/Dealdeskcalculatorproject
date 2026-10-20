import { useState } from 'react'
import {
  FileText,
  X,
  Check,
  Copy,
  Download,
  AlertTriangle,
  Code2,
} from 'lucide-react'

export function ProposalSaveModal({
  isOpen,
  serializedData,
  onClose,
  onConfirmSave,
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
              <FileText className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="save-proposal-title" className="text-sm font-bold text-white tracking-wide">
                Save Proposal Draft — Frontend Prototype
              </h2>
              <p className="text-[11px] text-slate-300">
                Pydantic schema representation for FastAPI Wave 5 integration.
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

        {/* Notice Banner */}
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200/80 flex items-start gap-2.5 text-xs text-amber-900 shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <strong className="font-semibold">Frontend Prototype Notice:</strong>{' '}
            The PostgreSQL backend persistence endpoint (`POST /proposals`) is currently pending deployment in Wave 5.
            This proposal structure will be retained in local browser state and can be copied or downloaded as JSON.
            No persistent database record is created at this time.
          </div>
        </div>

        {/* Content Body: Schema Preview */}
        <div className="p-5 flex-1 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
              <span>FastAPI Schema Payload ({serializedData?.proposal?.code})</span>
            </span>
            <div className="flex items-center gap-2">
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
          </div>

          <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto max-h-72 border border-slate-800">
            {jsonString}
          </pre>
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
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-200/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirmSave()
                onClose()
              }}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-2xs transition-colors"
            >
              Confirm Local Prototype Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProposalSaveModal
